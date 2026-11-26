import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { getStaffIssueResolutionTime, isValidStaffIssueResolutionNotes } from "./staffIssues.ts";
import * as issues from "./staffIssues.ts";
import * as subscriptions from "./email/staffEmailNotifications.ts";
import * as logging from "./email/communicationIdempotency.ts";
import * as branding from "./email/customerEmail.ts";
import * as html from "./email/html.ts";
import * as locations from "./staffLocations.ts";
import * as capture from "./adminIssueCapture.ts";
import * as media from "./staffIssueMedia.ts";
import { getRolePermissions } from "./supabase/serverAdmin.ts";

const sent: Array<Record<string, unknown>> = [];
let smtpFailure = false;
const smtp = { sendZingaraEmail: async (input: Record<string, unknown>) => {
  sent.push(input);
  if (smtpFailure) throw new Error("Uncertain SMTP outcome");
  return { ok: true };
} };
const afterJobs: Array<() => Promise<void>> = [];

const now = "2026-11-26T10:00:00.000Z";
const reporter = { id: "reporter", user_id: "auth-reporter", active: true, email: "reporter@example.invalid", full_name: "Reporter",
  venue_scope: ["cape-town"], roles: { name: "Box Office Staff", role_permissions: [{ permissions: { key: "bookings:manage" } }] } };
const manager = { ...reporter, id: "manager", roles: { name: "Super Admin" } };
let actor: typeof reporter | typeof manager | null = manager;
let database: ReturnType<typeof fixture>;
const auth = {
  getRolePermissions,
  getAdminRoleFromName: (name: string) => name === "Super Admin" ? "super-admin" : "box-office-staff",
  requireActiveStaff: async () => actor ? { staffProfile: actor, serviceClient: database, user: { id: actor.user_id } }
    : { error: Response.json({ error: "Sign in" }, { status: 401 }) },
  getServiceClient: () => database,
};
const audit = {
  diffAuditFields: () => ({ beforeValues: {}, afterValues: {}, changedFields: [] }),
  pickAuditFields: (value: unknown) => value,
  tryRecordAuditEvent: async () => undefined,
};

function load<T>(path: string, modules: Record<string, unknown>): T {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", code)((name: string) => { assert.ok(name in modules, name); return modules[name]; }, exports);
  return exports as T;
}
const notifications = load<typeof import("./staffIssueResolutionNotification.ts")>("./staffIssueResolutionNotification.ts", {
  "@/lib/email/communicationIdempotency": logging, "@/lib/email/customerEmail": branding,
  "@/lib/email/html": html, "@/lib/email/smtp": smtp, "@/lib/email/staffEmailNotifications": subscriptions,
  "@/lib/staffIssues": issues, "@/lib/staffLocations": locations, "@/lib/supabase/serverAdmin": auth,
});
const { buildStaffIssueResolutionContent, resolveStaffIssueAction, runStaffIssueResolutionNotifications } = notifications;
const { PATCH } = load<typeof import("../app/api/admin/issues/route.ts")>("../app/api/admin/issues/route.ts", {
  "next/server": { after: (job: () => Promise<void>) => afterJobs.push(job) },
  "@/lib/adminIssueCapture": capture, "@/lib/staffIssues": issues, "@/lib/staffIssueMedia": media,
  "@/lib/staffIssueNotification": {}, "@/lib/staffIssueResolutionNotification": notifications,
  "@/lib/supabase/serverAdmin": auth, "@/lib/supabase/serverAudit": audit,
});

