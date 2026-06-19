import { vi } from "vitest";
import { loadEnv, type AppConfig } from "../src/config/env";
import type { AlertProvider } from "../src/modules/alerts/AlertService";
import { AlertService } from "../src/modules/alerts/AlertService";
import type { CalendarService } from "../src/modules/calendar/GoogleCalendarService";
import type {
  CalendarEventCreate,
  ClientRecord,
  ConversationRecord,
  ConversationRepository,
  ConversationUpdate,
  MessageCreate,
  MessageRecord
} from "../src/modules/conversations/ConversationRepository";
import { ConversationService } from "../src/modules/conversations/ConversationService";
import type { AiService } from "../src/modules/openai/OpenAiService";
import type { SchedulingIntent } from "../src/modules/openai/schemas";
import type { DownloadedMedia, WhatsAppProvider } from "../src/modules/whatsapp/WhatsAppProvider";
import type { DependencyHealth, SchedulingContext } from "../src/types";

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...loadEnv({
      NODE_ENV: "test",
      PORT: "3000",
      DATABASE_URL: "postgresql://test",
      ADMIN_API_KEY: "admin-key",
      ADMIN_PHONE: "5491111111111",
      ALERTS_ENABLED: "true",
      AUTO_REPLY: "false",
      STRICT_PREFLIGHT: "true",
      HEALTHCHECK_INTERVAL_MINUTES: "5",
      WHATSAPP_PROVIDER: "cloud",
      WHATSAPP_VERIFY_TOKEN: "verify-token",
      WHATSAPP_ACCESS_TOKEN: "wa-token",
      WHATSAPP_PHONE_NUMBER_ID: "phone-id",
      WHATSAPP_BUSINESS_ACCOUNT_ID: "business-id",
      OPENAI_API_KEY: "openai-key",
      OPENAI_TRANSCRIPTION_MODEL: "transcribe",
      OPENAI_EXTRACTION_MODEL: "extract",
      GOOGLE_CLIENT_EMAIL: "svc@example.com",
      GOOGLE_PRIVATE_KEY: "private-key",
      GOOGLE_CALENDAR_ID: "calendar-id",
      DEFAULT_TIMEZONE: "America/Argentina/Buenos_Aires",
      DEFAULT_DURATION_MINUTES: "60",
      AUDIO_STORAGE_ENABLED: "false"
    } as any),
    ...overrides
  };
}

export const validExtraction: SchedulingIntent = {
  intent: "schedule_class",
  confidence: 0.96,
  clientName: "Cliente",
  date: "2026-06-19",
  time: "19:00",
  durationMinutes: 60,
  topic: "Playwright e IA aplicada a QA",
  confirmedByClient: true,
  missingFields: [],
  isAmbiguous: false,
  shouldCreateCalendarEvent: true,
  suggestedReply: "Listo, queda agendado."
};

export class InMemoryConversationRepository implements ConversationRepository {
  clients = new Map<string, ClientRecord>();
  conversations = new Map<string, ConversationRecord>();
  messages: MessageRecord[] = [];
  calendarEvents: CalendarEventCreate[] = [];
  updates: ConversationUpdate[] = [];

  async findOrCreateClient(phone: string, name?: string): Promise<ClientRecord> {
    const existing = this.clients.get(phone);
    if (existing) return existing;
    const client = { id: `client-${this.clients.size + 1}`, phone, name: name ?? null };
    this.clients.set(phone, client);
    return client;
  }

