import { z } from "zod";

export const SchedulingIntentSchema = z.object({
  intent: z.enum(["schedule_class", "reschedule", "cancel", "ask_info", "unknown"]),
  confidence: z.number().min(0).max(1),
  clientName: z.string().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  durationMinutes: z.number().int().positive().default(60),
  topic: z.string().nullable(),
  confirmedByClient: z.boolean(),
  missingFields: z.array(z.string()),
  isAmbiguous: z.boolean(),
  shouldCreateCalendarEvent: z.boolean(),
  suggestedReply: z.string()
});

export type SchedulingIntent = z.infer<typeof SchedulingIntentSchema>;

export function parseSchedulingIntent(value: unknown): SchedulingIntent {
  return SchedulingIntentSchema.parse(value);
}
