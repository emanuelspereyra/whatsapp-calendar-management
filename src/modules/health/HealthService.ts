import type { PrismaClient } from "@prisma/client";
import type { DependencyHealth, ServiceStatus } from "../../types";
import type { AlertService } from "../alerts/AlertService";
import type { CalendarService } from "../calendar/GoogleCalendarService";
import type { AiService } from "../openai/OpenAiService";
import type { WhatsAppProvider } from "../whatsapp/WhatsAppProvider";

export type ReadinessResult = {
  status: ServiceStatus;
  services: {
    database: ServiceStatus;
    openai: ServiceStatus;
    googleCalendar: ServiceStatus;
    whatsapp: ServiceStatus;
  };
  messages: Record<string, string>;
};

export class HealthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ai: AiService,
    private readonly calendar: CalendarService,
    private readonly whatsapp: WhatsAppProvider,
    private readonly alerts: AlertService
  ) {}

  async liveness() {
    return {
      status: "ok",
      uptime: process.uptime().toFixed(0),
      timestamp: new Date().toISOString()
    };
  }

  async readiness(): Promise<ReadinessResult> {
    const database = await this.checkDatabase();
    const [openai, googleCalendar, whatsapp] = await Promise.all([
      this.ai.healthCheck(),
      this.calendar.healthCheck(),
      this.whatsapp.healthCheck()
    ]);

    const services = {
      database: database.status,
      openai: openai.status,
      googleCalendar: googleCalendar.status,
      whatsapp: whatsapp.status
    };
    const messages = {
      database: database.message,
      openai: openai.message,
      googleCalendar: googleCalendar.message,
      whatsapp: whatsapp.message
    };

    await this.persistLogs({ database, openai, googleCalendar, whatsapp });
    await this.alertFailures({ database, openai, googleCalendar, whatsapp });

    return {
      status: overallStatus(Object.values(services)),
      services,
      messages
    };
  }

  private async checkDatabase(): Promise<DependencyHealth> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", message: "PostgreSQL reachable" };
    } catch (error) {
      return { status: "down", message: error instanceof Error ? error.message : "PostgreSQL failed" };
    }
  }

  private async persistLogs(health: Record<string, DependencyHealth>) {
    await Promise.allSettled(
      Object.entries(health).map(([serviceName, result]) =>
        this.prisma.healthCheckLog.create({
          data: {
            serviceName,
            status: result.status,
            message: result.message
          }
        })
      )
    );
  }

  private async alertFailures(health: Record<string, DependencyHealth>) {
    await Promise.allSettled(
      Object.entries(health)
        .filter(([, result]) => result.status !== "ok")
        .map(([serviceName, result]) =>
          this.alerts.notify({
            serviceName,
            status: result.status,
            message: result.message
          })
        )
    );
  }
}

export function overallStatus(statuses: ServiceStatus[]): ServiceStatus {
  if (statuses.every((status) => status === "ok")) return "ok";
  if (statuses.some((status) => status === "down")) return "down";
  return "degraded";
}
