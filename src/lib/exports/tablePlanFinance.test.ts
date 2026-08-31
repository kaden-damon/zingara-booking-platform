import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateTablePlanFinancialBreakdown,
  getDineplanZoneReceiptFormula,
  tablePlanCurrencyNumberFormat,
  // @ts-expect-error Node's built-in TypeScript test runner requires the extension.
} from "./tablePlanFinance.ts";

test("builds dynamic zone formulas across all four payment columns", () => {
  assert.equal(getDineplanZoneReceiptFormula(29, 57), "SUM(H29:K57)");
  assert.equal(getDineplanZoneReceiptFormula(31, 63), "SUM(H31:K63)");
});

test("uses numeric Rand formatting including explicit zero values", () => {
  assert.equal(
    tablePlanCurrencyNumberFormat,
    '"R" #,##0.00;[Red]"-R" #,##0.00;"R" 0.00',
  );
});

test("preserves imported fully-paid value without fabricating a method", () => {
  const result = calculateTablePlanFinancialBreakdown(
    {
      confirmedPaidAmount: 2_200,
      guestCount: 4,
      outstandingAmount: 0,
      paymentStatus: "fully_paid",
      totalAmount: 2_200,
    },
    [
      {
        amount: 2_200,
        method: "platform",
        payment_status: "fully_paid",
        payment_type: "full_payment",
      },
    ],
  );

  assert.equal(result.totalPaid, 2_200);
  assert.equal(result.methodUnknownPaid, 2_200);
  assert.equal(result.fullCard + result.fullEft, 0);
  assert.equal(result.toPay, 0);
  assert.equal(result.statusLabel, "Fully Paid");
});

test("classifies known card and EFT payments without double counting", () => {
  const result = calculateTablePlanFinancialBreakdown(
    {
      confirmedPaidAmount: 1_320,
      guestCount: 1,
      outstandingAmount: 0,
      paymentStatus: "fully_paid",
      totalAmount: 1_320,
    },
    [
      {
        amount: 550,
        method: "card",
        payment_status: "deposit_paid",
        payment_type: "deposit",
      },
      {
        amount: 770,
        method: "eft",
        payment_status: "fully_paid",
        payment_type: "balance",
      },
    ],
  );

  assert.equal(result.prePaidCard, 550);
  assert.equal(result.fullEft, 770);
  assert.equal(result.totalPaid, 1_320);
  assert.equal(result.methodUnknownPaid, 0);
});

test("maps PayFast and provider-backed platform payments to online/card", () => {
  const result = calculateTablePlanFinancialBreakdown(
    {
      confirmedPaidAmount: 1_100,
      guestCount: 2,
      outstandingAmount: 1_540,
      paymentStatus: "deposit_paid",
      totalAmount: 2_640,
    },
    [
      {
        amount: 550,
        method: "payfast",
        payment_status: "deposit_paid",
        payment_type: "deposit",
      },
      {
        amount: 550,
        method: "platform",
        payment_status: "deposit_paid",
        payment_type: "deposit",
        provider_transaction_id: "fixture-provider-reference",
      },
    ],
  );

  assert.equal(result.prePaidCard, 1_100);
  assert.equal(result.methodUnknownPaid, 0);
  assert.equal(result.totalPaid, 1_100);
});

test("reports partial and unpaid balances from authoritative amounts", () => {
  const partial = calculateTablePlanFinancialBreakdown(
    {
      confirmedPaidAmount: 550,
      guestCount: 1,
      outstandingAmount: 770,
      paymentStatus: "deposit_paid",
      totalAmount: 1_320,
    },
    [
      {
        amount: 550,
        method: "eft",
        payment_status: "deposit_paid",
        payment_type: "deposit",
      },
    ],
  );
  const unpaid = calculateTablePlanFinancialBreakdown(
    {
      confirmedPaidAmount: 0,
      guestCount: 1,
      outstandingAmount: 1_320,
      paymentStatus: "pending_payment",
      totalAmount: 1_320,
    },
    [],
  );

  assert.equal(partial.prePaidEft, 550);
  assert.equal(partial.toPay, 770);
  assert.equal(partial.statusLabel, "Deposit Paid");
  assert.equal(unpaid.totalPaid, 0);
  assert.equal(unpaid.toPay, 1_320);
  assert.equal(unpaid.statusLabel, "Outstanding R1 320");
});

