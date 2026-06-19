import type { Router } from "express";
import express from "express";
import { randomUUID } from "node:crypto";
import type { ConversationService } from "../conversations/ConversationService";
import type { WhatsAppProvider } from "./WhatsAppProvider";

export function createWhatsAppRouter(whatsapp: WhatsAppProvider, conversations: ConversationService): Router {
  const router = express.Router();

  router.get("/webhooks/whatsapp", (req, res) => {
    const challenge = whatsapp.verifyWebhook(req.query);
    if (!challenge) {
      res.status(403).send("Forbidden");
      return;
    }
    res.type("text").send(challenge);
  });

  router.post("/webhooks/whatsapp", async (req, res, next) => {
    const correlationId = req.header("x-correlation-id") ?? randomUUID();
    try {
      const records = whatsapp.parseWebhookPayload(req.body);
      for (const record of records) {
        await conversations.processWhatsAppRecord(record, correlationId);
      }
      res.json({ ok: true, correlationId });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
