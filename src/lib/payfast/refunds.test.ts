import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createPayFastApiParamString,
  createPayFastApiSignature,
  formatPayFastApiTimestamp,
  queryPayFastRefundAvailability,
  submitPayFastRefund,
} from "./refunds";
import type { PayFastConfig } from "./types";

const config: PayFastConfig = {
  apiUrl: "https://api.example.test",
  cancelUrl: "https://example.test/cancel",
  configured: true,
  merchantId: "10000100",
  merchantKey: "unused-for-api-signing",
  mode: "live",
  notifyUrl: "https://example.test/notify",
  onsiteProcessUrl: "https://example.test/onsite",
  passphrase: "test passphrase",
  processUrl: "https://example.test/process",
  returnUrl: "https://example.test/return",
  validateUrl: "https://example.test/validate",
};

test("PayFast refund API signing orders passphrase and formats timestamps", async () => {
  const timestamp = formatPayFastApiTimestamp(
    new Date("2026-08-27T12:34:56.789Z"),
  );
  const fields = {
    "merchant-id": config.merchantId,
    timestamp,
    version: "v1",
  };
  const parameterString = createPayFastApiParamString(
    fields,
    config.passphrase,
  );

  assert.equal(timestamp, "2026-08-27T12:34:56+00:00");
  assert.equal(
    parameterString,
    "merchant-id=10000100&passphrase=test+passphrase&timestamp=2026-08-27T12%3A34%3A56%2B00%3A00&version=v1",
  );
  assert.equal(
    createPayFastApiSignature(fields, config.passphrase),
    createHash("md5").update(parameterString).digest("hex"),
  );

  const requests: Array<{ init?: RequestInit; url: string }> = [];
  const fetcher = async (input: URL | RequestInfo, init?: RequestInit) => {
    requests.push({ init, url: String(input) });

    if (init?.method === "POST") {
      return Response.json({ status: "success" });
    }

    return Response.json({
      amount_available_for_refund: 1000,
      refund_full: { method: "PAYMENT_SOURCE" },
      status: "REFUNDABLE",
    });
  };

  await queryPayFastRefundAvailability("test-payment-id", config, fetcher);
  await submitPayFastRefund(
    {
      amount: 10,
      notifyBuyer: true,
      notifyMerchant: false,
      pfPaymentId: "test-payment-id",
      reason: "Test refund reason",
    },
    config,
    fetcher,
  );

  assert.equal(requests.length, 2);
  assert.equal(requests[0].init?.method, "GET");
  assert.equal(requests[1].init?.method, "POST");

  for (const request of requests) {
    const headers = new Headers(request.init?.headers);
    const requestTimestamp = headers.get("timestamp");

    assert.match(
      requestTimestamp ?? "",
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/,
    );
    assert.doesNotMatch(requestTimestamp ?? "", /\.\d{3}/);

    const signatureFields: Record<string, string> = {
      "merchant-id": config.merchantId,
      timestamp: requestTimestamp ?? "",
      version: "v1",
    };

    if (request.init?.method === "POST") {
      const body = request.init.body as URLSearchParams;

      for (const [key, value] of body.entries()) {
        signatureFields[key] = value;
      }
    }

    assert.equal(
      headers.get("signature"),
      createPayFastApiSignature(signatureFields, config.passphrase),
    );
  }
});
