import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { adminIpUndertaking } from "./adminIpUndertaking.ts";
import { platformOwner, platformVersion } from "./platformIdentity.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Version 1.0 platform terms are authoritative and neutral", () => {
  assert.equal(platformVersion, "1.0");
  assert.equal(platformOwner, "Kaden Damon (Pty) Ltd");
  assert.equal(adminIpUndertaking.title, "Platform Use & Access Terms");
  assert.equal(adminIpUndertaking.version, "ADMIN-IP-UNDERTAKING-V1");
  assert.match(adminIpUndertaking.checkboxLabel, /read, understand and agree/);
});

test("Admin guard fails closed until the current server policy is accepted", async () => {
  const guard = await source("./supabase/serverAdmin.ts");
  const activeCheck = guard.indexOf("if (!staffProfile?.active)");
  const acceptanceCheck = guard.indexOf('.from("admin_policy_acceptances")');

  assert.ok(activeCheck >= 0 && activeCheck < acceptanceCheck);
  assert.match(guard, /options\.requireIpUndertaking !== false/);
  assert.match(guard, /adminIpUndertaking\.version/);
  assert.match(guard, /ADMIN_IP_UNDERTAKING_REQUIRED/);
  assert.match(guard, /status: 428/);
  assert.match(guard, /status: 503/);
});

test("acceptance endpoint binds evidence to the authenticated active staff identity", async () => {
  const route = await source("../app/api/admin/ip-undertaking/route.ts");

  assert.match(route, /requireActiveStaff\(request, \{ requireIpUndertaking: false \}\)/);
  assert.match(route, /body\?\.accepted !== true/);
  assert.match(route, /body\.version !== adminIpUndertaking\.version/);
  assert.match(route, /staff_profile_id: auth\.staffProfile\.id/);
  assert.match(route, /actor_auth_user_id: auth\.user\.id/);
  assert.doesNotMatch(route, /body\.(staff|user|profile)/);
});

test("acceptance storage is versioned, append-only and atomically audited", async () => {
  const migration = await source(
    "../../supabase/migrations/20260908120000_phase_41_1e_admin_ip_undertaking.sql",
  );

  assert.match(migration, /unique \(actor_auth_user_id, policy_key, policy_version\)/);
  assert.match(migration, /accepted_at timestamptz not null default now\(\)/);
  assert.match(migration, /admin_policy_acceptances are append-only/);
  assert.match(migration, /after insert on public\.admin_policy_acceptances/);
  assert.match(migration, /'admin\.ip-undertaking\.accepted'/);
  assert.match(migration, /revoke all on public\.admin_policy_acceptances from public, anon, authenticated/);
  assert.match(migration, /grant select, insert on public\.admin_policy_acceptances to service_role/);
});

test("blocking modal requires an unchecked acknowledgement and has no dismissal bypass", async () => {
  const gate = await source("../app/admin/AdminIpUndertakingGate.tsx");

  assert.match(gate, /useState\(false\)/);
  assert.match(gate, /disabled=\{!accepted \|\| isLoading \|\| isSubmitting\}/);
  assert.match(gate, /Accept & Continue/);
  assert.match(gate, /View Full Terms/);
  assert.match(gate, /aria-modal="true"/);
  assert.doesNotMatch(gate, /onClose|Close|Dismiss/);
  assert.doesNotMatch(gate, /Kaden Damon/);
  assert.doesNotMatch(gate, /competitor|Dineplan|restraint of trade/i);
});

test("Admin loads current acceptance before dashboard datasets", async () => {
  const page = await source("../app/admin/page.tsx");
  const apiClient = await source("./supabase/apiClient.ts");
  const undertakingCheck = page.indexOf('"/api/admin/ip-undertaking"');
  const customerLoad = page.indexOf("const customerRecordsRequest = refreshLiveCustomerRecords()", undertakingCheck);

  assert.ok(undertakingCheck >= 0 && undertakingCheck < customerLoad);
  assert.match(page, /adminUndertakingState !== "accepted"/);
  assert.match(page, /<AdminIpUndertakingGate/);
  assert.match(page, /adminIpUndertakingRequiredEvent/);
  assert.match(apiClient, /response\.status === 428/);
  assert.match(apiClient, /ADMIN_IP_UNDERTAKING_REQUIRED/);
});

test("full terms retain ownership, confidentiality and lawful-skills boundaries", async () => {
  const terms = await source("./royalDecrees.ts");

  assert.match(terms, /Intellectual Property, Confidentiality & Authorised Use/);
  assert.match(terms, /owned by Kaden Damon \(Pty\) Ltd/);
  assert.match(terms, /business records and customer data remain distinct/);
  assert.match(terms, /must not disclose, copy, extract/);
  assert.match(terms, /continue after access ends/);
  assert.match(terms, /general skills, experience or information that is genuinely public/);
  assert.doesNotMatch(terms, /Licensed to Zingara|Licence Active|License Active|Licence Expiry|License Expiry/);
});

test("broad Admin portability and management exports fail closed", async () => {
  const portability = await source("../app/api/admin/data-portability/imports/route.ts");
  const managementExport = await source(
    "../app/api/admin/analytics/management/export/route.ts",
  );
  const page = await source("../app/admin/page.tsx");

  assert.match(portability, /Admin Data Portability access is disabled/);
  assert.match(managementExport, /Management data export is disabled/);
  assert.match(managementExport, /status: 403/);
  assert.doesNotMatch(
    page.match(/const settingsTabs[\s\S]*?\];/)?.[0] ?? "",
    /portability/i,
  );
  assert.doesNotMatch(
    page.match(/\[\s*\["dashboard", "Dashboard"[\s\S]*?as Array<\[OperationsTab/)?.[0] ?? "",
    /export-centre/,
  );
});

test("minimum operational documents remain permissioned and audited", async () => {
  const page = await source("../app/admin/page.tsx");
  const tablePlan = await source("../app/api/admin/analytics/table-plan/route.ts");
  const reportAudit = await source("./supabase/reportGenerationLockServer.ts");

  assert.match(page, /Daily Manifest/);
  assert.match(page, /Floor Manifest/);
  assert.match(page, /Check-In/);
  assert.match(tablePlan, /Table Plan Workbook/);
  assert.match(tablePlan, /requireActiveStaff\(request\)/);
  assert.match(reportAudit, /analytics\.report_generation_started/);
  assert.match(reportAudit, /analytics\.report_generation_completed/);
});

test("System Status uses authoritative Version 1.0 and discreet owner metadata", async () => {
  const status = await source("../app/api/admin/system-status/route.ts");
  const page = await source("../app/admin/page.tsx");

  assert.match(status, /platformOwner/);
  assert.match(status, /platformVersion/);
  assert.match(page, /\["Platform Owner", systemStatus\.platform\.platformOwner\]/);
  assert.doesNotMatch(status, /1\.0 RC/);
  assert.doesNotMatch(page, /Zingara Version 1\.0 RC/);
});
