import type { Router } from "express";
import express from "express";
import type { HealthService } from "./HealthService";

export function createHealthRouter(health: HealthService): Router {
  const router = express.Router();

  router.get("/health", async (_req, res, next) => {
    try {
      res.json(await health.liveness());
    } catch (error) {
      next(error);
    }
  });

  router.get("/ready", async (_req, res, next) => {
    try {
      const result = await health.readiness();
      const statusCode = result.status === "ok" ? 200 : result.status === "degraded" ? 200 : 503;
      res.status(statusCode).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
