import { logger } from "../../utils/logger";
import type { AlertProvider } from "./AlertService";

export class LogAlertProvider implements AlertProvider {
  async sendAlert(message: string): Promise<void> {
    logger.error({ alert: message }, "alert fallback");
  }
}
