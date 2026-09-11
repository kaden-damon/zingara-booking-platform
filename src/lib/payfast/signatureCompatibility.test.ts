import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("all checkout surfaces submit the server-provided canonical PayFast fields", async () => {
  const paths = [
    "../../app/book/page.tsx",
    "../../app/find-booking/page.tsx",
    "../../app/corporate/payment/page.tsx",
    "../../app/payment/[token]/payment-link-client.tsx",
  ];
  const surfaces = await Promise.all(paths.map(source));

  for (const surface of surfaces) {
    assert.match(surface, /Object\.entries\(fields\)/);
    assert.match(surface, /input\.name = name/);
    assert.match(surface, /input\.value = String\(value\)/);
    assert.match(surface, /form\.submit\(\)/);
  }
});

test("public, Corporate and payment-link checkout routes share one signer path", async () => {
  const [publicCheckout, corporateCheckout, paymentLinkCheckout, sharedCheckout] =
    await Promise.all([
      source("../../app/api/payfast/checkout/route.ts"),
      source("../../app/api/corporate-payment/checkout/route.ts"),
      source("../payment-links/customerPaymentLinks.ts"),
      source("./checkout.ts"),
    ]);

  for (const checkout of [publicCheckout, corporateCheckout, paymentLinkCheckout]) {
    assert.match(checkout, /createExistingBookingPayFastCheckout/);
  }
  assert.match(sharedCheckout, /createPayFastPaymentData/);
  assert.match(sharedCheckout, /calculatePayFastTransactionAmounts/);
});

test("ITN keeps signature, source, amount and server-confirmation validation", async () => {
  const route = await source("../../app/api/payfast/itn/route.ts");

  assert.match(route, /verifyPayFastItnSignature/);
  assert.match(route, /verifyPayFastSourceIp/);
  assert.match(route, /verifyPayFastServerConfirmation/);
  assert.match(route, /paymentAmountValid/);
  assert.match(route, /confirm_payfast_payment_core/);
});
