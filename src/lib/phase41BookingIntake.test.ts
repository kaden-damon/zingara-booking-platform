import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Corporate guest limits use configured venue capacity instead of an arbitrary ceiling", async () => {
  const [classification, route] = await Promise.all([
    readFile(new URL("./bookingClassification.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/corporate-requests/route.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(classification, /corporatePartySizeThreshold = 20/);
  assert.match(classification, /getConfiguredZoneMaxSeats/);
  assert.match(route, /getConfiguredVenueGuestCapacity\(settings\)/);
  assert.doesNotMatch(route, /> 2000/);
});

test("public Corporate intake supports direct whole-number entry and server validation", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/corporate/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/corporate-requests/route.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(page, /type="number"/);
  assert.match(page, /step=\{1\}/);
  assert.match(page, /inputMode="numeric"/);
  assert.match(route, /Number\.isInteger\(corporateRequest\.guestCount\)/);
  assert.match(route, /getConfiguredVenueGuestCapacity/);
  assert.doesNotMatch(route, /> 2000/);
});

test("internal Corporate booking supports direct numeric entry and mandatory contact", async () => {
  const page = await readFile(
    new URL("../app/book/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /aria-label="Number of guests"/);
  assert.match(page, /maximumCorporateGuestCount/);
  assert.match(page, /isCorporateCalendarCheckout\) && <span aria-hidden="true">\*<\/span>/);
});

test("PayFast completion resolves the show venue and records render failure", async () => {
  const route = await readFile(
    new URL("../app/api/payfast/itn/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /select\("id,name,date,time,venue"\)/);
  assert.match(route, /location: normalizeShowLocation\(row\.venue\)/);
  assert.match(route, /Confirmation render failed/);
  assert.match(route, /status: "failed"/);
  assert.match(route, /claim_email_communication_once/);
});

test("Corporate enquiry does not emit a booking confirmation", async () => {
  const route = await readFile(
    new URL("../app/api/corporate-requests/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /sendCorporateEnquiryEmails/);
  assert.doesNotMatch(route, /reservation-confirmed/);
  assert.doesNotMatch(route, /createZingaraTicketEmail/);
});
