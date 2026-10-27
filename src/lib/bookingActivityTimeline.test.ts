import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const helper = fs.readFileSync("src/lib/bookingActivityTimeline.ts", "utf8");
const route = fs.readFileSync(
  "src/app/api/admin/bookings/[reference]/activity-timeline/route.ts",
  "utf8",
);
const modal = fs.readFileSync(
  "src/app/admin/BookingActivityTimelineModal.tsx",
  "utf8",
);
const admin = fs.readFileSync("src/app/admin/page.tsx", "utf8");
const auditMigration = fs.readFileSync(
  "supabase/migrations/20260806143000_phase_20b_immutable_audit_trail.sql",
  "utf8",
);

test("timeline access is restricted to the two approved active Super Admin staff IDs", () => {
  assert.match(helper, /e8598359-54a0-4e1f-a635-1ec8ae02cb78/);
  assert.match(helper, /3ac09b59-fc3f-4c6d-9bb3-8dd47a077188/);
  assert.match(helper, /staffProfile\.active/);
  assert.match(helper, /=== "super-admin"/);
  assert.match(route, /canAccessBookingActivityTimeline\(auth\.staffProfile\)/);
  assert.match(route, /status: 403/);
});

test("timeline reads only the selected booking through bounded indexed sources", () => {
  assert.match(route, /const pageSize = 25/);
  assert.match(route, /const maximumPage = 20/);
  assert.match(route, /\.eq\("booking_reference", bookingReference\)/);
  assert.match(route, /\.eq\("entity_reference", bookingReference\)/);
  assert.ok((route.match(/\.eq\("booking_id", booking\.id\)/g) ?? []).length >= 4);
  assert.match(route, /\.eq\("source_booking_id", booking\.id\)/);
  assert.match(route, /\.limit\(candidateLimit\)/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("normal Booking Details loading makes no timeline request", () => {
  assert.match(admin, /const BookingActivityTimelineModal = dynamic/);
  assert.match(admin, /bookingActivityReference && \(/);
  assert.doesNotMatch(admin, /fetchSupabaseApi[^\n]+activity-timeline/);
  assert.match(modal, /useEffect\(\(\) =>/);
  assert.match(modal, /activity-timeline\?page=1/);
  assert.match(modal, /Load More/);
});

test("sensitive values are removed and audit history remains immutable", () => {
  assert.match(helper, /authorization\|cookie\|password\|secret\|token\|qr/);
  assert.match(helper, /provider_transaction/);
  assert.match(helper, /private contact/);
  assert.match(helper, /private reference/);
  assert.match(auditMigration, /audit_events are append-only/);
  assert.match(auditMigration, /audit_events_entity_type_reference_idx/);
});
