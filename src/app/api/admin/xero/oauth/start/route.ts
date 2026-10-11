import { requireXeroConfiguration } from "@/lib/xero/config";
import { buildXeroAuthorizationUrl, createXeroOAuthState } from "@/lib/xero/oauth";
import { encryptXeroSecret } from "@/lib/xero/tokenVault";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  const role = Array.isArray(auth.staffProfile.roles) ? auth.staffProfile.roles[0] : auth.staffProfile.roles;
  if (!getRolePermissions(role).includes("settings:manage")) return Response.json({ error: "Settings access is required." }, { status: 403 });
  try {
    const config = requireXeroConfiguration();
    const state = createXeroOAuthState();
    const { error } = await auth.serviceClient.from("xero_oauth_states").insert({ encrypted_code_verifier: encryptXeroSecret(state.verifier, config.tokenEncryptionKey), expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), initiated_by_staff_profile_id: auth.staffProfile.id, state_hash: state.stateHash });
    if (error) throw error;
    return Response.json({ authorizationUrl: buildXeroAuthorizationUrl(config, state.state, state.challenge) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Xero connection could not start." }, { status: 503 }); }
}
