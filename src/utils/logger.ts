import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "*.token",
      "*.accessToken",
      "*.apiKey",
      "*.authorization",
      "req.headers.authorization",
      "config.whatsappAccessToken",
      "config.openaiApiKey",
      "config.googlePrivateKey"
    ],
    censor: "[redacted]"
  }
});

export type Logger = typeof logger;
