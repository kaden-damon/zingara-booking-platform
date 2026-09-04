import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { neutralizeSpreadsheetFormula } from "./exports/tablePlan.ts";
import { getRolePermissions } from "./supabase/serverAdmin.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("public Corporate endpoint cannot enumerate or bulk-upsert enquiries", async () => {
  const route = await source("../app/api/corporate-requests/route.ts");

  assert.match(route, /available through authenticated Admin/);
  assert.match(route, /if \(!submittedRequest \|\| body\.requests\)/);
  assert.match(route, /id: `CORP-\$\{crypto\.randomUUID\(\)\}`/);
  assert.match(route, /status: "corporate-tentative"/);
  assert.match(route, /source: "Corporate Direct"/);
  assert.match(route, /scope: "corporate_enquiry_ip"/);
  assert.match(route, /scope: "corporate_enquiry_contact"/);
  assert.doesNotMatch(route, /return Response\.json\(persistedRequests/);
});

test("public waitlist endpoint cannot enumerate or bulk-upsert entries", async () => {
  const route = await source("../app/api/waitlist/route.ts");

  assert.match(route, /available through authenticated Admin/);
  assert.match(route, /if \(!submittedEntry \|\| body\.entries\)/);
  assert.match(route, /id: `WLT-\$\{crypto\.randomUUID\(\)\}`/);
  assert.match(route, /status: "waiting"/);
  assert.match(route, /requirePublicMaintenanceAvailable/);
  assert.match(route, /scope: "waitlist_ip"/);
  assert.match(route, /scope: "waitlist_contact"/);
  assert.doesNotMatch(route, /return Response\.json\(persistedEntries/);
});

test("guest push delivery requires authenticated communication authority", async () => {
  const route = await source("../app/api/guest-push/route.ts");
  const authIndex = route.indexOf("requireActiveStaff(request)");
  const bodyIndex = route.indexOf("await request.json()");
  const sendIndex = route.indexOf("sendGuestPushNotification({");

  assert.ok(authIndex >= 0 && authIndex < bodyIndex);
  assert.ok(bodyIndex < sendIndex);
  assert.match(route, /includes\("communications:manage"\)/);
});

test("guest push registration verifies the booking customer and is rate limited", async () => {
  const route = await source("../app/api/push-subscriptions/route.ts");

  assert.match(route, /getVerifiedGuestContext/);
  assert.match(route, /customer\.email\.trim\(\)\.toLowerCase\(\) !== normalizedEmail/);
  assert.match(route, /scope: "push_subscription_ip"/);
  assert.match(route, /scope: "push_subscription_booking"/);
  assert.match(route, /status: 401/);
  assert.doesNotMatch(route, /staffEmail: staffContext\?\.email \?\? null/);
});

test("unknown roles and authoritative empty permission relations fail closed", () => {
  assert.deepEqual(getRolePermissions(undefined), []);
  assert.deepEqual(
    getRolePermissions({
      id: "unknown",
      name: "Unexpected Role",
      role_permissions: [],
    }),
    [],
  );
  assert.deepEqual(
    getRolePermissions({
      id: "known-empty",
      name: "Venue Manager",
      role_permissions: [],
    }),
    [],
  );
});

test("browser security headers and private no-store policies are configured", async () => {
  const config = await source("../../next.config.ts");

  for (const header of [
    "Content-Security-Policy",
    "Permissions-Policy",
    "Referrer-Policy",
    "X-Content-Type-Options",
    "X-Frame-Options",
  ]) {
    assert.match(config, new RegExp(header));
  }

  assert.match(config, /private, no-store, max-age=0/);
  assert.match(config, /poweredByHeader: false/);
});

test("crawler policy excludes sensitive application surfaces", async () => {
  const robots = await source("../app/robots.ts");

  for (const path of ["/admin", "/api", "/find-booking", "/payment", "/ticket"]) {
    assert.match(robots, new RegExp(`"${path}"`));
  }
});

test("public debug route is absent", async () => {
  await assert.rejects(access(new URL("../app/react-test/page.tsx", import.meta.url)));
});

test("table-plan exports neutralize spreadsheet formulas in customer content", () => {
  for (const prefix of ["=", "+", "-", "@"]) {
    assert.equal(
      neutralizeSpreadsheetFormula(`  ${prefix}SUM(A1:A2)`),
      `'  ${prefix}SUM(A1:A2)`,
    );
  }

  assert.equal(neutralizeSpreadsheetFormula("Ordinary guest note"), "Ordinary guest note");
});

test("payment preparation remains bounded to authoritative outstanding", async () => {
  const checkout = await source("../app/api/payfast/checkout/route.ts");
  const helper = await source("./payfast/checkout.ts");

  assert.match(checkout, /attemptResult\.attempt\.amount_due - body\.amount/);
  assert.match(helper, /payload\.amount - attempt\.amount_due > 0\.01/);
  assert.match(helper, /Payment amount exceeds the outstanding balance/);
});

test("promo activation remains service-controlled and explicit", async () => {
  const migration = await source(
    "../../supabase/migrations/20260904140000_phase_39_65b_promo_activation_guard.sql",
  );

  assert.match(migration, /PROMO_ACTIVATION_REQUIRES_AUTHORISED_ADMIN_ACTION/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /to service_role/);
});
