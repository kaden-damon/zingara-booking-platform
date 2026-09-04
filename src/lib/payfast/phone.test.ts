import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizePayFastCellNumber } from "./phone.ts";

const expectedNumbers = [
  ["0821234567", "0821234567"],
  ["+27821234567", "0821234567"],
  ["27821234567", "0821234567"],
  ["082 123 4567", "0821234567"],
  ["082-123-4567", "0821234567"],
  ["215265600", "0215265600"],
] as const;

for (const [input, expected] of expectedNumbers) {
  test(`normalises ${input} for PayFast`, () => {
    assert.deepEqual(normalizePayFastCellNumber(input), {
      cellNumber: expected,
      valid: true,
    });
  });
}

test("rejects a non-South-African or malformed phone before checkout", () => {
  assert.equal(normalizePayFastCellNumber("+1 202 555 0100").valid, false);
  assert.equal(normalizePayFastCellNumber("not-a-phone").valid, false);
});

test("allows an absent optional cell number", () => {
  assert.deepEqual(normalizePayFastCellNumber(undefined), {
    cellNumber: undefined,
    valid: true,
  });
});

test("all PayFast checkout entry points share the provider-boundary normaliser", async () => {
  const [checkout, payment, publicRoute, corporateRoute, paymentLink] =
    await Promise.all([
      readFile(new URL("./checkout.ts", import.meta.url), "utf8"),
      readFile(new URL("./payment.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../../app/api/payfast/checkout/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../../app/api/corporate-payment/checkout/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../payment-links/customerPaymentLinks.ts", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(checkout, /normalizePayFastCellNumber\(payload\.customer\?\.phone\)/);
  assert.match(checkout, /cellNumber: normalizedPhone\.cellNumber/);
  assert.match(payment, /cell_number: input\.cellNumber/);
  assert.match(payment, /return appendPayFastSignature\(data, config\.passphrase\)/);
  assert.match(publicRoute, /createExistingBookingPayFastCheckout/);
  assert.match(corporateRoute, /createExistingBookingPayFastCheckout/);
  assert.match(paymentLink, /createExistingBookingPayFastCheckout/);
});
