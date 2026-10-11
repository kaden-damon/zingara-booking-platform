import { randomUUID } from "node:crypto";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { getXeroConnectionRuntime } from "@/lib/xero/connectionRuntime";
import { XeroAccountingAdapter } from "@/lib/xero/accountingAdapter";
import { executeXeroOperation } from "@/lib/xero/operations";
import { allRequiredXeroMappingsApproved } from "@/lib/xero/mappings";
import { runXeroOutboxWorker, type XeroOutboxItem, type XeroWorkerStore } from "@/lib/xero/worker";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const auth = await requireActiveStaff(request); if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  const role = Array.isArray(auth.staffProfile.roles) ? auth.staffProfile.roles[0] : auth.staffProfile.roles;
  if (!getRolePermissions(role).includes("settings:manage")) return Response.json({ error: "Settings access is required." }, { status: 403 });
  if (process.env.XERO_LIVE_SYNC_AUTHORISED !== "true") return Response.json({ error: "Live Xero sync is paused and requires separate approval." }, { status: 409 });
  const client = auth.serviceClient; const workerId = randomUUID();
  const store: XeroWorkerStore = {
    async claim(limit) { const { data, error } = await client.rpc("claim_xero_sync_outbox", { p_lease_seconds: 90, p_limit: limit, p_worker_id: workerId }); if (error) throw error; return (data ?? []).map((row: Record<string, unknown>) => ({ attemptCount: Number(row.attempt_count), documentId: row.document_id as string | null, id: String(row.id), idempotencyKey: String(row.idempotency_key), operation: String(row.operation), payload: row.payload as Record<string, unknown>, tenantId: String(row.tenant_id) })); },
    async complete(item, result) {
      const completedAt = new Date().toISOString();
      await client.from("xero_sync_outbox").update({ completed_at: completedAt, lease_expires_at: null, lease_owner: null, provider_resource_id: result.providerId ?? null, provider_resource_number: result.providerNumber ?? null, provider_status: result.providerStatus ?? null, status: "succeeded", updated_at: completedAt }).eq("id", item.id).eq("lease_owner", workerId);
      const contactSource = item.payload.contactSource as { companyId?: string | null; customerId?: string | null } | undefined;
      const contact = item.payload.contact as { contactNumber?: string } | undefined;
      if (result.providerContactId && contact?.contactNumber && contactSource && (contactSource.companyId || contactSource.customerId)) await client.from("xero_contact_mappings").upsert({ company_id: contactSource.companyId ?? null, contact_number: contact.contactNumber, customer_id: contactSource.customerId ?? null, status: "active", tenant_id: item.tenantId, updated_at: completedAt, xero_contact_id: result.providerContactId }, { onConflict: "tenant_id,contact_number" });
      if (item.documentId) await client.from("xero_documents").update({ sync_status: "synced", updated_at: completedAt, xero_document_id: result.providerId ?? null, xero_document_number: result.providerNumber ?? null, xero_status: result.providerStatus ?? null }).eq("id", item.documentId).eq("version", Number(item.payload.documentVersion));
    },
    async connection(tenantId) { const { data } = await client.from("xero_connections").select("status,sync_paused").eq("tenant_id", tenantId).maybeSingle(); const { data: mappings } = await client.from("xero_account_mappings").select("category").eq("tenant_id", tenantId).not("approved_at", "is", null); return { configured: Boolean(process.env.XERO_CLIENT_ID), connected: data?.status === "connected", mappingsApproved: allRequiredXeroMappingsApproved((mappings ?? []).map((row) => row.category)), syncPaused: data?.sync_paused !== false }; },
    async fail(item, failure) { await client.from("xero_sync_outbox").update({ last_error: failure.message, lease_expires_at: null, lease_owner: null, next_attempt_at: failure.delayMs ? new Date(Date.now() + failure.delayMs).toISOString() : null, status: failure.terminal ? "blocked" : "pending", updated_at: new Date().toISOString() }).eq("id", item.id).eq("lease_owner", workerId); },
  };
  const runtimes = new Map<string, { adapter: XeroAccountingAdapter }>();
  return Response.json(await runXeroOutboxWorker({ store, workerId, execute: async (item: XeroOutboxItem) => { let runtime = runtimes.get(item.tenantId); if (!runtime) { const loaded = await getXeroConnectionRuntime(client, item.tenantId); runtime = { adapter: new XeroAccountingAdapter(loaded.transport, item.tenantId) }; runtimes.set(item.tenantId, runtime); } return executeXeroOperation(runtime.adapter, item); } }));
}
