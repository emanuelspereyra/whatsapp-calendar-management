import type { AppConfig } from "../../config/env";
import type { WhatsAppProvider } from "../whatsapp/WhatsAppProvider";
import type { AlertProvider } from "./AlertService";

export class WhatsAppAlertProvider implements AlertProvider {
  constructor(
    private readonly config: AppConfig,
    private readonly whatsapp: WhatsAppProvider
  ) {}

  async sendAlert(message: string): Promise<void> {
    if (!this.config.adminPhone) {
      throw new Error("ADMIN_PHONE is not configured");
    }
    await this.whatsapp.sendTextMessage(this.config.adminPhone, message);
  }
}
