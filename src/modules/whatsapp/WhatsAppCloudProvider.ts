import type { AppConfig } from "../../config/env";
import type { DependencyHealth } from "../../types";
import { logger } from "../../utils/logger";
import { parseCloudWebhookPayload } from "./whatsapp.parser";
import type {
  DownloadedMedia,
  NormalizedWhatsAppMessage,
  WebhookVerificationQuery,
  WhatsAppProvider
} from "./WhatsAppProvider";

const GRAPH_BASE_URL = "https://graph.facebook.com/v20.0";

export class WhatsAppCloudProvider implements WhatsAppProvider {
  constructor(private readonly config: AppConfig) {}

  verifyWebhook(query: WebhookVerificationQuery): string | null {
    if (
      query["hub.mode"] === "subscribe" &&
      query["hub.verify_token"] === this.config.whatsappVerifyToken &&
      query["hub.challenge"]
    ) {
      return query["hub.challenge"];
    }

    return null;
  }

  parseWebhookPayload(body: unknown): NormalizedWhatsAppMessage[] {
    return parseCloudWebhookPayload(body);
  }

  async sendTextMessage(to: string, message: string): Promise<void> {
    const response = await fetch(`${GRAPH_BASE_URL}/${this.config.whatsappPhoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.whatsappAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message }
      })
    });

    if (!response.ok) {
      throw new Error(`WhatsApp send failed: ${response.status}`);
    }
  }

  async downloadMedia(mediaId: string): Promise<DownloadedMedia> {
    const meta = await fetch(`${GRAPH_BASE_URL}/${mediaId}`, {
      headers: { Authorization: `Bearer ${this.config.whatsappAccessToken}` }
    });

    if (!meta.ok) {
      throw new Error(`WhatsApp media metadata failed: ${meta.status}`);
    }

    const metadata = (await meta.json()) as { url?: string; mime_type?: string };
    if (!metadata.url) {
      throw new Error("WhatsApp media metadata did not include a URL");
    }

    const media = await fetch(metadata.url, {
      headers: { Authorization: `Bearer ${this.config.whatsappAccessToken}` }
    });

    if (!media.ok) {
      throw new Error(`WhatsApp media download failed: ${media.status}`);
    }

    return {
      buffer: Buffer.from(await media.arrayBuffer()),
      mimeType: metadata.mime_type ?? media.headers.get("content-type") ?? "application/octet-stream"
    };
  }

  async healthCheck(): Promise<DependencyHealth> {
    try {
      const response = await fetch(`${GRAPH_BASE_URL}/${this.config.whatsappPhoneNumberId}`, {
        headers: { Authorization: `Bearer ${this.config.whatsappAccessToken}` }
      });
      if (!response.ok) {
        return { status: "down", message: `WhatsApp API returned ${response.status}` };
      }
      return { status: "ok", message: "WhatsApp Cloud API reachable" };
    } catch (error) {
      logger.warn({ err: error }, "whatsapp healthcheck failed");
      return { status: "down", message: error instanceof Error ? error.message : "WhatsApp healthcheck failed" };
    }
  }
}
