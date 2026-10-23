import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { runLiveXeroSyncWorker } from "@/lib/xero/liveSync";

export const dynamic = "force-dynamic";
function canManage(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  const role = Array.isArray(auth.staffProfile?.roles) ? auth.staffProfile?.roles[0] : auth.staffProfile?.roles;
  return getRolePermissions(role).includes("settings:manage");
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request); if (auth.error || !auth.serviceClient) return auth.error;
  if (!canManage(auth)) return Response.json({ error: "Settings access is required." }, { status: 403 });
  const { data, error, count } = await auth.serviceClient.from("xero_sync_outbox")
    .select("id,document_id,operation,status,attempt_count,last_error,next_attempt_at,updated_at", { count: "exact" })
    .in("status", ["paused", "pending", "blocked"])
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return Response.json({ items: data ?? [], total: count ?? 0 });
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request); if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!canManage(auth)) return Response.json({ error: "Settings access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { action?: "retry"; outboxId?: string };
  if (body.action === "retry") {
    if (!body.outboxId) return Response.json({ error: "Choose the sync item to retry." }, { status: 400 });
    const client = auth.serviceClient;
    const { data: item } = await client.from("xero_sync_outbox").select("id,tenant_id,status,last_error").eq("id", body.outboxId).eq("operation", "document.sync").eq("status", "blocked").maybeSingle();
    if (!item) return Response.json({ error: "This sync item is no longer waiting for review." }, { status: 409 });
    const { data: connection } = await client.from("xero_connections").select("status,sync_paused").eq("tenant_id", item.tenant_id).maybeSingle();
    const nextStatus = process.env.XERO_LIVE_SYNC_AUTHORISED === "true" && connection?.status === "connected" && connection.sync_paused === false ? "pending" : "paused";
    const { data: updated, error } = await client.rpc("retry_xero_sync_outbox_atomic", { p_actor_auth_user_id: auth.user?.id ?? null, p_actor_location_scope: auth.staffProfile.venue_scope ?? [], p_actor_name: auth.staffProfile.full_name, p_actor_role: Array.isArray(auth.staffProfile.roles) ? auth.staffProfile.roles[0] : auth.staffProfile.roles, p_actor_staff_profile_id: auth.staffProfile.id, p_next_status: nextStatus, p_outbox_id: item.id });
    if (error) return Response.json({ error: error.message.includes("no longer") ? "This sync item changed. Refresh and try again." : "The sync item could not be retried." }, { status: error.message.includes("no longer") ? 409 : 500 });
    return Response.json({ item: updated });
  }
  if (process.env.XERO_LIVE_SYNC_AUTHORISED !== "true") return Response.json({ error: "Live Xero sync is paused and requires separate approval." }, { status: 409 });
  return Response.json(await runLiveXeroSyncWorker(auth.serviceClient));
}
