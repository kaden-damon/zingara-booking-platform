import type { SupabaseClient } from "@supabase/supabase-js";
import { getXeroConfiguration } from "./config";
import { refreshXeroTokens } from "./oauth";
import { decryptXeroSecret, encryptXeroSecret } from "./tokenVault";
import { FetchXeroTransport } from "./transport";

type ConnectionRow = { encrypted_access_token: string | null; encrypted_refresh_token: string | null; id: string; status: string; sync_paused: boolean; tenant_id: string | null; token_expires_at: string | null; token_revision: number };

export async function getXeroConnectionRuntime(client: SupabaseClient, tenantId?: string) {
  const config = getXeroConfiguration();
  if (!config.configured) throw new Error("Xero is not configured.");
  let query = client.from("xero_connections").select("id,tenant_id,status,sync_paused,encrypted_access_token,encrypted_refresh_token,token_expires_at,token_revision");
  query = tenantId ? query.eq("tenant_id", tenantId) : query.not("tenant_id", "is", null).limit(1);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  const connection = data as ConnectionRow | null;
  if (!connection?.tenant_id || !connection.encrypted_access_token || !connection.encrypted_refresh_token) throw new Error("Connect and approve a Xero organisation first.");
  if (connection.status !== "connected" && connection.status !== "sync_paused") throw new Error("Reconnect Xero before continuing.");
  let accessToken = decryptXeroSecret(connection.encrypted_access_token, config.tokenEncryptionKey);
  if (!connection.token_expires_at || new Date(connection.token_expires_at).getTime() <= Date.now() + 60_000) {
    const refreshToken = decryptXeroSecret(connection.encrypted_refresh_token, config.tokenEncryptionKey);
    const refreshed = await refreshXeroTokens(config, refreshToken);
    const { data: updated, error: updateError } = await client.from("xero_connections").update({ encrypted_access_token: encryptXeroSecret(refreshed.accessToken, config.tokenEncryptionKey), encrypted_refresh_token: encryptXeroSecret(refreshed.refreshToken, config.tokenEncryptionKey), health_error: null, token_expires_at: refreshed.expiresAt, token_revision: connection.token_revision + 1, token_scope: refreshed.scope, updated_at: new Date().toISOString() }).eq("id", connection.id).eq("token_revision", connection.token_revision).select("id").maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw new Error("Xero credentials changed. Retry safely.");
    accessToken = refreshed.accessToken;
  }
  return { connection, config, transport: new FetchXeroTransport(accessToken) };
}
