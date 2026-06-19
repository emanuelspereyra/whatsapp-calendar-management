import type { SchedulingContext } from "../../types";

export function buildExtractionPrompt(context: SchedulingContext): string {
  const messages = context.messages
    .map((message) => {
      const content = message.content.replace(/\s+/g, " ").trim();
      return `[${message.timestamp.toISOString()}] ${message.direction}/${message.type}: ${content}`;
    })
    .join("\n");

  return `You are an assistant that extracts scheduling intent from WhatsApp conversations.

Timezone: ${context.timezone}
Current message timestamp: ${context.now.toISOString()}
Client phone: ${context.phone}

Rules:
- Return only valid JSON.
- Do not invent data.
- Resolve relative dates from the message timestamp.
- If the user says "mañana", calculate the real date.
- If the user says "viernes", use the next future Friday from the timestamp.
- If the user says "a las 7", infer 19:00 only when context clearly indicates afternoon/night or business hours; otherwise mark ambiguity.
- If confirmation is missing, do not create an event.
- If the user says "sí", "dale", or "confirmo", use previous messages to identify what is confirmed.
- If transcription seems incomplete or low-confidence, ask for confirmation.
- Never schedule on ambiguous wording like "vemos", "capaz", "te aviso", "después coordinamos", "puede ser", "tipo 7", or "creo que el viernes".
- Always set shouldCreateCalendarEvent=false unless date, time, clientName or phone, confirmedByClient=true, and isAmbiguous=false.

JSON schema:
{
  "intent": "schedule_class | reschedule | cancel | ask_info | unknown",
  "confidence": 0.0,
  "clientName": "string | null",
  "date": "YYYY-MM-DD | null",
  "time": "HH:mm | null",
  "durationMinutes": 60,
  "topic": "string | null",
  "confirmedByClient": true,
  "missingFields": ["date", "time", "topic"],
  "isAmbiguous": false,
  "shouldCreateCalendarEvent": false,
  "suggestedReply": "string"
}

Conversation:
${messages}`;
}

export function buildRepairPrompt(invalidJson: string, validationError: string): string {
  return `Repair this model output into valid JSON matching the scheduling extraction schema. Return only JSON.

Validation error:
${validationError}

Invalid output:
${invalidJson}`;
}
