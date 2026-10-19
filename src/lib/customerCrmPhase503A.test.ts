import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const customerWorkspace = source("../app/admin/CustomerManagementWorkspace.tsx");
const companyWorkspace = source("../app/admin/CompanyCrmWorkspace.tsx");
const customerRoute = source("../app/api/admin/customer-management/route.ts");
const companyRoute = source("../app/api/admin/companies/route.ts");
const companyServer = source("./supabase/companyMasterServer.ts");
const adminPage = source("../app/admin/page.tsx");

test("customer detail prioritizes core data and safely bounds secondary history", () => {
  assert.match(customerRoute, /mode === "detail"/);
  assert.match(customerRoute, /mode === "history"/);
  assert.match(customerRoute, /getPagination\(url\)/);
  assert.match(customerRoute, /\.range\(from, to\)/);
  assert.match(customerWorkspace, /pageSize: "10"/);
  assert.match(customerWorkspace, /detailAbortRef\.current\?\.abort\(\)/);
  assert.match(customerWorkspace, /requestId !== detailRequestRef\.current/);
  assert.match(customerWorkspace, /Customer details couldn't be loaded\. Try again\./);
  assert.match(customerWorkspace, />Retry</);
});

test("customer directory stays at ten names-only server rows", () => {
  assert.match(customerWorkspace, /const pageSize = 10/);
  assert.match(customerRoute, /customerListFields/);
  assert.match(customerRoute, /count: "exact"/);
  assert.match(customerRoute, /\.range\(\(page - 1\) \* pageSize, page \* pageSize - 1\)/);
  assert.doesNotMatch(
    customerWorkspace,
    /customer\.email, customer\.mobile[\s\S]{0,120}No contact details/,
  );
});

test("company directory and association search use bounded server queries", () => {
  assert.match(companyWorkspace, /getCompanyPage/);
  assert.match(companyWorkspace, /paginateServerItems/);
  assert.doesNotMatch(companyWorkspace, /paginateItems\(visibleCompanies/);
  assert.match(companyRoute, /mode"\) === "list"/);
  assert.match(companyServer, /\.range\(offset, offset \+ pageSize - 1\)/);
  assert.match(customerRoute, /legal_name\.ilike/);
  assert.match(customerRoute, /trading_name\.ilike/);
  assert.match(customerRoute, /\.limit\(20\)/);
  assert.match(customerWorkspace, /companyRequestRef/);
});

test("Booking Details refreshes only its exact linked customer", () => {
  assert.match(adminPage, /refreshBookingCustomerDetails/);
  assert.match(
    adminPage,
    /mode=detail&id=\$\{encodeURIComponent\(booking\.customerId\)\}/,
  );
  assert.match(adminPage, /Save or discard booking edits before refreshing customer details/);
  assert.match(adminPage, /Customer details refreshed\./);
  assert.match(adminPage, /Companies: \{refresh\.companies\.join/);
});
