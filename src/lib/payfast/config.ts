import type { PayFastConfig, PayFastMode } from "./types";

const payFastUrls: Record<
  PayFastMode,
  {
    apiUrl: string;
    onsiteProcessUrl: string;
    processUrl: string;
    validateUrl: string;
  }
> = {
  live: {
    apiUrl: "https://api.payfast.co.za",
    onsiteProcessUrl: "https://www.payfast.co.za/onsite/process",
    processUrl: "https://www.payfast.co.za/eng/process",
    validateUrl: "https://www.payfast.co.za/eng/query/validate",
  },
  sandbox: {
    apiUrl: "https://api.payfast.co.za",
    onsiteProcessUrl: "https://sandbox.payfast.co.za/onsite/process",
    processUrl: "https://sandbox.payfast.co.za/eng/process",
    validateUrl: "https://sandbox.payfast.co.za/eng/query/validate",
  },
};

function normalizeMode(value: string | undefined): PayFastMode {
  return value?.trim().toLowerCase() === "live" ? "live" : "sandbox";
}

function readEnvValue(
  env: NodeJS.ProcessEnv,
  key: keyof NodeJS.ProcessEnv,
) {
  return env[key]?.trim() ?? "";
}

export function getPayFastConfig(
  env: NodeJS.ProcessEnv = process.env,
): PayFastConfig {
  const mode = normalizeMode(env.PAYFAST_MODE);
  const merchantId = readEnvValue(env, "PAYFAST_MERCHANT_ID");
  const merchantKey = readEnvValue(env, "PAYFAST_MERCHANT_KEY");
  const passphrase = readEnvValue(env, "PAYFAST_PASSPHRASE");
  const returnUrl = readEnvValue(env, "PAYFAST_RETURN_URL");
  const cancelUrl = readEnvValue(env, "PAYFAST_CANCEL_URL");
  const notifyUrl = readEnvValue(env, "PAYFAST_NOTIFY_URL");
  const apiUrlOverride = readEnvValue(env, "PAYFAST_API_URL");
  const urls = payFastUrls[mode];

  return {
    cancelUrl,
    apiUrl: apiUrlOverride || urls.apiUrl,
    configured: Boolean(
      merchantId &&
        merchantKey &&
        returnUrl &&
        cancelUrl &&
        notifyUrl &&
        passphrase,
    ),
    merchantId,
    merchantKey,
    mode,
    notifyUrl,
    onsiteProcessUrl: urls.onsiteProcessUrl,
    passphrase,
    processUrl: urls.processUrl,
    returnUrl,
    validateUrl: urls.validateUrl,
  };
}

export function isPayFastConfigured(config = getPayFastConfig()) {
  return config.configured;
}
