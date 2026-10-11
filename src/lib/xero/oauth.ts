import { createHash, randomBytes } from "node:crypto";
import { XERO_SCOPES, type XeroConfiguration } from "./config.ts";

export type XeroTokenSet = { accessToken: string; expiresAt: string; refreshToken: string; scope: string };
export type XeroTenant = { connectionId: string; tenantId: string; tenantName: string; tenantType: string };
export type OAuthHttp = (url: string, init: RequestInit) => Promise<Response>;

export function createXeroOAuthState() {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { challenge, state, stateHash: createHash("sha256").update(state).digest("hex"), verifier };
}

export function buildXeroAuthorizationUrl(config: XeroConfiguration, state: string, challenge: string) {
  const url = new URL("https://login.xero.com/identity/connect/authorize");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: XERO_SCOPES.join(" "),
    state,
  }).toString();
  return url.toString();
}

async function tokenRequest(config: XeroConfiguration, body: URLSearchParams, http: OAuthHttp) {
  const response = await http("https://identity.xero.com/connect/token", {
    body,
    headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  if (!response.ok) throw new Error(`Xero token request failed (${response.status}).`);
  const value = await response.json() as { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string };
  if (!value.access_token || !value.refresh_token) throw new Error("Xero did not return a complete token set.");
  return { accessToken: value.access_token, expiresAt: new Date(Date.now() + (value.expires_in ?? 1800) * 1000).toISOString(), refreshToken: value.refresh_token, scope: value.scope ?? "" } satisfies XeroTokenSet;
}

export function exchangeXeroCode(config: XeroConfiguration, code: string, verifier: string, http: OAuthHttp = fetch) {
  return tokenRequest(config, new URLSearchParams({ client_id: config.clientId, code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: config.redirectUri }), http);
}

export function refreshXeroTokens(config: XeroConfiguration, refreshToken: string, http: OAuthHttp = fetch) {
  return tokenRequest(config, new URLSearchParams({ client_id: config.clientId, grant_type: "refresh_token", refresh_token: refreshToken }), http);
}

export async function listXeroTenants(accessToken: string, http: OAuthHttp = fetch): Promise<XeroTenant[]> {
  const response = await http("https://api.xero.com/connections", { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, method: "GET" });
  if (!response.ok) throw new Error(`Xero organisation discovery failed (${response.status}).`);
  const rows = await response.json() as Array<{ id?: string; tenantId?: string; tenantName?: string; tenantType?: string }>;
  return rows.filter((row) => row.id && row.tenantId && row.tenantName).map((row) => ({ connectionId: row.id!, tenantId: row.tenantId!, tenantName: row.tenantName!, tenantType: row.tenantType ?? "ORGANISATION" }));
}
