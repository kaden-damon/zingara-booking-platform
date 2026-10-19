import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const workspace = source("../app/admin/CustomerManagementWorkspace.tsx");
const route = source("../app/api/admin/customer-management/route.ts");
const adminPage = source("../app/admin/page.tsx");

test("historical booking rows use the authoritative show schema", () => {
  assert.match(route, /select\("id,name,date,time,venue,status"\)/);
  assert.doesNotMatch(route, /select\("id,date,time,location"\)/);
  assert.match(workspace, /booking\.show\.venue/);
  assert.match(workspace, /booking\.show\.name/);
});

test("the restored profile exposes original CRM capabilities", () => {
  for (const label of [
    "Spend",
    "Attendance",
    "Relationship Notes & VIP",
    "Favourite Seating",
    "Add-Ons Purchased",
    "Promo Usage",
    "Booking & Performance History",
    "Communications & Preferences",
    "Customer Activity",
    "Open Booking",
    "Archive Customer",
  ]) {
    assert.match(workspace, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(workspace, /onOpenBooking/);
  assert.match(adminPage, /onOpenBooking=\{openCustomerHistoryBooking\}/);
});

test("large histories remain lazy, paginated and server bounded", () => {
  assert.match(route, /mode === "summary"/);
  assert.match(route, /const batchSize = 500/);
  assert.match(route, /mode === "communications"/);
  assert.match(route, /mode === "activity"/);
  assert.match(route, /pageSize = Math\.min\(25/);
  assert.match(route, /\.range\(from, to\)/);
  assert.match(workspace, /onToggle=.*loadCommunications/);
  assert.match(workspace, /onToggle=.*loadActivity/);
  assert.match(workspace, /detailAbortRef\.current\?\.abort/);
  assert.doesNotMatch(workspace, /loadLiveCustomerRecords/);
});

test("Phase 50.3 customer and company controls remain available", () => {
  assert.match(workspace, /\+ Add Customer/);
  assert.match(workspace, /Edit Customer/);
  assert.match(workspace, /Use existing customer:/);
  assert.match(workspace, /Associated Companies/);
  assert.match(workspace, /Link Customer/);
  assert.match(route, /create_customer_profile_atomic/);
  assert.match(route, /link_customer_company_association_atomic/);
  assert.match(route, /unlink_customer_company_association_atomic/);
});
