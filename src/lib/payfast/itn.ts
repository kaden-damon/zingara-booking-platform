import { lookup } from "node:dns/promises";
import { createHash } from "node:crypto";

import type { PayFastConfig } from "./types";

export type PayFastItnData = Record<string, string>;

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
    .map(
      ([key, value]) =>
        `${key}=${encodeURIComponent(value.trim()).replace(/%20/g, "+")}`,
    )
    .join("&");
}

export function verifyPayFastItnSignature(
  data: PayFastItnData,
  paramString: string,
  passphrase?: string,
) {
  const signedParamString = passphrase
    ? `${paramString}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`
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
  const addresses = await Promise.all(
    payFastValidHosts.map(async (host) => {
      try {
        const records = await lookup(host, { all: true });

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
  const result = (await response.text()).trim();

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
