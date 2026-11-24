import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { runInNewContext } from "node:vm";
import { findBookingCustomer } from "./bookingCustomerIdentity.ts";
import { getBookingGuestName, getBookingGuestLabel, getAttendingGuestNameFromNotes, normalizeAttendingGuestName } from "./bookingGuestName.ts";
import { getGuestTicketsForBooking, type DemoBooking } from "./zingaraDemo.ts";
import { createBookingMetadataDraft, isBookingMetadataDraftDirty } from "./bookingMetadataDraft.ts";
import { calculateBookingAddonFinancialUpdate, getBookingAddonTotal } from "./bookingAddons.ts";

const purchaser = { id: "purchaser", email: "marisa@example.test", mobile: "+27821234567", first_name: "Marisa", surname: "Example", preferences: { vipTags: ["Existing"] }, relationship_notes: "Keep", dietary_requirements: "Keep" };

test("email identity has priority, regardless of attendee name or shared phone ordering", () => {
  const other = { ...purchaser, id: "other", email: "another@example.test", first_name: "Manuela" };
  assert.equal(findBookingCustomer([other, purchaser], { email: "MARISA@example.test", name: "Leigh-Ann", phone: purchaser.mobile })?.id, purchaser.id);
});

test("shared contacts never automatically merge distinct or ambiguous people", () => {
  assert.equal(findBookingCustomer([purchaser], { email: "other@example.test", phone: purchaser.mobile, name: "Marisa Example" }), undefined);
  assert.equal(findBookingCustomer([purchaser], { phone: purchaser.mobile, name: "Manuela Example" }), undefined);
  assert.equal(findBookingCustomer([purchaser, { ...purchaser, id: "duplicate" }], { phone: purchaser.mobile, name: "Marisa Example" }), undefined);
  assert.equal(findBookingCustomer([purchaser], { name: "Marisa Example" }), undefined);
  assert.equal(findBookingCustomer([purchaser], { phone: "0821234567", name: " Marisa  Example " })?.id, purchaser.id);
});

