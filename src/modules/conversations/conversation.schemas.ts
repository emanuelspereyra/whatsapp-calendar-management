import { z } from "zod";

export const ConversationStatusSchema = z.enum([
  "idle",
  "collecting_information",
  "pending_confirmation",
  "missing_information",
  "confirmed_ready_to_schedule",
  "scheduled",
  "cancelled",
  "failed"
]);

export type ConversationStatusValue = z.infer<typeof ConversationStatusSchema>;
