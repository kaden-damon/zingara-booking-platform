import assert from "node:assert/strict";
import test from "node:test";
import { parsePayFastHistoryCsv } from "./reconciliation";

const headers = '"Date","Type","Sign","Party","Email / Cell","Name","Description","Currency","Funding Type","Gross","Fee","Net","Balance","M Payment ID","PF Payment ID"';

test("PayFast history keeps booking payments and reversals distinct", () => {
  const parsed = parsePayFastHistoryCsv([
    headers,
    '"2026-09-18 17:22:41","Funds Received","Credit","Customer","","","","ZAR","Credit Card","23470.00","-716.97","22753.03","0","ZNG-DE3UHX","328827333"',
    '"2026-10-01 08:40:42","Funds Received (Reversal)","Debit","Customer","","","","ZAR","Credit Card","-6060.00","184.10","-5875.90","0","ZNG-DRHB7L","327217271"',
    '"2026-10-01 09:00:00","Funds Received","Credit","Other","","","","ZAR","Credit Card","50.00","-2.00","48.00","0","OTHER-1","99"',
  ].join("\n"));

  assert.equal(parsed.transactions.length, 2);
  assert.deepEqual(parsed.transactions.map((row) => row.eventType), ["payment", "reversal"]);
  assert.equal(parsed.transactions[0]?.providerPaymentId, "328827333");
  assert.equal(parsed.transactions[1]?.grossAmount, -6060);
});

test("PayFast history rejects an unsupported file", () => {
  assert.throws(() => parsePayFastHistoryCsv("Date,Amount\n2026-01-01,10"), /supported PayFast/);
});
