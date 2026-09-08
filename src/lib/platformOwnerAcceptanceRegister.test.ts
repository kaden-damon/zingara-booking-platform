import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getPolicyDisplayVersion } from "./platformOwner.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Platform Owner binding is immutable technical governance configuration", async () => {
  const migration = await source(
    "../../supabase/migrations/20260908140000_phase_41_1e_c_platform_owner_binding.sql",
  );

  assert.match(migration, /create table if not exists public\.platform_owner_bindings/);
  assert.match(migration, /staff_profile_id uuid primary key/);
  assert.match(migration, /auth_user_id uuid not null unique/);
  assert.match(migration, /e8598359-54a0-4e1f-a635-1ec8ae02cb78/);
  assert.match(migration, /1f8b62f8-cac9-4cf7-927d-945d96a302ce/);
  assert.match(migration, /grant select on public\.platform_owner_bindings to service_role/);
  assert.match(migration, /revoke insert, update, delete, truncate/);
  assert.match(migration, /platform_owner_bindings_no_update/);
  assert.match(migration, /platform_owner_bindings_no_delete/);
});

test("owner resolution binds both authenticated and staff identities server-side", async () => {
  const owner = await source("./supabase/platformOwner.ts");
  const route = await source(
    "../app/api/admin/platform-governance/acceptance-register/route.ts",
  );

  assert.match(owner, /\.eq\("staff_profile_id", staffProfile\.id\)/);
  assert.match(owner, /\.eq\("auth_user_id", user\.id\)/);
  assert.match(owner, /\.eq\("authority", "platform-owner"\)/);
  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /isPlatformOwnerIdentity\(auth\.serviceClient, auth\.staffProfile, auth\.user\)/);
  assert.match(route, /Platform Owner access is required/);
  assert.match(route, /status: 403/);
  assert.doesNotMatch(route, /request\.json|searchParams.*owner|client.*owner/i);
});

test("operational Super Admin cannot alter or delete the owner profile", async () => {
  const staffRoute = await source("../app/api/admin/staff/route.ts");

  assert.match(staffRoute, /isPlatformOwnerStaffProfile/);
  assert.equal(
    staffRoute.match(/Platform Owner identity cannot be managed through operational Staff Management\./g)?.length,
    2,
  );
});

test("Acceptance Register route is read-only, no-store and omits authentication secrets", async () => {
  const route = await source(
    "../app/api/admin/platform-governance/acceptance-register/route.ts",
  );

  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.match(route, /private, no-store, max-age=0/);
  assert.doesNotMatch(route, /access_token|refresh_token|session_token/);
  assert.doesNotMatch(route, /authUserId:/);
});

test("register derives current, superseded and pending states from authoritative data", async () => {
  const route = await source(
    "../app/api/admin/platform-governance/acceptance-register/route.ts",
  );

  assert.match(route, /\.from\("staff_profiles"\)/);
  assert.match(route, /row\.active && isKnownAdminRoleName/);
  assert.match(route, /\.from\("admin_policy_acceptances"\)/);
  assert.match(route, /\.from\("audit_events"\)/);
  assert.match(route, /adminIpUndertaking\.version/);
  assert.match(route, /"superseded"/);
  assert.match(route, /"pending" as const/);
  assert.match(route, /activeAdminUsers: activeStaff\.length/);
  assert.match(route, /pending: activeStaff\.length - currentAccepted/);
});

test("Preferences has isolated workspaces and closed plus-minus sections", async () => {
  const preferences = await source("../app/admin/SystemPreferences.tsx");
  const collapsible = await source("../app/admin/AdminCollapsibleSection.tsx");

  assert.match(preferences, /Cookie Consent/);
  assert.match(preferences, /Platform Use &amp; Access Terms/);
  assert.match(preferences, /workspace === "cookie-consent"/);
  assert.match(preferences, /workspace === "platform-terms"/);
  assert.match(preferences, /title="Current Terms Version"/);
  assert.match(preferences, /title="Acceptance Register"/);
  assert.match(preferences, /title="Policy Details"/);
  assert.equal(preferences.match(/indicator="plus-minus"/g)?.length, 4);
  assert.match(collapsible, /defaultOpen = false/);
  assert.match(collapsible, /isOpen \? "−" : "\+"/);
});

test("register is visibly read-only with responsive rows and no export", async () => {
  const preferences = await source("../app/admin/SystemPreferences.tsx");

  assert.match(preferences, /selectedAcceptanceId\s*\?[^:]+register\?\.rows\.find/s);
  assert.match(preferences, /Staff Member/);
  assert.match(preferences, /Role at Acceptance/);
  assert.match(preferences, /Accepted Date \/ Time/);
  assert.match(preferences, /Matching Audit Event ID/);
  assert.match(preferences, /Africa\/Johannesburg/);
  assert.match(preferences, /md:hidden/);
  assert.match(preferences, /hidden overflow-x-auto.*md:block/);
  assert.doesNotMatch(preferences, />\s*(Edit|Delete|Revoke|Reset|Mark Accepted)\s*</i);
  assert.doesNotMatch(preferences, /Export|CSV|XLSX|PDF/);
});

test("policy version display supports future append-only versions", () => {
  assert.equal(getPolicyDisplayVersion("ADMIN-IP-UNDERTAKING-V1"), "V1");
  assert.equal(getPolicyDisplayVersion("ADMIN-IP-UNDERTAKING-V2"), "V2");
});
