import type { DependencyHealth } from "../../types";
import type {
  DownloadedMedia,
  NormalizedWhatsAppMessage,
  WebhookVerificationQuery,
  WhatsAppProvider
} from "./WhatsAppProvider";

export class EvolutionApiProvider implements WhatsAppProvider {
  verifyWebhook(_query: WebhookVerificationQuery): string | null {
    return null;
  }

  parseWebhookPayload(_body: unknown): NormalizedWhatsAppMessage[] {
    return [{ kind: "unknown", reason: "Evolution API provider is not implemented yet" }];
  }

  async sendTextMessage(_to: string, _message: string): Promise<void> {
    throw new Error("Evolution API provider is not implemented yet");
  }

  async downloadMedia(_mediaId: string): Promise<DownloadedMedia> {
    throw new Error("Evolution API provider is not implemented yet");
  }

  async healthCheck(): Promise<DependencyHealth> {
    return { status: "degraded", message: "Evolution API provider stub" };
  }
}
