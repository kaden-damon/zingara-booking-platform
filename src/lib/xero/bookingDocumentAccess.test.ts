import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("Booking Details document access is exact, venue-scoped and bounded", async () => {
  const route = await source("../../app/api/admin/xero/route.ts");

  assert.match(route, /bookingDocumentsReference/);
  assert.match(route, /\.eq\("booking_reference", bookingDocumentsReference\)/);
  assert.match(route, /if \(!venues\.includes\(show\.venue\)\)/);
  assert.match(route, /\.eq\("source_booking_reference", booking\.booking_reference\)/);
  assert.match(route, /source_booking_id\.eq\.\$\{booking\.id\},source_booking_id\.is\.null/);
  assert.match(route, /\.in\("kind", \["quote", "invoice"\]\)/);
  assert.match(route, /\.limit\(100\)/);
});

test("Booking Details stays request-free until staff open the document section", async () => {
  const [panel, adminPage] = await Promise.all([
    source("../../app/admin/BookingDocumentsSection.tsx"),
    source("../../app/admin/page.tsx"),
  ]);

  assert.match(panel, /function toggleOpen\(\)/);
  assert.match(panel, /if \(nextOpen && documents === null && !loading\)/);
  assert.match(panel, /bookingDocumentsReference=/);
  assert.doesNotMatch(panel, /useEffect\(\(\) => \{\s*void loadDocuments/);
  assert.match(panel, /await import\("@\/lib\/xero\/documentPdf"\)/);
  assert.match(adminPage, /dynamic\(\s*\(\) => import\("\.\/BookingDocumentsSection"\)/);
  assert.match(adminPage, /canManageBookings[\s\S]{0,300}<BookingDocumentsSection[\s\S]{0,180}bookingReference=\{booking\.reference\}/);
});

test("document actions distinguish types and reuse the authoritative PDF renderer", async () => {
  const panel = await source("../../app/admin/BookingDocumentsSection.tsx");

  assert.match(panel, /return "Quotation"/);
  assert.match(panel, /return "Issued Invoice"/);
  assert.match(panel, /return "Invoice Draft"/);
  assert.match(panel, /createXeroDocumentPdf/);
  assert.match(panel, /View PDF/);
  assert.match(panel, /Download PDF/);
  assert.match(panel, /pdfCache\.current/);
  assert.match(panel, /Create Invoice Draft/);
  assert.match(panel, /document=invoice/);
});
