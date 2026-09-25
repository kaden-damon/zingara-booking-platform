import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260925170000_phase_41_2x_p0_d_atomic_mark_paid.sql",
  import.meta.url,
);
const routeUrl = new URL(
  "../app/api/admin/bookings/mark-paid/route.ts",
  import.meta.url,
);
const adminUrl = new URL("../app/admin/page.tsx", import.meta.url);

async function sources() {
  const [migration, route, admin] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(routeUrl, "utf8"),
    readFile(adminUrl, "utf8"),
  ]);
  return { admin, migration, route };
}

test("Mark Paid is one protected database transaction", async () => {
  const { migration } = await sources();

  assert.match(migration, /create or replace function public\.mark_booking_paid_atomic/);
  assert.match(migration, /language plpgsql[\s\S]*security definer/);
  assert.match(migration, /permission\.key = 'bookings:manage'/);
  assert.match(migration, /staff\.user_id = p_actor_auth_user_id/);
  assert.match(migration, /staff\.active/);
  assert.match(migration, /SHOW_OUTSIDE_STAFF_SCOPE/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\(upper\(trim\(p_booking_reference\)\)\)\)/);
  assert.match(migration, /from public\.bookings[\s\S]*for update/);
  assert.match(migration, /BOOKING_REVISION_CHANGED/);
  assert.match(migration, /grant execute on function public\.mark_booking_paid_atomic[\s\S]*to service_role/);
  assert.match(migration, /revoke all on function public\.mark_booking_paid_atomic[\s\S]*from public, anon, authenticated/);
});

test("manual settlement evidence is actor-attributed and never fabricates PayFast identity", async () => {
  const { migration } = await sources();

  assert.match(migration, /insert into public\.payments/);
  assert.match(migration, /'manual'/);
  assert.match(migration, /processed_by[\s\S]*p_actor_auth_user_id/);
  assert.match(migration, /processed_at[\s\S]*v_now/);
  assert.match(migration, /Authorised manual full settlement by %s/);
  assert.match(migration, /payment_status = 'pending_payment'[\s\S]*provider_transaction_id is null/);
  assert.match(migration, /if v_payment\.id is null then[\s\S]*insert into public\.payments[\s\S]*else[\s\S]*update public\.payments/);
  assert.match(
    migration,
    /provider_gross_amount,[\s\S]*provider_transaction_id,[\s\S]*transaction_fee_amount[\s\S]*null,[\s\S]*null,[\s\S]*v_booking\.booking_reference,[\s\S]*null/,
  );
  assert.doesNotMatch(migration, /'payfast'/i);
});

test("financial aggregates, lifecycle, links, tickets and evidence commit together", async () => {
  const { migration } = await sources();

  assert.match(migration, /v_outstanding := greatest[\s\S]*v_booking\.total_amount[\s\S]*v_booking\.amount_paid/);
  assert.match(migration, /set amount_paid = round\(coalesce\(v_booking\.total_amount, 0\), 2\)/);
  assert.match(migration, /balance_outstanding = 0/);
  assert.match(migration, /payment_status = 'fully_paid'/);
  assert.match(migration, /when v_booking\.booking_status::text in \('new', 'pending_payment'\)[\s\S]*then 'confirmed'/);
  assert.match(migration, /update public\.booking_payment_links[\s\S]*status = 'revoked'/);
  assert.match(migration, /update public\.tickets[\s\S]*insert into public\.tickets/);
  assert.match(migration, /insert into public\.booking_lifecycle_events/);
  assert.match(migration, /insert into public\.audit_events/);
  assert.match(migration, /'booking\.payment-recorded'/);
});

test("retry, double-click and concurrent settlement cannot duplicate payment value", async () => {
  const { migration } = await sources();

  const lockPosition = migration.indexOf("pg_advisory_xact_lock");
  const bookingPosition = migration.indexOf("from public.bookings", lockPosition);
  const idempotencyPosition = migration.indexOf("from public.audit_events", bookingPosition);
  const paymentPosition = migration.indexOf("insert into public.payments", idempotencyPosition);

  assert.ok(lockPosition >= 0);
  assert.ok(bookingPosition > lockPosition);
  assert.ok(idempotencyPosition > bookingPosition);
  assert.ok(paymentPosition > idempotencyPosition);
  assert.match(migration, /request_id = trim\(p_idempotency_key\)/);
  assert.match(migration, /'status', 'already_processed'/);
  assert.match(migration, /BOOKING_ALREADY_PAID/);
});

test("the endpoint keeps authentication and authoritative outcome guidance at the server boundary", async () => {
  const { route } = await sources();

  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /getRolePermissions\(role\)\.includes\("bookings:manage"\)/);
  assert.match(route, /normalizeStaffVenueScope/);
  assert.match(route, /\.rpc\("mark_booking_paid_atomic"/);
  assert.match(route, /BOOKING_REVISION_CHANGED/);
  assert.match(route, /BOOKING_ALREADY_PAID/);
  assert.match(route, /MARK_PAID_NOT_ALLOWED/);
  assert.match(route, /No partial financial change was retained/);
});

test("Admin waits for committed success and then reloads authoritative payment state", async () => {
  const { admin } = await sources();
  const flow = admin.slice(
    admin.indexOf("async function confirmMarkPaid"),
    admin.indexOf("function openRefundBookingConfirmation"),
  );

  const requestPosition = flow.indexOf('fetchSupabaseApi<{');
  const reloadPosition = flow.indexOf("getBookings()", requestPosition);
  const successPosition = flow.indexOf("showWorkflowToast", reloadPosition);

  assert.ok(requestPosition >= 0);
  assert.ok(reloadPosition > requestPosition);
  assert.ok(successPosition > reloadPosition);
  assert.match(flow, /\/api\/admin\/bookings\/mark-paid/);
  assert.match(flow, /setIsMarkPaidProcessing\(true\)/);
  assert.match(flow, /setIsMarkPaidProcessing\(false\)/);
  assert.match(flow, /resolveStaffActionGuidance/);
  assert.match(flow, /No partial financial change was retained/);
  assert.doesNotMatch(flow, /setBookings\([^\n]*map/);
  assert.doesNotMatch(flow, /persistAdminBookingState|updatePayment|updateTicket/);
});

test("Booking Details presents payment and lifecycle status independently", async () => {
  const { admin } = await sources();

  assert.match(
    admin,
    /Payment Status[\s\S]{0,500}paymentStatusLabels\[financials\.paymentStatus\]/,
  );
  assert.match(
    admin,
    /Booking Status[\s\S]{0,500}bookingStatusLabels\[booking\.status \?\? "confirmed"\]/,
  );
});

test("the atomic flow contains no fixture-specific correction", async () => {
  const { admin, migration, route } = await sources();
  const source = `${migration}\n${route}\n${admin.slice(admin.indexOf("async function confirmMarkPaid"), admin.indexOf("function openRefundBookingConfirmation"))}`;

  for (const reference of [
    "ZNG-QZJDFQ",
    "ZNG-NLV6MB",
    "ZNG-2QPL3V",
    "ZNG-2XHJY5",
    "ZNG-QNETCQ",
    "ZNG-4T9GRU",
    "ZNG-4HPH2Q",
  ]) {
    assert.doesNotMatch(source, new RegExp(reference));
  }
});
