import type { Request, Response, NextFunction, Router } from "express";
import express from "express";
import { z } from "zod";
import { AppError } from "../../utils/errors";
import type { RateLimiter } from "../ratelimit/RateLimiter";
import type { AuthService } from "./AuthService";

const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(10).max(128)
});

const registerSchema = credentialsSchema.extend({
  code: z.string().optional()
});

export function createAuthRouter(auth: AuthService, rateLimiter: RateLimiter): Router {
  const router = express.Router();
  router.use(createAuthRateLimit(rateLimiter));

  router.post("/auth/register", async (req, res, next) => {
    try {
      const body = registerSchema.parse(req.body);
      res.status(201).json(await auth.register(body.username, body.password, body.code));
    } catch (error) {
      next(toAppError(error));
    }
  });

  router.post("/auth/login", async (req, res, next) => {
    try {
      const body = credentialsSchema.parse(req.body);
      res.json(await auth.login(body.username, body.password));
    } catch (error) {
      next(toAppError(error));
    }
  });

  return router;
}

function toAppError(error: unknown): unknown {
  if (error instanceof z.ZodError) {
    return new AppError("Usuario o contrasena invalidos", 400, true);
  }
  return error;
}

function createAuthRateLimit(rateLimiter: RateLimiter) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const key = `auth:${req.ip ?? "unknown"}`;
    try {
      const allowed = await rateLimiter.consume(key, 20, 60_000);
      if (!allowed) {
        next(new AppError("Demasiados intentos, probá más tarde", 429, true));
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
