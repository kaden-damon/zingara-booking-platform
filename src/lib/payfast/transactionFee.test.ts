import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePayFastBookingReconciliation,
  calculatePayFastTransactionAmounts,
  // @ts-expect-error Node's built-in TypeScript test runner requires the extension.
} from "./transactionFee.ts";

test("adds one R10 fee to every positive PayFast transaction", () => {
  assert.deepEqual(calculatePayFastTransactionAmounts(550), {
    bookingAppliedAmount: 550,
    providerGrossAmount: 560,
    transactionFeeAmount: 10,
  });
  assert.deepEqual(calculatePayFastTransactionAmounts(50), {
    bookingAppliedAmount: 50,
    providerGrossAmount: 60,
    transactionFeeAmount: 10,
  });
  assert.deepEqual(calculatePayFastTransactionAmounts(1320), {
    bookingAppliedAmount: 1320,
    providerGrossAmount: 1330,
    transactionFeeAmount: 10,
  });
});

test("keeps booking accounting separate across multiple transactions", () => {
  const deposit = calculatePayFastTransactionAmounts(550);
  const balance = calculatePayFastTransactionAmounts(770);

  assert.equal(
    deposit.bookingAppliedAmount + balance.bookingAppliedAmount,
    1320,
  );
  assert.equal(
    deposit.transactionFeeAmount + balance.transactionFeeAmount,
    20,
  );
  assert.equal(deposit.providerGrossAmount + balance.providerGrossAmount, 1340);

  const afterDeposit = calculatePayFastBookingReconciliation(
    1320,
    0,
    deposit.bookingAppliedAmount,
  );
  const afterBalance = calculatePayFastBookingReconciliation(
    1320,
    afterDeposit.amountPaid,
    balance.bookingAppliedAmount,
  );

  assert.deepEqual(afterDeposit, {
    amountPaid: 550,
    outstandingAmount: 770,
  });
  assert.deepEqual(afterBalance, {
    amountPaid: 1320,
    outstandingAmount: 0,
  });
});

test("does not charge a transaction fee for zero-value completion", () => {
  assert.deepEqual(calculatePayFastTransactionAmounts(0), {
    bookingAppliedAmount: 0,
    providerGrossAmount: 0,
    transactionFeeAmount: 0,
  });
});
