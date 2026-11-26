import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { bookingOperationalStaffIds, hasBookingOperationalAuthority } from "./bookingOperationalAuthority.ts";
import { parseCorporateZoneEntitlements } from "./corporateZoneEntitlements.ts";
import { resolveFunctionBriefBuyoutComposition } from "./corporateFunctionBriefFinancials.ts";

const row = { package_snapshot: { displayName: "Original package" }, commercial_base_amount: 10434.78,
  commercial_vat_amount: 1565.22, commercial_gratuity_amount: 1250, commercial_total_amount: 13250,
  commercial_additional_guest_amount: 0 };
const agreement = { ticketAmount: 12000, gratuityAmount: 1250, discountAmount: 0, barTabAmount: 500,
  otherAmount: 100, forfeitedAmount: 0, gratuityForfeitedAmount: 0, refundReviewAmount: 0,
  gratuityReviewAmount: 0, buyoutComposition: { baseAmount: 10434.78, vatAmount: 1565.22, additionalGuestAmount: 0 } };
const notes = (value: unknown) => "__zingara_booking_meta__:" + JSON.stringify({ operationalFinancialAgreement: value });

test("Buyout reporting uses the saved amended VAT composition with separately retained amounts", () => {
  assert.deepEqual(resolveFunctionBriefBuyoutComposition(row, { addonsTotal: 100, serviceFee: 1250,
    totalAmount: 13850, notes: notes(agreement) }), {
    packageName: "Original package", packageBaseAmount: 10434.78, vatAmount: 1565.22,
  });
});

test("inconsistent current Buyout evidence never fabricates VAT", () => {
  for (const value of [ { ...agreement, ticketAmount: 12001 }, { ...agreement, gratuityAmount: 1 },
    { ...agreement, buyoutComposition: { ...agreement.buyoutComposition, vatAmount: NaN } } ]) {
    assert.equal(resolveFunctionBriefBuyoutComposition(row, { addonsTotal: 100, serviceFee: 1250,
      totalAmount: 13850, notes: notes(value) }).vatAmount, null);
  }
});

function zoneHandler(id: string, venue: string) {
  const file = "src/app/api/admin/bookings/route.ts";
  const source = readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "persistCorporateZoneEntitlementUpdate")!;
  const calls: Record<string, unknown>[] = [];
  const client = { from(table: string) {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ error: null, data: table === "shows"
      ? { id: "show", venue } : { id: "booking", guest_count: 10, booking_origin: "corporate", booking_source: "corporate-direct", show_id: "show" } }) };
    return q;
  }, rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, ...args }); return { data: { ready: true }, error: null }; } };
  const context = { Request, Response, exports: {} as { run?: (request: Request, input: unknown) => Promise<Response> },
    requireActiveStaff: async () => ({ staffProfile: { id, active: true, venue_scope: ["all"], roles: { name: "Super Admin" } },
      user: { id: "distinct-auth-id" }, serviceClient: client }), getAdminRoleFromName: () => "super-admin",
    rolePermissions: { "super-admin": ["bookings:manage"] }, parseCorporateZoneEntitlements,
    hasBookingOperationalAuthority, normalizeShowLocation: (value: string) => value,
    normalizeStaffVenueScope: (value: unknown) => value };
  runInNewContext(ts.transpileModule(`${fn.getText(ast)}\nexports.run=persistCorporateZoneEntitlementUpdate;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return { calls, save: (pax: number) => context.exports.run!(new Request("http://fixture/api/admin/bookings"), {
    bookingReference: "FIXTURE", expectedUpdatedAt: "2026-11-26T10:00:00Z",
    zoneEntitlements: [{ zoneId: "royal-booths", pax: 4 }, { zoneId: "middle-ring", pax }],
  }) };
}

test("all verified named profiles can save explicit zone-count changes at both venues without a reason", async () => {
  for (const id of bookingOperationalStaffIds) for (const venue of ["cape-town", "johannesburg"]) {
    const f = zoneHandler(id, venue);
    assert.equal((await f.save(4)).status, 200);
    assert.equal(f.calls[0].p_actor_staff_profile_id, id);
    assert.equal(f.calls[0].p_actor_auth_user_id, "distinct-auth-id");
    assert.equal(f.calls[0].p_reason, undefined);
  }
});

test("an unrelated Super Admin retains ordinary zone editing, not the new commercial count exception", async () => {
  const f = zoneHandler("unlisted-profile", "cape-town");
  assert.equal((await f.save(4)).status, 400);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.save(6)).status, 200);
});

test("the new SQL paths retain exact manual table sets, genuine paid funds and fixed package snapshots", () => {
  const sql = readFileSync("supabase/migrations/20261126180000_box_office_operational_authority.sql", "utf8");
  assert.match(sql, /p_amount_paid is distinct from b\.amount_paid/);
  assert.match(sql, /component_sum<>p_total_amount/);
  assert.match(sql, /reserved>b\.amount_paid/);
  assert.match(sql, /manualSeatingAgreement','zones',v_set\.zone_id,'tableIds'/);
  assert.match(sql, /normalize_booking_capacity_zone\(section\)=v_set\.zone_id/);
  assert.doesNotMatch(sql, /set\s+(package_snapshot|terms_snapshot)\s*=/i);
});
