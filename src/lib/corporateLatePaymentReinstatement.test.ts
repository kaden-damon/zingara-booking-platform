import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

const migrationPath =
  "supabase/migrations/20260928150000_phase_41_2y_p0_a_corporate_late_eft_reinstatement.sql";

test("expired Corporate payment uses the authoritative payment and audit tables", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /record_expired_corporate_payment_atomic/);
  assert.match(sql, /insert into public\.payments/);
  assert.match(sql, /'booking\.payment-recorded'/);
  assert.match(sql, /method[^\n]+manual|method = 'manual'/s);
  assert.match(sql, /provider_transaction_id[^\n]+null/s);
  assert.match(sql, /provider_gross_amount[^\n]+null/s);
});

test("late payment remains financially separate from entitlement restoration", async () => {
  const sql = await source(migrationPath);
  const paymentFunction = sql.slice(
    sql.indexOf("create or replace function public.record_expired_corporate_payment_atomic"),
    sql.indexOf("create or replace function public.preview_expired_corporate_reinstatement"),
  );
  assert.match(paymentFunction, /payment_status = 'fully_paid'/);
  assert.doesNotMatch(paymentFunction, /booking_status = 'confirmed'/);
  assert.doesNotMatch(paymentFunction, /insert into public\.tickets/);
  assert.match(paymentFunction, /'booking_status', 'cancelled'/);
});

test("only immutable system-expiry provenance permits the workflow", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /booking_origin is distinct from 'corporate'/);
  assert.match(sql, /booking_source <> 'corporate-direct'/);
  assert.match(sql, /corporate_payment_expired_at is null/);
  assert.match(sql, /corporate\.payment_deadline\.expired/);
  assert.match(sql, /booking_status::text <> 'cancelled'/);
  assert.match(sql, /payment_refunds[\s\S]+completed_at is not null/);
});

test("reinstatement requires authoritative fully-paid evidence", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /CORPORATE_REINSTATEMENT_PAYMENT_REQUIRED/);
  assert.match(sql, /payment_status::text <> 'fully_paid'/);
  assert.match(sql, /amount_paid[\s\S]+total_amount/);
  assert.match(sql, /balance_outstanding[\s\S]+0\.01/);
  assert.match(sql, /public\.payments payment/);
  assert.match(sql, /booking\.payment-recorded/);
});

test("capacity is checked per entitlement while Floor Queue stays in active entitlement", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /zone_entitlements/);
  assert.match(sql, /booking_capacity_zone_state/);
  assert.match(sql, /active_entitlement_pax \+ v_entitlement\.pax/);
  assert.match(sql, /effective_operational_capacity/);
  assert.match(sql, /CORPORATE_REINSTATEMENT_CAPACITY_EXCEEDED/);
  assert.doesNotMatch(sql, /assign_unallocated_booking_table_atomic/);
});

test("reinstatement is stale-safe, locked, idempotent, and actor attributed", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\(upper/);
  assert.match(sql, /for update/);
  assert.match(sql, /BOOKING_REVISION_CHANGED/);
  assert.match(sql, /request_id = trim\(p_idempotency_key\)/);
  assert.match(sql, /corporate\.booking\.reinstated/);
  assert.match(sql, /actor_staff_profile_id/);
  assert.match(sql, /CORPORATE_REINSTATEMENT_ALREADY_ACTIVE/);
});

test("same booking and ticket identities are preserved", async () => {
  const sql = await source(migrationPath);
  assert.doesNotMatch(sql, /insert into public\.bookings/);
  assert.match(sql, /update public\.bookings/);
  assert.match(sql, /update public\.tickets/);
  assert.match(sql, /if v_ticket_count = 0 then[\s\S]+insert into public\.tickets/);
  assert.match(sql, /booking_id, issued_at, qr_payload, ticket_code/);
});

test("payment links are revoked in both authoritative operations", async () => {
  const sql = await source(migrationPath);
  assert.equal((sql.match(/update public\.booking_payment_links/g) ?? []).length, 2);
  assert.equal((sql.match(/status = 'revoked'/g) ?? []).length, 2);
});

test("RPCs remain service-role only", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /revoke all on function public\.record_expired_corporate_payment_atomic[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.preview_expired_corporate_reinstatement[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.reinstate_expired_corporate_booking_atomic[\s\S]+from public, anon, authenticated/);
});

test("server route enforces permission and venue scope", async () => {
  const route = await source("src/app/api/admin/bookings/reinstate-corporate/route.ts");
  assert.match(route, /requireActiveStaff/);
  assert.match(route, /bookings:manage/);
  assert.match(route, /normalizeStaffVenueScope/);
  assert.match(route, /outside your assigned location/);
});

test("server route returns actionable payment, capacity, stale, and eligibility guidance", async () => {
  const route = await source("src/app/api/admin/bookings/reinstate-corporate/route.ts");
  assert.match(route, /Record the verified EFT payment before reinstating/);
  assert.match(route, /REINSTATEMENT BLOCKED — CAPACITY CONFLICT/);
  assert.match(route, /Shortfall: \$\{shortfall\} seats/);
  assert.match(route, /changed since you opened it/);
  assert.match(route, /Only system-expired Corporate bookings/);
});

test("Booking Details uses explicit preview and confirmation instead of status dropdown", async () => {
  const page = await source("src/app/admin/page.tsx");
  assert.match(page, /Reinstate Booking/);
  assert.match(page, /Record Late EFT/);
  assert.match(page, /Record Late Corporate EFT/);
  assert.match(page, /action: "preview"/);
  assert.match(page, /action: "reinstate"/);
  assert.match(page, /disabled=\{bookingIsReadOnly \|\| isSystemExpiredCorporate\}/);
  assert.match(page, /Use Reinstate Booking after recording verified EFT payment/);
});

test("expired payment does not send guest communications before reinstatement", async () => {
  const page = await source("src/app/admin/page.tsx");
  assert.match(page, /response\.result\.booking_status !== "cancelled"/);
  assert.match(page, /Recording this EFT payment does not restore booking entitlement/);
});

test("all future manual EFT payments use the structured evidence-backed RPC", async () => {
  const route = await source("src/app/api/admin/bookings/mark-paid/route.ts");
  assert.match(route, /record_manual_eft_payment_atomic/);
  assert.match(route, /p_amount_received: amountReceived/);
  assert.match(route, /p_received_on: receivedOn/);
  assert.match(route, /p_bank_reference: bankReference/);
  assert.match(route, /p_confirmed: true/);
  assert.doesNotMatch(route, /record_expired_corporate_payment_atomic/);
  assert.doesNotMatch(route, /mark_booking_paid_atomic/);
});

test("the existing seven-day policy and Standard expiry migrations are untouched", async () => {
  const sql = await source(migrationPath);
  assert.doesNotMatch(sql, /durationDays/);
  assert.doesNotMatch(sql, /expire_unpaid_public_booking/);
  assert.doesNotMatch(sql, /set_new_corporate_payment_hold/);
});

test("PayFast, Dineplan, reporting, cancellation, and refund implementations are not replaced", async () => {
  const sql = await source(migrationPath);
  assert.doesNotMatch(sql, /payfast/i);
  assert.doesNotMatch(sql, /dineplan/i);
  assert.doesNotMatch(sql, /financial_report/i);
  assert.doesNotMatch(sql, /cancel_booking_atomic/);
  assert.doesNotMatch(sql, /refund_booking/);
});
