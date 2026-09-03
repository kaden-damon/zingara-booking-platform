import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getReportGenerationLockMessage } from "./reportGenerationLock.ts";

const page = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
const analytics = readFileSync(new URL("../app/admin/ManagementAnalytics.tsx", import.meta.url), "utf8");
const lockRoute = readFileSync(new URL("../app/api/admin/analytics/report-lock/route.ts", import.meta.url), "utf8");
const managementExport = readFileSync(new URL("../app/api/admin/analytics/management/export/route.ts", import.meta.url), "utf8");
const tablePlanExport = readFileSync(new URL("../app/api/admin/analytics/table-plan/route.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20260903190000_phase_39_57a_report_generation_lock.sql", import.meta.url), "utf8");

test("Analytics defaults to Sales and renders one workspace at a time", () => {
  assert.match(page, /useState<AnalyticsWorkspace>\("sales"\)/);
  assert.match(page, /Sales & Performance Demand/);
  assert.match(page, /Manifests, Check-In Sheets & Floor Reports/);
  assert.match(page, /analyticsWorkspace === "sales" && <ManagementAnalytics/);
  assert.match(page, /analyticsWorkspace === "reports" && \(/);
});

test("Analytics workspace navigation wraps without horizontal overflow", () => {
  assert.match(page, /aria-label="Analytics workspaces"/);
  assert.match(page, /grid-cols-1[^\n]+sm:grid-cols-2/);
  assert.match(page, /min-h-12/);
});

test("Phase 39.57 filters stay global and analytical sections collapse", () => {
  assert.match(analytics, /aria-labelledby="analytics-filters"/);
  assert.match(analytics, /zingara-admin-management-analytics-filters/);
  assert.match(analytics, /sessionStorage\.setItem/);
  assert.match(analytics, /restoreFilters\(sessionStorage\.getItem/);
  assert.match(analytics, /"booking-activity",\s*"performance-demand"/);
  for (const title of [
    "Booking Activity",
    "Performance Demand",
    "Day of Week Performance",
    "Midweek vs Weekend",
    "Performance Month \/ Season Demand",
    "Booking Lead Time",
    "Seating Demand",
    "Payment Analytics",
    "Management Highlights",
  ]) assert.match(analytics, new RegExp(`title="${title}"`));
  assert.match(analytics, /isOpen \? <div id=\{contentId\}/);
});

test("lock message reveals only an appropriate staff display name", () => {
  assert.equal(
    getReportGenerationLockMessage({
      acquiredAt: "2026-09-03T10:00:00Z",
      expiresAt: "2026-09-03T10:05:00Z",
      ownerName: "Kaden Damon",
      reportType: "Management Analytics Workbook",
    }),
    "Kaden Damon is currently generating a report. Please try again when it has completed.",
  );
});

test("database lock is atomic, expiring, singleton and service-role controlled", () => {
  assert.match(migration, /primary key check \(lock_key = 'analytics-heavy-report'\)/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('analytics-heavy-report'\)\)/);
  assert.match(migration, /expires_at <= v_now/);
  assert.match(migration, /least\(greatest\(p_timeout_seconds, 60\), 900\)/);
  assert.match(migration, /revoke all on public\.report_generation_locks from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.acquire_report_generation_lock[\s\S]*to service_role/);
});

test("lock API enforces authentication and analytics permission", () => {
  assert.match(lockRoute, /requireActiveStaff\(request\)/);
  assert.match(lockRoute, /analytics:read/);
  assert.match(lockRoute, /status: 423/);
  assert.match(lockRoute, /body\.action === "acquire"/);
  assert.match(lockRoute, /releaseReportGenerationLock/);
});

test("heavy server exports acquire and always release the shared lock", () => {
  for (const route of [managementExport, tablePlanExport]) {
    assert.match(route, /acquireReportGenerationLock/);
    assert.match(route, /finally/);
    assert.match(route, /releaseReportGenerationLock/);
    assert.match(route, /status: 423/);
  }
});

test("client-generated operational reports share the same lock", () => {
  assert.match(page, /runWithReportGenerationLock/);
  assert.match(page, /await acquireReportGenerationLock\(reportType, reportScope\)/);
  assert.match(page, /await releaseReportGenerationLock/);
  assert.match(page, /isOperationalReportExporting \|\| Boolean\(reportGenerationLock\)/);
});

test("report generation remains separate from Analytics viewing", () => {
  assert.match(analytics, /useReportGenerationLock\(\)/);
  assert.match(analytics, /disabled=\{exporting \|\| Boolean\(reportLock\)\}/);
});

test("report lifecycle and stale recovery are audited", () => {
  const server = readFileSync(new URL("./supabase/reportGenerationLockServer.ts", import.meta.url), "utf8");
  for (const action of [
    "analytics.report_generation_started",
    "analytics.report_generation_started_after_stale_recovery",
    "analytics.report_generation_completed",
    "analytics.report_generation_failed",
  ]) assert.match(server, new RegExp(action.replaceAll(".", "\\.")));
});
