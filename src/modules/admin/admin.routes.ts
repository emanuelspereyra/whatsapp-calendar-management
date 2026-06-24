import type { Request, Response, NextFunction, Router } from "express";
import express from "express";
import { z } from "zod";
import type { AppConfig } from "../../config/env";
import { AppError } from "../../utils/errors";
import type { AuthService } from "../auth/AuthService";
import { createRequireAuth, requireAdminRole } from "../auth/authMiddleware";
import type { UserRepository } from "../auth/UserRepository";
import type { ConversationService } from "../conversations/ConversationService";
import type { HealthService } from "../health/HealthService";
import type { RateLimiter } from "../ratelimit/RateLimiter";

const roleSchema = z.object({ role: z.enum(["admin", "viewer"]) });

export function createAdminRouter(
  config: AppConfig,
  health: HealthService,
  conversations: ConversationService,
  auth: AuthService,
  users: UserRepository,
  rateLimiter: RateLimiter
): Router {
  const router = express.Router();
  router.use(createRequireAuth(config, auth));
  router.use(createAdminRateLimit(rateLimiter));

  router.post("/admin/healthcheck/run", requireAdminRole, async (_req, res, next) => {
    try {
      res.json(await health.readiness());
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/conversations", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status.split(",") : undefined;
      const take = Math.min(Number(req.query.take) || 20, 100);
      const skip = Number(req.query.skip) || 0;
      const { data, total } = await conversations.listConversations({ status, skip, take });
      res.json({ data, pagination: { skip, take, total } });
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/calendar-events", async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 10, 50);
      res.json({ data: await conversations.listRecentCalendarEvents(limit) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/conversations/:id/approve", requireAdminRole, async (req: Request, res, next) => {
    try {
      res.json(await conversations.approveConversation(String(req.params.id), req.authUserId));
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/conversations/:id/reject", requireAdminRole, async (req: Request, res, next) => {
    try {
      res.json(await conversations.rejectConversation(String(req.params.id), req.authUserId));
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/users", requireAdminRole, async (_req, res, next) => {
    try {
      res.json({ data: await users.listUsers() });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/admin/users/:id/role", requireAdminRole, async (req: Request, res, next) => {
    try {
      const body = roleSchema.parse(req.body);
      const id = String(req.params.id);
      if (body.role !== "admin") {
        const all = await users.listUsers();
        const target = all.find((u) => u.id === id);
        const adminCount = all.filter((u) => u.role === "admin").length;
        if (target?.role === "admin" && adminCount <= 1) {
          throw new AppError("No se puede quitar el rol admin al único administrador", 409, true);
        }
      }
      // updateRole also bumps tokenVersion, invalidating existing tokens for this
      // user — role is embedded in the JWT, so stale tokens must stop working.
      res.json(await users.updateRole(id, body.role));
    } catch (error) {
      next(error instanceof z.ZodError ? new AppError("Rol inválido", 400, true) : error);
    }
  });

  router.post("/admin/users/:id/revoke", requireAdminRole, async (req: Request, res, next) => {
    try {
      await auth.revokeUserSessions(String(req.params.id));
      res.json({ revoked: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function createAdminRateLimit(rateLimiter: RateLimiter) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const key = `admin:${req.ip ?? "unknown"}`;
    try {
      const allowed = await rateLimiter.consume(key, 60, 60_000);
      if (!allowed) {
        next(new AppError("Too many admin requests", 429, true));
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
