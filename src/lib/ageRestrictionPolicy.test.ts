import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ageRestrictionPolicy,
  createAgePolicyAcknowledgement,
  hasValidAgePolicyAcknowledgement,
} from "./ageRestrictionPolicy.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("authoritative policy contains the approved admission rules", () => {
  assert.equal(ageRestrictionPolicy.label, "Age Restriction");
  assert.match(ageRestrictionPolicy.policy, /No children under 13 will be admitted/);
  assert.match(ageRestrictionPolicy.policy, /Guests aged 13–18 require parental guidance/);
  assert.match(ageRestrictionPolicy.explanation, /including when accompanied by an adult/);
  assert.doesNotMatch(ageRestrictionPolicy.explanation, /Tollie Parton/i);
});

test("versioned acknowledgement evidence is explicit and timestamped", () => {
  const evidence = createAgePolicyAcknowledgement("2026-09-07T12:00:00.000Z");

  assert.deepEqual(evidence, {
    acknowledged: true,
    acknowledgedAt: "2026-09-07T12:00:00.000Z",
    policyVersion: ageRestrictionPolicy.version,
  });
  assert.equal(hasValidAgePolicyAcknowledgement(evidence), true);
  assert.equal(hasValidAgePolicyAcknowledgement(undefined), false);
  assert.equal(
    hasValidAgePolicyAcknowledgement({ ...evidence, acknowledged: false }),
    false,
  );
});

test("public Standard checkout displays the notice and separate unchecked acknowledgement", async () => {
  const page = await source("../app/book/page.tsx");

  assert.match(page, /<AgeRestrictionNotice \/>/);
  assert.match(page, /hasAcknowledgedAgePolicy[\s\S]*useState\(false\)/);
  assert.match(page, /ageRestrictionPolicy\.acknowledgement/);
  assert.match(page, /requiresPublicAgeAcknowledgement &&/);
  assert.match(page, /!hasAcknowledgedAgePolicy/);
  assert.match(page, /hasAcceptedBookingTerms/);
});

test("public Standard payload carries evidence and crafted omission is rejected", async () => {
  const [page, route] = await Promise.all([
    source("../app/book/page.tsx"),
    source("../app/api/bookings/route.ts"),
  ]);

  assert.match(page, /agePolicyAcknowledgement:[\s\S]*createAgePolicyAcknowledgement/);
  assert.match(route, /!isTrustedInternalHandoff/);
  assert.match(route, /hasValidAgePolicyAcknowledgement\(booking\.agePolicyAcknowledgement\)/);
  assert.match(route, /Age restriction acknowledgement is required/);
});

test("trusted staff does not receive a customer-style age attestation requirement", async () => {
  const [page, route] = await Promise.all([
    source("../app/book/page.tsx"),
    source("../app/api/bookings/route.ts"),
  ]);

  assert.match(page, /requiresPublicAgeAcknowledgement = !isTrustedManualCheckout/);
  assert.match(route, /!isTrustedInternalHandoff &&/);
});

test("public Corporate enquiry requires and persists the same acknowledgement", async () => {
  const [page, route] = await Promise.all([
    source("../app/corporate/page.tsx"),
    source("../app/api/corporate-requests/route.ts"),
  ]);

  assert.match(page, /<AgeRestrictionNotice \/>/);
  assert.match(page, /agePolicyAcknowledgement:[\s\S]*createAgePolicyAcknowledgement/);
  assert.match(page, /Please acknowledge the age restriction before submitting/);
  assert.match(route, /submittedRequest\.agePolicyAcknowledgement/);
  assert.match(route, /Age restriction acknowledgement is required/);
});

test("notice explanation is tap and keyboard accessible without navigation", async () => {
  const notice = await source("../app/components/AgeRestrictionNotice.tsx");

  assert.match(notice, /type="button"/);
  assert.match(notice, /aria-expanded=\{open\}/);
  assert.match(notice, /role="dialog"/);
  assert.match(notice, /aria-label="Close age restriction explanation"/);
  assert.doesNotMatch(notice, /onMouseEnter|href=/);
});

test("historical payment links and verified booking lookup remain informational", async () => {
  const [paymentLink, findBooking] = await Promise.all([
    source("../app/payment/[token]/payment-link-client.tsx"),
    source("../app/find-booking/page.tsx"),
  ]);

  assert.match(paymentLink, /<AgeRestrictionNotice/);
  assert.doesNotMatch(paymentLink, /hasValidAgePolicyAcknowledgement/);
  assert.match(findBooking, /<AgeRestrictionNotice/);
  assert.doesNotMatch(findBooking, /hasValidAgePolicyAcknowledgement/);
});

test("ticket, PDF and Wallet keep identity while adding informational policy", async () => {
  const [ticket, pdf, wallet] = await Promise.all([
    source("../app/ticket/[reference]/ticket-client.tsx"),
    source("./ticketPdf.ts"),
    source("./appleWalletPass.ts"),
  ]);

  assert.match(ticket, /<AgeRestrictionNotice/);
  assert.match(pdf, /ageRestrictionPolicy\.policy/);
  assert.match(wallet, /key: "age-restriction"/);
  assert.match(wallet, /pass\.setBarcodes/);
  assert.match(wallet, /pass\.setRelevantDate\(performance\.value\)/);
});

test("shared branded customer email carries concise policy wording", async () => {
  const email = await source("./email/customerEmail.ts");

  assert.match(email, /ageRestrictionPolicy\.policy/);
  assert.match(email, /adult-oriented dinner show/);
  assert.match(email, /messageWithAgePolicy/);
});

test("Booking Details, legal terms and Academy show the same operational policy", async () => {
  const [details, legal, admin] = await Promise.all([
    source("../app/admin/BookingMetadataDraftEditor.tsx"),
    source("./royalDecrees.ts"),
    source("../app/admin/page.tsx"),
  ]);

  assert.match(details, /<AgeRestrictionNotice/);
  assert.match(legal, /No children under 13 will be admitted, including when accompanied by an adult/);
  assert.match(admin, /no children under 13 are admitted, including with adult supervision/);
  assert.match(admin, /same age restriction applies to Standard and Corporate parties/);
});

test("policy architecture does not collect date of birth or child PII", async () => {
  const [policy, notice] = await Promise.all([
    source("./ageRestrictionPolicy.ts"),
    source("../app/components/AgeRestrictionNotice.tsx"),
  ]);

  assert.doesNotMatch(`${policy}\n${notice}`, /dateOfBirth|date_of_birth|\bdob\b/i);
});
