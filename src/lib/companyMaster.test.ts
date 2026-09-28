import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  normalizeCompanyMatchKey,
  normalizeCompanyReviewKey,
  validateCompanyInput,
  validateSouthAfricanVatNumber,
} from "./companyMaster.ts";

const root = process.cwd();
const migrationPath = `${root}/supabase/migrations/20260928234000_phase_42_2_company_master.sql`;
const companiesRoutePath = `${root}/src/app/api/admin/companies/route.ts`;
const contactRoutePath = `${root}/src/app/api/admin/companies/contact/route.ts`;
const reviewsRoutePath = `${root}/src/app/api/admin/companies/reviews/route.ts`;
const panelPath = `${root}/src/app/admin/CompanyCrmWorkspace.tsx`;
const bookingRoutePath = `${root}/src/app/api/bookings/route.ts`;
const corporateServerPath = `${root}/src/lib/supabase/corporateRequestsServer.ts`;

test("exact Company matching normalises only case whitespace and punctuation", () => {
  assert.equal(normalizeCompanyMatchKey(" DISCOVERY (SA) "), "discovery sa");
  assert.equal(normalizeCompanyMatchKey("Discovery SA"), "discovery sa");
  assert.notEqual(
    normalizeCompanyMatchKey("Chelete Management"),
    normalizeCompanyMatchKey("Chelete Management (Pty) Ltd"),
  );
});

test("legal suffix matching is review-only and can identify a candidate", () => {
  assert.equal(
    normalizeCompanyReviewKey("Chelete Management (Pty) Ltd"),
    normalizeCompanyReviewKey("Chelete Management"),
  );
});

test("VAT validation accepts empty optional values and valid SA VAT numbers", () => {
  assert.deepEqual(validateSouthAfricanVatNumber(""), { normalized: "", valid: true });
  assert.equal(validateSouthAfricanVatNumber("412 345 6789").valid, true);
  assert.equal(validateSouthAfricanVatNumber("5123456789").valid, false);
});

test("Company validation requires a legal name and validates billing email", () => {
  assert.equal(validateCompanyInput({ legalName: "" }), "Legal Company Name is required.");
  assert.equal(
    validateCompanyInput({ billingEmail: "wrong", legalName: "Example" }),
    "Enter a valid Billing Email.",
  );
  assert.equal(validateCompanyInput({ legalName: "Example (Pty) Ltd" }), null);
});

test("migration adds one Company master and nullable person links", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table if not exists public\.companies/);
  assert.match(sql, /alter table public\.customers[\s\S]*company_id uuid/);
  assert.match(sql, /job_title text/);
  assert.match(sql, /primary_contact_customer_id uuid/);
  assert.match(sql, /billing_address_line_1 text/);
  assert.match(sql, /physical_address_different boolean/);
  assert.doesNotMatch(sql, /xero_contact/i);
});

test("bookings and Corporate requests preserve snapshots beside master links", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /alter table public\.bookings[\s\S]*company_id uuid/);
  assert.match(sql, /alter table public\.corporate_requests[\s\S]*company_id uuid/);
  assert.doesNotMatch(sql, /drop column[^;]*(company_name|contact_name)/i);
  const bookingRoute = await readFile(bookingRoutePath, "utf8");
  assert.match(bookingRoute, /company_name:/);
  assert.match(bookingRoute, /company_id: booking\.companyId/);
  const corporateServer = await readFile(corporateServerPath, "utf8");
  assert.match(corporateServer, /company_name: request\.companyName/);
  assert.match(corporateServer, /company_id: request\.companyId/);
});

test("exact Company candidates auto-link but legal variants enter review", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /Deterministic exact\/case\/punctuation Company candidates/);
  assert.match(sql, /public\.normalise_company_match_key\(booking\.company_name\)/);
  assert.match(sql, /candidate_type[\s\S]*'company-variant'/);
  assert.match(sql, /on conflict \(candidate_type, review_key\) do nothing/);
});

test("empty profile cleanup is dependency-free and archives instead of deleting", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const table of [
    "bookings",
    "communications",
    "customer_communication_suppressions",
    "promo_redemptions",
    "waitlist_entries",
    "corporate_requests",
    "audit_events",
  ]) {
    assert.match(sql, new RegExp(`not exists \\(select 1 from public\\.${table}`));
  }
  assert.match(sql, /'archiveReason', 'Dependency-free empty CRM profile'/);
  assert.doesNotMatch(sql, /delete from public\.customers/i);
});

test("customer merge is transactional idempotent and preserves dependencies", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create or replace function public\.merge_customers_atomic/);
  assert.match(sql, /v_duplicate\.merged_into_customer_id = p_survivor_customer_id/);
  for (const table of [
    "bookings",
    "communications",
    "waitlist_entries",
    "promo_redemptions",
    "customer_communication_suppressions",
    "corporate_requests",
  ]) {
    assert.match(sql, new RegExp(`update public\\.${table}`));
  }
  assert.match(sql, /'customer\.merged'/);
  assert.doesNotMatch(sql, /delete from public\.(payments|tickets|audit_events|customers)/i);
});

