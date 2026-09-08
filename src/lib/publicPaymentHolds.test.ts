import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  publicPaymentHoldMinutes,
  releaseValidatedFailedPublicPaymentHold,
  runPublicPaymentHoldCleanup,
} from "./workflows/publicPaymentHolds.ts";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260908190000_phase_41_1i_public_payment_holds.sql",
    import.meta.url,
  ),
  "utf8",
);
const bookingRoute = readFileSync(
  new URL("../app/api/bookings/route.ts", import.meta.url),
  "utf8",
);
const checkoutRoute = readFileSync(
  new URL("../app/api/payfast/checkout/route.ts", import.meta.url),
  "utf8",
);
const itnRoute = readFileSync(
  new URL("../app/api/payfast/itn/route.ts", import.meta.url),
  "utf8",
);
const availabilityRoute = readFileSync(
  new URL("../app/api/shows/availability/route.ts", import.meta.url),
  "utf8",
);
const workflowRoute = readFileSync(
  new URL("../app/api/workflows/run/route.ts", import.meta.url),
  "utf8",
);

function fakeClient() {
  const calls: Array<{ args: unknown; name: string }> = [];
  return {
    calls,
    client: {
      async rpc(name: string, args: unknown) {
        calls.push({ args, name });
        return {
          data: {
            expired: 2,
            released_pax: 9,
            released_table_claims: 1,
          },
          error: null,
        };
      },
    },
  };
}

test("public checkout creates a bounded server-authoritative hold", () => {
  assert.equal(publicPaymentHoldMinutes, 30);
  assert.match(migration, /public_checkout_expires_at timestamptz/);
  assert.match(migration, /created_at, now\(\)\) \+ interval '30 minutes'/);
  assert.match(migration, /before insert on public\.bookings/);
  assert.match(migration, /booking_source = 'online'/);
  assert.match(migration, /booking_origin, v_metadata_origin\) = 'customer_public'/);
});

test("active unexpired holds are protected and due holds release capacity", () => {
  assert.match(migration, /public_checkout_expires_at > v_now/);
  assert.match(migration, /update public\.show_tables[\s\S]*booking_id = null[\s\S]*status = 'available'/);
  assert.match(migration, /booking_status = 'cancelled'/);
  assert.match(migration, /archived_at = v_now/);
  assert.match(migration, /public_checkout_expired_at = v_now/);
});

test("paid, ticketed, and communicated records fail closed", () => {
  assert.match(migration, /provider_transaction_id/);
  assert.match(migration, /payment_status in \('deposit_paid', 'fully_paid'\)/);
  assert.match(migration, /from public\.tickets t where t\.booking_id = v_booking\.id/);
  assert.match(migration, /from public\.communications c where c\.booking_id = v_booking\.id/);
  assert.doesNotMatch(migration, /delete from public\.(payments|tickets|customers|communications)/i);
  assert.doesNotMatch(migration, /update public\.(payments|customers|communications)/i);
});

test("authoritative payment supersedes only same-journey same-show siblings", () => {
  assert.match(migration, /public_checkout_journey_id = new\.public_checkout_journey_id/);
  assert.match(migration, /show_id = new\.show_id/);
  assert.match(migration, /customer_id = new\.customer_id/);
  assert.match(migration, /guest_count = new\.guest_count/);
  assert.match(migration, /section is not distinct from new\.section/);
  assert.match(migration, /coalesce\(new\.amount_paid, 0\) <= 0/);
  assert.match(migration, /superseded-by-authoritative-payment/);
});

test("same customer on a different show is not treated as a duplicate", () => {
  assert.match(
    migration,
    /successor\.show_id = v_booking\.show_id[\s\S]*successor\.customer_id = v_booking\.customer_id/,
  );
});

test("cleanup is service-role-only and auditable", () => {
  assert.match(migration, /revoke all on function public\.expire_due_public_booking_holds\(integer\)[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.expire_due_public_booking_holds\(integer\) to service_role/);
  assert.match(migration, /public_checkout\.hold\.expired/);
  assert.match(migration, /public_checkout\.hold\.superseded/);
  assert.match(migration, /insert into public\.booking_lifecycle_events/);
});

test("scheduled and opportunistic cleanup protect availability and new reservations", () => {
  assert.match(workflowRoute, /runPublicPaymentHoldCleanup\(serviceClient\)/);
  assert.match(availabilityRoute, /runPublicPaymentHoldCleanup\(serviceClient\)/);
  assert.match(bookingRoute, /runPublicPaymentHoldCleanup\(supabase\)/);
  assert.match(checkoutRoute, /runPublicPaymentHoldCleanup\(serviceClient\)/);
});

test("validated failed or cancelled ITN releases only the public hold", async () => {
  const failed = fakeClient();
  await releaseValidatedFailedPublicPaymentHold(
    failed.client as never,
    "ZNG-TEST01",
    "FAILED",
  );
  assert.deepEqual(failed.calls, [
    {
      args: {
        p_booking_reference: "ZNG-TEST01",
        p_reason: "validated-payfast-failed",
      },
      name: "expire_public_booking_hold_by_reference",
    },
  ]);

  const untrustedStatus = fakeClient();
  await releaseValidatedFailedPublicPaymentHold(
    untrustedStatus.client as never,
    "ZNG-TEST02",
    "UNKNOWN",
  );
  assert.equal(untrustedStatus.calls.length, 0);
  assert.match(
    itnRoute,
    /!signatureValid[\s\S]*!sourceIpValid[\s\S]*!paymentAmountValid[\s\S]*!serverValidationValid[\s\S]*data\.payment_status !== "COMPLETE"/,
  );
});

test("PayFast return alone cannot confirm and duplicate ITN remains idempotent", () => {
  assert.match(itnRoute, /data\.payment_status !== "COMPLETE"/);
  assert.match(itnRoute, /duplicate_provider_transaction/);
  assert.match(itnRoute, /already_confirmed/);
  assert.doesNotMatch(bookingRoute, /payment_status.*fully_paid.*request/i);
});

test("cleanup helper returns released pax and table claims", async () => {
  const fake = fakeClient();
  const result = await runPublicPaymentHoldCleanup(fake.client as never);
  assert.deepEqual(result, {
    expired: 2,
    releasedPax: 9,
    releasedTableClaims: 1,
  });
  assert.equal(fake.calls[0]?.name, "expire_due_public_booking_holds");
});

test("Corporate, internal, deposit, and paid booking lifecycles remain protected", () => {
  assert.match(migration, /booking_source <> 'online'/);
  assert.match(migration, /booking_origin <> 'customer_public'/);
  assert.match(migration, /booking_status <> 'pending_payment'/);
  assert.match(migration, /payment_status <> 'pending_payment'/);
  assert.match(migration, /coalesce\(v_booking\.amount_paid, 0\) <> 0/);
});
