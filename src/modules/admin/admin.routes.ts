import type { Request, Response, NextFunction, Router } from "express";
import express from "express";
import type { AppConfig } from "../../config/env";
import { AppError } from "../../utils/errors";
import type { ConversationService } from "../conversations/ConversationService";
import type { HealthService } from "../health/HealthService";

const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function createAdminRouter(
  config: AppConfig,
  health: HealthService,
  conversations: ConversationService
): Router {
  const router = express.Router();
  router.use(requireAdminApiKey(config));
  router.use(adminRateLimit);

  router.post("/admin/healthcheck/run", async (_req, res, next) => {
    try {
      res.json(await health.readiness());
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/conversations/:id/approve", async (req, res, next) => {
    try {
      res.json(await conversations.approveConversation(req.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/conversations/:id/reject", async (req, res, next) => {
    try {
      res.json(await conversations.rejectConversation(req.params.id));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function requireAdminApiKey(config: AppConfig) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header("x-admin-api-key");
    if (!config.adminApiKey || header !== config.adminApiKey) {
      next(new AppError("Unauthorized", 401, true));
      return;
    }
    next();
  };
}

function adminRateLimit(req: Request, _res: Response, next: NextFunction) {
  const key = `${req.ip}:${req.header("x-admin-api-key") ?? "missing"}`;
  const now = Date.now();
  const windowMs = 60_000;
  const current = requestCounts.get(key);
  if (!current || current.resetAt < now) {
    requestCounts.set(key, { count: 1, resetAt: now + windowMs });
    next();
    return;
  }
  current.count += 1;
  if (current.count > 60) {
    next(new AppError("Too many admin requests", 429, true));
    return;
  }
  next();
}
