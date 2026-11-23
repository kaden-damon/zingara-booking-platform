import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { isPaymentLinkEligible } from "./paymentControls.ts";

const source = fs.readFileSync("src/app/admin/page.tsx", "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let eligibility = "";
let button: ts.JsxElement | undefined;
let target: ts.JsxOpeningElement | undefined;
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "canReviewBookingPayment") eligibility = node.initializer!.getText(ast);
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === "button" && node.children.some((child) => ts.isJsxText(child) && child.text.trim() === "Review Payment")) button = node;
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === "div" && node.attributes.properties.some((prop) => ts.isJsxAttribute(prop) && prop.name.getText(ast) === "id" && prop.initializer?.getText(ast).includes("payment-controls-"))) target = node;
  ts.forEachChild(node, visit);
}
visit(ast);

function canReview(overrides: { status?: string; archivedAt?: string; paymentStatus?: string; amountPaid?: number; canManage?: boolean; readOnly?: boolean } = {}) {
  const evaluate = new Function("booking", "financials", "canManageBookings", "bookingIsReadOnly", "isPaymentLinkEligible", `return ${eligibility}`);
  return evaluate({ reference: "ZNG-TEST", status: overrides.status ?? "confirmed", archivedAt: overrides.archivedAt },
    { totalPrice: 7700, amountPaid: overrides.amountPaid ?? 0, paymentStatus: overrides.paymentStatus ?? "pending-payment" },
    overrides.canManage ?? true, overrides.readOnly ?? false, isPaymentLinkEligible);
}

test("cancelled, archived and terminal bookings cannot offer Review Payment", () => {
  assert.equal(canReview({ status: "cancelled" }), false);
  assert.equal(canReview({ status: "cancelled", archivedAt: "2026-11-21T17:18:11Z", readOnly: true }), false);
  assert.equal(canReview({ archivedAt: "2026-11-21T17:18:11Z" }), false);
  for (const status of ["completed", "refunded"]) assert.equal(canReview({ status }), false);
});

test("active unpaid and deposit-paid bookings can open the existing controls", () => {
  for (const status of ["new", "pending-payment", "confirmed"]) assert.equal(canReview({ status }), true);
  assert.equal(canReview({ paymentStatus: "deposit-paid", amountPaid: 2200 }), true);
});

test("paid, complimentary and refunded payments do not offer a collection shortcut", () => {
  assert.equal(canReview({ amountPaid: 7700 }), false);
  assert.equal(canReview({ amountPaid: 8000 }), false);
  for (const paymentStatus of ["fully-paid", "fully_paid", "comp-vip", "comp_vip", "refunded", "cancelled"]) assert.equal(canReview({ paymentStatus }), false);
});

test("staff permissions and read-only/edit-lock access are required", () => {
  assert.equal(canReview({ canManage: false }), false);
  assert.equal(canReview({ readOnly: true }), false);
  assert.match(source, /canManageBookings && !bookingIsReadOnly \? \(/);
});

test("actual click handler scrolls and focuses only this booking's existing payment controls", () => {
  assert.ok(button);
  const attribute = button.openingElement.attributes.properties.find((prop) => ts.isJsxAttribute(prop) && prop.name.getText(ast) === "onClick") as ts.JsxAttribute;
  const expression = (attribute.initializer as ts.JsxExpression).expression!;
  const calls: unknown[] = [];
  const controls = { scrollIntoView: (options: unknown) => calls.push(["scroll", options]), focus: (options: unknown) => calls.push(["focus", options]) };
  const document = { getElementById: (id: string) => { calls.push(["target", id]); return controls; } };
  const click = new Function("booking", "document", `return ${expression.getText(ast)}`)({ reference: "ZNG-TEST" }, document);
  click();
  assert.deepEqual(calls, [["target", "payment-controls-ZNG-TEST"], ["scroll", { block: "start" }], ["focus", { preventScroll: true }]]);
  assert.doesNotThrow(() => new Function("booking", "document", `return ${expression.getText(ast)}`)({ reference: "ZNG-TEST" }, { getElementById: () => null })());
  assert.ok(target?.attributes.properties.some((prop) => ts.isJsxAttribute(prop) && prop.name.getText(ast) === "tabIndex" && prop.initializer?.getText(ast) === "{-1}"));
  assert.doesNotMatch(expression.getText(ast), /fetch|payment-link|record|reinstat|updateBooking|window.location/i);
  assert.match(source, /booking\.status === "cancelled"\s*\? "Booking cancelled"/);
});
