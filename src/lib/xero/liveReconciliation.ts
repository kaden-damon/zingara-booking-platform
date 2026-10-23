import type { SupabaseClient } from "@supabase/supabase-js";
import { XeroAccountingAdapter } from "./accountingAdapter";
import { getXeroConfiguration } from "./config";
import { getXeroConnectionRuntime } from "./connectionRuntime";
import { buildInvoiceReconciliation, type ProviderInvoice } from "./inbound";

export async function runLiveXeroReconciliation(client: SupabaseClient) {
  const config = getXeroConfiguration();
  if (process.env.XERO_LIVE_SYNC_AUTHORISED !== "true") return { checked: 0, differences: 0, processedReceipts: 0, reason: "paused" as const };
  if (!config.webhookKey) return { checked: 0, differences: 0, processedReceipts: 0, reason: "webhook-not-configured" as const };
  const { data: connection } = await client.from("xero_connections").select("tenant_id,status,sync_paused,live_sync_activated_at,last_sync_at").eq("status", "connected").eq("sync_paused", false).limit(1).maybeSingle();
  if (!connection?.tenant_id || !connection.live_sync_activated_at) return { checked: 0, differences: 0, processedReceipts: 0, reason: "connection-paused" as const };
  const runtime = await getXeroConnectionRuntime(client, connection.tenant_id);
  const adapter = new XeroAccountingAdapter(runtime.transport, connection.tenant_id);
  const { data: receipts, error: receiptsError } = await client.from("xero_webhook_receipts").select("id,event_sequence,event_type,resource_id").eq("tenant_id", connection.tenant_id).eq("status", "received").order("event_sequence", { ascending: true }).limit(25);
  if (receiptsError) throw receiptsError;
  let processedReceipts = 0;
  for (const receipt of receipts ?? []) {
    try {
      if (receipt.event_type.startsWith("INVOICE.") && receipt.resource_id) {
        const invoiceResponse = await adapter.getInvoice(receipt.resource_id);
        const invoice = ((invoiceResponse.data as { Invoices?: ProviderInvoice[] }).Invoices ?? [])[0];
        if (invoice) await client.from("xero_documents").update({ xero_event_sequence: receipt.event_sequence, xero_status: invoice.Status ?? null, updated_at: new Date().toISOString() }).eq("xero_document_id", receipt.resource_id).or(`xero_event_sequence.is.null,xero_event_sequence.lt.${receipt.event_sequence ?? 0}`);
      }
      await client.from("xero_webhook_receipts").update({ processed_at: new Date().toISOString(), status: "processed" }).eq("id", receipt.id).eq("status", "received");
      processedReceipts += 1;
    } catch (receiptError) {
      await client.from("xero_webhook_receipts").update({ error: receiptError instanceof Error ? receiptError.message.slice(0, 500) : "Webhook processing failed.", status: "failed" }).eq("id", receipt.id).eq("status", "received");
    }
  }
  const response = await adapter.listInvoices(1, connection.last_sync_at ?? connection.live_sync_activated_at);
  const providerRows = ((response.data as { Invoices?: ProviderInvoice[] }).Invoices ?? []).slice(0, 100);
  const providerIds = providerRows.map((row) => row.InvoiceID).filter((id): id is string => Boolean(id));
  let localRows: Array<{ id: string; total_cents: number; xero_document_id: string; xero_status: string | null }> = [];
  if (providerIds.length) {
    const { data, error } = await client.from("xero_documents").select("id,total_cents,xero_document_id,xero_status").eq("kind", "invoice").in("xero_document_id", providerIds).limit(100);
    if (error) throw error;
    localRows = (data ?? []) as typeof localRows;
  }
  const linkedProviderIds = new Set(localRows.map((row) => row.xero_document_id));
  const linkedProviderRows = providerRows.filter((row) => row.InvoiceID && linkedProviderIds.has(row.InvoiceID));
  const differences = buildInvoiceReconciliation(localRows, linkedProviderRows);
  for (const difference of differences) {
    await client.from("xero_reconciliation_items").upsert({ category: difference.category, details: { providerStatus: difference.providerStatus }, document_id: difference.documentId, last_seen_at: new Date().toISOString(), provider_amount_cents: difference.providerAmountCents, provider_resource_id: difference.providerResourceId, provider_resource_type: "invoice", tenant_id: connection.tenant_id }, { onConflict: "tenant_id,category,provider_resource_type,provider_resource_id,document_id" });
  }
  await client.from("xero_connections").update({ health_checked_at: new Date().toISOString(), health_error: null, last_sync_at: new Date().toISOString() }).eq("tenant_id", connection.tenant_id);
  return { checked: linkedProviderRows.length, differences: differences.length, processedReceipts };
}
