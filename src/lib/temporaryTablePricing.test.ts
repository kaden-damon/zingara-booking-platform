import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getTemporaryTablePricePerPerson,
  normalizeTemporaryTableCustomPrice,
} from "./temporaryTablePricing.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("temporary table without a custom price uses the configured zone price", () => {
  assert.equal(
    getTemporaryTablePricePerPerson({ configuredZonePrice: 1540 }),
    1540,
  );
});

test("custom temporary-table price overrides the configured zone price", () => {
  assert.equal(
    getTemporaryTablePricePerPerson({
      configuredZonePrice: 1540,
      customPricePerPerson: 1150,
    }),
    1150,
  );
});

test("Rand custom prices are normalized to cents and must be positive", () => {
  assert.equal(normalizeTemporaryTableCustomPrice("1150.005"), 1150.01);
  assert.equal(normalizeTemporaryTableCustomPrice(""), null);
  assert.throws(() => normalizeTemporaryTableCustomPrice(0), /positive Rand/);
});

test("custom pricing is stored only on one show-table row", async () => {
  const migration = await source(
    "../../supabase/migrations/20260901213000_phase_39_41_temporary_table_custom_pricing.sql",
  );

  assert.match(migration, /alter table public\.show_tables/);
  assert.match(migration, /custom_price_per_person numeric\(10,2\)/);
  assert.match(migration, /is_override/);
  assert.match(migration, /availability_scope = 'operational'/);
  assert.doesNotMatch(migration, /alter table public\.venue_settings/);
});

test("table management changes require authoritative table permission and are audited", async () => {
  const route = await source("../app/api/admin/show-tables/route.ts");

  assert.match(route, /includes\("tables:manage"\)/);
  assert.match(route, /status: 403/);
  assert.match(route, /custom_price_per_person: customPricePerPerson/);
  assert.match(route, /beforeValues/);
  assert.match(route, /tryRecordAuditEvent/);
});

test("manual checkout selection is resolved and repriced server-side", async () => {
  const route = await source("../app/api/bookings/route.ts");

  assert.match(route, /resolveCustomPricedTemporaryTable/);
  assert.match(route, /\.eq\("id", tableId\)/);
  assert.match(route, /\.eq\("show_id", showId\)/);
  assert.match(route, /customPricedTemporaryTable\?\.customPricePerPerson/);
  assert.match(route, /reservationTableClaims: \[/);
});

test("public bookings cannot submit an internal temporary-table assignment", async () => {
  const route = await source("../app/api/bookings/route.ts");
  const untrustedBranch = route.slice(
    route.indexOf("if (!isTrustedStaff)"),
    route.indexOf("const maintenanceResponse", route.indexOf("if (!isTrustedStaff)")),
  );

  assert.match(untrustedBranch, /reservationTableClaims: \[\]/);
  assert.match(untrustedBranch, /tableId: ""/);
  assert.match(untrustedBranch, /tableNumber: ""/);
});

test("existing booking moves and table-price edits do not rewrite booking financials", async () => {
  const [tableRoute, moveMigration] = await Promise.all([
    source("../app/api/admin/show-tables/route.ts"),
    source(
      "../../supabase/migrations/20260828160000_phase_39_18_cross_zone_table_reallocation.sql",
    ),
  ]);

  const updateBranch = tableRoute.slice(
    tableRoute.indexOf('if (body.action === "update")'),
    tableRoute.indexOf('if (body.action === "set-capacity")'),
  );
  assert.doesNotMatch(updateBranch, /\.from\("bookings"\)\.update/);
  assert.doesNotMatch(
    moveMigration,
    /set\s+(total_amount|subtotal_amount|amount_paid|balance_outstanding)/i,
  );
});

test("dynamic pricing remains absent and promo remains a separate pricing step", async () => {
  const pricing = await source("./pricing.ts");

  assert.doesNotMatch(pricing, /getDynamicPriceMultiplier|1\.12|0\.95/);
  assert.match(
    pricing,
    /const discountAmount = Math\.min\(input\.promo\?\.discountAmount \?\? 0, subtotal\)/,
  );
  assert.match(pricing, /getIncludedBookingFeeBreakdown\(seatingSubtotal\)/);
});

test("manual checkout clearly distinguishes custom and standard table pricing", async () => {
  const page = await source("../app/book/page.tsx");

  assert.match(page, /Staff Table Pricing/);
  assert.match(page, /Standard zone price/);
  assert.match(page, /customPricePerPerson/);
  assert.match(page, /agreedPriceSource/);
});
