import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  new URL("../app/api/admin/dineplan-reconciliation/route.ts", import.meta.url),
  "utf8",
);
const component = readFileSync(
  new URL("../app/admin/DineplanReconciliation.tsx", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../../supabase/migrations/20260924090000_phase_41_2w_dineplan_reconciliation.sql", import.meta.url),
  "utf8",
);
const adminPage = readFileSync(
  new URL("../app/admin/page.tsx", import.meta.url),
  "utf8",
);
const actionRoute = readFileSync(
  new URL("../app/api/admin/dineplan-reconciliation/actions/route.ts", import.meta.url),
  "utf8",
);
const actionStore = readFileSync(
  new URL("./dineplanActionStore.ts", import.meta.url),
  "utf8",
);
const actionEngine = readFileSync(
  new URL("./dineplanActions.ts", import.meta.url),
  "utf8",
);
const digestWorkflow = readFileSync(
  new URL("./workflows/dineplanActionDigest.ts", import.meta.url),
  "utf8",
);
const workflowRoute = readFileSync(
  new URL("../app/api/workflows/run/route.ts", import.meta.url),
  "utf8",
);
const smtp = readFileSync(new URL("./email/smtp.ts", import.meta.url), "utf8");
const emailTemplate = readFileSync(new URL("./email/customerEmail.ts", import.meta.url), "utf8");

test("reconciliation route is permission protected and has no booking mutation path", () => {
  assert.match(route, /requireActiveStaff/);
  assert.match(route, /bookings:reconcile/);
  assert.match(route, /settings:manage/);
  assert.doesNotMatch(route, /from\("bookings"\)[\s\S]{0,120}\.(?:insert|update|delete|upsert)\(/);
  assert.doesNotMatch(route, /from\("payments"\)[\s\S]{0,120}\.(?:insert|update|delete|upsert)\(/);
  assert.doesNotMatch(route, /from\("show_tables"\)[\s\S]{0,120}\.(?:insert|update|delete|upsert)\(/);
  assert.doesNotMatch(route, /from\("tickets"\)[\s\S]{0,120}\.(?:insert|update|delete|upsert)\(/);
});

test("selected-show evidence is bulk loaded without per-reservation HTTP calls", () => {
  assert.equal((route.match(/\.from\("bookings"\)/g) ?? []).length, 1);
  assert.match(route, /Promise\.all\(\[/);
  assert.doesNotMatch(route, /for \([^)]*reservation[^)]*\)[\s\S]{0,200}(?:fetch|\.from\()/i);
  assert.doesNotMatch(component, /setInterval|polling/i);
});

test("snapshots are private, bounded and deduplicated by checksum", () => {
  assert.match(migration, /checksum text not null unique/);
  assert.match(migration, /file_size bigint[^;]+10485760/s);
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /revoke all[^;]+from anon, authenticated/gs);
  assert.doesNotMatch(migration, /storage\.buckets|storage_path|binary|bytea/i);
});

test("performance candidates stay bounded and duplicate previews refresh metadata only", () => {
  assert.match(route, /\.eq\("date", snapshot\.performanceDate\)/);
  assert.match(route, /query = query\.eq\("time", snapshot\.performanceTime\)/);
  assert.match(route, /query = query\.ilike\("venue"/);
  assert.match(route, /existing\.status === "preview"/);
  assert.match(route, /source_generated_at: snapshot\.generatedAt/);
  assert.match(route, /performance_date: snapshot\.performanceDate/);
  assert.match(route, /return Response\.json\(\{ duplicate: true, shows, snapshot: resolvedSnapshot \}\)/);
  assert.match(route, /action !== "reconcile" \|\| !body\.snapshotId \|\| !body\.showId/);
});

test("review metadata is isolated from booking lifecycle and the System tab is lazy", () => {
  assert.match(migration, /dineplan_reconciliation_reviews/);
  assert.match(component, /Authoritative booking data remains unchanged/);
  assert.match(adminPage, /activeSystemTab === "dineplan"/);
  assert.doesNotMatch(adminPage, /refreshDineplan|loadDineplan/);
  assert.match(component, /\/admin\?section=bookings&booking=/);
  assert.match(route, /action !== "reconcile" \|\| !body\.snapshotId \|\| !body\.showId/);
});

test("next 30 days aggregates only uploaded reconciliation snapshots", () => {
  assert.match(route, /searchParams\.get\("scope"\) === "next30"/);
  assert.match(route, /dineplan_reconciliation_snapshots/);
  assert.match(component, /Uploaded and reconciled snapshots only/);
  assert.doesNotMatch(component, /setInterval|EventSource|WebSocket/);
});

test("Stage 1 source contains no credential or scraping implementation", () => {
  const combined = `${route}\n${component}\n${actionRoute}\n${digestWorkflow}`;
  assert.doesNotMatch(combined, /dineplan_(?:password|username)|puppeteer|playwright|selenium|scrape/i);
  assert.doesNotMatch(combined, /automatic login/i);
});

test("Action Centre is authenticated, venue scoped and cannot mutate bookings", () => {
  assert.match(actionRoute, /requireActiveStaff/);
  assert.match(actionRoute, /canReceiveDineplanVenue/);
  assert.match(digestWorkflow, /routeDineplanDigestAudiences/);
  assert.match(actionRoute, /dineplan_reconciliation_snapshots/);
  assert.match(actionRoute, /order\("source_generated_at"/);
  assert.match(actionRoute, /bookings:reconcile/);
  assert.doesNotMatch(`${actionRoute}\n${actionStore}`, /from\("(bookings|payments|show_tables|tickets|shows)"\)[\s\S]{0,140}\.(?:insert|update|delete|upsert)\(/);
  assert.doesNotMatch(actionRoute, /export async function GET[\s\S]*sendZingaraEmail/);
});

test("acknowledgement and no-action dispositions only update reconciliation metadata", () => {
  assert.match(actionRoute, /action === "acknowledge"/);
  assert.match(actionRoute, /action === "no_action"/);
  assert.match(actionRoute, /A later reconciliation snapshot has already resolved this action/);
  assert.match(actionStore, /resolved_by_reconciliation/);
  assert.match(actionEngine, /materially_changed/);
});

test("recipient settings accept active staff identities only and default disabled", () => {
  assert.match(actionRoute, /from\("staff_profiles"\)/);
  assert.match(actionRoute, /\.eq\("active", true\)/);
  assert.match(actionRoute, /settings:manage/);
  assert.doesNotMatch(actionRoute, /from\("customers"\)/);
  assert.match(migration, /hourly_reminders_enabled boolean not null default false/);
  assert.match(migration, /action_recipient_staff_ids uuid\[\]/);
  assert.match(migration, /corporate_recipient_staff_ids uuid\[\]/);
  for (const email of [
    "fatima@zingara.co.za", "jacques@zingara.co.za", "retha@zingara.co.za", "sharonricketts@zingara.co.za",
    "michael@zingara.co.za", "lisa@zingara.co.za", "aswin@zingara.co.za", "tracy@zingara.co.za",
    "nicky-annedebeer@zingara.co.za", "marvin@zingara.co.za", "kaden@kaden.co.za",
  ]) assert.match(migration, new RegExp(email.replace(".", "\\.")));
  assert.doesNotMatch(migration, /mervin@/i);
});

test("recipient roles stay configurable and Corporate routing is server enforced", () => {
  assert.match(actionRoute, /corporateRecipientStaffIds/);
  assert.match(actionRoute, /corporate_recipient_staff_ids/);
  assert.match(actionRoute, /Choose either General or Corporate only/);
  assert.match(digestWorkflow, /routeDineplanDigestAudiences/);
  assert.match(actionEngine, /bookingKind === "corporate"/);
  assert.doesNotMatch(digestWorkflow, /michael@zingara|lisa@zingara/i);
});

test("Action Digest reuses the authoritative Zingara HTML shell and CTA styling", () => {
  assert.match(digestWorkflow, /createBrandedCustomerEmail/);
  assert.match(digestWorkflow, /includeAgePolicy: false/);
  assert.match(digestWorkflow, /attachments: branded\.attachments/);
  assert.match(actionEngine, /createZingaraEmailCta/);
  assert.match(emailTemplate, /data-zingara-customer-email/);
  assert.match(emailTemplate, /ZINGARA/);
  assert.match(emailTemplate, /House of Zingara\. All rights reserved/);
  assert.match(emailTemplate, /background:#d8c36a/);
  assert.doesNotMatch(digestWorkflow, /<!doctype html>|<html lang=/);
});

test("digest preview cannot send and scheduler reuses the existing hourly runner", () => {
  assert.match(actionRoute, /preview=1|searchParams\.get\("preview"\)/);
  assert.doesNotMatch(actionRoute, /sendZingaraEmail/);
  assert.match(workflowRoute, /runDineplanActionDigest/);
  assert.match(digestWorkflow, /sendZingaraEmail/);
  assert.match(smtp, /cc: cc \?\? undefined/);
});

test("hourly action job claims stored actions and never reruns reconciliation", () => {
  assert.match(digestWorkflow, /claim_due_dineplan_reconciliation_actions/);
  assert.doesNotMatch(digestWorkflow, /reconcileDineplanSnapshot|normalized_reservations|dineplan_reconciliation_snapshots/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /notification_claimed_at/);
});

test("provider outcome integrity records sent only after acceptance", () => {
  const sendIndex = digestWorkflow.indexOf("await sendZingaraEmail");
  const sentIndex = digestWorkflow.indexOf('status: "sent"');
  assert.ok(sendIndex >= 0 && sentIndex > sendIndex);
  assert.match(digestWorkflow, /if \(!result\.ok\)/);
  assert.match(digestWorkflow, /status: "failed"/);
  assert.match(digestWorkflow, /notification_claimed_at: null/);
});

test("action state is stable and immutable history is retained", () => {
  assert.match(migration, /action_key text not null unique/);
  assert.match(migration, /dineplan_reconciliation_action_events/);
  assert.match(migration, /resolved_by_snapshot_id/);
  assert.match(migration, /grant select, insert on public\.dineplan_reconciliation_action_events/);
  assert.doesNotMatch(migration, /grant[^;]+update[^;]+dineplan_reconciliation_action_events/i);
});