function upsertHandler(path: string, dependency: Record<string, unknown>) {
  const source = fs.readFileSync(path, "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const statement = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "upsertCustomer")!;
  const context = { ...dependency, exports: {} as { handler: (client: unknown, customer: unknown) => Promise<unknown> } };
  runInNewContext(ts.transpileModule(statement.getText(ast) + "\nexports.handler=upsertCustomer;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports.handler;
}

test("actual public repeat-booking upsert never overwrites the matched CRM profile", async () => {
  const calls: string[] = [];
  const handler = upsertHandler("src/app/api/bookings/route.ts", {
    getCustomerPayload: () => ({ email: purchaser.email, preferences: {} }),
    normalizePhoneForComparison: () => purchaser.mobile,
    getPhoneLookupVariants: () => [purchaser.mobile], findBookingCustomer,
  });
  const client = { from() { const chain = { select() { return chain; }, is() { return chain; }, eq() { return chain; }, maybeSingle: async () => ({ data: purchaser, error: null }), update() { calls.push("update"); throw new Error("Unexpected update"); } }; return chain; } };
  assert.equal(await handler(client, { name: "Manuela", email: purchaser.email }), purchaser.id);
  assert.deepEqual(calls, []);
  assert.equal(purchaser.first_name, "Marisa");
  assert.equal(purchaser.relationship_notes, "Keep");
});

test("actual Admin creation upsert also preserves matched profiles and existing preferences", async () => {
  const handler = upsertHandler("src/app/api/admin/customers/route.ts", {
    findCustomer: async () => purchaser, toCustomerPayload: () => ({ first_name: "Leigh-Ann" }),
  });
  const result = await handler({ from() { throw new Error("Must not write existing profile"); } }, {}) as { row: unknown; created: boolean };
  assert.equal(result.row, purchaser);
  assert.equal(result.created, false);
});

test("attending names remain separate from purchaser contacts, ticket identity and normal bookings", () => {
  const booking = { reference: "ZNG-TEST", partySize: 2, customer: { name: "Marisa Example", email: purchaser.email, phone: purchaser.mobile }, attendingGuestName: "Manuela Example" } as DemoBooking;
  const tickets = getGuestTicketsForBooking(booking);
  assert.equal(tickets[0].fullName, "Manuela Example");
  assert.equal(tickets[0].email, purchaser.email);
  assert.equal(tickets[0].mobile, purchaser.mobile);
  assert.equal(tickets[1].fullName, "Guest 2");
  const normal = getGuestTicketsForBooking({ ...booking, attendingGuestName: undefined });
  assert.equal(normal[0].fullName, "Marisa Example");
  assert.equal(normal[0].ticketCode, tickets[0].ticketCode);
  assert.equal(getBookingGuestLabel(booking), "Manuela Example (Booked by Marisa Example)");
  assert.equal(getBookingGuestName(booking), "Manuela Example");
  assert.equal(booking.customer.name, "Marisa Example");
});

test("attendee edits are dirty metadata, not CRM or financial updates; clearing and malicious input are safe", () => {
  const before = createBookingMetadataDraft("Keep notes", [], undefined);
  assert.equal(isBookingMetadataDraftDirty(createBookingMetadataDraft("Keep notes", [], "Leigh-Ann"), before), true);
  assert.equal(normalizeAttendingGuestName(null), undefined);
  assert.equal(normalizeAttendingGuestName("  Manuela  "), "Manuela");
  assert.throws(() => normalizeAttendingGuestName({ name: "Not a string" }));
  assert.throws(() => normalizeAttendingGuestName("x".repeat(121)));
  assert.throws(() => normalizeAttendingGuestName("Name\nHidden"));
  assert.equal(getAttendingGuestNameFromNotes('__zingara_booking_meta__:{"attendingGuestName":"Leigh-Ann"}'), "Leigh-Ann");
  assert.equal(getAttendingGuestNameFromNotes("Legacy notes"), undefined);
});

test("gift display is connected to existing manifests, Table Plans, Wallet and authorised metadata saving", () => {
  const page = fs.readFileSync("src/app/admin/page.tsx", "utf8");
  assert.match(page, /Booker: getBookingGuestLabel\(booking\)/);
  assert.match(page, /initialAttendingGuestName=\{booking.attendingGuestName\}/);
  const route = fs.readFileSync("src/app/api/admin/bookings/route.ts", "utf8");
  const metadata = route.slice(route.indexOf("async function persistBookingMetadataUpdate"), route.indexOf("async function setBookingArchiveState"));
  assert.match(route, /const lockError = await ensureNoConflictingBookingLock/);
  assert.match(metadata, /expectedUpdatedAt/);
  assert.match(metadata, /attendingGuestChanged/);
  assert.doesNotMatch(metadata, /from\("customers"\)|sendOperationalCustomerEmail/);
  assert.match(fs.readFileSync("src/lib/exports/tablePlan.ts", "utf8"), /getAttendingGuestNameFromNotes\(booking.notes\)/);
  assert.match(fs.readFileSync("src/lib/appleWalletPass.ts", "utf8"), /getAttendingGuestNameFromNotes\(booking.notes\)/);
});

test("actual attendee metadata save keeps purchaser, financials and ticket identities intact and rejects stale saves", async () => {
  const route = fs.readFileSync("src/app/api/admin/bookings/route.ts", "utf8");
  const ast = ts.createSourceFile("route.ts", route, ts.ScriptTarget.Latest, true);
  const handler = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "persistBookingMetadataUpdate")!;
  const prefix = "__zingara_booking_meta__:";
  const metadata = { customer: { name: "Marisa Example", email: purchaser.email, phone: purchaser.mobile }, addons: [], operationalNotes: "Keep notes", reference: "ZNG-TEST", paymentStatus: "fully-paid", guestTickets: [{ index: 1, ticketCode: "SAME-QR", fullName: "Marisa Example" }] };
  const before = { id: "booking", booking_reference: "ZNG-TEST", show_id: "show", customer_id: purchaser.id, updated_at: "2026-11-24T09:00:00Z", notes: prefix + JSON.stringify(metadata), addons_total: 0, amount_paid: 3080, balance_outstanding: 0, total_amount: 3080, subtotal_amount: 3080, service_fee: 0, guest_count: 2, payment_status: "fully_paid" };
  const writes: Array<Record<string, unknown>> = [];
  let audit: Record<string, unknown> | undefined;
  const client = { from(table: string) {
    assert.ok(["bookings", "shows"].includes(table), `Unexpected financial/customer/ticket/communication operation: ${table}`);
    let update: Record<string, unknown> | undefined;
    const chain = { select() { return chain; }, eq() { return chain; }, update(value: Record<string, unknown>) { update = value; writes.push(value); return chain; },
      maybeSingle: async () => ({ data: update ? { id: before.id, updated_at: update.updated_at } : table === "bookings" ? before : { date: "2026-12-01", time: "18:00", venue: "cape-town" }, error: null }) };
    return chain;
  } };
  const context = { Response, bookingSelect: "id", normalizeAttendingGuestName, calculateBookingAddonFinancialUpdate, getBookingAddonTotal,
    requireActiveStaff: async () => ({ serviceClient: client, staffProfile: { id: "staff", roles: { name: "Super Admin" }, venue_scope: ["all"] }, user: { id: "auth" }, error: null }),
    getAdminRoleFromName: () => "super-admin", rolePermissions: { "super-admin": ["bookings:manage"] },
    normalizeShowLocation: (value: string) => value, normalizeStaffVenueScope: (value: string[]) => value,
    parseSerializedBookingNotes: (value: string) => JSON.parse(value.slice(prefix.length)),
    normalizeInternalBookingAddons: (value: unknown) => value,
    enforceDietaryAddonOrdering: (value: { requestedAddons: unknown }) => ({ addons: value.requestedAddons }),
    hasPricedBookingAddons: () => false,
    serializeBookingNotes: (value: unknown) => prefix + JSON.stringify(value),
    getDietaryRequirementsProjection: () => null, toAuditJsonValue: (value: unknown) => value,
    recordAuditEvent: async (_client: unknown, _staff: unknown, _user: unknown, value: Record<string, unknown>) => { audit = value; },
    exports: {} as { save: (request: Request, body: unknown) => Promise<Response> },
  };
  runInNewContext(ts.transpileModule(handler.getText(ast) + "\nexports.save=persistBookingMetadataUpdate;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const body = { bookingReference: "ZNG-TEST", expectedUpdatedAt: before.updated_at, operationalNotes: "Keep notes", addons: [], attendingGuestName: "Leigh-Ann" };
  const response = await context.exports.save(new Request("https://example.test"), body);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).attendingGuestName, "Leigh-Ann");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].total_amount, 3080);
  assert.equal(writes[0].balance_outstanding, 0);
  assert.equal(writes[0].payment_status, "fully_paid");
  const saved = JSON.parse(String(writes[0].notes).slice(prefix.length));
  assert.equal(saved.attendingGuestName, "Leigh-Ann");
  assert.deepEqual(saved.customer, metadata.customer);
  assert.deepEqual(saved.guestTickets, metadata.guestTickets);
  assert.ok((audit?.changedFields as string[]).includes("attendingGuestName"));
  assert.equal((await context.exports.save(new Request("https://example.test"), { ...body, expectedUpdatedAt: "stale" })).status, 409);
  assert.equal(writes.length, 1);
});
