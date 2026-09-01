import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  defaultPlatformMaintenanceConfig,
  isPublicMaintenanceBlocking,
  normalizePlatformMaintenanceConfig,
  validatePlatformMaintenanceConfig,
} from "./platformMaintenance.ts";

const root = process.cwd();
const read = (path: string) => readFile(`${root}/${path}`, "utf8");

test("maintenance defaults are operational and public contact is safe", () => {
  assert.equal(defaultPlatformMaintenanceConfig.staff.enabled, false);
  assert.equal(defaultPlatformMaintenanceConfig.public.enabled, false);
  assert.equal(
    defaultPlatformMaintenanceConfig.public.contactEmail,
    "bookings@zingara.co.za",
  );
});

test("normalization fails optional state closed to OFF", () => {
  const config = normalizePlatformMaintenanceConfig({
    public: { enabled: "true" },
    staff: { enabled: 1 },
  });

  assert.equal(config.public.enabled, false);
  assert.equal(config.staff.enabled, false);
});

test("BOOKINGS scope blocks booking creation only", () => {
  const config = normalizePlatformMaintenanceConfig({
    public: { enabled: true, scope: "bookings" },
  });

  assert.equal(isPublicMaintenanceBlocking(config, "booking"), true);
  assert.equal(isPublicMaintenanceBlocking(config, "payment"), false);
});

test("PAYMENTS scope blocks payment initiation only", () => {
  const config = normalizePlatformMaintenanceConfig({
    public: { enabled: true, scope: "payments" },
  });

  assert.equal(isPublicMaintenanceBlocking(config, "booking"), false);
  assert.equal(isPublicMaintenanceBlocking(config, "payment"), true);
});

test("FULL scope blocks booking and payment actions", () => {
  const config = normalizePlatformMaintenanceConfig({
    public: { enabled: true, scope: "full" },
  });

  assert.equal(isPublicMaintenanceBlocking(config, "booking"), true);
  assert.equal(isPublicMaintenanceBlocking(config, "payment"), true);
});

test("maintenance validation requires operational copy and safe contact", () => {
  assert.match(
    validatePlatformMaintenanceConfig({ public: {}, staff: {} }) ?? "",
    /Staff Maintenance message/,
  );
  assert.equal(
    validatePlatformMaintenanceConfig(defaultPlatformMaintenanceConfig),
    null,
  );
});

test("active staff sessions are checked on every mutation", async () => {
  const source = await read("src/lib/supabase/serverAdmin.ts");

  assert.match(source, /const isMutation = !\["GET", "HEAD", "OPTIONS"\]/);
  assert.match(source, /loadPlatformMaintenance\(serviceClient\)/);
  assert.match(source, /config\.staff\.enabled/);
  assert.match(source, /!isSuperAdminProfile\(staffProfile\)/);
  assert.ok(source.indexOf("if (!user)") < source.indexOf("config.staff.enabled"));
});

test("staff maintenance guard fails closed with 503", async () => {
  const source = await read("src/lib/supabase/serverAdmin.ts");
  const helper = await read("src/lib/platformMaintenance.ts");

  assert.match(source, /Staff guard failed closed/);
  assert.match(helper, /status: 503/);
  assert.match(helper, /Retry-After/);
});

test("all public booking and payment starts use the maintenance guard", async () => {
  const routes = [
    "src/app/api/bookings/route.ts",
    "src/app/api/bookings/complete-zero-value/route.ts",
    "src/app/api/waitlist/route.ts",
    "src/app/api/payfast/checkout/route.ts",
    "src/app/api/payment-links/[token]/checkout/route.ts",
    "src/app/api/corporate-payment/checkout/route.ts",
  ];

  for (const route of routes) {
    assert.match(await read(route), /requirePublicMaintenanceAvailable/, route);
  }
});

test("Find My Booking and ticket access remain outside maintenance guards", async () => {
  assert.doesNotMatch(
    await read("src/app/api/find-booking/route.ts"),
    /requirePublicMaintenanceAvailable/,
  );
  assert.doesNotMatch(
    await read("src/app/api/tickets/[reference]/route.ts"),
    /requirePublicMaintenanceAvailable/,
  );
});

test("payment-link and corporate checkouts are blocked before PayFast preparation", async () => {
  for (const route of [
    "src/app/api/payment-links/[token]/checkout/route.ts",
    "src/app/api/corporate-payment/checkout/route.ts",
  ]) {
    const source = await read(route);
    assert.ok(
      source.indexOf("const maintenanceResponse") <
        source.lastIndexOf("preparePayFastCheckoutAttempt"),
      route,
    );
  }
});

test("maintenance enquiry is rate-limited and isolated from business ledgers", async () => {
  const source = await read("src/app/api/maintenance-booking-enquiries/route.ts");

  assert.match(source, /checkRateLimit/);
  assert.match(source, /maintenance_booking_enquiries/);
  assert.doesNotMatch(source, /\.from\("bookings"\)/);
  assert.doesNotMatch(source, /\.from\("customers"\)/);
  assert.doesNotMatch(source, /\.from\("payments"\)/);
  assert.doesNotMatch(source, /\.from\("tickets"\)/);
});

test("maintenance migration defaults to no enabled preference row", async () => {
  const source = await read(
    "supabase/migrations/20260901170000_phase_39_37_system_maintenance.sql",
  );

  assert.match(source, /create table if not exists public\.maintenance_booking_enquiries/);
  assert.doesNotMatch(
    source.split("create or replace function")[0],
    /system_maintenance/,
  );
});

test("maintenance changes and audits commit in one database function", async () => {
  const source = await read(
    "supabase/migrations/20260901170000_phase_39_37_system_maintenance.sql",
  );

  assert.match(source, /save_system_maintenance_atomic/);
  assert.match(source, /STALE_MAINTENANCE_REVISION/);
  assert.match(source, /platform\.staff_maintenance_enabled/);
  assert.match(source, /platform\.public_maintenance_enabled/);
  assert.match(source, /insert into public\.audit_events/g);
});

test("maintenance controls use explicit save and confirmation", async () => {
  const source = await read("src/app/admin/SystemMaintenancePanel.tsx");

  assert.match(source, /Save Maintenance/);
  assert.match(source, /window\.confirm/);
  assert.doesNotMatch(source, /onChange=.*saveMaintenance/);
});

test("public maintenance page states enquiry is not a booking", async () => {
  const source = await read("src/app/book/PublicMaintenanceBoundary.tsx");
  const config = await read("src/lib/platformMaintenance.ts");

  assert.match(source, /Submitting this enquiry does not confirm a booking/);
  assert.match(config, /bookings@zingara\.co\.za/);
  assert.match(source, /Find My Booking/);
});

test("Admin exposes dedicated staff maintenance and Super Admin recovery UI", async () => {
  const source = await read("src/app/admin/page.tsx");

  assert.match(source, /platformMaintenance\.staff\.enabled && !isSuperAdmin/);
  assert.match(source, /Staff Maintenance Active/);
  assert.match(source, /Open Operations/);
});
