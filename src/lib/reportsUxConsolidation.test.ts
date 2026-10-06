import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Reports categories start compact and preserve legacy tools", async () => {
  const admin = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");

  assert.match(admin, /useState<\s*AnalyticsSectionId\[\]\s*>\(\[\]\)/);
  assert.match(admin, /title="Legacy Reports"/);
  assert.match(admin, /Older reporting tools retained for historical reference\./);
  assert.match(admin, /Per-Show Booking Value/);
  assert.match(admin, /Table Plan/);
});

test("Sales calendar uses the compact desktop presentation", async () => {
  const calendar = await readFile(new URL("../app/admin/SalesPerformanceCalendar.tsx", import.meta.url), "utf8");

  assert.match(calendar, /min-h-32/);
  assert.doesNotMatch(calendar, /min-h-44/);
  for (const field of ["guests", "occupancy", "Booked", "Paid", "Outstanding"]) {
    assert.match(calendar, new RegExp(field));
  }
});

test("Table Plan implementation remains outside the Reports UX change", async () => {
  const admin = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  const tablePlanRoute = await readFile(new URL("../app/api/admin/analytics/table-plan/route.ts", import.meta.url), "utf8");
  const tablePlanExport = await readFile(new URL("./exports/tablePlan.ts", import.meta.url), "utf8");

  assert.match(admin, /Table Plan/);
  assert.doesNotMatch(admin, /title="Operations Reports"/);
  assert.match(tablePlanRoute, /requireActiveStaff/);
  assert.match(tablePlanExport, /Table Plan/);
});
