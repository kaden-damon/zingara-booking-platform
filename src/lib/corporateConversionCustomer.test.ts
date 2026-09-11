import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateBookingCreate,
  // @ts-expect-error Node's built-in TypeScript test runner requires the extension.
} from "./bookingCreateValidation.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const migrationPath =
  "../../supabase/migrations/20260911100000_phase_41_2c_atomic_corporate_customer_conversion.sql";

test("trusted Corporate conversion permits authoritative email-only identity", () => {
  assert.deepEqual(
    validateBookingCreate({
      bookingSource: "corporate-direct",
      customer: {
        email: "maureen@example.com",
        name: "Maureen Prentice",
        phone: "",
      },
      isCreate: true,
      isTrustedStaff: true,
      partySize: 23,
    }),
    {},
  );
});

test("public booking still requires both email and mobile", () => {
  assert.deepEqual(
    validateBookingCreate({
      bookingSource: "online",
      customer: {
        email: "guest@example.com",
        name: "Public Guest",
        phone: "",
      },
      isCreate: true,
      isTrustedStaff: false,
      partySize: 2,
    }),
    { phone: "Mobile number is required." },
  );
});

test("optional Corporate mobile is canonicalised and validated", async () => {
  const bookingRoute = await source("../app/api/bookings/route.ts");

  assert.deepEqual(
    validateBookingCreate({
      bookingSource: "corporate-direct",
      customer: {
        email: "corporate@example.com",
        name: "Corporate Guest",
        phone: "+44 7911 123456",
      },
      isCreate: true,
      isTrustedStaff: true,
      partySize: 20,
    }),
    {},
  );
  assert.deepEqual(
    validateBookingCreate({
      bookingSource: "corporate-direct",
      customer: {
        email: "corporate@example.com",
        name: "Corporate Guest",
        phone: "123",
      },
      isCreate: true,
      isTrustedStaff: true,
      partySize: 20,
    }),
    { phone: "Enter a valid mobile number." },
  );
  assert.match(bookingRoute, /customer: normalizeBookingCustomer\(booking\.customer\)/);
  assert.match(bookingRoute, /p_mobile_lookup_variants: getPhoneLookupVariants/);
});

test("customer resolution and booking conversion share one database transaction", async () => {
  const [bookingRoute, migration] = await Promise.all([
    source("../app/api/bookings/route.ts"),
    source(migrationPath),
  ]);

  assert.match(bookingRoute, /reserve_corporate_conversion_with_customer/);
  assert.match(migration, /language plpgsql[\s\S]*select public\.reserve_public_booking_entitlement/);
  assert.match(migration, /select public\.reserve_public_booking_table/);
  assert.match(migration, /select public\.reserve_corporate_multi_zone_entitlement/);
  assert.match(migration, /v_booking\.corporate_request_id/);
});

test("canonical email and mobile resolve one existing customer without creating a duplicate", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /where lower\(email\) = v_email/);
  assert.match(migration, /jsonb_array_elements_text\(coalesce\(p_mobile_lookup_variants/);
  assert.match(migration, /= any\(v_mobile_variants\)/);
  assert.match(migration, /if v_email_customer_id is not null/);
  assert.match(migration, /elsif cardinality\(v_mobile_customer_ids\) = 1/);
  assert.match(migration, /if v_customer\.id is null then[\s\S]*insert into public\.customers/);
});

test("ambiguous customer identity fails closed with actionable guidance", async () => {
  const [bookingRoute, migration] = await Promise.all([
    source("../app/api/bookings/route.ts"),
    source(migrationPath),
  ]);

  assert.match(migration, /CORPORATE_CUSTOMER_IDENTITY_AMBIGUOUS/g);
  assert.match(bookingRoute, /Customer identity is ambiguous/);
  assert.match(bookingRoute, /Review the customer records using this email or mobile number/);
});

test("new customer creation preserves available contact without fabricating consent", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /v_first_name,[\s\S]*v_surname,[\s\S]*v_email/);
  assert.match(migration, /nullif\(trim\(p_customer_payload ->> 'mobile'\), ''\)/);
  assert.doesNotMatch(migration, /marketing|consent|opt.?in/i);
});

test("retry and failure safety are enforced by locks, unique linkage, and transaction rollback", async () => {
  const [migration, conversionMigration] = await Promise.all([
    source(migrationPath),
    source("../../supabase/migrations/20260903150000_phase_39_58_atomic_corporate_conversion.sql"),
  ]);

  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /not in \('success', 'already_exists'\)/);
  assert.match(migration, /CORPORATE_BOOKING_RESERVATION_FAILED/);
  assert.match(conversionMigration, /bookings_corporate_request_unique_idx/);
  assert.match(conversionMigration, /CORPORATE_REQUEST_ALREADY_CONVERTED/);
});

test("conversion customer audit is immutable and emitted only on customer creation", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /if v_customer_created then[\s\S]*insert into public\.audit_events/);
  assert.match(migration, /'customer\.create'/);
  assert.match(migration, /'Corporate Conversion'/);
});

test("Corporate financial, zone, large-party, and Floor behaviour remain delegated", async () => {
  const [conversionRoute, bookingRoute, migration] = await Promise.all([
    source("../app/api/admin/corporate-requests/convert/route.ts"),
    source("../app/api/bookings/route.ts"),
    source(migrationPath),
  ]);

  assert.match(conversionRoute, /hasValidReviewedFinancials/);
  assert.match(conversionRoute, /validateBookingCapacityIncrease/);
  assert.match(conversionRoute, /reservationTableClaims: table[\s\S]*: \[\]/);
  assert.match(bookingRoute, /p_zone_entitlements: booking\.zoneEntitlements \?\? \[\]/);
  assert.match(migration, /jsonb_array_length\(p_zone_entitlements\) > 1/);
  assert.doesNotMatch(migration, /payfast|ticket|communication/i);
});

test("database function is service-role only", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/);
});