test("marks comps without inventing receipts and excludes transaction fees", () => {
  const complimentary = calculateTablePlanFinancialBreakdown(
    {
      confirmedPaidAmount: 0,
      guestCount: 2,
      outstandingAmount: 0,
      paymentStatus: "comp_vip",
      totalAmount: 0,
    },
    [],
  );
  const paid = calculateTablePlanFinancialBreakdown(
    {
      confirmedPaidAmount: 550,
      guestCount: 1,
      outstandingAmount: 0,
      paymentStatus: "fully_paid",
      totalAmount: 550,
    },
    [
      {
        amount: 550,
        method: "card",
        payment_status: "fully_paid",
        payment_type: "full_payment",
        provider_gross_amount: 560,
        transaction_fee_amount: 10,
      },
    ],
  );

  assert.equal(complimentary.complimentaryAmount, 0);
  assert.equal(complimentary.totalPaid, 0);
  assert.equal(complimentary.statusLabel, "Complimentary");
  assert.equal(paid.fullCard, 550);
  assert.equal(paid.totalPaid, 550);
});

test("preserves source-proven legacy receipts when imported paid truth was lost", () => {
  const result = calculateTablePlanFinancialBreakdown(
    {
      confirmedPaidAmount: 1_100,
      guestCount: 2,
      outstandingAmount: 0,
      paymentStatus: "fully_paid",
      totalAmount: 1_100,
    },
    [
      {
        amount: 1_100,
        method: "platform",
        payment_status: "fully_paid",
        payment_type: "full_payment",
      },
    ],
    {
      booking_id: "fixture-booking",
      complimentary: false,
      full_card_amount: 0,
      full_eft_amount: 0,
      pre_paid_card_amount: 1_600,
      pre_paid_eft_amount: 0,
    },
  );

  assert.equal(result.prePaidCard, 1_600);
  assert.equal(result.totalPaid, 1_600);
  assert.equal(result.methodUnknownPaid, 0);
});

test("keeps recovered ancillary amounts outside ticket receipts", () => {
  const result = calculateTablePlanFinancialBreakdown(
    {
      confirmedPaidAmount: 11_880,
      guestCount: 8,
      outstandingAmount: 0,
      paymentStatus: "fully_paid",
      totalAmount: 11_880,
    },
    [],
    {
      booking_id: "fixture-booking",
      complimentary: false,
      full_card_amount: 10_560,
      full_eft_amount: 0,
      pre_paid_card_amount: 0,
      pre_paid_eft_amount: 0,
      ticket_gratuity_amount: 1_320,
    },
  );

  assert.equal(result.fullCard, 10_560);
  assert.equal(result.ticketGratuityAmount, 1_320);
  assert.equal(result.totalPaid, 10_560);
  assert.equal(result.methodUnknownPaid, 0);
});

test("lets explicit recovered payment evidence override a damaged comp import", () => {
  const result = calculateTablePlanFinancialBreakdown(
    {
      confirmedPaidAmount: 0,
      guestCount: 30,
      outstandingAmount: 0,
      paymentStatus: "comp_vip",
      totalAmount: 0,
    },
    [],
    {
      booking_id: "fixture-booking",
      complimentary: false,
      full_card_amount: 0,
      full_eft_amount: 46_200,
      pre_paid_card_amount: 0,
      pre_paid_eft_amount: 0,
    },
  );

  assert.equal(result.fullEft, 46_200);
  assert.equal(result.complimentaryAmount, 0);
  assert.equal(result.statusLabel, "Fully Paid");
});

test("leaves the unclassified remainder visible when legacy evidence is partial", () => {
  const result = calculateTablePlanFinancialBreakdown(
    {
      confirmedPaidAmount: 2_200,
      guestCount: 4,
      outstandingAmount: 0,
      paymentStatus: "fully_paid",
      totalAmount: 2_200,
    },
    [],
    {
      booking_id: "fixture-booking",
      complimentary: false,
      full_card_amount: 0,
      full_eft_amount: 0,
      pre_paid_card_amount: 1_100,
      pre_paid_eft_amount: 0,
    },
  );

  assert.equal(result.prePaidCard, 1_100);
  assert.equal(result.methodUnknownPaid, 1_100);
  assert.equal(result.totalPaid, 2_200);
});
