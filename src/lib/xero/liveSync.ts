import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { XeroAccountingAdapter } from "./accountingAdapter";
import { getXeroConfiguration } from "./config";
import { getXeroConnectionRuntime } from "./connectionRuntime";
import { allRequiredXeroMappingsApproved } from "./mappings";
import { executeXeroOperation } from "./operations";
import { runXeroOutboxWorker, type XeroOutboxItem, type XeroWorkerStore } from "./worker";

export async function runLiveXeroSyncWorker(client: SupabaseClient, limit = 10) {
  const config = getXeroConfiguration();
  if (process.env.XERO_LIVE_SYNC_AUTHORISED !== "true") return { blocked: 0, failed: 0, processed: 0, reason: "paused" as const, succeeded: 0 };
  if (!config.webhookKey) return { blocked: 0, failed: 0, processed: 0, reason: "webhook-not-configured" as const, succeeded: 0 };
  const workerId = randomUUID();
  const store: XeroWorkerStore = {
    async claim(claimLimit) {
      const { data, error } = await client.rpc("claim_xero_sync_outbox", { p_lease_seconds: 90, p_limit: claimLimit, p_worker_id: workerId });
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({ attemptCount: Number(row.attempt_count), documentId: row.document_id as string | null, id: String(row.id), idempotencyKey: String(row.idempotency_key), operation: String(row.operation), payload: row.payload as Record<string, unknown>, tenantId: String(row.tenant_id) }));
    },
    async complete(item, result) {
      const completedAt = new Date().toISOString();
      const { error: completionError } = await client.rpc("complete_xero_document_sync_atomic", {
        p_outbox_id: item.id,
        p_provider_resource_id: result.providerId ?? null,
        p_provider_resource_number: result.providerNumber ?? null,
        p_provider_status: result.providerStatus ?? null,
        p_worker_id: workerId,
      });
      if (completionError) throw completionError;
      const contactSource = item.payload.contactSource as { companyId?: string | null; customerId?: string | null } | undefined;
      const contact = item.payload.contact as { contactNumber?: string } | undefined;
      if (result.providerContactId && contact?.contactNumber && contactSource && (contactSource.companyId || contactSource.customerId)) await client.from("xero_contact_mappings").upsert({ company_id: contactSource.companyId ?? null, contact_number: contact.contactNumber, customer_id: contactSource.customerId ?? null, status: "active", tenant_id: item.tenantId, updated_at: completedAt, xero_contact_id: result.providerContactId }, { onConflict: "tenant_id,contact_number" });
    },
    async connection(tenantId) {
      const { data } = await client.from("xero_connections").select("status,sync_paused,live_sync_activated_at").eq("tenant_id", tenantId).maybeSingle();
      const { data: mappings } = await client.from("xero_account_mappings").select("venue,category").eq("tenant_id", tenantId).not("approved_at", "is", null);
      return { configured: config.configured && Boolean(config.webhookKey) && Boolean(data?.live_sync_activated_at), connected: data?.status === "connected", mappingsApproved: allRequiredXeroMappingsApproved(mappings ?? []), syncPaused: data?.sync_paused !== false };
    },
    async fail(item, failure) {
      await client.from("xero_sync_outbox").update({ last_error: failure.message, lease_expires_at: null, lease_owner: null, next_attempt_at: failure.delayMs ? new Date(Date.now() + failure.delayMs).toISOString() : null, status: failure.terminal ? "blocked" : "pending", updated_at: new Date().toISOString() }).eq("id", item.id).eq("lease_owner", workerId);
    },
  };
  const runtimes = new Map<string, { adapter: XeroAccountingAdapter }>();
  return runXeroOutboxWorker({ limit, store, workerId, execute: async (item: XeroOutboxItem) => {
    let runtime = runtimes.get(item.tenantId);
    if (!runtime) {
      const loaded = await getXeroConnectionRuntime(client, item.tenantId);
      runtime = { adapter: new XeroAccountingAdapter(loaded.transport, item.tenantId) };
      runtimes.set(item.tenantId, runtime);
    }
    return executeXeroOperation(runtime.adapter, item);
  } });
}
