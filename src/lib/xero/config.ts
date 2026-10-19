export const XERO_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.settings.read",
  "accounting.contacts",
  "accounting.invoices",
  "accounting.payments",
] as const;

export type XeroConfiguration = {
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  configured: boolean;
  redirectUri: string;
  tokenEncryptionKey: string;
  webhookKey: string;
};

export function getXeroConfiguration(env: NodeJS.ProcessEnv = process.env): XeroConfiguration {
  const clientId = env.XERO_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.XERO_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = env.XERO_REDIRECT_URI?.trim() ?? "";
  const tokenEncryptionKey = env.XERO_TOKEN_ENCRYPTION_KEY?.trim() ?? "";
  return {
    apiBaseUrl: "https://api.xero.com/api.xro/2.0",
    clientId,
    clientSecret,
    configured: Boolean(clientId && clientSecret && redirectUri && tokenEncryptionKey),
    redirectUri,
    tokenEncryptionKey,
    webhookKey: env.XERO_WEBHOOK_KEY?.trim() ?? "",
  };
}

export function requireXeroConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const config = getXeroConfiguration(env);
  if (!config.configured) throw new Error("Xero is not configured. Add the approved connection details first.");
  const redirect = new URL(config.redirectUri);
  if (redirect.protocol !== "https:" && redirect.hostname !== "localhost") throw new Error("The Xero redirect address must use HTTPS.");
  return config;
}
