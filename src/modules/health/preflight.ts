import type { AppConfig } from "../../config/env";
import { missingRequiredEnv } from "../../config/env";
import { logger } from "../../utils/logger";
import type { AlertService } from "../alerts/AlertService";
import type { HealthService } from "./HealthService";

export type PreflightResult = {
  mode: "ok" | "degraded";
  missingEnv: string[];
};

export async function runPreflight(
  config: AppConfig,
  health: HealthService,
  alerts: AlertService
): Promise<PreflightResult> {
  const missingEnv = missingRequiredEnv(config);
  if (missingEnv.length) {
    const message = `Missing required environment variables: ${missingEnv.join(", ")}`;
    logger.error({ missingEnv }, message);
    await alerts.notify({ serviceName: "preflight", status: "failed", message });
    if (config.strictPreflight) {
      throw new Error(message);
    }
    return { mode: "degraded", missingEnv };
  }

  const readiness = await health.readiness();
  if (readiness.status !== "ok") {
    const message = `Preflight readiness failed with status ${readiness.status}`;
    logger.error({ readiness }, message);
    await alerts.notify({ serviceName: "preflight", status: readiness.status, message });
    if (config.strictPreflight) {
      throw new Error(message);
    }
    return { mode: "degraded", missingEnv };
  }

  return { mode: "ok", missingEnv };
}
