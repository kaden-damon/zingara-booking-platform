import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("reports place Sales & Performance after Filters and before Website Conversion", async () => {
  const component = await read("../app/admin/ManagementAnalytics.tsx");
  const daily = component.indexOf("<DailyAnalyticsReportPanel />");
  const filters = component.indexOf('sectionProps("filters")');
  const sales = component.indexOf('sectionProps("sales-performance")', filters);
  const conversion = component.indexOf('sectionProps("website-conversion")');

  assert.ok(daily < filters);
  assert.ok(filters < sales);
  assert.ok(sales < conversion);
  assert.match(component, /params\.get\("report"\) === "sales-performance"/);
});

test("Sales & Performance keeps every metric in a compact responsive calendar", async () => {
  const component = await read("../app/admin/SalesPerformanceCalendar.tsx");

  for (const metric of [
    "Shows",
    "Guests booked",
    "Occupancy",
    "Booking value",
    "Paid",
    "Outstanding",
  ]) {
    assert.match(component, new RegExp(`label="${metric}"`));
  }

  assert.match(component, /min-h-20/);
  assert.match(component, /xl:hidden/);
  assert.match(component, /hidden overflow-hidden[\s\S]*xl:block/);
  assert.match(component, /row\.occupancy\.toFixed\(1\)/);
  assert.match(component, /row\.bookingValue/);
  assert.match(component, /row\.amountPaid/);
  assert.match(component, /row\.outstanding/);
});

test("Admin shell uses compact controls without changing their actions", async () => {
  const admin = await read("../app/admin/page.tsx");

  assert.match(admin, /aria-label="Scan Tickets"[\s\S]*setIsScannerOpen\(true\)/);
  assert.match(admin, /aria-label=\{`Notifications, \$\{unreadNotificationCount\} unread`\}/);
  assert.match(admin, /aria-expanded=\{isNotificationCentreOpen\}/);
  assert.match(admin, /staffAccountMenuRef/);
  assert.match(admin, /adminRoleLabels\[currentStaff\.role\]/);
  assert.match(admin, /getStaffVenueScopeLabel\(\[currentStaff\.venueId\]\)/);
  assert.match(admin, /onClick=\{logout\}/);
  assert.match(admin, /min-h-\[calc\(100dvh-5rem\)\]/);
  assert.match(admin, /Restoring Session/);
  assert.match(admin, /Verifying Platform Access/);
});

test("shared branding is compact only on Admin routes", async () => {
  const header = await read("../app/components/ZingaraHeader.tsx");

  assert.match(header, /isAdminRoute\s*\? "py-2"/);
  assert.match(header, /isAdminRoute\s*\? "w-12 sm:w-14"/);
  assert.match(header, /: "w-28 min-\[390px\]:w-32 sm:w-44"/);
  assert.match(header, /isAdminRoute \? "" : "zingara-header-logo"/);
  assert.match(header, /isAdminRoute\s*\? "h-10 w-10"/);
});

test("Table Plan source is outside the Phase 46.7 presentation files", async () => {
  const admin = await read("../app/admin/page.tsx");

  assert.match(admin, /Table Plan/);
  assert.doesNotMatch(admin, /PHASE 46\.7/);
});
