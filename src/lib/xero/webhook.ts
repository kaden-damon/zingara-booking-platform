import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export type XeroWebhookEvent = { eventCategory: string; eventDateUtc: string; eventType: string; resourceId: string; tenantId: string };
const SUPPORTED = new Set(["CONTACT", "INVOICE", "CREDITNOTE", "OVERPAYMENT", "PREPAYMENT"]);

export function verifyXeroWebhook(rawBody: string, signature: string, key: string) {
  if (!signature || !key) return false;
  const expected = createHmac("sha256", key).update(rawBody).digest("base64");
  const left = Buffer.from(signature); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function parseXeroWebhook(rawBody: string) {
  const value = JSON.parse(rawBody) as { events?: Array<Record<string, unknown>>; firstEventSequence?: number; lastEventSequence?: number };
  const events = (value.events ?? []).map((event) => ({
    eventCategory: String(event.eventCategory ?? "").toUpperCase(), eventDateUtc: String(event.eventDateUtc ?? ""), eventType: String(event.eventType ?? "").toUpperCase(), resourceId: String(event.resourceId ?? ""), tenantId: String(event.tenantId ?? ""),
  })).filter((event) => event.resourceId && event.tenantId);
  return { events, firstEventSequence: value.firstEventSequence ?? 0, lastEventSequence: value.lastEventSequence ?? 0 };
}

export function xeroWebhookEventKey(event: XeroWebhookEvent) { return createHash("sha256").update([event.tenantId,event.eventCategory,event.eventType,event.resourceId,event.eventDateUtc].join(":"), "utf8").digest("hex"); }
export function isSupportedXeroWebhookEvent(event: XeroWebhookEvent) { return SUPPORTED.has(event.eventCategory) && (event.eventType === "CREATE" || event.eventType === "UPDATE"); }
