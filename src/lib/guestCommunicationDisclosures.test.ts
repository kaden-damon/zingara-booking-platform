import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = process.cwd();

async function source(path: string) {
  return readFile(`${root}/${path}`, "utf8");
}

test("guest payment touchpoints use the shared disclosure renderer", async () => {
  const [booking, paymentLink, findBooking, component] = await Promise.all([
    source("src/app/book/page.tsx"),
    source("src/app/payment/[token]/payment-link-client.tsx"),
    source("src/app/find-booking/page.tsx"),
    source("src/app/components/GuestBookingDisclosures.tsx"),
  ]);

  assert.match(booking, /<GuestBookingDisclosures/);
  assert.match(paymentLink, /<GuestBookingDisclosures/);
  assert.match(findBooking, /<GuestBookingDisclosures/);
  assert.match(component, /getGuestVenueInclusions/);
  assert.match(component, /getGuestPaymentDisclosures/);
  assert.doesNotMatch(booking, /Beverages are charged separately/);
  assert.doesNotMatch(booking, /will be applied to beverages/);
});

test("payment and reminder queries load authoritative service fee evidence", async () => {
  const [paymentRows, paymentRoute, findRoute, workflows] = await Promise.all([
    source("src/lib/payment-links/customerPaymentLinks.ts"),
    source("src/app/api/payment-links/[token]/route.ts"),
    source("src/app/api/find-booking/route.ts"),
    source("src/lib/workflows/automatedWorkflows.ts"),
  ]);

  assert.match(paymentRows, /guest_count,section,service_fee/);
  assert.match(paymentRoute, /serviceFeeAmount: Math\.max\(Number\(booking\.service_fee\)/);
  assert.match(findRoute, /section,service_fee,total_amount/);
  assert.match(workflows, /section,service_fee,total_amount/);
  assert.doesNotMatch(workflows, /will be billed on the night/);
});

test("editable confirmation copy and Admin previews retain the authoritative disclosures", async () => {
  const [itn, zeroValue, admin] = await Promise.all([
    source("src/app/api/payfast/itn/route.ts"),
    source("src/app/api/bookings/complete-zero-value/route.ts"),
    source("src/app/admin/page.tsx"),
  ]);

  assert.match(itn, /introMessage: renderCommunicationTemplate\(template\.body/);
  assert.match(zeroValue, /introMessage: renderCommunicationTemplate\(template\.body/);
  assert.match(admin, /getGuestVenueInclusions\(previewShow/);
  assert.match(admin, /getGuestPaymentDisclosures/);
});

test("compact ticket and Wallet surfaces retain their existing focused layout", async () => {
  const [ticket, wallet, pdf] = await Promise.all([
    source("src/app/ticket/[reference]/ticket-client.tsx"),
    source("src/lib/appleWalletPass.ts"),
    source("src/lib/ticketPdf.ts"),
  ]);

  assert.match(ticket, /Payment Summary/);
  assert.match(wallet, /GROUNDS OPEN/);
  assert.match(wallet, /SHOW STARTS/);
  assert.match(pdf, /groundsOpen: experienceTimes\.groundsOpen/);
  assert.doesNotMatch(wallet, /getGuestPaymentDisclosures/);
  assert.doesNotMatch(pdf, /getGuestPaymentDisclosures/);
});
