import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as timeline from "./bookingActivityTimeline.ts";
import { normalizeStaffLocation, normalizeStaffVenueScope } from "./staffLocations.ts";
import { adminRoleLabels, rolePermissions, type AdminRole } from "./zingaraAccess.ts";

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

test("all active known Admin staff roles can read the timeline, not just two accounts", () => {
  for (const name of Object.values(adminRoleLabels)) {
    assert.equal(timeline.canAccessBookingActivityTimeline({ active: true, id: "any-staff", roles: { id: "role", name } }), true);
    assert.equal(timeline.canAccessBookingActivityTimeline({ active: false, id: "any-staff", roles: { id: "role", name } }), false);
  }
  assert.equal(timeline.canAccessBookingActivityTimeline({ active: true, id: "unknown", roles: null }), false);
  assert.match(admin, /canViewBookingActivityTimeline = Boolean\(currentStaff\)/);
  assert.match(route, /canAccessBookingActivityTimeline\(auth\.staffProfile\)/);
  assert.match(route, /status: 403/);
});

function fixtureEntry(overrides: Partial<timeline.BookingActivityEntry> = {}): timeline.BookingActivityEntry {
  return { id: "event", action: "booking.edit", actor: "System", changes: [], reason: null,
    occurredAt: "2026-11-17T05:19:44Z", outcome: "success", source: "Booking", ...overrides };
}

test("every catalogued event and unknown future event has a plain-English title", () => {
  for (const code of Object.keys(timeline.bookingActivityLabels)) {
    const row = timeline.presentBookingActivityEntry(fixtureEntry({ action: code }), { financial: true, privateDetails: true });
    assert.ok(row.action.length > 5, code);
    assert.doesNotMatch(row.action, /[_]|\b(?:RPC|ITN|atomic|idempotency|entitlement|phase\d*)\b/i, code);
    assert.notEqual(row.action, code);
  }
  assert.equal(timeline.presentBookingActivityEntry(fixtureEntry({ action: "booking.NEW_INTERNAL_CODE" }), { financial: true, privateDetails: true }).action, "Booking details updated");
  const blocked = timeline.presentBookingActivityEntry(fixtureEntry({ outcome: "blocked" }), { financial: true, privateDetails: true });
  assert.match(blocked.action, /^Not completed:/);
});

