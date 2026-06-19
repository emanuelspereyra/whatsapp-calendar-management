import { describe, expect, it } from "vitest";
import { testConfig } from "../testUtils";
import { WhatsAppCloudProvider } from "../../src/modules/whatsapp/WhatsAppCloudProvider";
import { parseCloudWebhookPayload } from "../../src/modules/whatsapp/whatsapp.parser";

describe("WhatsApp Cloud provider", () => {
  it("verifies webhook with the expected token", () => {
    const provider = new WhatsAppCloudProvider(testConfig());
    expect(
      provider.verifyWebhook({
        "hub.mode": "subscribe",
        "hub.verify_token": "verify-token",
        "hub.challenge": "abc"
      })
    ).toBe("abc");
  });

  it("rejects webhook verification with an invalid token", () => {
    const provider = new WhatsAppCloudProvider(testConfig());
    expect(
      provider.verifyWebhook({
        "hub.mode": "subscribe",
        "hub.verify_token": "bad",
        "hub.challenge": "abc"
      })
    ).toBeNull();
  });

  it("normalizes inbound text payloads", () => {
    const [message] = parseCloudWebhookPayload({
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: "5491", profile: { name: "Ana" } }],
                messages: [{ id: "m1", from: "5491", timestamp: "1781892000", type: "text", text: { body: "hola" } }]
              }
            }
          ]
        }
      ]
    });

    expect(message).toMatchObject({ kind: "message", type: "text", from: "5491", text: "hola", contactName: "Ana" });
  });

  it("normalizes inbound audio payloads", () => {
    const [message] = parseCloudWebhookPayload({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "m1",
                    from: "5491",
                    timestamp: "1781892000",
                    type: "audio",
                    audio: { id: "media-1", mime_type: "audio/ogg" }
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    expect(message).toMatchObject({ kind: "message", type: "audio", mediaId: "media-1", mimeType: "audio/ogg" });
  });
});
