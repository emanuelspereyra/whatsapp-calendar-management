import { describe, expect, it } from "vitest";
import { audioRecord, buildConversationHarness, textRecord, validExtraction } from "../testUtils";

describe("ConversationService", () => {
  it("downloads and transcribes audio before extraction", async () => {
    const { service, whatsapp, ai, repo } = buildConversationHarness();

    const result = await service.processWhatsAppRecord(audioRecord(), "corr-1");

    expect(result.calendarEventCreated).toBe(true);
    expect(whatsapp.downloadMedia).toHaveBeenCalledWith("media-1");
    expect(ai.transcribeAudio).toHaveBeenCalled();
    expect(repo.messages[0]).toMatchObject({ type: "audio", transcription: "audio transcripto" });
  });

  it("does not create calendar events for ambiguous messages", async () => {
    const { service, ai, calendar, repo } = buildConversationHarness();
    ai.extraction = {
      ...validExtraction,
      confirmedByClient: false,
      shouldCreateCalendarEvent: false,
      isAmbiguous: true,
      missingFields: ["time"],
      suggestedReply: "Necesito confirmacion de horario."
    };

    const result = await service.processWhatsAppRecord(textRecord("tipo 7 vemos"), "corr-1");

    expect(result.calendarEventCreated).toBe(false);
    expect(calendar.createEvent).not.toHaveBeenCalled();
    expect(repo.updates.at(-1)).toMatchObject({ status: "pending_confirmation" });
  });

  it("creates a calendar event when confirmed and available", async () => {
    const { service, calendar, repo } = buildConversationHarness();

    const result = await service.processWhatsAppRecord(textRecord(), "corr-1");

    expect(result.status).toBe("scheduled");
    expect(result.calendarEventCreated).toBe(true);
    expect(calendar.checkAvailability).toHaveBeenCalled();
    expect(calendar.createEvent).toHaveBeenCalled();
    expect(repo.calendarEvents[0]).toMatchObject({ googleEventId: "google-1", status: "created" });
  });

  it("does not create Google event when calendar is busy", async () => {
    const { service, calendar, repo } = buildConversationHarness();
    calendar.available = false;

    const result = await service.processWhatsAppRecord(textRecord(), "corr-1");

    expect(result.calendarEventCreated).toBe(false);
    expect(calendar.createEvent).not.toHaveBeenCalled();
    expect(repo.calendarEvents[0]).toMatchObject({ status: "conflict" });
  });

  it("alerts and marks failed when OpenAI fails", async () => {
    const { service, ai, primaryAlerts, repo } = buildConversationHarness();
    (ai.extractSchedulingIntent as any) = async () => {
      throw new Error("openai down");
    };

    const result = await service.processWhatsAppRecord(textRecord(), "corr-1");

    expect(result.status).toBe("failed");
    expect(repo.updates.at(-1)).toMatchObject({ status: "failed" });
    expect(primaryAlerts.messages.join("\n")).toContain("conversation");
  });

  it("alerts and marks failed when Calendar fails", async () => {
    const { service, calendar, primaryAlerts } = buildConversationHarness();
    (calendar.checkAvailability as any) = async () => {
      throw new Error("calendar down");
    };

    const result = await service.processWhatsAppRecord(textRecord(), "corr-1");

    expect(result.status).toBe("failed");
    expect(primaryAlerts.messages.join("\n")).toContain("googleCalendar");
  });

  it("manual approval creates an event when data is complete", async () => {
    const { service, repo, calendar } = buildConversationHarness();
    const client = await repo.findOrCreateClient("5491", "Ana");
    const conversation = await repo.findOrCreateActiveConversation(client.id);
    await repo.updateConversation(conversation.id, {
      proposedDate: "2026-06-19",
      proposedTime: "19:00",
      proposedTopic: "QA",
      proposedDurationMinutes: 60
    });

    const result = await service.approveConversation(conversation.id);

    expect(result.calendarEventCreated).toBe(true);
    expect(calendar.createEvent).toHaveBeenCalled();
  });

  it("manual rejection cancels the conversation", async () => {
    const { service, repo } = buildConversationHarness();
    const client = await repo.findOrCreateClient("5491", "Ana");
    const conversation = await repo.findOrCreateActiveConversation(client.id);

    const result = await service.rejectConversation(conversation.id);

    expect(result.status).toBe("cancelled");
    expect(repo.conversations.get(conversation.id)?.status).toBe("cancelled");
  });
});