test("all literal booking action types in existing source and migration history are catalogued", () => {
  const visit = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const path = `${directory}/${item.name}`;
    return item.isDirectory() ? visit(path) : /\.(ts|tsx|sql)$/.test(path) && !path.includes(".test.") ? [path] : [];
  });
  const actions = new Set<string>();
  for (const path of [...visit("src"), ...visit("supabase/migrations")]) {
    for (const match of fs.readFileSync(path, "utf8").matchAll(/["']((?:booking\.|booking-lock\.|corporate\.|public_booking\.|public_checkout\.)[a-z0-9_.-]+)["']/g)) actions.add(match[1]);
  }
  assert.ok(actions.size > 80);
  for (const action of actions) assert.ok(timeline.bookingActivityLabels[action], `Missing everyday wording: ${action}`);
});

test("payment expiry and late payment never imply the guest failed to authorise or was refunded", () => {
  const row = timeline.presentBookingActivityEntry(fixtureEntry({ action: "public_booking.late-payment-review-required", outcome: "blocked", reason: "ITN CAPACITY_REVIEW" }), { financial: false, privateDetails: false });
  assert.match(row.reason || "", /Payment was received after the reservation ended/);
  assert.doesNotMatch(row.reason || "", /ITN|CAPACITY|refund|authoris/i);
  assert.doesNotMatch(row.action, /Not completed/);
});

test("actor names use recorded identity and unknown staff are never guessed to be System", () => {
  assert.equal(timeline.timelineActor("Charlie"), "Charlie");
  assert.equal(timeline.timelineActor(null, true), "Staff member (name not recorded)");
  assert.equal(timeline.timelineActor(null), "Not recorded");
  assert.equal(timeline.timelineActor("SYSTEM"), "System");
  assert.equal(timeline.timelineActor("AUTHORISED SUPPORT RECOVERY"), "Support team (authorised recovery)");
});

test("before/after values are readable, unchanged fields omitted, sensitive data excluded", () => {
  const changes = timeline.buildTimelineChanges({ guest_count: 4 }, { guest_count: 4, amount_paid: 6160, payment_status: "fully_paid", provider_transaction_id: "private", email: "private@example.test" });
  assert.equal(changes.some((change) => change.field === "Guests"), false);
  const row = timeline.presentBookingActivityEntry(fixtureEntry({ changes }), { financial: true, privateDetails: true });
  assert.match(String(row.changes.find((change) => change.field === "Paid")?.after), /6.?160/);
  assert.equal(row.changes.find((change) => change.field === "Payment status")?.after, "Fully paid");
  assert.doesNotMatch(JSON.stringify(row), /private@example|provider_transaction|fully_paid/);
  const hidden = timeline.buildTimelineChanges({}, { invalidated_ticket_codes: ["ZNG-PRIVATE-01"], ticketUrl: "https://example.test/ticket/private", acceptanceLinkId: "private" });
  assert.equal(hidden.length, 0);
  assert.equal(timeline.sanitizeTimelineText("Sent https://example.test/ticket/private"), "Sent [private link]");
  const restricted = timeline.presentBookingActivityEntry(fixtureEntry({ changes, reason: "Paid R6160" }), { financial: false, privateDetails: true });
  assert.equal(restricted.changes.length, 0);
  assert.equal(restricted.reason, null);
  assert.match(timeline.timelineValue("2026-11-17T05:19:44Z"), /07:19:44.*SAST/);
});

test("sorting keeps distinct evidence, removes only repeated IDs and preserves timestamps", () => {
  const older = fixtureEntry({ id: "old" });
  const newer = fixtureEntry({ id: "new", occurredAt: "2026-11-18T07:58:39Z" });
  assert.deepEqual(timeline.sortBookingActivityEntries([older, newer, older]).map((row) => row.id), ["new", "old"]);
  assert.equal(timeline.sortBookingActivityEntries([older, { ...older, id: "other-source" }]).length, 2);
});

test("earlier status history remains visible without duplicating equivalent stored events", () => {
  const notes = '__zingara_booking_meta__:' + JSON.stringify({ lifecycleHistory: [
    { createdAt: "2026-11-17T05:19:44.000Z", fromStatus: "new", toStatus: "pending-payment" },
    { createdAt: "2026-11-18T07:58:39Z", fromStatus: "cancelled", toStatus: "confirmed", note: "Earlier recovery" },
  ] });
  const earlier = timeline.legacyTimelineStatusEvents(notes, [{ id: "actual", created_at: "2026-11-17T05:19:44+00:00", from_status: "new", to_status: "pending_payment" }]);
  assert.equal(earlier.length, 1);
  assert.equal(earlier[0].changed_by, null);
  assert.equal(earlier[0].to_status, "confirmed");
  assert.deepEqual(timeline.legacyTimelineStatusEvents("invalid", []), []);
});

async function routeFixture(role: AdminRole, options: { venue?: string; active?: boolean; unauthenticated?: boolean } = {}) {
  const calls: string[] = [];
  const booking = { id: "booking", booking_reference: "DP-TEST", created_at: "2026-11-17T05:19:44Z", booking_source: "online", booking_origin: "customer_public", created_by_staff_id: null, booking_status: "confirmed", payment_status: "fully_paid", guest_count: 4, section: "Golden Circle", show: { venue: options.venue || "johannesburg" } };
  const rows: Record<string, unknown[]> = {
    audit_events: [{ id: "audit", created_at: "2026-11-18T07:58:39Z", action: "booking.edit", actor_staff_profile_id: "charlie", actor_auth_user_id: null, actor_name: "Charlotte King", outcome: "success", source_area: "Bookings", before_values: { guest_count: 3 }, after_values: { guest_count: 4, amount_paid: 6160 }, changed_fields: ["guest_count", "amount_paid"], reason: null }],
    staff_profiles: [{ id: "charlie", user_id: "charlie-auth", full_name: "Charlie" }],
    payments: [{ id: "placeholder", amount: 0, payment_status: "pending_payment" }, { id: "payment", created_at: "2026-11-17T05:19:45Z", processed_at: "2026-11-18T07:58:39Z", amount: 6160, payment_status: "fully_paid", method: "platform", processed_by: null }],
    booking_lifecycle_events: [{ id: "lifecycle", from_status: "new", to_status: "pending_payment", changed_by: null, created_at: "2026-11-17T05:19:44Z", note: "Awaiting PayFast payment", reason: null }],
  };
  const serviceClient = { from(table: string) {
    calls.push(table);
    const chain = { select() { return chain; }, eq() { return chain; }, or() { return chain; }, order() { return chain; }, limit() { return chain; },
      maybeSingle: async () => ({ data: booking, error: null }),
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: rows[table] || [], error: null })); } };
    return chain;
  } };
  const ast = ts.createSourceFile("route.ts", route, ts.ScriptTarget.Latest, true);
  const source = ts.createPrinter().printFile(ts.factory.updateSourceFile(ast, ast.statements.filter((node) => !ts.isImportDeclaration(node))));
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { ...timeline, normalizeStaffLocation, normalizeStaffVenueScope, getRolePermissions: () => rolePermissions[role], exports: {} as { GET: (request: Request, context: unknown) => Promise<Response> }, Response, URL, console,
    requireActiveStaff: async () => options.unauthenticated ? { error: Response.json({ error: "Authentication required" }, { status: 401 }) } : { error: null, serviceClient, staffProfile: { id: "staff", active: options.active !== false, roles: { id: "role", name: adminRoleLabels[role] }, venue_scope: ["johannesburg"] } } };
  runInNewContext(compiled, context);
  const response = await context.exports.GET(new Request("https://example.test/api/admin/bookings/DP-TEST/activity-timeline"), { params: Promise.resolve({ reference: "DP-TEST" }) });
  return { status: response.status, data: await response.json(), calls };
}