function fixture() {
  const issue = { id: "issue", ticket_reference: "BUG-FIXTURE", reporter_staff_id: reporter.id,
    category: "booking", priority: "normal", status: "logged", title: "Guest count could not be changed", description: "Original report",
    admin_notes: null, resolution_notes: null, completed_at: null, started_at: null,
    created_at: "2026-11-26T08:36:00.000Z", updated_at: "2026-11-26T08:36:00.000Z",
    metadata: { technicalContext: { bookingReference: "ZNG-FIXTURE" } }, reporter,
  };
  const tables: Record<string, Array<Record<string, unknown>>> = {
    staff_issue_reports: [issue], staff_profiles: [reporter], staff_email_notification_deliveries: [],
    staff_email_subscriptions: [], communication_templates: [], communications: [],
    bookings: [{ booking_reference: "ZNG-FIXTURE", show_id: "show" }],
    shows: [{ id: "show", venue: "Cape Town" }],
  };
  class Query {
    filters: Array<(row: Record<string, unknown>) => boolean> = [];
    values: Record<string, unknown> | null = null;
    insertValues: Record<string, unknown> | null = null;
    table: string;
    constructor(table: string) { this.table = table; }
    select() { return this; }
    eq(key: string, value: unknown) { this.filters.push((row) => row[key] === value); return this; }
    order() { return this; }
    limit() { return this; }
    update(values: Record<string, unknown>) { this.values = values; return this; }
    insert(values: Record<string, unknown>) { this.insertValues = values; return this; }
    async maybeSingle() { const result = await this.execute(); return { ...result, data: result.data[0] ?? null }; }
    then(resolve: (value: unknown) => unknown) { return this.execute().then(resolve); }
    async execute() {
      if (this.insertValues) {
        const row = { ...this.insertValues, id: `log-${tables[this.table].length}` };
        tables[this.table].push(row); return { data: [row], error: null };
      }
      const rows = tables[this.table].filter((row) => this.filters.every((filter) => filter(row)));
      for (const row of rows) if (this.values) {
        const before = structuredClone(row); Object.assign(row, this.values);
        if (this.table === "staff_issue_reports") {
          const metadata = row.metadata as Record<string, unknown>;
          if (row.status === "completed" && before.status !== "completed" && !before.completed_at) {
            row.completed_at = now;
            metadata.verifiedResolution = { createdAt: row.created_at, completedAt: now, title: row.title,
              notes: row.resolution_notes, reporterStaffId: row.reporter_staff_id, technicalContext: metadata.technicalContext };
            tables.staff_email_notification_deliveries.push({ id: "delivery", event_key: row.id, status: "pending", notification_key: "staff-issue-resolution" });
          }
          row.updated_at = now;
        }
      }
      return { data: rows, error: null };
    }
  }
  return {
    tables, issue,
    from: (table: string) => new Query(table),
    rpc: async (_name: string, params: Record<string, unknown>) => {
      const delivery = tables.staff_email_notification_deliveries.find((row) => row.event_key === params.p_event_key && row.status === "pending");
      if (delivery) delivery.status = "processing";
      return { data: delivery?.id ?? null, error: null };
    },
  };
}
function reset() { database = fixture(); sent.length = 0; afterJobs.length = 0; smtpFailure = false; actor = manager; }
async function save(body: Record<string, unknown> = {}) {
  return PATCH(new Request("https://fixture.invalid/api/admin/issues", { method: "PATCH", body: JSON.stringify({ id: "issue", ...body }) }));
}
async function complete() {
  const response = await save({ status: "completed", resolutionVerified: true,
    resolutionNotes: "This issue has been resolved. Please reopen the booking and try again." });
  assert.equal(response.status, 200);
  for (const job of afterJobs.splice(0)) await job();
}

