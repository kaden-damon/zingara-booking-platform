import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { resolveBookingOutstandingBalance } from "./paymentControls.ts";
import { getIncludedBookingFeeBreakdown } from "./zingaraDemo.ts";
import { resolveTablePlanPaymentSummary, calculateTablePlanFinancialBreakdown } from "./exports/tablePlanFinance.ts";

const input = { bookingOrigin: "admin_staff", bookingSource: "admin", bookingStatus: "pending_payment", paymentStatus: "pending_payment", totalAmount: 21600, confirmedPaidAmount: 0, recordedOutstanding: 13350 };
function extract(path: string, name: string, bindings: Record<string, unknown>) {
  const source = readFileSync(path, "utf8"), ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)!;
  assert.ok(fn);
  const context = { exports: {} as { invoke?: (...args: unknown[]) => unknown }, Response, console, ...bindings };
  runInNewContext(ts.transpileModule(`${fn.getText(ast)}\nexports.invoke=${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exports.invoke!;
}
test("BUG40: a requested R8250 deposit does not reduce R21600 owed before any receipt", () => {
  assert.equal(resolveBookingOutstandingBalance(input), 21600);
  assert.equal(resolveBookingOutstandingBalance({ ...input, recordedOutstanding: 0 }), 21600);
  assert.equal(resolveBookingOutstandingBalance({ ...input, bookingOrigin: "customer_public", bookingSource: "online" }), 21600);
});
test("historical contracts, imports, paid/refunded/COMP and cancelled states retain recorded treatment", () => {
  for (const override of [{ bookingOrigin: "data_import" }, { bookingOrigin: "corporate", bookingSource: "corporate-direct" }, { confirmedPaidAmount: 8250, paymentStatus: "deposit_paid" }, { confirmedPaidAmount: 21600, paymentStatus: "fully_paid" }, { bookingStatus: "cancelled" }, { paymentStatus: "comp_vip" }, { paymentStatus: "refunded" }]) {
    assert.equal(resolveBookingOutstandingBalance({ ...input, ...override }), 13350);
  }
});
test("actual Booking Details calculation shows paid zero, deposit requested and full outstanding", () => {
  const fn = extract("src/app/admin/page.tsx", "getBookingFinancials", {
    getIncludedBookingFeeBreakdown, resolveBookingOutstandingBalance,
    getBookingPaymentStatus: (b: { paymentStatus: string }) => b.paymentStatus,
  });
  const booking = { bookingOrigin: "admin_staff", source: "admin", status: "pending-payment", paymentStatus: "pending-payment", totalPrice: 21600, subtotalPrice: 21600, amountPaid: 0, balanceDue: 13350, depositPercentage: 38.19444444444444 };
  const result = fn(booking) as { amountPaid: number; balanceDue: number; depositAmount: number };
  assert.equal(result.amountPaid, 0); assert.equal(result.balanceDue, 21600); assert.equal(result.depositAmount, 8250);
  assert.equal(booking.balanceDue, 13350, "presentation does not rewrite stored history");
});
test("actual new reservation payload and embedded metadata cannot deduct an unpaid deposit", async () => {
  let payload: { balance_outstanding?: number; notes?: string } = {};
  const fn = extract("src/app/api/bookings/route.ts", "reservePublicBookingAtomically", {
    normalizeReservationClaims: () => [], resolveBookingOutstandingBalance,
    getBookingPayload: (b: { balanceDue: number }) => ({ balance_outstanding: b.balanceDue, notes: JSON.stringify(b) }),
    getPaymentPayload: () => ({ amount: 0, payment_status: "pending_payment" }),
  });
  const booking = { bookingOrigin: "admin_staff", source: "admin", status: "pending-payment", paymentStatus: "pending-payment", totalPrice: 21600, amountPaid: 0, balanceDue: 13350 };
  await fn({ rpc: async (_name: string, args: { p_booking_payload: typeof payload }) => { payload = args.p_booking_payload; return { data: { status: "success", booking_id: "fixture" }, error: null }; } }, booking, "customer", "show");
  assert.equal(payload.balance_outstanding, 21600);
  assert.equal(JSON.parse(payload.notes!).balanceDue, 21600);
  assert.equal(JSON.parse(payload.notes!).amountPaid, 0);
  assert.equal(booking.balanceDue, 13350);
});
test("Table Plan summary and financial buckets distinguish zero receipts from deposit requests", () => {
  const summary = resolveTablePlanPaymentSummary({ bookingOrigin: input.bookingOrigin, bookingStatus: input.bookingStatus, paymentStatus: input.paymentStatus, amountPaid: 0, balanceOutstanding: 13350, totalAmount: 21600, depositPercentage: 38.19444444444444 });
  assert.equal(summary.amountPaid, 0); assert.equal(summary.outstanding, 21600); assert.equal(summary.depositRequirement, 8250);
  const detail = calculateTablePlanFinancialBreakdown({ bookingOrigin: "admin_staff", confirmedPaidAmount: 0, paymentStatus: "pending_payment", totalAmount: 21600, guestCount: 15 }, [{ amount: 0, method: "platform", payment_status: "pending_payment", payment_type: "deposit" }]);
  assert.equal(detail.totalPaid, 0);
});
