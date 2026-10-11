import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { requireXeroConfiguration } from "@/lib/xero/config";
import { exchangeXeroCode, listXeroTenants } from "@/lib/xero/oauth";
import { decryptXeroSecret, encryptXeroSecret } from "@/lib/xero/tokenVault";

export const dynamic = "force-dynamic";
function finish(request: Request, status: string) { return NextResponse.redirect(new URL(`/admin?section=xero&connection=${encodeURIComponent(status)}`, request.url)); }

export async function GET(request: Request) {
  const client = getServiceClient();
  if (!client) return finish(request, "unavailable");
  const url = new URL(request.url); const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
  if (!code || !state || url.searchParams.get("error")) return finish(request, "cancelled");
  try {
    const config = requireXeroConfiguration();
    const stateHash = createHash("sha256").update(state).digest("hex");
    const now = new Date().toISOString();
    const { data: consumed, error } = await client.from("xero_oauth_states").update({ consumed_at: now }).eq("state_hash", stateHash).is("consumed_at", null).gt("expires_at", now).select("id,encrypted_code_verifier,initiated_by_staff_profile_id").maybeSingle();
    if (error || !consumed) return finish(request, "invalid-state");
    const tokens = await exchangeXeroCode(config, code, decryptXeroSecret(consumed.encrypted_code_verifier, config.tokenEncryptionKey));
    const tenants = await listXeroTenants(tokens.accessToken);
    if (!tenants.length) return finish(request, "no-organisation");
    const { error: insertError } = await client.from("xero_connections").insert({ connected_by_staff_profile_id: consumed.initiated_by_staff_profile_id, encrypted_access_token: encryptXeroSecret(tokens.accessToken, config.tokenEncryptionKey), encrypted_refresh_token: encryptXeroSecret(tokens.refreshToken, config.tokenEncryptionKey), organisation: { candidates: tenants }, status: "not_connected", sync_paused: true, token_expires_at: tokens.expiresAt, token_scope: tokens.scope });
    if (insertError) throw insertError;
    return finish(request, "choose-organisation");
  } catch { return finish(request, "failed"); }
}
