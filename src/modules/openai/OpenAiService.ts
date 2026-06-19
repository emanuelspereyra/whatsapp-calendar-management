import OpenAI, { toFile } from "openai";
import type { AppConfig } from "../../config/env";
import type { DependencyHealth, SchedulingContext } from "../../types";
import { logger } from "../../utils/logger";
import { buildExtractionPrompt, buildRepairPrompt } from "./prompts";
import { parseSchedulingIntent, type SchedulingIntent } from "./schemas";

export interface AiService {
  transcribeAudio(fileBuffer: Buffer, mimeType: string): Promise<string>;
  extractSchedulingIntent(context: SchedulingContext): Promise<SchedulingIntent>;
  healthCheck(): Promise<DependencyHealth>;
}

export class OpenAiService implements AiService {
  private readonly client: OpenAI;

  constructor(private readonly config: AppConfig, client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey: config.openaiApiKey });
  }

  async transcribeAudio(fileBuffer: Buffer, mimeType: string): Promise<string> {
    const extension = mimeType.includes("mpeg") ? "mp3" : mimeType.includes("ogg") ? "ogg" : "audio";
    const file = await toFile(fileBuffer, `whatsapp-audio.${extension}`, { type: mimeType });
    const result = await this.client.audio.transcriptions.create({
      file,
      model: this.config.openaiTranscriptionModel
    });
    return result.text;
  }

  async extractSchedulingIntent(context: SchedulingContext): Promise<SchedulingIntent> {
    const content = await this.extractJson(buildExtractionPrompt(context));
    try {
      return parseSchedulingIntent(JSON.parse(content));
    } catch (firstError) {
      const repaired = await this.extractJson(
        buildRepairPrompt(content, firstError instanceof Error ? firstError.message : String(firstError))
      );
      return parseSchedulingIntent(JSON.parse(repaired));
    }
  }

  async healthCheck(): Promise<DependencyHealth> {
    try {
      await this.client.models.list();
      return { status: "ok", message: "OpenAI API reachable" };
    } catch (error) {
      logger.warn({ err: error }, "openai healthcheck failed");
      return { status: "down", message: error instanceof Error ? error.message : "OpenAI healthcheck failed" };
    }
  }

  private async extractJson(prompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.config.openaiExtractionModel,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return only valid JSON. Never include markdown." },
        { role: "user", content: prompt }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI extraction returned empty content");
    }
    return content;
  }
}
