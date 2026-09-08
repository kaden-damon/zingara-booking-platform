import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  composeInternationalPhoneInput,
  getPhoneLookupVariants,
  normalizePhoneForComparison,
  normalizePhoneForStorage,
  parseInternationalPhone,
  // @ts-expect-error Node's built-in TypeScript test runner requires the extension.
} from "./phone.ts";

test("South African local and international formats share one E.164 identity", () => {
  assert.equal(normalizePhoneForStorage("0821234567"), "+27821234567");
  assert.equal(normalizePhoneForStorage("082 123 4567"), "+27821234567");
  assert.equal(normalizePhoneForStorage("+27821234567"), "+27821234567");
  assert.equal(
    normalizePhoneForComparison("0821234567"),
    normalizePhoneForComparison("+27821234567"),
  );
  assert.deepEqual(getPhoneLookupVariants("+27821234567"), [
    "+27821234567",
    "27821234567",
    "0821234567",
  ]);
});

test("valid international examples normalize to E.164 without SA length assumptions", () => {
  const examples = [
    ["+44 7911 123456", "+447911123456"],
    ["+1 202 555 0100", "+12025550100"],
    ["+61 412 345 678", "+61412345678"],
    ["+33 6 12 34 56 78", "+33612345678"],
  ] as const;

  for (const [input, expected] of examples) {
    assert.equal(normalizePhoneForStorage(input), expected);
    assert.equal(parseInternationalPhone(input).valid, true);
  }
});

test("country selector composes local input and malformed values fail closed", () => {
  assert.equal(composeInternationalPhoneInput("GB", "07911 123456"), "+447911123456");
  assert.equal(composeInternationalPhoneInput("ZA", "082 123 4567"), "+27821234567");
  assert.equal(parseInternationalPhone("123").valid, false);
  assert.equal(parseInternationalPhone("not-a-phone").valid, false);
});

test("all relevant customer journeys use the shared phone architecture", async () => {
  const [component, booking, corporate, findBooking, adminEditor, bookingApi, customerApi] =
    await Promise.all([
      readFile(new URL("../app/components/InternationalPhoneInput.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/book/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/corporate/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/find-booking/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/admin/CustomerIdentityEditor.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/admin/customers/route.ts", import.meta.url), "utf8"),
    ]);

  assert.match(component, /defaultPhoneCountry/);
  assert.match(component, /Country calling code/);
  assert.match(booking, /InternationalPhoneInput/g);
  assert.match(corporate, /InternationalPhoneInput/);
  assert.match(findBooking, /InternationalPhoneInput/);
  assert.match(adminEditor, /InternationalPhoneInput/);
  assert.match(bookingApi, /normalizePhoneForComparison/);
  assert.match(bookingApi, /getPhoneLookupVariants/);
  assert.match(customerApi, /parseInternationalPhone/);
});

test("Find My Booking verifies canonical international numbers server-side", async () => {
  const route = await readFile(
    new URL("../app/api/find-booking/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /normalizePhoneForComparison/);
  assert.match(route, /normalizePhoneForLookup\(body\.mobileNumber\)/);
  assert.match(route, /normalizePhoneForLookup\(getCustomerPhone\(booking, customer\)\)/);
  assert.match(route, /genericNotFoundMessage/);
});
