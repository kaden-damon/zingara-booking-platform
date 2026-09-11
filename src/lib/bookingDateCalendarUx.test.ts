import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminSource = readFileSync(
  new URL("../app/admin/page.tsx", import.meta.url),
  "utf8",
);
const pickerSource = readFileSync(
  new URL("../app/admin/ZingaraDatePicker.tsx", import.meta.url),
  "utf8",
);

const bookingFilterStart = adminSource.indexOf(
  'aria-label="Booking Created"',
);
const bookingFilterEnd = adminSource.indexOf(
  'aria-label="Archive view"',
  bookingFilterStart,
);
const bookingFilterSource = adminSource.slice(
  bookingFilterStart,
  bookingFilterEnd,
);

test("shared Zingara calendar exposes visible previous and next month controls", () => {
  assert.match(pickerSource, /Previous \$\{label\.toLowerCase\(\)\} month/);
  assert.match(pickerSource, /Next \$\{label\.toLowerCase\(\)\} month/);
  assert.match(pickerSource, /changeMonth\(-1\)/);
  assert.match(pickerSource, /changeMonth\(1\)/);
});

test("Show Date and Booking Created use the same calendar without native date inputs", () => {
  assert.match(bookingFilterSource, /label="Show Date"/);
  assert.match(bookingFilterSource, /label="Booking Created Date"/);
  assert.match(bookingFilterSource, /label="Booking Created From"/);
  assert.match(bookingFilterSource, /label="Booking Created To"/);
  assert.equal(
    bookingFilterSource.match(/<ZingaraDatePicker/g)?.length,
    4,
  );
  assert.doesNotMatch(bookingFilterSource, /type="date"/);
});

test("Booking Created conditional controls render only for specific date and range", () => {
  assert.match(
    bookingFilterSource,
    /bookingCreatedDateFilter === "specific" \|\|\s*bookingCreatedDateFilter === "range"/,
  );
  assert.match(bookingFilterSource, /bookingCreatedDateFilter === "specific"/);
  assert.match(bookingFilterSource, /sm:max-w-xs/);
  assert.match(bookingFilterSource, /sm:max-w-2xl/);
  assert.match(bookingFilterSource, /sm:grid-cols-2/);
});

test("calendar remains local and introduces no network or booking state work", () => {
  assert.doesNotMatch(pickerSource, /fetch\(|supabase|setBooking|setCorporate/);
  assert.match(pickerSource, /timeZone: "Africa\/Johannesburg"/);
  assert.match(pickerSource, /onChange\(date\)/);
});

test("Show Date and Booking Created retain their existing state setters", () => {
  assert.match(bookingFilterSource, /setBookingDateFilter\(date \|\| "all"\)/);
  assert.match(bookingFilterSource, /setBookingCreatedSpecificDate\(date\)/);
  assert.match(bookingFilterSource, /setBookingCreatedFrom\(date\)/);
  assert.match(bookingFilterSource, /setBookingCreatedTo\(date\)/);
});
