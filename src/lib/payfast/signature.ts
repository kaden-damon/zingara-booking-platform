import { createHash } from "node:crypto";
import type { PayFastData, PayFastFieldValue } from "./types";

type PayFastEntry = [string, PayFastFieldValue];

const customPaymentFieldOrder = [
  "merchant_id",
  "merchant_key",
  "return_url",
  "cancel_url",
  "notify_url",
  "name_first",
  "name_last",
  "email_address",
  "cell_number",
  "m_payment_id",
  "amount",
  "item_name",
  "item_description",
  "custom_int1",
  "custom_int2",
  "custom_int3",
  "custom_int4",
  "custom_int5",
  "custom_str1",
  "custom_str2",
  "custom_str3",
  "custom_str4",
  "custom_str5",
  "email_confirmation",
  "confirmation_address",
  "payment_method",
  "subscription_type",
  "billing_date",
  "recurring_amount",
  "frequency",
  "cycles",
  "subscription_notify_email",
  "subscription_notify_webhook",
  "subscription_notify_buyer",
];

function encodePayFastValue(value: string) {
  return encodeURIComponent(value.trim()).replace(/%20/g, "+");
}

function shouldIncludeValue(value: PayFastFieldValue) {
  return value !== null && value !== undefined && String(value) !== "";
}

function normalizeEntries(data: PayFastData | PayFastEntry[]) {
  return Array.isArray(data) ? data : Object.entries(data);
}

export function orderPayFastPaymentEntries(data: PayFastData | PayFastEntry[]) {
  const entries = normalizeEntries(data).filter(([key]) => key !== "signature");
  const fieldRank = new Map(
    customPaymentFieldOrder.map((field, index) => [field, index]),
  );

  return entries.sort(([leftKey], [rightKey]) => {
    const leftRank = fieldRank.get(leftKey) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = fieldRank.get(rightKey) ?? Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return leftKey.localeCompare(rightKey);
  });
}

export function createPayFastParamString(
  data: PayFastData | PayFastEntry[],
  passphrase?: string | null,
) {
  const params = orderPayFastPaymentEntries(data)
    .filter(([, value]) => shouldIncludeValue(value))
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
  const orderedData = Object.fromEntries(
    orderPayFastPaymentEntries(data),
  ) as TData;

  return {
    ...orderedData,
    signature: generatePayFastSignature(orderedData, passphrase),
  };
}
