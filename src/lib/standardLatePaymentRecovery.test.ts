import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260929120000_emergency_standard_late_payment_recovery.sql",
  import.meta.url,
);
const itnRouteUrl = new URL("../app/api/payfast/itn/route.ts", import.meta.url);
const adminPageUrl = new URL("../app/admin/page.tsx", import.meta.url);

test("late-payment eligibility requires immutable expiry and provider evidence", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /booking_origin is distinct from 'customer_public'/);
  assert.match(migration, /booking_source <> 'online'/);
  assert.match(migration, /archive_reason <> 'Public payment hold expired'/);
  assert.match(migration, /payment\.processed_at > v_booking\.public_checkout_expired_at/);
  assert.match(migration, /payment\.provider_transaction_id is not null/);
  assert.match(migration, /payment\.method = 'payfast'/);
  assert.match(migration, /payment_refunds/);
  assert.match(migration, /booking\.cancel', 'booking\.archive', 'booking\.refund/);
  assert.match(migration, /public_checkout_superseded_by is not null/);
});

test("late restoration uses authoritative effective capacity and never creates capacity", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /booking_capacity_zone_state/);
  assert.match(migration, /effective_operational_capacity/);
  assert.match(migration, /active_entitlement_pax \+ v_entitlement\.pax/);
  assert.match(migration, /capacity_review/);
  assert.doesNotMatch(
    migration,
    /insert into public\.show_tables|update public\.show_tables|delete from public\.show_tables/i,
  );
});

test("safe restoration preserves identity, partial payment, tickets, and immutable audit", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  const recovery = migration.slice(
    migration.indexOf("create or replace function public.recover_standard_late_payment_booking_atomic"),
  );
  assert.match(recovery, /archived_at = null/);
  assert.match(recovery, /archive_reason = null/);
  assert.match(recovery, /booking_status = 'confirmed'/);
  assert.match(recovery, /ticket_status = case when ticket_status = 'cancelled' then 'valid'/);
  assert.match(recovery, /public_booking\.late-payment-recovered/);
  assert.match(recovery, /p_expected_updated_at/);
  assert.match(recovery, /p_request_id/);
  assert.doesNotMatch(recovery, /insert into public\.(bookings|payments|tickets)/i);
  assert.doesNotMatch(recovery, /amount_paid\s*=|balance_outstanding\s*=|payment_status\s*=/i);
});

test("PayFast confirmation reloads committed booking and payment before communication", async () => {
  const route = await readFile(itnRouteUrl, "utf8");
  const confirmation = route.slice(route.indexOf("async function confirmPayment("));

  assert.match(confirmation, /loadBooking\(supabase, booking\.reference\)/);
  assert.match(confirmation, /loadPersistedPayment/);
  assert.match(confirmation, /toAuthoritativeBooking/);
  assert.match(confirmation, /isOperationallyActive/);
  assert.match(route, /claim_payfast_payment_email_once/);
  assert.match(confirmation, /persistedPayment\.provider_transaction_id/);
  assert.doesNotMatch(
    confirmation.slice(confirmation.indexOf("const authoritativeBooking")),
    /ensureCommunication\([\s\S]{0,250}updatedBooking/,
  );
});

test("provider payment identity owns the retry-safe communication claim", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /communications_payfast_payment_email_claim_uidx/);
  assert.match(
    migration,
    /booking_id, provider_transaction_id, type, channel/,
  );
  assert.match(migration, /status in \('sending', 'sent'\)/);
  assert.match(migration, /claim_payfast_payment_email_once/);
  assert.match(migration, /status in \('sending', 'sent'\)[\s\S]*return jsonb_build_object/);
});

test("exact reference and CRM Open Booking reuse the existing detail workflow", async () => {
  const page = await readFile(adminPageUrl, "utf8");
  const filters = page.slice(
    page.indexOf("function bookingMatchesCurrentFilters"),
    page.indexOf("function getFilteredArchivableBookings"),
  );

  assert.match(filters, /isExactBookingReferenceSearch/);
  assert.ok(
    filters.indexOf("isExactBookingReferenceSearch") <
      filters.indexOf('bookingArchiveFilter === "active"'),
  );
  assert.match(page, /function openCustomerHistoryBooking/);
  assert.match(page, /Open Booking/);
  assert.match(page, /void openBookingDetails\(reference\)/);
});
