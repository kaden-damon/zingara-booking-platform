import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const reconciliationRoute = readFileSync(
  new URL("../app/api/admin/dineplan-reconciliation/route.ts", import.meta.url),
  "utf8",
);
const actionRoute = readFileSync(
  new URL(
    "../app/api/admin/dineplan-reconciliation/actions/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const adminPage = readFileSync(
  new URL("../app/admin/page.tsx", import.meta.url),
  "utf8",
);
const workflowRoute = readFileSync(
  new URL("../app/api/workflows/run/route.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260924090000_phase_41_2w_dineplan_reconciliation.sql",
    import.meta.url,
  ),
  "utf8",
);

test("legacy Dineplan entry points are retired and remain permission protected", () => {
  for (const route of [reconciliationRoute, actionRoute]) {
    assert.match(route, /requireActiveStaff/);
    assert.match(route, /bookings:reconcile/);
    assert.match(route, /settings:manage/);
    assert.match(route, /status: 410/);
    assert.match(route, /legacy Dineplan workflow has been retired/);
  }
});

test("Dineplan has no Admin or scheduled workflow entry point", () => {
  assert.doesNotMatch(
    adminPage,
    /DineplanReconciliation|id: "dineplan"|setActiveSystemTab\("dineplan"\)/,
  );
  assert.doesNotMatch(
    workflowRoute,
    /runDineplanScheduledEmails|dineplanScheduledEmails/,
  );
});

test("historical Dineplan evidence remains preserved by its original schema", () => {
  assert.match(migration, /dineplan_reconciliation_snapshots/);
  assert.match(migration, /dineplan_reconciliation_reviews/);
  assert.doesNotMatch(reconciliationRoute, /\.delete\(|\.update\(|\.insert\(/);
  assert.doesNotMatch(actionRoute, /\.delete\(|\.update\(|\.insert\(/);
});
