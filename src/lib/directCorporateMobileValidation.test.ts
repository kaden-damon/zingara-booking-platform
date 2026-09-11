import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("direct Corporate checkout presents mobile as optional without weakening public checkout", async () => {
  const page = await source("../app/book/page.tsx");

  assert.equal(
    page.match(/Mobile Number\{" "\}[\s\S]{0,260}\(Optional\)/g)?.length,
    2,
  );
  assert.equal(
    page.match(/required=\{!isTrustedManualCheckout\}/g)?.length,
    2,
  );
  assert.doesNotMatch(
    page,
    /Mobile Number\{" "\}[\s\S]{0,400}required=\{!isTrustedManualCheckout \|\| isCorporateCalendarCheckout\}/,
  );
  assert.match(page, /isCorporateCalendarCheckout\s*\? "corporate-direct"/);
});

test("direct Corporate creation uses the shared trusted validator and server-side source resolution", async () => {
  const [page, route, validation] = await Promise.all([
    source("../app/book/page.tsx"),
    source("../app/api/bookings/route.ts"),
    source("./bookingCreateValidation.ts"),
  ]);

  assert.match(page, /customerDetailsComplete\s*=\s*Object\.keys\(currentCustomerValidationErrors\)\.length === 0/);
  assert.match(page, /if \(!validateCheckoutCustomerDetails\(\)\) \{\s*return;\s*\}/);
  assert.match(route, /const trustedBookingSource = resolveTrustedBookingSource/);
  assert.match(route, /validateBookingCreate\(\{[\s\S]*bookingSource: trustedBookingSource,[\s\S]*isTrustedStaff/);
  assert.match(validation, /const requiresEmail =\s*!input\.isTrustedStaff \|\| input\.bookingSource === "corporate-direct"/);
  assert.match(validation, /const requiresMobile = !input\.isTrustedStaff/);
  assert.match(validation, /else if \(customer\.phone && !parseInternationalPhone\(customer\.phone\)\.valid\)/);
});

test("missing Corporate mobile remains null and is omitted from optional PayFast data", async () => {
  const [route, payFastPhone] = await Promise.all([
    source("../app/api/bookings/route.ts"),
    source("./payfast/phone.ts"),
  ]);

  assert.match(route, /mobile: customer\.phone\?\.trim\(\) \|\| null/);
  assert.match(route, /if \(!mobile\) \{\s*return undefined;\s*\}/);
  assert.doesNotMatch(route, /mobile:\s*["'](?:unknown|none|n\/a|0+)["']/i);
  assert.match(payFastPhone, /if \(!trimmed\) \{\s*return \{ cellNumber: undefined, valid: true \};\s*\}/);
});
