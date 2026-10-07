import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Edit Guest Count does not expose developer-only financial wording", async () => {
  const [modal, route] = await Promise.all([
    source("../app/admin/BookingReconciliationModal.tsx"),
    source("../app/api/admin/bookings/reconciliation/route.ts"),
  ]);
  const visibleCopy = `${modal}\n${route}`;

  for (const phrase of [
    "not authoritative",
    "reconcile its financials",
    "Requires financial reconciliation",
    "Current venue pricing is not inferred",
  ]) {
    assert.doesNotMatch(visibleCopy, new RegExp(phrase, "i"));
  }
  assert.match(
    visibleCopy,
    /We can't confirm the original price for this booking\. Check the payment details before adding guests\./,
  );
});

test("key Admin guidance uses operational wording", async () => {
  const [quickStart, corporate, analytics] = await Promise.all([
    source("../app/admin/quick-start/page.tsx"),
    source("../app/admin/CorporateFinancialReconciliationModal.tsx"),
    source("../app/admin/ManagementAnalytics.tsx"),
  ]);
  assert.match(quickStart, /Complimentary bookings can be increased or reduced and remain R0/);
  assert.doesNotMatch(corporate, /authoritative source used/);
  assert.doesNotMatch(analytics, /authoritative public online bookings/);
});
