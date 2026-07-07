import { createHash } from "node:crypto";
import type { PayFastData, PayFastFieldValue } from "./types";

type PayFastEntry = [string, PayFastFieldValue];

function encodePayFastValue(value: string) {
  return encodeURIComponent(value.trim()).replace(/%20/g, "+");
}

function shouldIncludeValue(value: PayFastFieldValue) {
  return value !== null && value !== undefined && String(value) !== "";
}

function normalizeEntries(data: PayFastData | PayFastEntry[]) {
  return Array.isArray(data) ? data : Object.entries(data);
}

export function createPayFastParamString(
  data: PayFastData | PayFastEntry[],
  passphrase?: string | null,
) {
  const params = normalizeEntries(data)
    .filter(([key, value]) => key !== "signature" && shouldIncludeValue(value))
    .map(([key, value]) => `${key}=${encodePayFastValue(String(value))}`);

  if (passphrase !== null && passphrase !== undefined && passphrase !== "") {
    params.push(`passphrase=${encodePayFastValue(passphrase)}`);
  }

  return params.join("&");
}

export function generatePayFastSignature(
  data: PayFastData | PayFastEntry[],
  passphrase?: string | null,
) {
  const parameterString = createPayFastParamString(data, passphrase);

  return createHash("md5").update(parameterString).digest("hex");
}

export function appendPayFastSignature<TData extends PayFastData>(
  data: TData,
  passphrase?: string | null,
) {
  return {
    ...data,
    signature: generatePayFastSignature(data, passphrase),
  };
}
