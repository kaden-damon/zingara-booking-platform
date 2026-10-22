import { randomUUID } from "node:crypto";
import { createBrandedCustomerEmail } from "@/lib/email/customerEmail";
import { sendZingaraEmail } from "@/lib/email/smtp";
import { claimStaffEmailDelivery, completeStaffEmailDelivery } from "@/lib/email/staffEmailNotifications";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { formatZar, hashQuoteAcceptanceToken } from "@/lib/xero/quoteAcceptance";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

async function loadLink(token: string) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  const client = getServiceClient();
  if (!client) throw new Error("Quote service is unavailable.");
  const tokenHash = hashQuoteAcceptanceToken(token);
  const { data: link, error } = await client.from("xero_quote_acceptance_links").select("*").eq("token_hash", tokenHash).maybeSingle();
  if (error) throw error;
  if (!link) return null;
  const { data: quote, error: quoteError } = await client.from("xero_documents").select("id,version,status,accepted_version,local_reference").eq("id", link.document_id).single();
  if (quoteError) throw quoteError;
  return { client, link, quote, tokenHash };
}

function publicQuote(link: Record<string, unknown>, quote: Record<string, unknown>) {
  const snapshot = link.snapshot as Record<string, unknown>;
  const available = link.status === "active" && Date.parse(String(link.expires_at)) > Date.now() && quote.status === "sent" && quote.version === link.document_version;
  const accepted = link.status === "accepted" && quote.accepted_version === link.document_version;
  return {
    accepted,
    available: available || accepted,
    currency: link.currency_code,
    customerName: snapshot.customer_name,
    documentDate: snapshot.document_date,
    expiresAt: link.expires_at,
    lines: snapshot.lines,
    reference: quote.local_reference,
    subtotalCents: snapshot.subtotal_cents,
    taxCents: snapshot.tax_cents,
    totalCents: link.total_cents,
    validUntil: snapshot.valid_until,
  };
}

export async function GET(_request: Request, context: Context) {
  const { token } = await context.params;
  const loaded = await loadLink(token);
  if (!loaded) return Response.json({ error: "This quotation link is unavailable." }, { status: 404 });
  const quote = publicQuote(loaded.link, loaded.quote);
  if (!quote.available) return Response.json({ error: "This quotation link has expired or was replaced." }, { status: 410 });
  return Response.json({ quote }, { headers: { "Cache-Control": "private, no-store" } });
}

async function notifySales(client: NonNullable<ReturnType<typeof getServiceClient>>, link: Record<string, unknown>, quote: Record<string, unknown>) {
  const staffId = String(link.sales_staff_profile_id);
  const { data: staff } = await client.from("staff_profiles").select("id,full_name,email,active").eq("id", staffId).maybeSingle();
  if (!staff?.active || !staff.email) return;
  const eventKey = `quote-accepted:${link.id}`;
  const deliveryId = await claimStaffEmailDelivery(client, { ccStaffProfileIds: [], eventKey, notificationKey: "quote-accepted", toStaffProfileIds: [staff.id] });
  if (!deliveryId) return;
  const snapshot = link.snapshot as Record<string, unknown>;
  const subject = "Zingara | Quotation Accepted";
  const message = `Hi ${staff.full_name.split(/\s+/)[0]},\n\nYour quotation ${quote.local_reference} for ${snapshot.customer_name} has been accepted.\n\nAmount: ${formatZar(Number(link.total_cents))}\nAccepted: ${new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date())}\n\nThe quotation is now ready for invoicing.`;
  try {
    const branded = await createBrandedCustomerEmail({ ctaLabel: "VIEW QUOTATION", ctaUrl: `/admin?section=reports&report=accounting&quote=${encodeURIComponent(String(quote.id))}`, heading: "QUOTATION ACCEPTED", includeAgePolicy: false, message, subject });
    const result = await sendZingaraEmail({ ...branded, subject, to: staff.email });
    await completeStaffEmailDelivery(client, deliveryId, { error: result.ok ? undefined : result.error, status: result.ok ? "sent" : "failed" });
  } catch (error) {
    await completeStaffEmailDelivery(client, deliveryId, { error: error instanceof Error ? error.message : "Notification failed", status: "failed" });
  }
}

export async function POST(request: Request, context: Context) {
  const { token } = await context.params;
  const loaded = await loadLink(token);
  if (!loaded) return Response.json({ error: "This quotation link is unavailable." }, { status: 404 });
  const requestId = request.headers.get("x-vercel-id") ?? randomUUID();
  const metadata = { requestId: requestId.slice(0, 200), userAgent: (request.headers.get("user-agent") ?? "").slice(0, 500) };
  const { data, error } = await loaded.client.rpc("accept_xero_quote_by_token_atomic", { p_metadata: metadata, p_token_hash: loaded.tokenHash });
  if (error || !data) return Response.json({ error: "This quotation changed, expired or has already been replaced." }, { status: 409 });
  await notifySales(loaded.client, loaded.link, data as Record<string, unknown>);
  return Response.json({ accepted: true, reference: data.local_reference });
}
