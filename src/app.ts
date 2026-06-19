import express, { type NextFunction, type Request, type Response } from "express";
import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "./config/env";
import { loadEnv } from "./config/env";
import { prisma } from "./db/prisma";
import { LogAlertProvider } from "./modules/alerts/LogAlertProvider";
import { AlertService } from "./modules/alerts/AlertService";
import { WhatsAppAlertProvider } from "./modules/alerts/WhatsAppAlertProvider";
import { GoogleCalendarService, type CalendarService } from "./modules/calendar/GoogleCalendarService";
import { ConversationService } from "./modules/conversations/ConversationService";
import {
  PrismaConversationRepository,
  type ConversationRepository
} from "./modules/conversations/ConversationRepository";
import { createAdminRouter } from "./modules/admin/admin.routes";
import { HealthService } from "./modules/health/HealthService";
import { createHealthRouter } from "./modules/health/health.routes";
import { OpenAiService, type AiService } from "./modules/openai/OpenAiService";
import { EvolutionApiProvider } from "./modules/whatsapp/EvolutionApiProvider";
import { WhatsAppCloudProvider } from "./modules/whatsapp/WhatsAppCloudProvider";
import type { WhatsAppProvider } from "./modules/whatsapp/WhatsAppProvider";
import { createWhatsAppRouter } from "./modules/whatsapp/whatsapp.routes";
import { publicErrorMessage } from "./utils/errors";
import { logger } from "./utils/logger";

export type AppDependencies = {
  prisma: PrismaClient;
  whatsapp: WhatsAppProvider;
  ai: AiService;
  calendar: CalendarService;
  conversationsRepository: ConversationRepository;
  alerts: AlertService;
  health: HealthService;
  conversations: ConversationService;
};

export function buildDependencies(config: AppConfig, prismaClient: PrismaClient = prisma): AppDependencies {
  const whatsapp =
    config.whatsappProvider === "evolution" ? new EvolutionApiProvider() : new WhatsAppCloudProvider(config);
  const ai = new OpenAiService(config);
  const calendar = new GoogleCalendarService(config);
  const conversationsRepository = new PrismaConversationRepository(prismaClient);
  const fallbackAlerts = new LogAlertProvider();
  const alerts = new AlertService(config, new WhatsAppAlertProvider(config, whatsapp), fallbackAlerts);
  const health = new HealthService(prismaClient, ai, calendar, whatsapp, alerts);
  const conversations = new ConversationService(config, conversationsRepository, ai, calendar, whatsapp, alerts);

  return {
    prisma: prismaClient,
    whatsapp,
    ai,
    calendar,
    conversationsRepository,
    alerts,
    health,
    conversations
  };
}

export function createApp(config: AppConfig = loadEnv(), deps: AppDependencies = buildDependencies(config)) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));

  app.use(createHealthRouter(deps.health));
  app.use(createWhatsAppRouter(deps.whatsapp, deps.conversations));
  app.use(createAdminRouter(config, deps.health, deps.conversations));

  app.use((req, res) => {
    res.status(404).json({ error: "not_found", path: req.path });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const statusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : 500;
    logger.error({ err: error }, "request failed");
    res.status(statusCode).json({
      error: publicErrorMessage(error, config.nodeEnv === "production")
    });
  });

  return app;
}
