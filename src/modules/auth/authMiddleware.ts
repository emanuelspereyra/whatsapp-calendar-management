import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { AppConfig } from "../../config/env";
import { AppError } from "../../utils/errors";
import type { AuthService } from "./AuthService";

declare module "express-serve-static-core" {
  interface Request {
    authRole?: string;
    authUserId?: string;
  }
}

/**
 * Accepts either a logged-in user's Bearer JWT or the admin API key
 * (x-admin-api-key), so machine/admin scripts keep working alongside the UI.
 * The API key always grants the "admin" role but has no associated userId
 * (so audit fields like approvedByUserId stay null for API-key actions).
 */
export function createRequireAuth(config: AppConfig, auth: AuthService) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const apiKey = req.header("x-admin-api-key");
    if (safeEqualSecret(apiKey, config.adminApiKey)) {
      req.authRole = "admin";
      next();
      return;
    }

    const header = req.header("authorization");
    if (header?.startsWith("Bearer ")) {
      auth
        .verifyToken(header.slice(7))
        .then((payload) => {
          req.authRole = payload.role;
          req.authUserId = payload.sub;
          next();
        })
        .catch(next);
      return;
    }

    next(new AppError("Unauthorized", 401, true));
  };
}

export function requireAdminRole(req: Request, _res: Response, next: NextFunction) {
  if (req.authRole !== "admin") {
    next(new AppError("Se requiere rol admin para esta acción", 403, true));
    return;
  }
  next();
}

function safeEqualSecret(value: string | undefined, expected: string): boolean {
  if (!value || !expected) return false;
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}
