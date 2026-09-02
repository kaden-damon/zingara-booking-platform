import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("ticket email contains the complete branded ticket presentation", async () => {
  const email = await source("./ticketEmail.ts");

  assert.match(email, /ZINGARA/);
  assert.match(email, /THE ROYAL COUNTESS/);
  assert.match(email, /YOUR TICKET/);
  assert.match(email, /Booking reference/);
  assert.match(email, /Seating section/);
  assert.match(email, /OPEN LIVE TICKET/);
});

test("ticket email embeds the authoritative QR payload as an inline CID image", async () => {
  const email = await source("./ticketEmail.ts");
  const smtp = await source("./smtp.ts");

  assert.match(email, /QRCode\.toBuffer\(authoritativeQrPayload/);
  assert.match(email, /errorCorrectionLevel: "H"/);
  assert.match(email, /cid:\$\{qrContentId\}/);
  assert.match(email, /contentDisposition: "inline"/);
  assert.match(smtp, /attachments,/);
});

test("live ticket action sends the shared HTML without changing ticket identity", async () => {
  const route = await source("../../app/api/tickets/[reference]/route.ts");
  const emailBranch = route.slice(
    route.indexOf('if (body.action === "email"'),
    route.indexOf('return Response.json({ error: "Unknown ticket action."'),
  );

  assert.match(emailBranch, /createZingaraTicketEmail/);
  assert.match(emailBranch, /activeTicketQrPayload/);
  assert.match(emailBranch, /attachments: ticketEmail\.attachments/);
  assert.match(emailBranch, /html: ticketEmail\.html/);
  assert.doesNotMatch(emailBranch, /\.from\("tickets"\)\s*\.insert/);
});

test("Admin resend resolves current database state and reports send progress", async () => {
  const [route, page] = await Promise.all([
    source("../../app/api/admin/communications/route.ts"),
    source("../../app/admin/page.tsx"),
  ]);

  assert.match(route, /loadAuthoritativeTicketEmail/);
  assert.match(route, /\.from\("tickets"\)/);
  assert.match(route, /ticketRow\?\.qr_payload \?\? ticketCode/);
  assert.match(route, /ticketRow\?\.ticket_code \?\? metadata\?\.ticketCode/);
  assert.match(page, /"Sending\.\.\."/);
  assert.match(page, /"Ticket Sent ✓"/);
  assert.match(page, /"Send Failed"/);
});

test("automatic PayFast confirmation uses the same ticket email", async () => {
  const route = await source("../../app/api/payfast/itn/route.ts");

  assert.match(route, /createZingaraTicketEmail/);
  assert.match(route, /trigger === "reservation-confirmed" && ticket/);
  assert.match(route, /qrPayload: ticket\.qrPayload/);
  assert.match(route, /html: ticketEmail\?\.html/);
  assert.match(route, /confirm_payfast_payment_core/);
});

test("zero-value confirmed bookings use the shared ticket presentation", async () => {
  const route = await source(
    "../../app/api/bookings/complete-zero-value/route.ts",
  );

  assert.match(route, /createZingaraTicketEmail/);
  assert.match(route, /trigger === "reservation-confirmed" && ticket/);
  assert.match(route, /html: ticketEmail\?\.html/);
});

test("ticket links are absolute Production URLs", async () => {
  const email = await source("./ticketEmail.ts");

  assert.match(email, /https:\/\/book\.zingara\.co\.za/);
  assert.match(email, /new URL\(getTicketUrl\(ticketReference\), productionOrigin\)/);
});

test("shared email delivery preserves payment and ticket mutation boundaries", async () => {
  const [email, adminRoute] = await Promise.all([
    source("./ticketEmail.ts"),
    source("../../app/api/admin/communications/route.ts"),
  ]);

  assert.doesNotMatch(email, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(
    adminRoute.slice(adminRoute.indexOf("async function loadAuthoritativeTicketEmail")),
    /\.from\("(payments|tickets|bookings)"\)\s*\.(insert|update|upsert|delete)/,
  );
});
