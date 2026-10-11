import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { getXeroConfiguration } from "@/lib/xero/config";
import { decryptXeroSecret } from "@/lib/xero/tokenVault";
import { allRequiredXeroMappingsApproved } from "@/lib/xero/mappings";

export const dynamic = "force-dynamic";
function canManage(auth: Awaited<ReturnType<typeof requireActiveStaff>>) { const role = Array.isArray(auth.staffProfile?.roles) ? auth.staffProfile?.roles[0] : auth.staffProfile?.roles; return getRolePermissions(role).includes("settings:manage"); }

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request); if (auth.error || !auth.serviceClient) return auth.error;
  if (!canManage(auth)) return Response.json({ error: "Settings access is required." }, { status: 403 });
  const { data, error } = await auth.serviceClient.from("xero_connections").select("id,tenant_id,tenant_name,status,sync_paused,last_sync_at,health_checked_at,health_error,organisation,connected_at").order("updated_at", { ascending: false }).limit(5);
  if (error) throw error; return Response.json({ connections: data ?? [], configured: Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET && process.env.XERO_REDIRECT_URI && process.env.XERO_TOKEN_ENCRYPTION_KEY), liveSyncAuthorised: process.env.XERO_LIVE_SYNC_AUTHORISED === "true" });
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request); if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!canManage(auth)) return Response.json({ error: "Settings access is required." }, { status: 403 });
  const body = await request.json() as { action?: "select" | "pause" | "enable" | "disconnect"; connectionId?: string; tenantId?: string };
  if (!body.connectionId) return Response.json({ error: "Choose a Xero connection." }, { status: 400 });
  const { data: current, error } = await auth.serviceClient.from("xero_connections").select("id,organisation,tenant_id,encrypted_refresh_token").eq("id", body.connectionId).single();
  if (error || !current) return Response.json({ error: "The Xero connection could not be found." }, { status: 404 });
  if (body.action === "select") {
    const candidates = ((current.organisation as { candidates?: Array<{ connectionId: string; tenantId: string; tenantName: string; tenantType: string }> } | null)?.candidates ?? []);
    const selected = candidates.find((tenant) => tenant.tenantId === body.tenantId);
    if (!selected) return Response.json({ error: "Choose one of the authorised Xero organisations." }, { status: 400 });
    const { error: updateError } = await auth.serviceClient.from("xero_connections").update({ connected_at: new Date().toISOString(), connection_id: selected.connectionId, organisation: { selected }, status: "sync_paused", sync_paused: true, tenant_id: selected.tenantId, tenant_name: selected.tenantName }).eq("id", current.id).is("tenant_id", null);
    if (updateError) throw updateError; return Response.json({ status: "sync_paused" });
  }
  if (body.action === "enable") {
    if (process.env.XERO_LIVE_SYNC_AUTHORISED !== "true") return Response.json({ error: "Live Xero sync requires separate approval." }, { status: 409 });
    const { data: approvedMappings } = await auth.serviceClient.from("xero_account_mappings").select("category").eq("tenant_id", current.tenant_id).not("approved_at", "is", null);
    if (!allRequiredXeroMappingsApproved((approvedMappings ?? []).map((row) => row.category))) return Response.json({ error: "Accounts must approve all required mappings first." }, { status: 409 });
    const { error: enableError } = await auth.serviceClient.from("xero_connections").update({ status: "connected", sync_paused: false }).eq("id", current.id).not("tenant_id", "is", null);
    if (enableError) throw enableError;
    await auth.serviceClient.from("xero_sync_outbox").update({ status: "pending", updated_at: new Date().toISOString() }).eq("tenant_id", current.tenant_id).eq("status", "paused");
    return Response.json({ status: "connected" });
  }
  if (body.action === "disconnect") {
    const config = getXeroConfiguration();
    if (config.configured && current.encrypted_refresh_token) {
      const token = decryptXeroSecret(current.encrypted_refresh_token, config.tokenEncryptionKey);
      const response = await fetch("https://identity.xero.com/connect/revocation", { body: new URLSearchParams({ token }), headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, method: "POST" });
      if (!response.ok) return Response.json({ error: "Xero could not be disconnected. Try again." }, { status: 502 });
    }
    const { error: disconnectError } = await auth.serviceClient.from("xero_connections").update({ encrypted_access_token: null, encrypted_refresh_token: null, health_error: null, status: "not_connected", sync_paused: true, tenant_id: null, tenant_name: null, token_expires_at: null }).eq("id", current.id);
    if (disconnectError) throw disconnectError; return Response.json({ status: "not_connected" });
  }
  const { error: pauseError } = await auth.serviceClient.from("xero_connections").update({ status: current.tenant_id ? "sync_paused" : "not_connected", sync_paused: true }).eq("id", current.id);
  if (pauseError) throw pauseError; return Response.json({ status: "sync_paused" });
}