test("automatic duplicate cleanup is limited to deterministic import identity", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /Strict exact duplicate cleanup/);
  assert.match(sql, /min\(created_at\) = max\(created_at\)/);
  assert.match(sql, /count\(distinct lower\(coalesce\(email, ''\)\)\) = 1/);
  assert.match(sql, /Phase 42\.2 exact duplicate cleanup/);
  assert.match(sql, /shared-mobile/);
});

test("company merge blocks registration and VAT conflicts", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create or replace function public\.merge_companies_atomic/);
  assert.match(sql, /COMPANY_REGISTRATION_CONFLICT/);
  assert.match(sql, /COMPANY_VAT_CONFLICT/);
  assert.match(sql, /merged_into_company_id/);
});

test("Company routes require active staff and management permission", async () => {
  for (const path of [companiesRoutePath, contactRoutePath, reviewsRoutePath]) {
    const source = await readFile(path, "utf8");
    assert.match(source, /requireActiveStaff\(request\)/);
  }
  const companyRoute = await readFile(companiesRoutePath, "utf8");
  const contactRoute = await readFile(contactRoutePath, "utf8");
  const reviewRoute = await readFile(reviewsRoutePath, "utf8");
  assert.match(companyRoute, /bookings:manage/);
  assert.match(contactRoute, /bookings:manage/);
  assert.match(reviewRoute, /bookings:manage/);
});

test("all meaningful Company and review actions append audit evidence", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const reviewRoute = await readFile(reviewsRoutePath, "utf8");
  assert.match(sql, /'company\.created'/);
  assert.match(sql, /'company\.updated'/);
  assert.match(sql, /'customer\.company-linked'/);
  assert.match(sql, /'customer\.company-unlinked'/);
  assert.match(sql, /'company\.merged'/);
  assert.match(reviewRoute, /recordAuditEvent/);
});

test("CRM Company workspace is lazy and exposes required plain-English actions", async () => {
  const panel = await readFile(panelPath, "utf8");
  assert.match(panel, /no Company request is added to Admin boot/);
  assert.match(panel, /Company Directory/);
  assert.match(panel, /\+ Create/);
  assert.match(panel, /Primary Contact/);
  assert.match(panel, /Save Company Link/);
  assert.match(panel, /Data Review/);
  assert.match(panel, /Keep Separate/);
  assert.match(panel, /Not a Duplicate/);
});

test("Company directory defaults to the Bookings-style Compact view", async () => {
  const panel = await readFile(panelPath, "utf8");
  assert.match(panel, /useState<CompanyViewMode>\("compact"\)/);
  assert.match(panel, /\["list", "List"\]/);
  assert.match(panel, /\["grid", "Grid"\]/);
  assert.match(panel, /\["compact", "Compact"\]/);
  assert.match(panel, /aria-label="Companies view mode"/);
  assert.match(panel, /companyViewModeSessionStorageKey/);
});

test("Company directory paginates the filtered Company cohort", async () => {
  const panel = await readFile(panelPath, "utf8");
  assert.match(panel, /paginateItems\(visibleCompanies, companyPage, companyPageSize\)/);
  assert.match(panel, /setCompanyPage\(1\)/);
  assert.match(panel, /itemLabel="Companies"/);
  assert.match(panel, /companyPagination\.items\.map/);
  assert.doesNotMatch(panel, /visibleCompanies\.map/);
});

test("Company history lives in the opened profile rather than directory cards", async () => {
  const panel = await readFile(panelPath, "utf8");
  assert.match(panel, /id="company-profile-editor"/);
  assert.match(panel, /Company Profile/);
  assert.match(panel, /Contacts and history/);
  assert.doesNotMatch(panel, /<details/);
  assert.doesNotMatch(panel, /<summary/);
});

test("Company directory keeps batched lazy loading without row requests", async () => {
  const panel = await readFile(panelPath, "utf8");
  assert.equal((panel.match(/getCompanies\(true\)/g) ?? []).length, 1);
  assert.doesNotMatch(panel, /companyPagination\.items[\s\S]{0,400}getCompanies/);
});

test("private Customers remain valid without a Company", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /company_id uuid references public\.companies\(id\) on delete set null/);
  assert.doesNotMatch(sql, /company_id uuid not null/);
});

test("Company links do not modify financial entitlement ticket or table data", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.doesNotMatch(sql, /update public\.(payments|tickets|reservation_table_claims|show_table_overrides|shows)/i);
  assert.doesNotMatch(sql, /update public\.bookings set[^;]*(guest_count|total_amount|amount_paid|balance_outstanding|table_id)/i);
});
