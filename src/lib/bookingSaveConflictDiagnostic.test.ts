import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { bookingSaveConflictDiagnostic } from "./bookingSaveConflictDiagnostic.ts";
import { mergeAdminBookingState } from "./adminBookingStateMerge.ts";
import type { DemoBooking } from "./zingaraDemo";

test("safe diagnostics distinguish same-version projection conflicts from stale versions", () => {
  const input = {
    stage: "field-conflict", lock: "owned",
    requestId: "cpt1::iad1::rsn49-1794993682969-012f4627ff0a",
    expectedVersion: "version-1", currentVersion: "version-1",
    conflictingFields: ["customer", "customer", "untrusted@example.invalid", "partySize"],
  } as const;
  assert.deepEqual(bookingSaveConflictDiagnostic(input), {
    stage: "field-conflict", lock: "owned", requestId: input.requestId,
    versionComparison: "equal", conflictingFields: ["customer", "partySize"], conflictCount: 4,
  });
  assert.equal(bookingSaveConflictDiagnostic({ ...input, currentVersion: "version-2" }).versionComparison, "different");
  const invalid = bookingSaveConflictDiagnostic({ stage: "edit-lock", lock: "different-session", requestId: "untrusted@example.invalid" });
  assert.equal(invalid.requestId, undefined);
  assert.equal(invalid.versionComparison, "unknown");
});

test("lock and version diagnostics stay on rejection paths before follow-up writes", async () => {
  const route = await readFile(new URL("../app/api/admin/bookings/route.ts", import.meta.url), "utf8");
  const lockGuard = route.slice(route.indexOf("async function ensureNoConflictingBookingLock"), route.indexOf("async function releaseTableClaimsForBookings"));
  assert.match(lockGuard, /if \(!activeLock\) \{\s*observe\?\.\("absent"\);\s*return null/);
  assert.match(lockGuard, /activeLock.session_id === requestingSessionId\s*\) \{\s*observe\?\.\("owned"\);\s*return null/);
  const save = route.slice(route.indexOf("async function persistBookingStateUpdate"), route.indexOf("async function persistBookingMetadataUpdate"));
  assert.match(save, /if \(lockError\) \{\s*if \(lockError.status === 409\) diagnoseConflict\("edit-lock"\);\s*return lockError/);
  assert.match(save, /if \(merge\.conflictingFields.length > 0\) \{\s*diagnoseConflict\("field-conflict"/);
  assert.match(save, /\.eq\("updated_at", currentUpdatedAt\)[\s\S]*if \(!updatedBooking\) \{\s*diagnoseConflict\("write-version-miss"[\s\S]*\n    if \(customerChanged\)/);
  const patch = route.slice(route.indexOf("export async function PATCH"), route.indexOf("export async function DELETE"));
  assert.match(patch, /if \(lockError\) \{\s*if \(lockError.status === 409\) \{\s*warnBookingSaveConflict\(request, \{ stage: "edit-lock", lock: patchLockState \}\);\s*\}\s*return lockError/);
});

test("different read projections can produce a field conflict without a version change", () => {
  const previous = {
    updatedAt: "same", customer: { name: "Guest", email: "guest@example.invalid", phone: "1" },
  } as DemoBooking;
  const authoritative = { ...previous, customer: { ...previous.customer, phone: "" } };
  const requested = { ...previous, customer: { ...previous.customer, name: "Edited guest" } };
  const result = mergeAdminBookingState({ authoritative, previous, requested });
  assert.deepEqual(result.conflictingFields, ["customer"]);
  assert.deepEqual(result.mergedBooking.customer, authoritative.customer);
});
