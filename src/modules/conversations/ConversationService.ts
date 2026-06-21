import type { AppConfig } from "../../config/env";
import type { ConversationMessageContext } from "../../types";
import { addMinutes, toCalendarDateTime } from "../../utils/dates";
import { logger } from "../../utils/logger";
import type { AlertService } from "../alerts/AlertService";
import type { CalendarEventInput, CalendarService } from "../calendar/GoogleCalendarService";
import type { AiService } from "../openai/OpenAiService";
import type { SchedulingIntent } from "../openai/schemas";
import type { NormalizedWhatsAppMessage, WhatsAppProvider } from "../whatsapp/WhatsAppProvider";
import type {
  CalendarEventRecord,
  ConversationListFilter,
  ConversationListResult,
  ConversationRecord,
  ConversationRepository
} from "./ConversationRepository";

const RECENT_MESSAGE_LIMIT = 12;

export type ProcessingResult = {
  ignored?: boolean;
  conversationId?: string;
  status?: string;
  calendarEventCreated?: boolean;
  suggestedReply?: string;
};

export type CalendarEventView = CalendarEventRecord & { calendarLink: string | null };

export class ConversationService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: ConversationRepository,
    private readonly ai: AiService,
    private readonly calendar: CalendarService,
    private readonly whatsapp: WhatsAppProvider,
    private readonly alerts: AlertService
  ) {}

  async processWhatsAppRecord(record: NormalizedWhatsAppMessage, correlationId: string): Promise<ProcessingResult> {
    if (record.kind !== "message") {
      return { ignored: true };
    }

    const client = await this.repository.findOrCreateClient(record.from, record.contactName);
    const conversation = await this.repository.findOrCreateActiveConversation(client.id);

    try {
      const content = await this.saveIncomingMessage(conversation.id, record);
      const recentMessages = await this.repository.getRecentMessages(conversation.id, RECENT_MESSAGE_LIMIT);
      const extraction = await this.ai.extractSchedulingIntent({
        phone: record.from,
        timezone: this.config.defaultTimezone,
        now: record.timestamp,
        messages: recentMessages.map(toContextMessage)
      });

      const updated = await this.repository.updateConversation(conversation.id, {
        status: statusFromExtraction(extraction),
        lastIntent: extraction.intent,
        proposedDate: extraction.date,
        proposedTime: extraction.time,
        proposedDurationMinutes: extraction.durationMinutes ?? this.config.defaultDurationMinutes,
        proposedTopic: extraction.topic,
        suggestedReply: extraction.suggestedReply,
        lastError: null
      });

      if (!canCreateCalendarEvent(extraction, record.from)) {
        await this.maybeAutoReply(record.from, extraction.suggestedReply);
        return {
          conversationId: conversation.id,
          status: String(updated.status),
          calendarEventCreated: false,
          suggestedReply: extraction.suggestedReply
        };
      }

      return this.scheduleConversation(updated, extraction, record.from, content, correlationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "conversation processing failed";
      logger.error({ err: error, correlationId, conversationId: conversation.id }, "conversation processing failed");
      await this.repository.updateConversation(conversation.id, {
        status: "failed",
        lastError: message
      });
      await this.alerts.notify({
        serviceName: "conversation",
        status: "failed",
        message,
        error: message
      });
      return { conversationId: conversation.id, status: "failed", calendarEventCreated: false };
    }
  }

  async approveConversation(conversationId: string, approvedByUserId?: string): Promise<ProcessingResult> {
    const conversation = await this.requireConversation(conversationId);
    if (approvedByUserId) {
      await this.repository.updateConversation(conversation.id, { approvedByUserId });
    }
    if (!conversation.proposedDate || !conversation.proposedTime) {
      await this.repository.updateConversation(conversation.id, {
        status: "missing_information",
        suggestedReply: "Falta fecha u hora para aprobar la agenda."
      });
      return { conversationId, status: "missing_information", calendarEventCreated: false };
    }

    const extraction: SchedulingIntent = {
      intent: "schedule_class",
      confidence: 1,
      clientName: conversation.client?.name ?? null,
      date: conversation.proposedDate,
      time: conversation.proposedTime,
      durationMinutes: conversation.proposedDurationMinutes ?? this.config.defaultDurationMinutes,
      topic: conversation.proposedTopic,
      confirmedByClient: true,
      missingFields: [],
      isAmbiguous: false,
      shouldCreateCalendarEvent: true,
      suggestedReply: "Agenda aprobada manualmente."
    };

    return this.scheduleConversation(conversation, extraction, conversation.client?.phone ?? "", "manual approval", "admin");
  }

  async listConversations(filter: ConversationListFilter): Promise<ConversationListResult> {
    return this.repository.listConversations(filter);
  }

  async listRecentCalendarEvents(limit: number): Promise<CalendarEventView[]> {
    const events = await this.repository.listRecentCalendarEvents(limit);
    return events.map((event) => ({
      ...event,
      calendarLink: buildCalendarLink(event.googleEventId, this.config.googleCalendarId)
    }));
  }

  async rejectConversation(conversationId: string, rejectedByUserId?: string): Promise<ProcessingResult> {
    await this.repository.updateConversation(conversationId, {
      status: "cancelled",
      suggestedReply: "Agenda rechazada manualmente.",
      ...(rejectedByUserId ? { rejectedByUserId } : {})
    });
    return { conversationId, status: "cancelled", calendarEventCreated: false };
  }

  private async saveIncomingMessage(conversationId: string, record: Extract<NormalizedWhatsAppMessage, { kind: "message" }>) {
    if (record.type === "text") {
      await this.repository.appendMessage({
        conversationId,
        direction: "inbound",
        type: "text",
        rawText: record.text,
        timestamp: record.timestamp
      });
      return record.text;
    }

    try {
      const media = await this.whatsapp.downloadMedia(record.mediaId);
      const transcription = await this.ai.transcribeAudio(media.buffer, record.mimeType ?? media.mimeType);
      await this.repository.appendMessage({
        conversationId,
        direction: "inbound",
        type: "audio",
        mediaId: record.mediaId,
        transcription,
        timestamp: record.timestamp
      });
      return transcription;
    } catch (error) {
      const message = error instanceof Error ? error.message : "audio transcription failed";
      await this.alerts.notify({
        serviceName: "transcription",
        status: "failed",
        message,
        error: message
      });
      throw error;
    }
  }

  private async scheduleConversation(
    conversation: ConversationRecord,
    extraction: SchedulingIntent,
    phone: string,
    sourceText: string,
    correlationId: string
  ): Promise<ProcessingResult> {
    if (!extraction.date || !extraction.time) {
      return { conversationId: conversation.id, status: "missing_information", calendarEventCreated: false };
    }

    const startDateTime = toCalendarDateTime(extraction.date, extraction.time);
    const endDateTime = addMinutes(startDateTime, extraction.durationMinutes ?? this.config.defaultDurationMinutes);

    try {
      const available = await this.calendar.checkAvailability(startDateTime, endDateTime);
      if (!available) {
        await this.repository.createCalendarEvent({
          conversationId: conversation.id,
          title: buildEventTitle(extraction, phone),
          description: buildEventDescription(conversation.id, phone, sourceText, "conflict"),
          startDateTime,
          endDateTime,
          status: "conflict"
        });
        const suggestedReply = "Ese horario no esta disponible. Te propongo buscar otra opcion.";
        await this.repository.updateConversation(conversation.id, {
          status: "pending_confirmation",
          suggestedReply
        });
        await this.maybeAutoReply(phone, suggestedReply);
        return {
          conversationId: conversation.id,
          status: "pending_confirmation",
          calendarEventCreated: false,
          suggestedReply
        };
      }

      await this.repository.updateConversation(conversation.id, { status: "confirmed_ready_to_schedule" });
      const eventInput: CalendarEventInput = {
        title: buildEventTitle(extraction, phone),
        description: buildEventDescription(conversation.id, phone, sourceText, "texto/audio"),
        startDateTime,
        endDateTime
      };
      const event = await this.calendar.createEvent(eventInput);
      await this.repository.createCalendarEvent({
        conversationId: conversation.id,
        googleEventId: event.googleEventId,
        ...eventInput,
        status: "created"
      });
      const suggestedReply = extraction.suggestedReply || "Listo, la clase quedo agendada.";
      await this.repository.updateConversation(conversation.id, {
        status: "scheduled",
        suggestedReply
      });
      await this.maybeAutoReply(phone, suggestedReply);
      return {
        conversationId: conversation.id,
        status: "scheduled",
        calendarEventCreated: true,
        suggestedReply
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "calendar scheduling failed";
      logger.error({ err: error, correlationId, conversationId: conversation.id }, "calendar scheduling failed");
      await this.repository.updateConversation(conversation.id, { status: "failed", lastError: message });
      await this.alerts.notify({ serviceName: "googleCalendar", status: "failed", message, error: message });
      return { conversationId: conversation.id, status: "failed", calendarEventCreated: false };
    }
  }

  private async maybeAutoReply(phone: string, message: string) {
    if (!message) return;
    if (this.config.autoReply) {
      await this.whatsapp.sendTextMessage(phone, message);
      return;
    }
    await this.alerts.notify({
      serviceName: "autoReply",
      status: "degraded",
      message: `AUTO_REPLY=false. Suggested reply for ${phone}: ${message}`
    });
  }

  private async requireConversation(id: string): Promise<ConversationRecord> {
    const conversation = await this.repository.findConversationById(id);
    if (!conversation) {
      throw new Error(`Conversation ${id} not found`);
    }
    return conversation;
  }
}

function buildCalendarLink(googleEventId: string | null, calendarId: string): string | null {
  if (!googleEventId) return null;
  const eid = Buffer.from(`${googleEventId} ${calendarId}`).toString("base64").replace(/=+$/, "");
  return `https://www.google.com/calendar/event?eid=${eid}`;
}

function statusFromExtraction(extraction: SchedulingIntent): string {
  if (extraction.isAmbiguous) return "pending_confirmation";
  if (extraction.missingFields.length > 0) return "missing_information";
  if (!extraction.confirmedByClient) return "pending_confirmation";
  if (extraction.shouldCreateCalendarEvent) return "confirmed_ready_to_schedule";
  return "collecting_information";
}

function canCreateCalendarEvent(extraction: SchedulingIntent, phone: string): boolean {
  return Boolean(
    extraction.date &&
      extraction.time &&
      (extraction.clientName || phone) &&
      extraction.confirmedByClient &&
      !extraction.isAmbiguous &&
      extraction.shouldCreateCalendarEvent
  );
}

function toContextMessage(message: {
  direction: string;
  type: string;
  rawText: string | null;
  transcription: string | null;
  timestamp: Date;
}): ConversationMessageContext {
  return {
    direction: message.direction as ConversationMessageContext["direction"],
    type: message.type as ConversationMessageContext["type"],
    content: message.transcription ?? message.rawText ?? "",
    timestamp: message.timestamp
  };
}

function buildEventTitle(extraction: SchedulingIntent, phone: string): string {
  const clientName = extraction.clientName ?? phone;
  return extraction.topic ? `Clase con ${clientName} - ${extraction.topic}` : `Clase con ${clientName}`;
}

function buildEventDescription(conversationId: string, phone: string, sourceText: string, source: string): string {
  return [
    `Telefono del cliente: ${phone}`,
    `Resumen de contexto: ${sourceText.slice(0, 500)}`,
    `Fuente: ${source}`,
    `Timestamp: ${new Date().toISOString()}`,
    `Conversation ID: ${conversationId}`
  ].join("\n");
}
