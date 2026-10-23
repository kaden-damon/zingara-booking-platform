import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = readFileSync("package.json", "utf8");
const budgetScript = readFileSync(
  "scripts/check-admin-performance-budget.mjs",
  "utf8",
);
const sessionIndexMigration = readFileSync(
  "supabase/migrations/20261023211500_phase_51_5_platform_event_session_index.sql",
  "utf8",
);
const conversionScopeMigration = readFileSync(
  "supabase/migrations/20261023212000_phase_51_5_conversion_event_scope.sql",
  "utf8",
);
const conversionVenueGuardMigration = readFileSync(
  "supabase/migrations/20261023212500_phase_51_5_conversion_venue_lookup_guard.sql",
  "utf8",
);
const conversionRoute = readFileSync(
  "src/app/api/admin/analytics/website-conversion/route.ts",
  "utf8",
);

test("Production builds enforce the verified Admin initial-route budgets", () => {
  assert.match(
    packageJson,
    /"build": "next build && node scripts\/check-admin-performance-budget\.mjs"/,
  );
  assert.match(budgetScript, /gzipBytes: 320_000/);
  assert.match(budgetScript, /largestChunkGzipBytes: 170_000/);
  assert.match(budgetScript, /rawBytes: 1_320_000/);
  assert.match(budgetScript, /process\.exitCode = 1/);
});

test("Conversion reporting uses a bounded session and time index", () => {
  assert.match(
    sessionIndexMigration,
    /platform_events_session_created_at_idx/,
  );
  assert.match(
    sessionIndexMigration,
    /platform_events \(session_id, created_at desc\)/,
  );
  assert.match(sessionIndexMigration, /where session_id is not null/);
  for (const eventType of [
    "site_view",
    "session_started",
    "journey_started",
    "show_selected",
    "seating_selected",
    "guest_details_completed",
    "payment_initiated",
  ]) {
    assert.match(conversionScopeMigration, new RegExp(`'${eventType}'`));
  }
  assert.match(conversionScopeMigration, /pg_get_functiondef/);
  assert.match(conversionScopeMigration, /raise exception/);
  assert.match(
    conversionVenueGuardMigration,
    /nullif\(e\.metadata->>'location', ''\) is null/,
  );
  assert.match(conversionVenueGuardMigration, /coalesce\(bs\.venue, ''\)/);
  assert.match(conversionVenueGuardMigration, /raise exception/);
  assert.match(conversionRoute, /get_website_conversion_analytics_v3/);
  assert.match(conversionRoute, /rangeDays > 30/);
});
