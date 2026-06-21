import "dotenv/config";
import { z } from "zod";

const booleanFromEnv = z
  .union([z.boolean(), z.string(), z.undefined()])
  .transform((value) => {
    if (typeof value === "boolean") return value;
    if (!value) return false;
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  });

const integerFromEnv = (fallback: number) =>
  z
    .union([z.number(), z.string(), z.undefined()])
    .transform((value) => {
      if (typeof value === "number") return value;
      if (!value) return fallback;
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    });

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: integerFromEnv(3000),
  DATABASE_URL: z.string().default(""),
  ADMIN_API_KEY: z.string().default(""),
  ADMIN_PHONE: z.string().default(""),
  ADMIN_FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_SECRET: z.string().default(""),
  REGISTRATION_CODE: z.string().default(""),
  ALERTS_ENABLED: booleanFromEnv.default(false),
  AUTO_REPLY: booleanFromEnv.default(false),
  STRICT_PREFLIGHT: booleanFromEnv.default(true),
  HEALTHCHECK_INTERVAL_MINUTES: integerFromEnv(5),
  WHATSAPP_PROVIDER: z.enum(["cloud", "evolution"]).default("cloud"),
  WHATSAPP_VERIFY_TOKEN: z.string().default(""),
  WHATSAPP_ACCESS_TOKEN: z.string().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(""),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().default(""),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("gpt-4o-mini-transcribe"),
  OPENAI_EXTRACTION_MODEL: z.string().default("gpt-4.1-mini"),
  GOOGLE_CLIENT_EMAIL: z.string().default(""),
  GOOGLE_PRIVATE_KEY: z.string().default(""),
  GOOGLE_CALENDAR_ID: z.string().default("primary"),
  DEFAULT_TIMEZONE: z.string().default("America/Argentina/Buenos_Aires"),
  DEFAULT_DURATION_MINUTES: integerFromEnv(60),
  AUDIO_STORAGE_ENABLED: booleanFromEnv.default(false)
});

export type AppConfig = ReturnType<typeof loadEnv>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  const env = EnvSchema.parse(source);
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    adminApiKey: env.ADMIN_API_KEY,
    adminPhone: env.ADMIN_PHONE,
    adminFrontendOrigin: env.ADMIN_FRONTEND_ORIGIN,
    jwtSecret: env.JWT_SECRET,
    registrationCode: env.REGISTRATION_CODE,
    alertsEnabled: env.ALERTS_ENABLED,
    autoReply: env.AUTO_REPLY,
    strictPreflight: env.STRICT_PREFLIGHT,
    healthcheckIntervalMinutes: env.HEALTHCHECK_INTERVAL_MINUTES,
    whatsappProvider: env.WHATSAPP_PROVIDER,
    whatsappVerifyToken: env.WHATSAPP_VERIFY_TOKEN,
    whatsappAccessToken: env.WHATSAPP_ACCESS_TOKEN,
    whatsappPhoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    whatsappBusinessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiTranscriptionModel: env.OPENAI_TRANSCRIPTION_MODEL,
    openaiExtractionModel: env.OPENAI_EXTRACTION_MODEL,
    googleClientEmail: env.GOOGLE_CLIENT_EMAIL,
    googlePrivateKey: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    googleCalendarId: env.GOOGLE_CALENDAR_ID,
    defaultTimezone: env.DEFAULT_TIMEZONE,
    defaultDurationMinutes: env.DEFAULT_DURATION_MINUTES,
    audioStorageEnabled: env.AUDIO_STORAGE_ENABLED
  };
}

export function missingRequiredEnv(config: AppConfig): string[] {
  const required: Array<[keyof AppConfig, string]> = [
    ["databaseUrl", "DATABASE_URL"],
    ["adminApiKey", "ADMIN_API_KEY"],
    ["jwtSecret", "JWT_SECRET"],
    ["openaiApiKey", "OPENAI_API_KEY"],
    ["googleClientEmail", "GOOGLE_CLIENT_EMAIL"],
    ["googlePrivateKey", "GOOGLE_PRIVATE_KEY"],
    ["googleCalendarId", "GOOGLE_CALENDAR_ID"],
    ["whatsappVerifyToken", "WHATSAPP_VERIFY_TOKEN"],
    ["whatsappAccessToken", "WHATSAPP_ACCESS_TOKEN"],
    ["whatsappPhoneNumberId", "WHATSAPP_PHONE_NUMBER_ID"]
  ];

  if (config.alertsEnabled) {
    required.push(["adminPhone", "ADMIN_PHONE"]);
  }

  return required.filter(([key]) => !String(config[key] ?? "").trim()).map(([, name]) => name);
}
