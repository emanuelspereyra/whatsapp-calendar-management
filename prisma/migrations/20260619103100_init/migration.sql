CREATE TYPE "ConversationStatus" AS ENUM (
  'idle',
  'collecting_information',
  'pending_confirmation',
  'missing_information',
  'confirmed_ready_to_schedule',
  'scheduled',
  'cancelled',
  'failed'
);

CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound', 'system');

CREATE TYPE "MessageType" AS ENUM ('text', 'audio', 'system');

CREATE TYPE "CalendarEventStatus" AS ENUM ('created', 'conflict', 'failed', 'cancelled');

CREATE TYPE "HealthStatus" AS ENUM ('ok', 'degraded', 'down');

CREATE TABLE "Client" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "name" TEXT,
  "email" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "status" "ConversationStatus" NOT NULL DEFAULT 'idle',
  "lastIntent" TEXT,
  "proposedDate" TEXT,
  "proposedTime" TEXT,
  "proposedDurationMinutes" INTEGER,
  "proposedTopic" TEXT,
  "suggestedReply" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "direction" "MessageDirection" NOT NULL,
  "type" "MessageType" NOT NULL,
  "rawText" TEXT,
  "transcription" TEXT,
  "mediaId" TEXT,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarEvent" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "googleEventId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "startDateTime" TIMESTAMP(3) NOT NULL,
  "endDateTime" TIMESTAMP(3) NOT NULL,
  "status" "CalendarEventStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HealthCheckLog" (
  "id" TEXT NOT NULL,
  "serviceName" TEXT NOT NULL,
  "status" "HealthStatus" NOT NULL,
  "message" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HealthCheckLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Client_phone_key" ON "Client"("phone");
CREATE INDEX "Conversation_clientId_status_idx" ON "Conversation"("clientId", "status");
CREATE INDEX "Message_conversationId_timestamp_idx" ON "Message"("conversationId", "timestamp");
CREATE INDEX "CalendarEvent_conversationId_idx" ON "CalendarEvent"("conversationId");
CREATE INDEX "HealthCheckLog_serviceName_checkedAt_idx" ON "HealthCheckLog"("serviceName", "checkedAt");

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CalendarEvent"
  ADD CONSTRAINT "CalendarEvent_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
