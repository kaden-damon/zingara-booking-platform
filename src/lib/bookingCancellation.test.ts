import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { runCancellationUiFlow } from "./bookingCancellation.ts";

const projectRoot = new URL("../../", import.meta.url);
const migration = readFileSync(
  new URL(
    "supabase/migrations/20260831100000_phase_39_22a_atomic_booking_cancellation.sql",
    projectRoot,
  ),
  "utf8",
);
const bookingRoute = readFileSync(
  new URL("src/app/api/admin/bookings/route.ts", projectRoot),
  "utf8",
);
const ticketRoute = readFileSync(
  new URL("src/app/api/tickets/[reference]/route.ts", projectRoot),
  "utf8",
);
const validationRoute = readFileSync(
  new URL("src/app/api/admin/tickets/validate/route.ts", projectRoot),
  "utf8",
);

test("server success remains success when the best-effort browser refresh fails", async () => {
  let success = 0;
  let failure = 0;
  let refreshFailure = 0;

  const completed = await runCancellationUiFlow({
    mutate: async () => ({ idempotent: false }),
    onAuthoritativeFailure: () => {
      failure += 1;
    },
    onAuthoritativeSuccess: () => {
      success += 1;
    },
    onRefreshFailure: () => {
      refreshFailure += 1;
    },
    refreshAfterSuccess: async () => {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    },
  });

  assert.equal(completed, true);
  assert.equal(success, 1);
  assert.equal(failure, 0);
  assert.equal(refreshFailure, 1);
});

test("a genuine server cancellation failure reports failure and skips refresh", async () => {
  let success = 0;
  let failure = 0;
  let refreshed = 0;

  const completed = await runCancellationUiFlow({
    mutate: async () => {
      throw new Error("Authoritative cancellation rejected");
    },
    onAuthoritativeFailure: () => {
      failure += 1;
    },
    onAuthoritativeSuccess: () => {
      success += 1;
    },
    refreshAfterSuccess: async () => {
      refreshed += 1;
    },
  });

  assert.equal(completed, false);
  assert.equal(success, 0);
  assert.equal(failure, 1);
  assert.equal(refreshed, 0);
});

test("atomic cancellation clears both sides of the table assignment", () => {
  assert.match(migration, /update public\.bookings[\s\S]*table_id = null/);
  assert.match(
    migration,
    /update public\.show_tables[\s\S]*booking_id = null[\s\S]*status = 'available'/,
  );
});

test("atomic cancellation persists cancelled tickets and terminal live-ticket state", () => {
  assert.match(
    migration,
    /update public\.tickets[\s\S]*ticket_status = 'cancelled'/,
  );
  assert.match(ticketRoute, /terminalTicketStatuses\.has\(existingRow\.ticket_status\)/);
  assert.match(validationRoute, /terminalTicketStatuses\.has\(ticket\.ticket_status\)/);
});

test("already-cancelled retries remain idempotent", () => {
  assert.match(migration, /v_was_cancelled := v_booking\.booking_status = 'cancelled'/);
  assert.match(migration, /'idempotent', v_was_cancelled/);
});

test("cancellation cannot touch payments, refunds, or PayFast", () => {
  assert.doesNotMatch(migration, /update public\.(payments|payment_refunds)/i);
  assert.doesNotMatch(migration, /payfast/i);
  assert.doesNotMatch(bookingRoute, /submitPayFastRefund/);
});

test("retries cannot duplicate cancellation lifecycle or audit events", () => {
  assert.match(
    migration,
    /if not v_was_cancelled then[\s\S]*insert into public\.booking_lifecycle_events/,
  );
  assert.match(
    migration,
    /if not v_was_cancelled then[\s\S]*insert into public\.audit_events/,
  );
});
