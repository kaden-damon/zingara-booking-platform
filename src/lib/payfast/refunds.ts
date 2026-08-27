import { createHash } from "node:crypto";
import { getPayFastConfig } from "./config";
import type { PayFastConfig } from "./types";

type PayFastRefundHeaders = {
  "merchant-id": string;
  signature: string;
  timestamp: string;
  version: string;
};

type PayFastRefundFetch = typeof fetch;

export type PayFastRefundAvailability = {
  amountAvailable: number;
  fullRefundMethod:
    | "bank_payout"
    | "not_available"
    | "payment_source"
    | "unknown";
  providerState: "not_available" | "refundable" | "refunded" | "unknown";
  raw: Record<string, unknown>;
  refundable: boolean;
  reason?: string;
};

export type PayFastRefundResult = {
  providerRefundId?: string | null;
  raw: Record<string, unknown>;
  status: "accepted" | "rejected" | "unknown";
};

export class PayFastRefundRequestError extends Error {
  definiteRejection: boolean;

  constructor(message: string, definiteRejection: boolean) {
    super(message);
    this.name = "PayFastRefundRequestError";
    this.definiteRejection = definiteRejection;
  }
}

const payFastApiVersion = "v1";

function encodePayFastApiValue(value: string) {
  return encodeURIComponent(value.trim()).replace(/%20/g, "+");
}

function createPayFastApiSignature(
  values: Record<string, string>,
  passphrase?: string,
) {
  const entries = Object.entries(values)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${encodePayFastApiValue(value)}`);

  if (passphrase?.trim()) {
    entries.push(`passphrase=${encodePayFastApiValue(passphrase)}`);
  }

  return createHash("md5").update(entries.join("&")).digest("hex");
}

function createRefundHeaders(
  config: PayFastConfig,
  extraSignatureValues: Record<string, string> = {},
): PayFastRefundHeaders {
  const timestamp = new Date().toISOString();
  const signatureValues = {
    ...extraSignatureValues,
    "merchant-id": config.merchantId,
    timestamp,
    version: payFastApiVersion,
  };

  return {
    "merchant-id": config.merchantId,
    signature: createPayFastApiSignature(signatureValues, config.passphrase),
    timestamp,
    version: payFastApiVersion,
  };
}

function getNumericField(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function getPayFastApiResponse(payload: Record<string, unknown>) {
  const data = payload.data;

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const response = (data as Record<string, unknown>).response;

    if (response && typeof response === "object" && !Array.isArray(response)) {
      return response as Record<string, unknown>;
    }
  }

  return payload;
}

function getRefundableStatus(data: Record<string, unknown>) {
  const status =
    typeof data.status === "string"
      ? data.status
      : typeof data.refund_status === "string"
        ? data.refund_status
        : typeof data.result === "string"
          ? data.result
          : "";

  return status.trim().toUpperCase();
}

async function parsePayFastJson(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const message =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.error === "string"
          ? payload.error
          : "PayFast refund request failed.";

    const definiteRejection =
      response.status >= 400 &&
      response.status < 500 &&
      ![408, 409, 425, 429].includes(response.status);

    throw new PayFastRefundRequestError(message, definiteRejection);
  }

  return payload;
}

function getFullRefundMethod(data: Record<string, unknown>) {
  const refundFull = data.refund_full;

  if (!refundFull || typeof refundFull !== "object" || Array.isArray(refundFull)) {
    return "unknown" as const;
  }

  const method = (refundFull as Record<string, unknown>).method;

  if (typeof method !== "string") {
    return "unknown" as const;
  }

  switch (method.trim().toUpperCase()) {
    case "PAYMENT_SOURCE":
      return "payment_source" as const;
    case "BANK_PAYOUT":
      return "bank_payout" as const;
    case "NOT_AVAILABLE":
      return "not_available" as const;
    default:
      return "unknown" as const;
  }
}

export async function queryPayFastRefundAvailability(
  pfPaymentId: string,
  config: PayFastConfig = getPayFastConfig(),
  fetcher: PayFastRefundFetch = fetch,
): Promise<PayFastRefundAvailability> {
  const url = `${config.apiUrl}/refunds/query/${encodeURIComponent(
    pfPaymentId,
  )}`;
  const response = await fetcher(url, {
    headers: createRefundHeaders(config),
    method: "GET",
  });
  const raw = await parsePayFastJson(response);
  const refundData = getPayFastApiResponse(raw);
  const amountAvailableInCents = getNumericField(refundData, [
    "amount_available",
    "amount_available_for_refund",
    "available_refund_amount",
  ]);
  const status = getRefundableStatus(refundData);
  const providerState =
    status === "COMPLETED"
      ? "refunded"
      : status === "REFUNDABLE" && amountAvailableInCents > 0
        ? "refundable"
        : ["NOT_AVAILABLE", "FAILED", "ERROR", "DECLINED"].includes(status)
          ? "not_available"
          : "unknown";

  return {
    amountAvailable: amountAvailableInCents / 100,
    fullRefundMethod: getFullRefundMethod(refundData),
    providerState,
    raw,
    reason:
      typeof refundData.message === "string"
        ? refundData.message
        : typeof refundData.reason === "string"
          ? refundData.reason
          : undefined,
    refundable: providerState === "refundable",
  };
}

export async function submitPayFastRefund(
  input: {
    amount: number;
    notifyBuyer: boolean;
    notifyMerchant: boolean;
    pfPaymentId: string;
    reason: string;
  },
  config: PayFastConfig = getPayFastConfig(),
  fetcher: PayFastRefundFetch = fetch,
): Promise<PayFastRefundResult> {
  const amountInCents = Math.round(input.amount * 100);
  const body = new URLSearchParams({
    amount: String(amountInCents),
    notify_buyer: input.notifyBuyer ? "1" : "0",
    notify_merchant: input.notifyMerchant ? "1" : "0",
    reason: input.reason,
  });
  const url = `${config.apiUrl}/refunds/${encodeURIComponent(
    input.pfPaymentId,
  )}`;
  const response = await fetcher(url, {
    body,
    headers: {
      ...createRefundHeaders(config, Object.fromEntries(body)),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  const raw = await parsePayFastJson(response);
  const refundData = getPayFastApiResponse(raw);
  const status = getRefundableStatus(raw) || getRefundableStatus(refundData);
  const providerRefundId =
    typeof refundData.refund_id === "string"
      ? refundData.refund_id
      : typeof refundData.pf_refund_id === "string"
        ? refundData.pf_refund_id
        : typeof refundData.id === "string"
          ? refundData.id
          : null;

  return {
    providerRefundId,
    raw,
    status:
      raw.status === "success" ||
      refundData.response === true ||
      ["SUCCESS", "ACCEPTED", "REFUNDABLE"].includes(status)
        ? "accepted"
      : ["FAILED", "ERROR", "DECLINED", "NOT_AVAILABLE"].includes(status)
        ? "rejected"
        : "unknown",
  };
}
