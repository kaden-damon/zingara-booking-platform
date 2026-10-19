import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("regenerated ticket identities remain authoritative during a guest increase", async () => {
  const migration = await source(
    "../../supabase/migrations/20261019170000_p0_booking_amendment_regenerated_ticket_identity.sql",
  );

  assert.match(migration, /ticket\.ticket_code = item ->> 'ticketCode'/);
  assert.match(migration, /ticket\.ticket_status::text in \('issued', 'valid', 'checked_in'\)/);
  assert.match(migration, /coalesce\(active_identity\.ticket_code, expected\.canonical_code\)/);
  assert.match(migration, /TICKET_POPULATION_TERMINAL_IDENTITY_REVIEW_REQUIRED/);
  assert.doesNotMatch(migration, /update\s+public\.payments/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.tickets/i);
});

test("known amendment failures map to safe actionable staff messages", async () => {
  const errors = await source("./bookingAmendmentErrors.ts");

  assert.match(errors, /ZONE_CAPACITY_EXCEEDED/);
  assert.match(errors, /does not have enough approved space/);
  assert.match(errors, /TICKET_POPULATION_TERMINAL_IDENTITY_REVIEW_REQUIRED/);
  assert.match(errors, /cancelled or replaced ticket that needs review/);
  assert.match(errors, /return match \? \{ \.\.\.match \} : null/);
  assert.doesNotMatch(errors, /duplicate key value|constraint secret|stack trace/i);
});

test("the route returns structured errors but keeps raw failures in server diagnostics", async () => {
  const route = await source("../app/api/admin/bookings/reconciliation/route.ts");
  const modal = await source("../app/admin/BookingReconciliationModal.tsx");

  assert.match(route, /mapBookingAmendmentError\(error\)/);
  assert.match(route, /code: mappedError\.code/);
  assert.match(route, /BOOKING_AMENDMENT_TEMPORARY_FAILURE/);
  assert.match(route, /console\.error\("\[Zingara Reconciliation\] Save failed", error\)/);
  assert.doesNotMatch(route, /error\.message[^\n]+status: 500/);
  assert.match(modal, /\{props\.error && <p role="alert"/);
  assert.match(modal, /value=\{draft\.reason\}/);
  assert.match(modal, /value=\{draft\.guestCount\}/);
});