test("elapsed time uses real timestamps without invented historical values", () => {
  assert.equal(getStaffIssueResolutionTime("2026-11-26T08:36:00Z", now), "Resolved in 1 hour 24 minutes");
  assert.equal(getStaffIssueResolutionTime(now, null), null);
  assert.equal(getStaffIssueResolutionTime(now, "invalid"), null);
  assert.equal(getStaffIssueResolutionTime(now, "2026-11-25T10:00:00Z"), null);
  assert.equal(getStaffIssueResolutionTime(now, now), "Resolved in less than a minute");
});
test("reporter notes allow two simple sentences, not technical findings", () => {
  assert.equal(isValidStaffIssueResolutionNotes("Fixed. Please try again."), true);
  for (const value of ["", "First. Second. Third.", "SQL migration fixed the API.", "a".repeat(301)]) assert.equal(isValidStaffIssueResolutionNotes(value), false);
});
test("complete authenticated management save, branded send, log and reopen", async () => {
  reset(); await complete();
  assert.equal(sent.length, 1); assert.equal(sent[0].to, reporter.email);
  assert.equal(sent[0].subject, "BUG-FIXTURE resolved");
  assert.match(String(sent[0].html), /data-zingara-customer-email="true"/);
  assert.match(String(sent[0].html), /Resolved in 1 hour 24 minutes/);
  assert.match(String(sent[0].html), /background:#d8c36a/);
  assert.match(String(sent[0].html), /booking=ZNG-FIXTURE/);
  assert.match(String(sent[0].html), /show=show/);
  assert.doesNotMatch(String(sent[0].html), /section=platform-operations|issue=issue/);
  assert.equal(database.tables.communications[0].status, "sent");
  assert.equal(database.tables.staff_email_notification_deliveries[0].status, "sent");
  assert.equal(database.issue.completed_at, now);
  assert.equal((await (await save({ adminNotes: "Internal verification" })).json()).issue.completedAt, now);
});
test("note edits and worker retries never email twice", async () => {
  reset(); await complete(); await save({ resolutionNotes: "Fixed. Please try again." });
  await runStaffIssueResolutionNotifications(database as never);
  assert.equal(sent.length, 1);
});
test("unverified completion and excessive reporter notes are rejected before saving", async () => {
  reset(); assert.equal((await save({ status: "completed" })).status, 400);
  assert.equal((await save({ resolutionNotes: "One. Two. Three." })).status, 400);
  assert.equal(database.issue.status, "logged"); assert.equal(sent.length, 0);
});
test("existing management permissions remain enforced", async () => {
  reset(); actor = reporter; assert.equal((await save({ status: "completed", resolutionVerified: true })).status, 403);
  actor = null; assert.equal((await save()).status, 401);
});
test("personal opt-out logs suppression and never changes the recipient", async () => {
  reset(); database.tables.staff_email_subscriptions.push({ staff_profile_id: reporter.id, notification_key: "staff-issue-resolution", enabled: false });
  await complete(); assert.equal(sent.length, 0);
  assert.equal(database.tables.communications[0].status, "suppressed");
  assert.equal(database.tables.staff_email_notification_deliveries[0].status, "suppressed");
});
test("disabled managed template suppresses without bypassing existing controls", async () => {
  reset(); database.tables.communication_templates.push({ name: "Staff Issue Resolution", channel: "email", active: false, subject: "Resolved", body: "{{resolution_notes}}" });
  await complete(); assert.equal(sent.length, 0); assert.equal(database.tables.communications[0].status, "suppressed");
});
test("uncertain SMTP failures are recorded, not blindly retried", async () => {
  reset(); smtpFailure = true; await complete(); await runStaffIssueResolutionNotifications(database as never);
  assert.equal(sent.length, 1); assert.equal(database.tables.staff_email_notification_deliveries[0].status, "failed");
});
test("historical completed issues and note edits have no retrospective emails", async () => {
  reset(); database.tables.staff_issue_reports[0].status = "completed"; database.tables.staff_issue_reports[0].completed_at = now;
  await save({ resolutionNotes: "Fixed. Please try again." });
  assert.equal(sent.length, 0); assert.equal(afterJobs.length, 0); assert.equal(database.tables.staff_email_notification_deliveries.length, 0);
});
test("no relevant destination means no primary action, with safe escaped summary", async () => {
  reset(); database.issue.metadata = { technicalContext: {} } as typeof database.issue.metadata;
  await complete(); assert.doesNotMatch(String(sent[0].html), /Open booking|OPEN ISSUE|href="https:\/\/book.zingara.co.za\/admin/);
  const resolution = (database.issue.metadata as Record<string, unknown>).verifiedResolution as Parameters<typeof buildStaffIssueResolutionContent>[0]["resolution"];
  const content = buildStaffIssueResolutionContent({ reference: "BUG-FIXTURE", reporterName: "<script>unsafe</script>", action: null,
    resolution: { ...resolution, title: "<img src=x onerror=alert(1)>" } });
  assert.doesNotMatch(content.html, /<script>|<img/);
});
test("contextual actions respect current permissions, venue scope and exact show", async () => {
  reset(); const resolution = { createdAt: now, completedAt: now, title: "Issue", notes: "Fixed.", reporterStaffId: reporter.id,
    technicalContext: { bookingReference: "ZNG-FIXTURE" } };
  assert.match((await resolveStaffIssueAction(database as never, resolution, reporter as never))!.url, /show=show/);
  database.tables.shows[0].venue = "Johannesburg";
  assert.equal(await resolveStaffIssueAction(database as never, resolution, reporter as never), null);
  database.tables.shows[0].venue = "Cape Town";
  assert.equal(await resolveStaffIssueAction(database as never, resolution, { ...reporter, roles: { name: "Floor Manager", role_permissions: [] } } as never), null);
  for (const adminPath of ["https://evil.invalid/admin?section=customers", "/admin?section=platform-operations&issue=other", "/admin?section=floor"]) {
    assert.equal(await resolveStaffIssueAction(database as never, { ...resolution, technicalContext: { adminPath } }, reporter as never), null);
  }
});

test("floor and customer actions reuse supported sections without stale performance state", async () => {
  reset(); const resolution = { createdAt: now, completedAt: now, title: "Issue", notes: "Fixed.", reporterStaffId: reporter.id };
  const floor = { ...reporter, roles: { name: "Floor Manager", role_permissions: [{ permissions: { key: "tables:manage" } }] } };
  const action = await resolveStaffIssueAction(database as never, { ...resolution, technicalContext: { adminPath: "/admin?section=floor&show=show" } }, floor as never);
  assert.equal(action?.url, "https://book.zingara.co.za/admin?show=show&section=floor");
  assert.equal((await resolveStaffIssueAction(database as never, { ...resolution, technicalContext: { showId: "show" } }, floor as never))?.url, "https://book.zingara.co.za/admin?show=show&section=floor");
  const customerStaff = { ...reporter, roles: { name: "Venue Manager", role_permissions: [{ permissions: { key: "crm:read" } }] } };
  assert.equal((await resolveStaffIssueAction(database as never, { ...resolution, technicalContext: { adminPath: "/admin?section=customers" } }, customerStaff as never))?.label, "Open customers");
});
test("simultaneous dispatchers claim one send only", async () => {
  reset(); const response = await save({ status: "completed", resolutionVerified: true, resolutionNotes: "Fixed. Please try again." });
  assert.equal(response.status, 200);
  await Promise.all([runStaffIssueResolutionNotifications(database as never), runStaffIssueResolutionNotifications(database as never)]);
  assert.equal(sent.length, 1); assert.equal(database.tables.communications.length, 1);
});
test("inactive original reporters do not cause rerouting to another staff member", async () => {
  reset(); database.tables.staff_profiles[0] = { ...reporter, active: false };
  await complete(); assert.equal(sent.length, 0); assert.equal(database.tables.communications[0].status, "suppressed");
});