  async findOrCreateActiveConversation(clientId: string): Promise<ConversationRecord> {
    const existing = [...this.conversations.values()].find((conversation) => conversation.clientId === clientId);
    if (existing) return existing;
    const client = [...this.clients.values()].find((value) => value.id === clientId);
    const conversation: ConversationRecord = {
      id: `conversation-${this.conversations.size + 1}`,
      clientId,
      status: "idle",
      lastIntent: null,
      proposedDate: null,
      proposedTime: null,
      proposedDurationMinutes: null,
      proposedTopic: null,
      suggestedReply: null,
      lastError: null,
      client
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  async findConversationById(id: string): Promise<ConversationRecord | null> {
    return this.conversations.get(id) ?? null;
  }

  async updateConversation(id: string, data: ConversationUpdate): Promise<ConversationRecord> {
    const current = this.conversations.get(id);
    if (!current) throw new Error(`missing conversation ${id}`);
    const updated = { ...current, ...data };
    this.conversations.set(id, updated);
    this.updates.push(data);
    return updated;
  }

  async appendMessage(input: MessageCreate): Promise<MessageRecord> {
    const message: MessageRecord = {
      id: `message-${this.messages.length + 1}`,
      conversationId: input.conversationId,
      direction: input.direction,
      type: input.type,
      rawText: input.rawText ?? null,
      transcription: input.transcription ?? null,
      mediaId: input.mediaId ?? null,
      timestamp: input.timestamp
    };
    this.messages.push(message);
    return message;
  }

  async getRecentMessages(conversationId: string, limit: number): Promise<MessageRecord[]> {
    return this.messages.filter((message) => message.conversationId === conversationId).slice(-limit);
  }

  async createCalendarEvent(input: CalendarEventCreate): Promise<void> {
    this.calendarEvents.push(input);
  }
}

export class FakeWhatsAppProvider implements WhatsAppProvider {
  sentMessages: Array<{ to: string; message: string }> = [];
  media: DownloadedMedia = { buffer: Buffer.from("audio"), mimeType: "audio/ogg" };
  health: DependencyHealth = { status: "ok", message: "ok" };
  verifyWebhook = vi.fn((query: any) =>
    query["hub.mode"] === "subscribe" && query["hub.verify_token"] === "verify-token" ? query["hub.challenge"] : null
  );
  parseWebhookPayload = vi.fn(() => []);
  sendTextMessage = vi.fn(async (to: string, message: string) => {
    this.sentMessages.push({ to, message });
  });
  downloadMedia = vi.fn(async () => this.media);
  healthCheck = vi.fn(async () => this.health);
}

export class FakeAiService implements AiService {
  extraction: SchedulingIntent = validExtraction;
  transcription = "audio transcripto";
  health: DependencyHealth = { status: "ok", message: "ok" };
  transcribeAudio = vi.fn(async () => this.transcription);
  extractSchedulingIntent = vi.fn(async (_context: SchedulingContext) => this.extraction);
  healthCheck = vi.fn(async () => this.health);
}

export class FakeCalendarService implements CalendarService {
  available = true;
  health: DependencyHealth = { status: "ok", message: "ok" };
  createdEvents: any[] = [];
  checkAvailability = vi.fn(async () => this.available);
  createEvent = vi.fn(async (input: any) => {
    this.createdEvents.push(input);
    return { googleEventId: `google-${this.createdEvents.length}` };
  });
  healthCheck = vi.fn(async () => this.health);
}

export class CapturingAlertProvider implements AlertProvider {
  messages: string[] = [];
  shouldFail = false;
  async sendAlert(message: string): Promise<void> {
    if (this.shouldFail) throw new Error("alert failed");
    this.messages.push(message);
  }
}

export function buildConversationHarness(config: AppConfig = testConfig()) {
  const repo = new InMemoryConversationRepository();
  const whatsapp = new FakeWhatsAppProvider();
  const ai = new FakeAiService();
  const calendar = new FakeCalendarService();
  const primaryAlerts = new CapturingAlertProvider();
  const fallbackAlerts = new CapturingAlertProvider();
  const alerts = new AlertService(config, primaryAlerts, fallbackAlerts);
  const service = new ConversationService(config, repo, ai, calendar, whatsapp, alerts);
  return { config, repo, whatsapp, ai, calendar, primaryAlerts, fallbackAlerts, alerts, service };
}

export function textRecord(text = "Si, confirmado. Quiero ver Playwright e IA aplicada a QA.") {
  return {
    kind: "message" as const,
    providerMessageId: "wamid-1",
    from: "5491111111111",
    timestamp: new Date("2026-06-19T18:00:00.000Z"),
    type: "text" as const,
    text,
    contactName: "Cliente"
  };
}

export function audioRecord() {
  return {
    kind: "message" as const,
    providerMessageId: "wamid-2",
    from: "5491111111111",
    timestamp: new Date("2026-06-19T18:00:00.000Z"),
    type: "audio" as const,
    mediaId: "media-1",
    mimeType: "audio/ogg",
    contactName: "Cliente"
  };
}
