import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  escapeReportHtml,
  isOperationalReportType,
  operationalReportColumns,
  operationalReportLabels,
  // @ts-expect-error Node's built-in TypeScript test runner requires the extension.
} from "./operationsReports.ts";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const route = source("../app/api/admin/operations-reports/route.ts");
const reports = source("./operationsReports.ts");
const customerRoute = source("../app/api/admin/customer-management/route.ts");
const reassignmentRoute = source("../app/api/admin/bookings/reassign-customer/route.ts");
const migration = source("../../supabase/migrations/20261019190000_phase_50_5_customer_reassignment_and_search.sql");
const admin = source("../app/admin/page.tsx");

test("Operations Reports expose only the three authorised report types", () => {
  assert.deepEqual(Object.keys(operationalReportLabels), ["bookings", "check-ins", "guest-list"]);
  assert.equal(isOperationalReportType("bookings"), true);
  assert.equal(isOperationalReportType("revenue"), false);
  assert.match(reports, /Booking Manifest/);
  assert.doesNotMatch(admin, /"Revenue Summary"|"Floor Allocation Summary"|"CRM Customer List"|"Waitlist Report"/);
});

test("selected-performance reports are bounded, scoped and keep CSV columns for zero rows", () => {
  assert.match(route, /\.eq\("show_id", show\.id\)/);
  assert.match(route, /normalizeStaffVenueScope/);
  assert.match(route, /\.is\("archived_at", null\)/);
  assert.match(route, /Promise\.all/);
  assert.match(admin, /report\.columns\.map\(escapeCsvValue\)/);
  assert.deepEqual(operationalReportColumns["guest-list"], ["Customer", "Email", "Phone", "Guests", "Zone", "Table", "Notes"]);
});

test("print output escapes customer-controlled fields", () => {
  assert.equal(escapeReportHtml('<script>alert("x")</script>'), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  assert.match(admin, /escapeReportHtml\(row\[header\]\)/);
});

test("customer search spans authoritative relationships while remaining paginated", () => {
  assert.match(customerRoute, /search_customer_crm_page/);
  assert.match(migration, /concat_ws\(' ', customer\.first_name, customer\.surname\)/);
  assert.match(migration, /booking\.booking_reference/);
  assert.match(migration, /customer_company_associations/);
  assert.match(migration, /regexp_replace\(coalesce\(customer\.mobile/);
  assert.match(migration, /least\(coalesce\(p_page_size, 10\), 25\)/);
});

test("customer reassignment is management-only, locked, revision-safe and changes only customer identity", () => {
  assert.match(reassignmentRoute, /super-admin.*venue-manager.*box-office-manager/);
  assert.match(migration, /BOOKING_LOCK_REQUIRED/);
  assert.match(migration, /BOOKING_CHANGED/);
  assert.match(migration, /update public\.bookings set customer_id = p_new_customer_id, updated_at = now\(\)/);
  assert.doesNotMatch(migration, /update public\.customers set/);
  assert.match(migration, /booking\.customer-reassigned/);
  assert.match(migration, /array\['customer_id'\]/);
});

test("company integrity uses exact immutable evidence and cannot follow customer reassignment", () => {
  assert.match(migration, /exact immutable Corporate booking Company snapshot match/);
  assert.match(migration, /normalise_company_match_key/);
  assert.match(migration, /tg_op = 'INSERT'/);
  assert.doesNotMatch(migration, /tg_op = 'UPDATE'.*new\.customer_id/s);
  assert.match(migration, /customer_company_associations/);
});
