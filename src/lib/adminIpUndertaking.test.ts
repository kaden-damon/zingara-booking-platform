import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  adminIpUndertaking,
  isCurrentAdminIpUndertakingCheck,
} from "./adminIpUndertaking.ts";
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
  assert.match(gate, /disabled=\{!accepted \|\| isSubmitting\}/);
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
  assert.match(page, /adminUndertakingState === "checking"/);
  assert.match(page, /adminUndertakingState === "required"/);
  assert.match(page, /<AdminIpUndertakingGate/);
  assert.match(page, /adminIpUndertakingRequiredEvent/);
  assert.match(apiClient, /response\.status === 428/);
  assert.match(apiClient, /ADMIN_IP_UNDERTAKING_REQUIRED/);
});

test("gate has only checking, required and accepted states and fails closed", async () => {
  const policy = await source("./adminIpUndertaking.ts");
  const page = await source("../app/admin/page.tsx");
  const stateDeclaration =
    page.match(
      /const \[adminUndertakingState, setAdminUndertakingState\][\s\S]*?useState<AdminIpUndertakingGateState>\("checking"\);/,
    )?.[0] ?? "";
  const checkingRender = page.indexOf(
    'if (adminUndertakingState === "checking")',
  );
  const requiredRender = page.indexOf(
    'if (adminUndertakingState === "required")',
  );
  const adminRender = page.indexOf("if (platformMaintenance.staff.enabled");

  assert.match(policy, /\| "checking"[\s\S]*\| "required"[\s\S]*\| "accepted"/);
  assert.match(stateDeclaration, /\("checking"\)/);
  assert.ok(checkingRender >= 0 && checkingRender < adminRender);
  assert.ok(requiredRender >= 0 && requiredRender < adminRender);
  assert.match(page, /Verifying Platform Access/);
  assert.match(page, /setAdminUndertakingState\("checking"\)/);
  assert.doesNotMatch(stateDeclaration, /idle|loading|error/);
});

test("unresolved or failed status never hydrates privileged datasets", async () => {
  const page = await source("../app/admin/page.tsx");
  const loadStart = page.indexOf("async function loadAdminData");
  const acceptanceFetch = page.indexOf('"/api/admin/ip-undertaking"', loadStart);
  const requiredReturn = page.indexOf(
    'setAdminUndertakingState("required")',
    acceptanceFetch,
  );
  const failureReturn = page.indexOf("return;", page.indexOf("catch (undertakingError)", acceptanceFetch));
  const datasetLoad = page.indexOf(
    "const customerRecordsRequest = refreshLiveCustomerRecords()",
    acceptanceFetch,
  );

  assert.ok(acceptanceFetch >= 0 && acceptanceFetch < datasetLoad);
  assert.ok(requiredReturn >= 0 && requiredReturn < datasetLoad);
  assert.ok(failureReturn >= 0 && failureReturn < datasetLoad);
  assert.match(page, /setAdminUndertakingError\([\s\S]*Platform Use & Access Terms status/);
  assert.match(page, /Retry Verification/);
});

test("acceptance checks are request-sequenced and bound to one staff session", async () => {
  assert.equal(
    isCurrentAdminIpUndertakingCheck({
      checkRequestId: 4,
      currentCheckRequestId: 4,
      currentStaffId: "staff-a",
      staffId: "staff-a",
    }),
    true,
  );
  assert.equal(
    isCurrentAdminIpUndertakingCheck({
      checkRequestId: 3,
      currentCheckRequestId: 4,
      currentStaffId: "staff-a",
      staffId: "staff-a",
    }),
    false,
  );
  assert.equal(
    isCurrentAdminIpUndertakingCheck({
      checkRequestId: 4,
      currentCheckRequestId: 4,
      currentStaffId: "staff-b",
      staffId: "staff-a",
    }),
    false,
  );
});

test("acceptance success is authoritative and failure retains the blocking modal", async () => {
  const page = await source("../app/admin/page.tsx");
  const gate = await source("../app/admin/AdminIpUndertakingGate.tsx");

  assert.match(page, /!acceptance\.accepted/);
  assert.match(page, /acceptance\.version !== adminIpUndertaking\.version/);
  assert.match(page, /catch \(error\)[\s\S]*setAdminUndertakingState\("required"\)/);
  assert.match(gate, /useState\(false\)/);
  assert.match(gate, /disabled=\{!accepted \|\| isSubmitting\}/);
  assert.match(gate, /\{isSubmitting \? "Accepting\.\.\." : "Accept & Continue"\}/);
});

test("status is private no-store and scoped by staff and policy version", async () => {
  const route = await source("../app/api/admin/ip-undertaking/route.ts");
  const guard = await source("./supabase/serverAdmin.ts");
  const apiClient = await source("./supabase/apiClient.ts");

  assert.match(route, /private, no-store, max-age=0/);
  assert.match(route, /Vary: "Authorization"/);
  assert.match(apiClient, /cache: options\.cache/);
  assert.match(guard, /\.eq\("staff_profile_id", staffProfile\.id\)/);
  assert.match(guard, /\.eq\("policy_version", adminIpUndertaking\.version\)/);
});

test("a future policy version necessarily requires a distinct acceptance", async () => {
  const migration = await source(
    "../../supabase/migrations/20260908120000_phase_41_1e_admin_ip_undertaking.sql",
  );
  const guard = await source("./supabase/serverAdmin.ts");

  assert.match(migration, /unique \(actor_auth_user_id, policy_key, policy_version\)/);
  assert.match(guard, /adminIpUndertaking\.version/);
  assert.equal(adminIpUndertaking.version, "ADMIN-IP-UNDERTAKING-V1");
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
