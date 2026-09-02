import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("all operational customer email passes through one branded shell", async () => {
  const smtp = await source("./smtp.ts");

  assert.match(smtp, /createBrandedCustomerEmail\(email\)/);
  assert.match(smtp, /brandedCustomerEmailMarker/);
  assert.match(smtp, /return sendZingaraEmail\(\{/);
});

test("shared shell carries Zingara branding and email-safe presentation", async () => {
  const shell = await source("./customerEmail.ts");

  assert.match(shell, /ZINGARA/);
  assert.match(shell, /THE ROYAL COUNTESS/);
  assert.match(shell, /role="presentation"/);
  assert.match(shell, /style="margin:0;padding:0;background:#0a0908/);
  assert.doesNotMatch(shell, /<script|javascript:/i);
});

test("customer email footer uses the published Legal Centre routes", async () => {
  const [shell, decrees] = await Promise.all([
    source("./customerEmail.ts"),
    source("../royalDecrees.ts"),
  ]);
  const routes = [
    "/royal-decrees/terms-and-conditions",
    "/royal-decrees/booking-terms",
    "/royal-decrees/booking-and-cancellation-policy",
    "/royal-decrees/privacy-policy",
  ];

  for (const route of routes) {
    assert.match(shell, new RegExp(route));
    assert.match(decrees, new RegExp(route));
  }
  assert.match(shell, /should not be shared or forwarded/);
  assert.match(shell, /House of Zingara\. All rights reserved/);
});

test("customer links are normalized to the absolute Production origin", async () => {
  const shell = await source("./customerEmail.ts");

  assert.match(shell, /https:\/\/book\.zingara\.co\.za/);
  assert.match(shell, /normalizeCustomerEmailLinks/);
  assert.match(shell, /new URL\(value, productionOrigin\)/);
});

test("customer-facing table tokens are replaced with TBC", async () => {
  const [shell, ticketDisplay, ticketEmail] = await Promise.all([
    source("./customerEmail.ts"),
    source("../guestTicketDisplay.ts"),
    source("./ticketEmail.ts"),
  ]);

  assert.match(shell, /replaceCustomerTableWithTbc/);
  assert.match(ticketDisplay, /return "TBC"/);
  assert.match(ticketEmail, /const table = "TBC"/);
});

test("Admin and Floor retain their authoritative internal table fields", async () => {
  const admin = await source("../../app/admin/page.tsx");

  assert.match(admin, /booking\.tableNumber/);
  assert.match(admin, /table\.tableNumber/);
  assert.doesNotMatch(admin, /resolveGuestVisibleTable/);
});

test("ticket email keeps the stored QR payload and shared branded shell", async () => {
  const ticketEmail = await source("./ticketEmail.ts");

  assert.match(ticketEmail, /QRCode\.toBuffer\(authoritativeQrPayload/);
  assert.match(ticketEmail, /createBrandedCustomerEmail/);
  assert.match(ticketEmail, /attachments: \[\.\.\.branded\.attachments, \.\.\.attachments\]/);
  assert.match(ticketEmail, /ctaLabel: "OPEN LIVE TICKET"/);
});

test("payment-link content and authoritative amount remain unchanged", async () => {
  const route = await source("../../app/api/admin/bookings/payment-link/route.ts");

  assert.match(route, /Amount due: R\$\{input\.amount\.toFixed\(2\)\}/);
  assert.match(route, /sendOperationalCustomerEmail/);
  assert.match(route, /getSelectedBookingPaymentAmount/);
});

test("automatic reminders and reviews use the customer email boundary", async () => {
  const workflows = await source("../workflows/automatedWorkflows.ts");

  assert.match(workflows, /sendOperationalCustomerEmail\(\{/);
  assert.match(workflows, /kind:[\s\S]*"show_reminder"[\s\S]*"post_show_review"/);
  assert.match(workflows, /message: item\.message/);
});

test("staff-only alert emails remain outside the customer branded boundary", async () => {
  const [issues, corporateHolds] = await Promise.all([
    source("../../app/api/admin/issues/route.ts"),
    source("../workflows/corporatePaymentHolds.ts"),
  ]);

  assert.match(issues, /sendZingaraEmail\(\{/);
  assert.match(corporateHolds, /sendZingaraEmail\(\{/);
  assert.doesNotMatch(issues, /sendOperationalCustomerEmail/);
  assert.doesNotMatch(corporateHolds, /sendOperationalCustomerEmail/);
});

test("communication persistence remains separate from presentation", async () => {
  const route = await source("../../app/api/admin/communications/route.ts");

  assert.match(route, /findDuplicateSentCommunication/);
  assert.match(route, /insertCommunicationPayload/);
  assert.match(route, /type: toSupabaseType\(record\.trigger\)/);
  assert.match(route, /status,/);
});

test("shared presentation introduces no booking ticket or payment mutation", async () => {
  const [shell, smtp] = await Promise.all([
    source("./customerEmail.ts"),
    source("./smtp.ts"),
  ]);

  assert.doesNotMatch(shell, /\.from\(|\.rpc\(|\.insert\(|\.update\(|\.delete\(/);
  assert.doesNotMatch(smtp, /\.from\("(bookings|payments|tickets)"\)/);
});
