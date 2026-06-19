import type { CalendarEventStatus, ConversationStatus, MessageDirection, MessageType, PrismaClient } from "@prisma/client";

export type ClientRecord = {
  id: string;
  phone: string;
  name: string | null;
  email?: string | null;
};

export type ConversationRecord = {
  id: string;
  clientId: string;
  status: ConversationStatus | string;
  lastIntent: string | null;
  proposedDate: string | null;
  proposedTime: string | null;
  proposedDurationMinutes: number | null;
  proposedTopic: string | null;
  suggestedReply: string | null;
  lastError: string | null;
  client?: ClientRecord;
};

export type MessageRecord = {
  id: string;
  conversationId: string;
  direction: MessageDirection | string;
  type: MessageType | string;
  rawText: string | null;
  transcription: string | null;
  mediaId: string | null;
  timestamp: Date;
};

export type ConversationUpdate = Partial<{
  status: ConversationStatus | string;
  lastIntent: string | null;
  proposedDate: string | null;
  proposedTime: string | null;
  proposedDurationMinutes: number | null;
  proposedTopic: string | null;
  suggestedReply: string | null;
  lastError: string | null;
}>;

export type MessageCreate = {
  conversationId: string;
  direction: MessageDirection | string;
  type: MessageType | string;
  rawText?: string | null;
  transcription?: string | null;
  mediaId?: string | null;
  timestamp: Date;
};

export type CalendarEventCreate = {
  conversationId: string;
  googleEventId?: string | null;
  title: string;
  description: string;
  startDateTime: Date;
  endDateTime: Date;
  status: CalendarEventStatus | string;
};

export interface ConversationRepository {
  findOrCreateClient(phone: string, name?: string): Promise<ClientRecord>;
  findOrCreateActiveConversation(clientId: string): Promise<ConversationRecord>;
  findConversationById(id: string): Promise<ConversationRecord | null>;
  updateConversation(id: string, data: ConversationUpdate): Promise<ConversationRecord>;
  appendMessage(input: MessageCreate): Promise<MessageRecord>;
  getRecentMessages(conversationId: string, limit: number): Promise<MessageRecord[]>;
  createCalendarEvent(input: CalendarEventCreate): Promise<void>;
}

export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findOrCreateClient(phone: string, name?: string): Promise<ClientRecord> {
    return this.prisma.client.upsert({
      where: { phone },
      create: { phone, name },
      update: name ? { name } : {}
    });
  }

  async findOrCreateActiveConversation(clientId: string): Promise<ConversationRecord> {
    const active = await this.prisma.conversation.findFirst({
      where: {
        clientId,
        status: { in: ["idle", "collecting_information", "pending_confirmation", "missing_information", "failed"] }
      },
      orderBy: { updatedAt: "desc" },
      include: { client: true }
    });

    if (active) return active;

    return this.prisma.conversation.create({
      data: { clientId, status: "idle" },
      include: { client: true }
    });
  }

  async findConversationById(id: string): Promise<ConversationRecord | null> {
    return this.prisma.conversation.findUnique({ where: { id }, include: { client: true } });
  }

  async updateConversation(id: string, data: ConversationUpdate): Promise<ConversationRecord> {
    return this.prisma.conversation.update({
      where: { id },
      data: data as any,
      include: { client: true }
    });
  }

  async appendMessage(input: MessageCreate): Promise<MessageRecord> {
    return this.prisma.message.create({
      data: {
        conversationId: input.conversationId,
        direction: input.direction as MessageDirection,
        type: input.type as MessageType,
        rawText: input.rawText,
        transcription: input.transcription,
        mediaId: input.mediaId,
        timestamp: input.timestamp
      }
    });
  }

  async getRecentMessages(conversationId: string, limit: number): Promise<MessageRecord[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { timestamp: "desc" },
      take: limit
    });
    return rows.reverse();
  }

  async createCalendarEvent(input: CalendarEventCreate): Promise<void> {
    await this.prisma.calendarEvent.create({
      data: {
        conversationId: input.conversationId,
        googleEventId: input.googleEventId,
        title: input.title,
        description: input.description,
        startDateTime: input.startDateTime,
        endDateTime: input.endDateTime,
        status: input.status as CalendarEventStatus
      }
    });
  }
}
