import { lookup } from "node:dns/promises";
import { createHash } from "node:crypto";

import type { PayFastConfig } from "./types";
import { encodePayFastValue } from "./signature";

export type PayFastItnData = Record<string, string>;

export class PayFastTransientValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayFastTransientValidationError";
  }
}

export const payFastValidHosts = [
  "www.payfast.co.za",
  "sandbox.payfast.co.za",
  "w1w.payfast.co.za",
  "w2w.payfast.co.za",
];

export function createPayFastItnParamString(
  entries: Array<[string, string]>,
) {
  return entries
    .filter(([key]) => key !== "signature")
    .map(([key, value]) => `${key}=${encodePayFastValue(value)}`)
    .join("&");
}

export function verifyPayFastItnSignature(
  data: PayFastItnData,
  paramString: string,
  passphrase?: string,
) {
  const signedParamString = passphrase
    ? `${paramString}&passphrase=${encodePayFastValue(passphrase)}`
    : paramString;
  const expectedSignature = createHash("md5")
    .update(signedParamString)
    .digest("hex");

  return data.signature === expectedSignature;
}

export async function verifyPayFastSourceIp(ipAddress?: string) {
  if (!ipAddress) {
    return false;
  }

  const normalizedIp = ipAddress.replace(/^::ffff:/, "");
  let resolvedHostCount = 0;
  const addresses = await Promise.all(
    payFastValidHosts.map(async (host) => {
      try {
        const records = await lookup(host, { all: true });

        if (records.length > 0) {
          resolvedHostCount += 1;
        }

        return records.map((record) => record.address);
      } catch (error) {
        console.error("[Zingara PayFast] Failed PayFast IP lookup", {
          error,
          host,
        });
        return [];
      }
    }),
  );

  if (resolvedHostCount === 0) {
    throw new PayFastTransientValidationError(
      "PayFast source validation is temporarily unavailable",
    );
  }

  const validIps = new Set(addresses.flat());

  return validIps.has(normalizedIp);
}

export async function verifyPayFastServerConfirmation(
  config: PayFastConfig,
  paramString: string,
) {
  const response = await fetch(config.validateUrl, {
    body: paramString,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new PayFastTransientValidationError(
      `PayFast validation returned HTTP ${response.status}`,
    );
  }

  const result = (await response.text()).trim();

  if (result !== "VALID" && result !== "INVALID") {
    throw new PayFastTransientValidationError(
      "PayFast validation returned an unknown response",
    );
  }

  return result === "VALID";
}

export function getPayFastRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim();
  }

  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    undefined
  );
}
