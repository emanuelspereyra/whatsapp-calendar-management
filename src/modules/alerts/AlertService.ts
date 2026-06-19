import type { AppConfig } from "../../config/env";
import { logger } from "../../utils/logger";

export type AlertInput = {
  serviceName: string;
  status: "ok" | "degraded" | "down" | "failed";
  message: string;
  error?: string;
  timestamp?: Date;
};

export interface AlertProvider {
  sendAlert(message: string): Promise<void>;
}

export class AlertService {
  constructor(
    private readonly config: AppConfig,
    private readonly primary: AlertProvider,
    private readonly fallback: AlertProvider
  ) {}

  async notify(input: AlertInput): Promise<void> {
    if (!this.config.alertsEnabled) return;
    const timestamp = input.timestamp ?? new Date();
    const message = `Healthcheck fallo: ${input.serviceName}. Estado: ${input.status}. Error: ${
      input.error ?? input.message
    }. Timestamp: ${timestamp.toISOString()}`;

    try {
      await this.primary.sendAlert(message);
    } catch (error) {
      logger.warn({ err: error, serviceName: input.serviceName }, "primary alert failed");
      await this.fallback.sendAlert(message);
    }
  }
}
