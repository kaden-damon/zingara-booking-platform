import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const workspace = source("../app/admin/CustomerManagementWorkspace.tsx");
const companyWorkspace = source("../app/admin/CompanyCrmWorkspace.tsx");
const route = source("../app/api/admin/customer-management/route.ts");
const bookingPage = source("../app/book/page.tsx");
const bookingRoute = source("../app/api/bookings/route.ts");
const adminPage = source("../app/admin/page.tsx");
const tablePlan = source("../app/api/admin/analytics/table-plan/route.ts");
const migration = source("../../supabase/migrations/20261019143000_phase_50_3_customer_company_associations.sql");

test("customer creation is bounded, explicit and audited atomically", () => {
  assert.match(workspace, /\+ Add Customer/);
  assert.match(workspace, /First name \*/);
  assert.match(workspace, /Surname \*/);
  assert.match(workspace, /Email \(optional\)/);
  assert.match(workspace, /Mobile \(optional\)/);
  assert.match(workspace, /Use existing customer:/);
  assert.match(workspace, /Create new customer/);
  assert.match(route, /\.limit\(8\)/);
  assert.match(route, /POTENTIAL_MATCHES/);
  assert.match(route, /create_customer_profile_atomic/);
  assert.match(migration, /'customer\.create'/);
});

test("customer list remains server paginated and does not trigger global booking hydration", () => {
  assert.match(route, /pageSize = Math\.min\(50/);
  assert.match(route, /\.range\(\(page - 1\) \* pageSize, page \* pageSize - 1\)/);
  assert.match(route, /count: "exact"/);
  assert.match(workspace, /const pageSize = 10/);
  assert.doesNotMatch(
    adminPage,
    /requiresCompleteBookingPopulation[\s\S]{0,500}activeAdminTab === "customers"/,
  );
});

test("customer and company associations are many-to-many and unlink safely", () => {
  assert.match(migration, /customer_company_associations/);
  assert.match(migration, /unique index[\s\S]*\(customer_id, company_id\)[\s\S]*where removed_at is null/i);
  assert.match(migration, /on delete restrict/);
  assert.match(migration, /link_customer_company_association_atomic/);
  assert.match(migration, /unlink_customer_company_association_atomic/);
  assert.match(migration, /preserve_customer_company_links_on_merge/);
  assert.match(companyWorkspace, /Associated Customers/);
  assert.match(companyWorkspace, /Link existing customer/);
  assert.match(companyWorkspace, /Create and link new customer/);
  assert.match(companyWorkspace, /Remove/);
});

test("staff bookings reuse an exact customer while public validation stays unchanged", () => {
  assert.match(bookingPage, /selectedExistingCustomerId/);
  assert.match(bookingPage, /manualCheckoutRole === "none"[\s\S]{0,100}undefined/);
  assert.match(bookingRoute, /isTrustedStaff[\s\S]*booking\.customerId/);
  assert.match(bookingRoute, /\.eq\("id", booking\.customerId\)/);
  assert.match(bookingRoute, /\.is\("merged_into_customer_id", null\)/);
  assert.match(bookingRoute, /customerId = selectedCustomer\.id/);
  assert.match(bookingPage, /customerInfo\.email\.trim\(\)/);
  assert.match(bookingPage, /customerInfo\.phone\.trim\(\)/);
});

test("Table Plan keeps the booking customer identity and existing columns", () => {
  assert.match(tablePlan, /customer/);
  assert.match(tablePlan, /booking_reference/);
  assert.doesNotMatch(tablePlan, /customer_company_associations/);
});
