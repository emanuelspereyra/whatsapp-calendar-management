import { randomUUID } from "node:crypto";
import type { NormalizedWhatsAppMessage } from "./WhatsAppProvider";

type AnyRecord = Record<string, any>;

export function parseCloudWebhookPayload(body: unknown): NormalizedWhatsAppMessage[] {
  const records: NormalizedWhatsAppMessage[] = [];
  const entries = asArray((body as AnyRecord)?.entry);

  for (const entry of entries) {
    const entryRecord = entry as AnyRecord;
    for (const change of asArray(entryRecord.changes)) {
      const changeRecord = change as AnyRecord;
      const value = changeRecord.value as AnyRecord | undefined;
      const contacts = asArray(value?.contacts);
      const nameByWaId = new Map<string, string>();
      for (const contact of contacts) {
        const contactRecord = contact as AnyRecord;
        if (contactRecord.wa_id) {
          nameByWaId.set(String(contactRecord.wa_id), String(contactRecord.profile?.name ?? ""));
        }
      }

      for (const status of asArray(value?.statuses)) {
        const statusRecord = status as AnyRecord;
        records.push({
          kind: "status",
          providerMessageId: statusRecord.id,
          status: String(statusRecord.status ?? "unknown"),
          timestamp: timestampFromWhatsApp(statusRecord.timestamp)
        });
      }

      for (const message of asArray(value?.messages)) {
        const messageRecord = message as AnyRecord;
        const from = String(messageRecord.from ?? "");
        const base = {
          kind: "message" as const,
          providerMessageId: String(messageRecord.id ?? randomUUID()),
          from,
          timestamp: timestampFromWhatsApp(messageRecord.timestamp),
          contactName: nameByWaId.get(from)
        };

        if (messageRecord.type === "text" && messageRecord.text?.body) {
          records.push({
            ...base,
            type: "text",
            text: String(messageRecord.text.body)
          });
          continue;
        }

        if (messageRecord.type === "audio" && messageRecord.audio?.id) {
          records.push({
            ...base,
            type: "audio",
            mediaId: String(messageRecord.audio.id),
            mimeType: messageRecord.audio.mime_type
          });
          continue;
        }

        records.push({ kind: "unknown", reason: `unsupported message type: ${messageRecord.type ?? "missing"}` });
      }
    }
  }

  return records.length ? records : [{ kind: "unknown", reason: "no supported WhatsApp records" }];
}

function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function timestampFromWhatsApp(value: unknown): Date {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric * 1000);
  }
  return new Date();
}
