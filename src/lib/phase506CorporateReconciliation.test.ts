import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Corporate reconciliation preserves the 52/227 Phase 50.5 classification boundary", async () => {
  const sql = await source("../../supabase/migrations/20261019210000_phase_50_6_corporate_reconciliation.sql");
  assert.match(sql, /booking_source = 'corporate-direct'/);
  assert.match(sql, /booking\.company_id is null/);
  assert.match(sql, /lower\(trim\(booking\.company_name\)\) = 'mark'/);
  assert.match(sql, /'insufficient_evidence'/);
  assert.match(sql, /'conflicting_company'/);
  assert.match(sql, /on conflict \(booking_id\) do nothing/);
});

test("Corporate reconciliation is explicit, management-only and immutable-audited", async () => {
  const sql = await source("../../supabase/migrations/20261019210000_phase_50_6_corporate_reconciliation.sql");
  assert.match(sql, /MANAGEMENT_PERMISSION_REQUIRED/);
  assert.match(sql, /CASE_CHANGED/);
  assert.match(sql, /BOOKING_COMPANY_CHANGED/);
  assert.match(sql, /VENUE_SCOPE_REQUIRED/);
  assert.match(sql, /insert into public\.audit_events/);
  assert.match(sql, /booking\.company-review-resolved/);
  assert.match(sql, /booking\.company-reconciled/);
  assert.doesNotMatch(sql, /update public\.companies/);
});

test("Reconciliation API remains bounded, venue-scoped and exports the filtered register", async () => {
  const route = await source("../app/api/admin/corporate-company-reconciliation/route.ts");
  assert.match(route, /replace\(\/\[-_\]\+\/g, " "\)/);
  assert.match(route, /const pageSize = 10/);
  assert.match(route, /venueScope\(auth\)/);
  assert.match(route, /Management access is required/);
  assert.match(route, /get\("format"\) === "xlsx"/);
  assert.match(route, /Zingara_Corporate_Company_Reconciliation\.xlsx/);
  assert.match(route, /evidenceId/);
  assert.match(route, /limit\(20\)/);
});

test("Companies workspace exposes reconciliation without replacing the directory", async () => {
  const workspace = await source("../app/admin/CompanyCrmWorkspace.tsx");
  const register = await source("../app/admin/CorporateCompanyReconciliation.tsx");
  assert.match(workspace, /Companies.*Reconciliation/s);
  assert.match(workspace, /CorporateCompanyReconciliation/);
  assert.match(register, /Open Booking/);
  assert.match(register, /View Original Evidence/);
  assert.match(register, /Find Company/);
  assert.match(register, /Add Company/);
  assert.match(register, /Confirm Review/);
  assert.match(register, /Page \{page\} of \{pageCount\}/);
  assert.match(register, /getAdminAuthSession/);
  assert.match(register, /Authorization: `Bearer/);
  assert.match(register, /URL\.createObjectURL/);
  assert.doesNotMatch(register, /href=\{exportHref\}/);
  const page = await source("../app/admin/page.tsx");
  assert.match(page, /onOpenBooking=\{\(bookingReference\) => \{[\s\S]*?setActiveAdminTab\("corporate"\);[\s\S]*?setCorporateWorkspace\("bookings"\);[\s\S]*?setBookingArchiveFilter\("all"\);[\s\S]*?setHideCancelledBookings\(false\);/);
});

test("Booking Details groups every workflow and places Change Customer with Customer Details", async () => {
  const page = await source("../app/admin/page.tsx");
  const dialog = await source("../app/admin/BookingCustomerReassignmentDialog.tsx");
  for (const heading of [
    "Booking Overview",
    "Customer &amp; Company",
    "Booking &amp; Seating",
    "Payments &amp; Financials",
    "Tickets &amp; Communications",
    "History &amp; Audit",
  ]) assert.equal(page.includes(heading), true, heading);
  assert.match(page, /Change Customer/);
  assert.doesNotMatch(page, />\s*Edit Linked Customer\s*</);
  assert.match(dialog, />Change Customer</);
  assert.match(dialog, /Find Customer/);
  assert.match(dialog, /Add Customer/);
  assert.match(dialog, /Reason for change/);
  assert.match(dialog, /Confirm Change/);
  assert.match(dialog, /rounded-2xl/);
  assert.match(page, /currentBookings\.some\(\(booking\) => booking\.reference === reference\)/);
  assert.match(page, /\[detailedBooking, \.\.\.currentBookings\]/);
});

test("Critical Booking Details actions remain present", async () => {
  const page = await source("../app/admin/page.tsx");
  for (const action of [
    "Refresh Details",
    "Open Live Ticket",
    "Resend Ticket",
    "Resend Confirmation",
    "Push Ticket",
    "Edit Agreed Price",
    "Edit Guest Count",
    "Record EFT",
    "Reinstate Booking",
    "Comp Booking",
    "Refund Booking",
    "Move to Another Show",
    "Booking Timeline",
  ]) assert.match(page, new RegExp(action));
});
