import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveGuestVisibleTable } from "./guestTicketDisplay.ts";

const validTicket = { status: "valid" as const };

test("guest table resolver conceals every operational assignment shape before release", () => {
  for (const tableNumber of ["501", "501+611", "501 + 611", ""]) {
    assert.equal(
      resolveGuestVisibleTable(
        { status: "confirmed", tableNumber },
        validTicket,
      ),
      "TBC",
    );
  }
});

test("Find My Booking uses the shared guest table resolver without another query", async () => {
  const route = await readFile(
    new URL("../app/api/find-booking/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /resolveGuestVisibleTable\(/);
  assert.match(route, /table: guestVisibleTable \|\| "TBC"/);
  assert.doesNotMatch(
    route,
    /table: metadataBooking\?\.tableNumber \?\? "Internal"/,
  );
  assert.equal(
    (route.match(/\.from\("show_tables"\)/g) ?? []).length,
    0,
  );
});

test("ticket release states remain governed by the existing shared resolver", async () => {
  const booking = { status: "checked-in" as const, tableNumber: "501+611" };
  const ticket = { status: "checked-in" as const };
  const [liveTicket, pdf, wallet] = await Promise.all([
    readFile(
      new URL("../app/api/tickets/[reference]/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("./ticketPdf.ts", import.meta.url), "utf8"),
    readFile(new URL("./appleWalletPass.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(resolveGuestVisibleTable(booking, ticket), "TBC");
  for (const source of [liveTicket, pdf, wallet]) {
    assert.match(source, /resolveGuestVisibleTable\(/);
  }
});
