import type { DependencyHealth } from "../../types";

export type NormalizedWhatsAppMessage =
  | {
      kind: "message";
      providerMessageId: string;
      from: string;
      timestamp: Date;
      type: "text";
      text: string;
      contactName?: string;
    }
  | {
      kind: "message";
      providerMessageId: string;
      from: string;
      timestamp: Date;
      type: "audio";
      mediaId: string;
      mimeType?: string;
      contactName?: string;
    }
  | {
      kind: "status";
      providerMessageId?: string;
      status: string;
      timestamp: Date;
    }
  | {
      kind: "unknown";
      reason: string;
    };

export type WebhookVerificationQuery = {
  "hub.mode"?: string;
  "hub.verify_token"?: string;
  "hub.challenge"?: string;
};

export type DownloadedMedia = {
  buffer: Buffer;
  mimeType: string;
};

export interface WhatsAppProvider {
  verifyWebhook(query: WebhookVerificationQuery): string | null;
  parseWebhookPayload(body: unknown): NormalizedWhatsAppMessage[];
  sendTextMessage(to: string, message: string): Promise<void>;
  downloadMedia(mediaId: string): Promise<DownloadedMedia>;
  healthCheck(): Promise<DependencyHealth>;
}
