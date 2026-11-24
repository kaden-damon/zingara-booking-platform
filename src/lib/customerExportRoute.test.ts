import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as policy from "./customerExport.ts";
import * as csv from "./exports/csv.ts";
import { buildTabularWorkbook } from "./exports/bookingsWorkbook.ts";

test("actual export POST enforces auth/field/scope validation and returns private CSV/XLSX without customer writes", async () => {
  let permissions = ["bookings:manage", "crm:read", "communications:manage"];
  let scope = ["all"], authenticated = true, loads = 0, audits = 0;
  const source = readFileSync(new URL("../app/api/admin/customer-management/route.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const modules: Record<string, unknown> = {
    "@/lib/auditTrail": { getActorRoleLabel: () => "Authorised staff" },
    "@/lib/phone": {},
    "@/lib/customerExport": policy,
    "@/lib/supabase/serverAdmin": {
      requireActiveStaff: async () => authenticated ? { serviceClient: {}, staffProfile: { full_name: "Synthetic staff", roles: { name: "Test" }, venue_scope: scope }, user: { id: "test" }, error: null } : { error: Response.json({ error: "Unauthorized" }, { status: 401 }) },
      getRolePermissions: () => permissions,
    },
    "@/lib/supabase/customerExportServer": { loadCustomerExportRows: async (_: unknown, options: policy.CustomerExportOptions, venues: string[]) => {
      loads++; policy.customerExportVenues(venues, options.venue);
      if (options.marketing) throw new policy.CustomerExportError("No verified email-marketing consent.", 404);
      return [{ "Customer name": options.search === "large-fixture" ? "é".repeat(3_000_000) : "Synthetic guest" }];
    } },
    "@/lib/exports/csv": csv,
    "@/lib/exports/bookingsWorkbook": { buildTabularWorkbook },
    "@/lib/supabase/serverAudit": { tryRecordAuditEvent: async () => { audits++; } },
  };
  const exports: { POST?: (r: Request) => Promise<Response> } = {};
  new Function("require", "exports", code)((name: string) => { assert.ok(name in modules, name); return modules[name]; }, exports);
  const options: policy.CustomerExportOptions = { action: "export", columns: ["name"], format: "csv", archived: "active", search: "", venue: "all", from: "", to: "", kind: "all", selectedIds: null, marketing: false };
  const post = (changes = {}) => exports.POST!(new Request("http://localhost/api/admin/customer-management", { method: "POST", body: JSON.stringify({ ...options, ...changes }) }));
  authenticated = false; assert.equal((await post()).status, 401); assert.equal(loads, 0);
  authenticated = true; permissions = ["tickets:validate"]; assert.equal((await post()).status, 403); assert.equal(loads, 0);
  permissions = ["bookings:manage"]; assert.equal((await post({ columns: ["dietary"] })).status, 403);
  assert.equal((await post({ format: "pdf" })).status, 400); assert.equal(loads, 0);
  scope = ["cape-town"]; assert.equal((await post({ venue: "johannesburg" })).status, 403); assert.equal(audits, 0);
  scope = ["all"];
  const result = await post(); assert.equal(result.status, 200);
  assert.equal(result.headers.get("Cache-Control"), "private, no-store"); assert.match(await result.text(), /Customer name\r\nSynthetic guest/);
  const excel = await post({ format: "xlsx" }); assert.equal(excel.status, 200);
  assert.match(excel.headers.get("Content-Type")!, /spreadsheetml/); assert.ok((await excel.arrayBuffer()).byteLength > 1000);
  const large = await post({ search: "large-fixture" });
  assert.equal(large.status, 200); assert.equal((await large.arrayBuffer()).byteLength, 6_000_018);
  permissions = ["bookings:manage", "crm:read", "communications:manage"];
  assert.equal((await post({ marketing: true })).status, 404); assert.equal(audits, 3);
});
