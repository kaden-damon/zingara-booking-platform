import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  getAllTicketsZipFilename,
  getIndividualTicketPdfFilename,
  hasIndividualTicketModel,
  resolveDownloadableTicketPopulation,
  type PersistedTicketIdentity,
} from "./ticketBulkDownload.ts";
import type { DemoBooking, GuestTicket } from "./zingaraDemo.ts";

function guestTicket(index: number, total: number, fullName = `Guest ${index}`) {
  return {
    email: "",
    fullName,
    id: `booking-${index}`,
    index,
    mobile: "",
    status: "valid",
    ticketCode: `ZNG-ABC123-${String(index).padStart(2, "0")}`,
    total,
  } satisfies GuestTicket;
}

function booking(total: number) {
  return {
    bookingDate: "2026-10-04",
    bookingOrigin: "corporate",
    customer: { email: "guest@example.com", name: "Corporate Guest", phone: "" },
    guestTickets: Array.from({ length: total }, (_, index) =>
      guestTicket(index + 1, total),
    ),
    partySize: total,
    pricePerPerson: 1540,
    reference: "ZNG-ABC123",
    showId: "show-1",
    source: "corporate-direct",
    status: "confirmed",
    tableId: "table-1",
    tableNumber: "501",
    totalPrice: total * 1540,
    zoneId: "golden-circle",
    zoneTitle: "Golden Circle",
  } satisfies DemoBooking;
}

function persistedTickets(total: number): PersistedTicketIdentity[] {
  return Array.from({ length: total }, (_, index) => ({
    booking_id: "booking-id",
    id: `ticket-${index + 1}`,
    issued_at: "2026-10-04T10:00:00+02:00",
    qr_payload: `ZNG-ABC123-${String(index + 1).padStart(2, "0")}`,
    ticket_code: `ZNG-ABC123-${String(index + 1).padStart(2, "0")}`,
    ticket_status: "valid",
  }));
}

test("2, 20, and 40 persisted valid identities resolve in canonical order", () => {
  for (const total of [2, 20, 40]) {
    const population = resolveDownloadableTicketPopulation(
      booking(total),
      persistedTickets(total).reverse(),
    );

    assert.equal(population.length, total);
    assert.equal(population[0]?.ticket.index, 1);
    assert.equal(population.at(-1)?.ticket.index, total);
  }
});

test("non-customised and customised ticket presentation is preserved", () => {
  const input = booking(2);

  input.guestTickets![1] = guestTicket(2, 2, "Nomsa Dlamini");
  const population = resolveDownloadableTicketPopulation(input, persistedTickets(2));

  assert.equal(population[0]?.ticket.fullName, "Guest 1");
  assert.equal(population[1]?.ticket.fullName, "Nomsa Dlamini");
});

test("terminal and historical-surplus rows are excluded", () => {
  const rows = persistedTickets(4);

  rows[1].ticket_status = "void";
  rows[2].ticket_status = "cancelled";
  rows.push({
    ...rows[0],
    id: "historical-surplus",
    ticket_code: "ZNG-ABC123-99",
    qr_payload: "ZNG-ABC123-99",
  });
  const population = resolveDownloadableTicketPopulation(booking(4), rows);

  assert.deepEqual(
    population.map(({ row }) => row.ticket_code),
    ["ZNG-ABC123-01", "ZNG-ABC123-04"],
  );
});

test("booking-level ticket architecture does not fabricate individual tickets", () => {
  const input = booking(20);

  input.guestTickets = [guestTicket(1, 1)];
  assert.equal(hasIndividualTicketModel(input), false);
  assert.deepEqual(resolveDownloadableTicketPopulation(input, persistedTickets(20)), []);
});

test("80 and 105-ticket populations are bounded, complete, and non-mutating", () => {
  for (const total of [80, 105]) {
    const input = booking(total);
    const before = JSON.stringify(input);
    const startedAt = performance.now();
    const first = resolveDownloadableTicketPopulation(input, persistedTickets(total));
    const second = resolveDownloadableTicketPopulation(input, persistedTickets(total));

    assert.equal(first.length, total);
    assert.deepEqual(
      first.map(({ row }) => row.ticket_code),
      second.map(({ row }) => row.ticket_code),
    );
    assert.equal(JSON.stringify(input), before);
    assert.ok(performance.now() - startedAt < 1000);
  }
});

test("ZIP and PDF filenames use authoritative references", () => {
  assert.equal(getAllTicketsZipFilename("ZNG-ABC123"), "ZNG-ABC123-All-Tickets.zip");
  assert.equal(getIndividualTicketPdfFilename("ZNG-ABC123-02"), "ZNG-ABC123-02.pdf");
});

test("bulk route is authenticated, venue scoped, Corporate-only, and read-only", () => {
  const route = readFileSync(
    "src/app/api/admin/tickets/[reference]/download-all/route.ts",
    "utf8",
  );

  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /getRolePermissions[\s\S]*bookings:manage/);
  assert.match(route, /normalizeStaffVenueScope/);
  assert.match(route, /isAuthoritativeCorporateBooking/);
  assert.match(route, /resolveDownloadableTicketPopulation/);
  assert.match(route, /Content-Type": "application\/zip"/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("individual and bulk downloads share the authoritative PDF resolver and renderer", () => {
  const renderer = readFileSync("src/lib/ticketPdf.ts", "utf8");
  const serverRenderer = readFileSync("src/lib/ticketPdfServer.ts", "utf8");
  const route = readFileSync(
    "src/app/api/admin/tickets/[reference]/download-all/route.ts",
    "utf8",
  );
  const client = readFileSync(
    "src/app/ticket/[reference]/ticket-client.tsx",
    "utf8",
  );

  assert.match(renderer, /createDownloadableTicketPdfBytes/);
  assert.match(renderer, /createDownloadableTicketPdfBytes\(input/);
  assert.match(serverRenderer, /createDownloadableTicketPdfBytes\(input/);
  assert.match(route, /resolveDownloadableTicketPdfInput\(source\)/);
  assert.match(client, /Download All Tickets/);
  assert.match(client, /fetchSupabaseBlob/);
});
