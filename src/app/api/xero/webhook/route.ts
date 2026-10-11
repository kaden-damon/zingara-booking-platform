import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { getXeroConfiguration } from "@/lib/xero/config";
import { isSupportedXeroWebhookEvent, parseXeroWebhook, verifyXeroWebhook, xeroWebhookEventKey } from "@/lib/xero/webhook";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-xero-signature") ?? "";
  const config = getXeroConfiguration();
  if (!config.webhookKey || !verifyXeroWebhook(rawBody, signature, config.webhookKey)) return new Response(null, { status: 401 });
  const client = getServiceClient();
  if (!client) return Response.json({ error: "Webhook storage is unavailable." }, { status: 503 });
  try {
    const payload = parseXeroWebhook(rawBody);
    if (!payload.events.length) return new Response(null, { status: 200 });
    const rows = payload.events.map((event) => ({ correlation: { firstEventSequence: payload.firstEventSequence, lastEventSequence: payload.lastEventSequence }, event_date_utc: event.eventDateUtc || null, event_key: xeroWebhookEventKey(event), event_sequence: payload.lastEventSequence, event_type: `${event.eventCategory}.${event.eventType}`, payload: event, resource_id: event.resourceId, status: isSupportedXeroWebhookEvent(event) ? "received" : "ignored", tenant_id: event.tenantId }));
    const { error } = await client.from("xero_webhook_receipts").upsert(rows, { ignoreDuplicates: true, onConflict: "event_key" });
    if (error) return Response.json({ error: "Webhook receipt could not be stored." }, { status: 503 });
    return new Response(null, { status: 200 });
  } catch { return Response.json({ error: "Invalid webhook payload." }, { status: 400 }); }
}
