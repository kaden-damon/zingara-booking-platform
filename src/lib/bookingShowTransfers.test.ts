import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildBookingShowTransferConfirmation,
  getEligibleBookingTransferShows,
  isBookingEligibleForShowTransfer,
} from "./bookingShowTransfers.ts";
import type { DemoShow } from "./zingaraDemo.ts";

const shows: DemoShow[] = [
  {
    date: "2026-09-02",
    id: "legacy-current",
    label: "Current",
    operationalStatus: "active",
    supabaseId: "current",
    time: "18:00",
  },
  {
    date: "2026-09-04",
    id: "later",
    label: "Later",
    operationalStatus: "active",
    supabaseId: "later-db",
    time: "18:00",
  },
  {
    date: "2026-09-03",
    id: "earlier",
    label: "Earlier",
    operationalStatus: "active",
    supabaseId: "earlier-db",
    time: "18:00",
  },
  {
    date: "2026-09-05",
    id: "inactive",
    label: "Inactive",
    operationalStatus: "inactive",
    supabaseId: "inactive-db",
    time: "18:00",
  },
];

test("only active non-current shows are eligible and date ordered", () => {
  assert.deepEqual(
    getEligibleBookingTransferShows(shows, "current").map((show) => show.id),
    ["earlier", "later"],
  );
});

test("completed, checked-in, cancelled, refunded, and no-show bookings fail closed", () => {
  for (const status of [
    "completed",
    "checked-in",
    "cancelled",
    "refunded",
    "no-show",
    "waitlisted",
  ] as const) {
    assert.equal(isBookingEligibleForShowTransfer(status), false);
  }

  assert.equal(isBookingEligibleForShowTransfer("confirmed"), true);
  assert.equal(isBookingEligibleForShowTransfer("pending-payment"), true);
});

test("confirmation names the move and preserved identity", () => {
  const message = buildBookingShowTransferConfirmation({
    bookingReference: "ZNG-TRANSFER",
    currentShow: "Johannesburg · 2 September · 18:00",
    destinationShow: "Johannesburg · 3 September · 18:00",
    guestName: "QA Guest",
    pax: 4,
    zone: "Middle Ring",
  });

  assert.match(message, /MOVE BOOKING TO ANOTHER SHOW/);
  assert.match(message, /ZNG-TRANSFER/);
  assert.match(message, /ticket identity, QR code, payment history/);
});

test("atomic transfer preserves identity and financial rows", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20260901200000_phase_39_39_booking_show_transfer.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /create or replace function public\.transfer_booking_show_atomic/);
  assert.match(migration, /update public\.bookings\s+set show_id = v_destination_show\.id/s);
  assert.match(migration, /update public\.show_tables\s+set booking_id = null/s);
  assert.match(migration, /insert into public\.booking_lifecycle_events/);
  assert.match(migration, /insert into public\.audit_events/);
  assert.doesNotMatch(migration, /update public\.(payments|tickets|customers|communications)/i);
  assert.doesNotMatch(
    migration,
    /set[^;]*(total_amount|subtotal_amount|amount_paid|balance_outstanding|payment_status)/i,
  );
});

test("transfer RPC is service-role only and idempotent", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20260901200000_phase_39_39_booking_show_transfer.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /if v_booking\.show_id = v_destination_show\.id then/);
  assert.match(migration, /'idempotent', true/);
  assert.match(migration, /revoke all on function public\.transfer_booking_show_atomic[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.transfer_booking_show_atomic[\s\S]*to service_role/);
});

test("route keeps authentication, edit-lock, scope, and wallet protections", () => {
  const route = readFileSync(
    new URL("../app/api/admin/bookings/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /body\.action === "transfer-show"/);
  assert.match(route, /ensureNoConflictingBookingLock/);
  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /normalizeStaffVenueScope/);
  assert.match(route, /notifyAppleWalletBooking/);
});

test("database validation fails closed for inactive, over-capacity, and stale moves", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20260901200000_phase_39_39_booking_show_transfer.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const route = readFileSync(
    new URL("../app/api/admin/bookings/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(migration, /v_booking\.show_id <> p_expected_show_id/);
  assert.match(migration, /v_destination_show\.status::text <> 'active'/);
  assert.match(migration, /normalize_booking_capacity_zone\(v_booking\.section\)/);
  assert.match(migration, /hashtextextended\(v_destination_show\.id::text \|\| ':' \|\| v_zone/);
  assert.match(route, /ZONE_CAPACITY_EXCEEDED/);
});

test("destination assignment is exact, same-zone, configured, free, and large enough", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20260901200000_phase_39_39_booking_show_transfer.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /table_code = v_old_table_code/);
  assert.match(migration, /normalize_booking_capacity_zone\(section\) = v_zone/);
  assert.match(migration, /capacity >= v_booking\.guest_count/);
  assert.match(migration, /status = 'available'/);
  assert.match(migration, /booking_id is null/);
  assert.match(migration, /is_physical/);
  assert.match(migration, /'Requires floor assignment'/);
});

test("ticket presentation resolves the moved booking without changing ticket identity", () => {
  const wallet = readFileSync(
    new URL("./appleWalletPass.ts", import.meta.url),
    "utf8",
  );
  const walletMigration = readFileSync(
    new URL(
      "../../supabase/migrations/20260826210000_phase_38_2_apple_wallet_live_sync.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(wallet, /\.eq\("id", booking\.show_id\)/);
  assert.match(wallet, /ticket\.qr_payload/);
  assert.match(walletMigration, /after update of booking_status, payment_status, section, table_id, show_id/);
});

test("Admin UX keeps show transfers separate from table moves and warns about outcomes", () => {
  const page = readFileSync(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /Move To Table \/ Zone/);
  assert.match(page, /Move to Another Show/);
  assert.match(page, /Existing pricing, payment history, ticket reference, UUID, and QR remain unchanged/);
  assert.match(page, /Floor Assignment Queue/);
  assert.doesNotMatch(page, /confirmBookingShowTransfer[\s\S]{0,1600}sendCustomer/);
});
