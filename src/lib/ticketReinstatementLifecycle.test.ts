import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync("src/app/api/tickets/[reference]/route.ts", "utf8");
const ast = ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true);

function routeFunction(name: string, globals: Record<string, unknown>) {
  const declaration = ast.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  assert.ok(declaration, `Missing route function ${name}`);
  const compiled = ts.transpileModule(declaration.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(`${compiled}\n${name}`, globals);
}

async function bookingPassedToPersistence(status: string) {
  let captured: Record<string, unknown> | undefined;
  const stopped = new Error("Stop before any persistence");
  const load = routeFunction("loadTicketPayload", {
    getServiceClient: () => ({}),
    normalizeTicketReference: (value: string) => value,
    loadTicketRow: async () => undefined,
    loadBookingByReferenceOrTicket: async () => ({
      id: "booking-id", booking_reference: "ZNG-TEST", booking_status: status,
      guest_count: 2, show_id: "current-show", table_id: null, section: "Middle Ring",
    }),
    parseBookingNotes: () => ({
      reference: "ZNG-TEST", status: "cancelled", partySize: 9, showId: "old-show",
    }),
    seatingZones: [],
    getDisplayZoneTitle: () => "Middle Ring",
    persistGuestTickets: async (_url: string, _id: string, booking: Record<string, unknown>) => {
      captured = booking;
      throw stopped;
    },
  });
  await assert.rejects(load("ZNG-TEST", "https://example.test"), (error) => error === stopped);
  assert.ok(captured);
  return captured;
}

test("reinstated booking cannot persist cancellation from stale ticket-page metadata", async () => {
  const booking = await bookingPassedToPersistence("confirmed");
  assert.equal(booking.status, "confirmed");
  assert.equal(booking.partySize, 2);
  assert.equal(booking.showId, "current-show");
});

test("authoritative cancelled and refunded bookings remain terminal", async () => {
  assert.equal((await bookingPassedToPersistence("cancelled")).status, "cancelled");
  assert.equal((await bookingPassedToPersistence("refunded")).status, "refunded");
});

test("persisted lifecycle spellings retain pending, checked-in and no-show states", async () => {
  for (const [stored, expected] of [
    ["pending_payment", "pending-payment"], ["checked_in", "checked-in"], ["no_show", "no-show"],
  ]) {
    assert.equal((await bookingPassedToPersistence(stored)).status, expected);
  }
});

test("ticket-page refresh never revives cancelled, refunded, void or expired identities", () => {
  const persistedStatus = routeFunction("getPersistedTicketStatus", {
    terminalTicketStatuses: new Set(["cancelled", "refunded", "void", "expired"]),
  });
  for (const status of ["cancelled", "refunded", "void", "expired"]) {
    assert.equal(persistedStatus({ status: "confirmed" }, { status: "valid" }, { ticket_status: status }), status);
  }
  assert.equal(persistedStatus({ status: "confirmed" }, { status: "valid" }, { ticket_status: "valid" }), "valid");
  assert.equal(persistedStatus({ status: "cancelled" }, { status: "valid" }, { ticket_status: "valid" }), "cancelled");
  assert.equal(persistedStatus({ status: "refunded" }, { status: "valid" }, { ticket_status: "valid" }), "refunded");
});
