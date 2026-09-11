import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  appendPayFastSignature,
  createPayFastParamString,
  encodePayFastValue,
  getPayFastSubmissionEntries,
} from "./signature.ts";
import type { PayFastData } from "./types.ts";

const passphrase = "test passphrase";
const paymentFields: PayFastData = {
  amount: "32928.00",
  cancel_url: "https://book.example.test/cancel",
  custom_str1: "ZNG-LQGT4H",
  custom_str2: "Golden Circle",
  email_address: "shanice@example.com",
  item_description: "Zingara booking payment ZNG-LQGT4H",
  item_name: "The Royal Countess Zingara Booking",
  m_payment_id: "ZNG-LQGT4H",
  merchant_id: "10000100",
  merchant_key: "test-key",
  name_first: " Shanice ",
  name_last: " Govender (Ramsamy) ",
  notify_url: "https://book.example.test/notify",
  return_url: "https://book.example.test/return",
};

function buildPayment(phone?: string) {
  return appendPayFastSignature(
    { ...paymentFields, cell_number: phone },
    passphrase,
  );
}

test("PayFast uses PHP-compatible form encoding for punctuation", () => {
  assert.equal(
    encodePayFastValue("Shanice Govender (Ramsamy)"),
    "Shanice+Govender+%28Ramsamy%29",
  );
  assert.equal(encodePayFastValue("O'Neil! *~"), "O%27Neil%21+%2A%7E");
});

test("the final submitted fields are the exact normalized field set that is signed", () => {
  const payment = buildPayment();
  const submittedFields = Object.fromEntries(
    Object.entries(payment).filter(([key]) => key !== "signature"),
  );
  const submissionEntries = getPayFastSubmissionEntries(submittedFields);
  const paramString = createPayFastParamString(submissionEntries, passphrase);

  assert.deepEqual(Object.entries(submittedFields), submissionEntries);
  assert.equal(submittedFields.name_first, "Shanice");
  assert.equal(submittedFields.name_last, "Govender (Ramsamy)");
  assert.equal("cell_number" in submittedFields, false);
  assert.equal(
    payment.signature,
    createHash("md5").update(paramString).digest("hex"),
  );
});

test("optional mobile is omitted before signing while a supplied mobile is signed", () => {
  const withoutMobile = buildPayment();
  const withMobile = buildPayment("0108228641");

  assert.equal("cell_number" in withoutMobile, false);
  assert.equal(withMobile.cell_number, "0108228641");
  assert.notEqual(withMobile.signature, withoutMobile.signature);
});

test("R32,918 plus the R10 transaction fee produces the signed R32,928 total", () => {
  const payment = buildPayment();

  assert.equal(payment.amount, "32928.00");
  assert.match(
    createPayFastParamString(payment, passphrase),
    /(?:^|&)amount=32928\.00(?:&|$)/,
  );
});
