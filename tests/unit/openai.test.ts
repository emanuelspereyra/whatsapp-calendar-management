import { describe, expect, it, vi } from "vitest";
import { OpenAiService } from "../../src/modules/openai/OpenAiService";
import { testConfig, validExtraction } from "../testUtils";

describe("OpenAiService", () => {
  it("repairs invalid JSON extraction once", async () => {
    let calls = 0;
    const fakeClient = {
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [
              {
                message: {
                  content: calls++ === 0 ? "{ invalid" : JSON.stringify(validExtraction)
                }
              }
            ]
          }))
        }
      },
      audio: { transcriptions: { create: vi.fn() } },
      models: { list: vi.fn() }
    } as any;
    const service = new OpenAiService(testConfig(), fakeClient);

    await expect(
      service.extractSchedulingIntent({
        phone: "5491",
        timezone: "America/Argentina/Buenos_Aires",
        now: new Date("2026-06-19T18:00:00.000Z"),
        messages: []
      })
    ).resolves.toEqual(validExtraction);
    expect(fakeClient.chat.completions.create).toHaveBeenCalledTimes(2);
  });
});