test("actual route allows all active staff, scopes venue and excludes restricted financial queries", async () => {
  for (const role of Object.keys(adminRoleLabels) as AdminRole[]) {
    const result = await routeFixture(role);
    assert.equal(result.status, 200, role);
    const financial = rolePermissions[role].includes("bookings:manage") || rolePermissions[role].includes("analytics:read");
    assert.equal(result.calls.includes("payments"), financial, role);
    assert.equal(result.calls.includes("xero_documents"), financial, role);
    if (!financial) assert.doesNotMatch(JSON.stringify(result.data), /6160|6.?160/);
    assert.equal(result.data.events.find((row: timeline.BookingActivityEntry) => row.id === "audit:audit")?.actor, "Charlie");
    const created = result.data.events.find((row: timeline.BookingActivityEntry) => row.id === "booking:booking:created");
    assert.doesNotMatch(JSON.stringify(created.changes), /Confirmed|Fully paid|Guests/);
    assert.equal(result.data.events.some((row: timeline.BookingActivityEntry) => row.id === "payment:placeholder"), false);
  }
  const denied = await routeFixture("floor-manager", { venue: "cape-town" });
  assert.equal(denied.status, 403);
  assert.deepEqual(denied.calls, ["bookings"]);
  assert.equal((await routeFixture("venue-manager", { active: false })).status, 403);
  assert.equal((await routeFixture("venue-manager", { unauthenticated: true })).status, 401);
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
  assert.match(helper, /PayFast \(\?:transaction\|payment received\)/);
  assert.match(helper, /private contact/);
  assert.match(helper, /private reference/);
  assert.match(auditMigration, /audit_events are append-only/);
  assert.match(auditMigration, /audit_events_entity_type_reference_idx/);
});
