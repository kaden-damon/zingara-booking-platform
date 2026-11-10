import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("legacy Dineplan automation has no live scheduler or Admin entry point", async () => {
  const [admin, workflow] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/api/workflows/run/route.ts"),
  ]);

  assert.doesNotMatch(workflow, /runDineplanScheduledEmails|dineplanScheduledEmails/);
  assert.doesNotMatch(admin, /DineplanReconciliation|id: "dineplan"|setActiveSystemTab\("dineplan"\)/);
});

test("legacy Dineplan APIs fail closed without mutating retained history", async () => {
  const [reconciliation, actions] = await Promise.all([
    source("../app/api/admin/dineplan-reconciliation/route.ts"),
    source("../app/api/admin/dineplan-reconciliation/actions/route.ts"),
  ]);

  assert.match(reconciliation, /export async function GET[\s\S]+retiredWorkflowResponse\(request\)/);
  assert.match(reconciliation, /export async function POST[\s\S]+retiredWorkflowResponse\(request\)/);
  assert.match(reconciliation, /export async function PATCH[\s\S]+retiredWorkflowResponse\(request\)/);
  assert.match(actions, /export async function GET[\s\S]+retiredWorkflowResponse\(request\)/);
  assert.match(actions, /export async function PATCH[\s\S]+retiredWorkflowResponse\(request\)/);
  assert.match(reconciliation, /status: 410/);
  assert.match(actions, /status: 410/);
});
