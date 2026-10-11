import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { XeroAccountingAdapter } from "@/lib/xero/accountingAdapter";
import { getXeroConnectionRuntime } from "@/lib/xero/connectionRuntime";
import { buildInvoiceReconciliation, type ProviderInvoice } from "@/lib/xero/inbound";

export const dynamic = "force-dynamic";
function allowed(auth: Awaited<ReturnType<typeof requireActiveStaff>>) { const role = Array.isArray(auth.staffProfile?.roles) ? auth.staffProfile?.roles[0] : auth.staffProfile?.roles; const permissions = getRolePermissions(role); return permissions.includes("bookings:reconcile") || permissions.includes("settings:manage"); }

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request); if (auth.error || !auth.serviceClient) return auth.error;
  if (!allowed(auth)) return Response.json({ error: "Accounts access is required." }, { status: 403 });
  const url = new URL(request.url); const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1); const pageSize = 20; const from = (page - 1) * pageSize;
  const { data, error, count } = await auth.serviceClient.from("xero_reconciliation_items").select("id,category,document_id,provider_resource_type,provider_resource_id,local_amount_cents,provider_amount_cents,status,first_seen_at,last_seen_at,details", { count: "exact" }).eq("status", "open").order("last_seen_at", { ascending: false }).range(from, from + pageSize - 1);
  if (error) throw error; return Response.json({ items: data ?? [], page, pageSize, total: count ?? 0 });
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request); if (auth.error || !auth.serviceClient) return auth.error;
  if (!allowed(auth)) return Response.json({ error: "Accounts access is required." }, { status: 403 });
  if (process.env.XERO_LIVE_SYNC_AUTHORISED !== "true") return Response.json({ error: "Xero reconciliation is paused and requires separate approval." }, { status: 409 });
  const { data: connection } = await auth.serviceClient.from("xero_connections").select("tenant_id,status,sync_paused,last_sync_at").eq("status", "connected").eq("sync_paused", false).limit(1).maybeSingle();
  if (!connection?.tenant_id) return Response.json({ error: "Connect the approved Xero organisation first." }, { status: 409 });
  const runtime = await getXeroConnectionRuntime(auth.serviceClient, connection.tenant_id); const adapter = new XeroAccountingAdapter(runtime.transport, connection.tenant_id);
  const { data: receipts, error: receiptsError } = await auth.serviceClient.from("xero_webhook_receipts").select("id,event_sequence,event_type,resource_id").eq("tenant_id", connection.tenant_id).eq("status", "received").order("event_sequence", { ascending: true }).limit(25);
  if (receiptsError) throw receiptsError;
  let processedReceipts = 0;
  for (const receipt of receipts ?? []) {
    try {
      if (receipt.event_type.startsWith("INVOICE.") && receipt.resource_id) {
        const invoiceResponse = await adapter.getInvoice(receipt.resource_id); const invoice = ((invoiceResponse.data as { Invoices?: ProviderInvoice[] }).Invoices ?? [])[0];
        if (invoice) await auth.serviceClient.from("xero_documents").update({ xero_event_sequence: receipt.event_sequence, xero_status: invoice.Status ?? null, updated_at: new Date().toISOString() }).eq("xero_document_id", receipt.resource_id).or(`xero_event_sequence.is.null,xero_event_sequence.lt.${receipt.event_sequence ?? 0}`);
      }
      await auth.serviceClient.from("xero_webhook_receipts").update({ processed_at: new Date().toISOString(), status: "processed" }).eq("id", receipt.id).eq("status", "received"); processedReceipts += 1;
    } catch (receiptError) {
      await auth.serviceClient.from("xero_webhook_receipts").update({ error: receiptError instanceof Error ? receiptError.message.slice(0, 500) : "Webhook processing failed.", status: "failed" }).eq("id", receipt.id).eq("status", "received");
    }
  }
  const response = await adapter.listInvoices(1, connection.last_sync_at ?? undefined); const providerRows = ((response.data as { Invoices?: ProviderInvoice[] }).Invoices ?? []).slice(0, 100);
  const providerIds = providerRows.map((row) => row.InvoiceID).filter((id): id is string => Boolean(id));
  let query = auth.serviceClient.from("xero_documents").select("id,total_cents,xero_document_id,xero_status").eq("kind", "invoice").not("xero_document_id", "is", null).limit(200);
  if (providerIds.length) query = query.in("xero_document_id", providerIds);
  const { data: localRows, error } = await query; if (error) throw error;
  const differences = buildInvoiceReconciliation(localRows ?? [], providerRows);
  for (const difference of differences) {
    await auth.serviceClient.from("xero_reconciliation_items").upsert({ category: difference.category, details: { providerStatus: difference.providerStatus }, document_id: difference.documentId, last_seen_at: new Date().toISOString(), provider_amount_cents: difference.providerAmountCents, provider_resource_id: difference.providerResourceId, provider_resource_type: "invoice", tenant_id: connection.tenant_id }, { onConflict: "tenant_id,category,provider_resource_type,provider_resource_id,document_id" });
  }
  await auth.serviceClient.from("xero_connections").update({ health_checked_at: new Date().toISOString(), health_error: null, last_sync_at: new Date().toISOString() }).eq("tenant_id", connection.tenant_id);
  return Response.json({ checked: providerRows.length, differences: differences.length, processedReceipts });
}
