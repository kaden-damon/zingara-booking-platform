import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { canBulkChangeShow, maxBulkAvailabilityShows, parseShowAvailabilityRequest, runShowAvailabilityBatch, visibleShowSelection } from "./showBulkAvailability.ts";

const route = readFileSync("src/app/api/admin/shows/route.ts", "utf8");
const ast = ts.createSourceFile("route.ts", route, ts.ScriptTarget.Latest, true);
function routeFunction(name: string, globals: Record<string, unknown>) {
  const declaration = ast.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(declaration);
  return runInNewContext(ts.transpileModule(declaration.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + `\n${name}`, globals);
}

const request = (shows = [{ id: "a", status: "active" }]) => ({ action: "close", month: "2026-12", venue: "all", shows });
const row = (id: string, status = "active", venue = "cape-town") => ({ id, status, venue, date: "2026-12-10", time: "18:00", updated_at: "revision-1", notes: null, name: id });

function harness(rows = [row("a"), row("b", "inactive")], options: {
  permission?: boolean; scope?: string[]; locks?: string[]; buyouts?: string[];
  fail?: string[]; stale?: string[]; auditFail?: string[];
} = {}) {
  const writes: Array<{ id: string; payload: object }> = [];
  const audits: string[] = [];
  let reads = 0;
  const client = { from(table: string) {
    const filters: Array<[string, unknown]> = [];
    let payload: object | undefined;
    const query = {
      select() { return query; }, gte() { return query; }, lt() { return query; }, limit() { return query; },
      eq(key: string, value: unknown) { filters.push([key, value]); return query; },
      is(key: string, value: unknown) { filters.push([key, value]); return query; },
      in() { return query; },
      update(value: object) { payload = value; return query; },
      async maybeSingle() {
        const id = filters.find(([key]) => key === "id")?.[1] as string;
        if (options.fail?.includes(id)) return { data: null, error: new Error("write failed") };
        if (options.stale?.includes(id)) return { data: null, error: null };
        const current = rows.find((r) => filters.every(([key, value]) => r[key as keyof typeof r] === value));
        if (!current) return { data: null, error: null };
        writes.push({ id, payload: payload! });
        return { data: { ...current, ...payload }, error: null };
      },
      then(resolve: (result: unknown) => unknown) {
        reads += 1;
        return Promise.resolve(resolve({ data: table === "show_edit_locks"
          ? (options.locks ?? []).map((show_reference) => ({ show_reference }))
          : rows.filter((r) => filters.every(([key, value]) => r[key as keyof typeof r] === value)), error: null }));
      },
    };
    return query;
  } };
  const auth = { serviceClient: client, staffProfile: { roles: {}, venue_scope: options.scope ?? ["all"] }, user: {} };
  const apply = routeFunction("changeSelectedShowAvailability", {
    Response, Date, Set, Map, Error,
    getRolePermissions: () => options.permission === false ? [] : ["settings:manage"],
    parseShowAvailabilityRequest, runShowAvailabilityBatch,
    normalizeStaffVenueScope: (scope: string[]) => scope,
    normalizeShowLocation: (location: string) => location,
    getShowReference: (show: { id: string }) => show.id,
    toSupabaseStatus: (status: string) => status,
    toDemoShow: (show: object) => show,
    findDuplicateActiveShow: () => null,
    loadActiveCorporateBuyoutSummaries: async () => new Map((options.buyouts ?? []).map((id) => [id, {}])),
    expireStaleShowLocks: async () => undefined,
    auditAndNotifyShowChange: async (_request: unknown, _auth: unknown, _before: unknown, saved: { id: string }) => {
      if (options.auditFail?.includes(saved.id)) throw new Error("audit unavailable");
      audits.push(saved.id);
    },
  });
  return { writes, audits, reads: () => reads, apply: (input: unknown) => apply(new Request("https://example.test", { method: "PATCH" }), auth, input) as Promise<Response> };
}

test("batch validation bounds input and rejects duplicate, invalid and special-status selections", () => {
  assert.equal(parseShowAvailabilityRequest(request()).shows.length, 1);
  for (const input of [request([]), request(Array.from({ length: maxBulkAvailabilityShows + 1 }, (_, i) => ({ id: String(i), status: "active" }))),
    request([{ id: "a", status: "active" }, { id: "a", status: "active" }]), request([{ id: "a", status: "blackout" }]),
    { ...request(), venue: "other" }, { ...request(), action: "delete" }, { ...request(), month: "2026-13" }]) {
    assert.throws(() => parseShowAvailabilityRequest(input));
  }
});

test("filtered selection never submits hidden or duplicate references; protected states are not selectable", () => {
  assert.deepEqual(visibleShowSelection(["a", "hidden", "a"], ["a", "b"]), ["a"]);
  for (const status of ["sold-out", "blackout", "venue-closure", "special-event"]) assert.equal(canBulkChangeShow({ operationalStatus: status }), false);
  assert.equal(canBulkChangeShow({ operationalStatus: "active", archivedAt: "date" }), false);
  assert.equal(canBulkChangeShow({ operationalStatus: "active", fullShowBuyout: {} }), false);
  assert.equal(canBulkChangeShow({ operationalStatus: "inactive" }), true);
});

test("multiple opening and closing updates only selected statuses and reuses audit handling", async () => {
  for (const action of ["open", "close"]) {
    const status = action === "open" ? "inactive" : "active";
    const h = harness([row("a", status), row("b", status), row("unselected", status)]);
    const response = await h.apply({ ...request([{ id: "a", status }, { id: "b", status }]), action });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.results.filter((r: { success: boolean }) => r.success).length, 2);
    assert.deepEqual(h.writes.map((w) => w.id), ["a", "b"]);
    assert.ok(h.writes.every((w) => JSON.stringify(w.payload) === JSON.stringify({ status: action === "open" ? "active" : "inactive" })));
    assert.deepEqual(h.audits, ["a", "b"]);
    assert.equal(h.reads(), 2);
  }
});

test("server permissions fail before database reads and venue scope is enforced", async () => {
  const denied = harness(undefined, { permission: false });
  assert.equal((await denied.apply(request())).status, 403);
  assert.equal(denied.reads(), 0);
  const scoped = harness([row("a", "active", "johannesburg")], { scope: ["cape-town"] });
  const result = await (await scoped.apply(request())).json();
  assert.match(result.results[0].error, /venue scope/);
  assert.equal(scoped.writes.length, 0);
  const filtered = harness([row("a", "active", "johannesburg")]);
  const hidden = await (await filtered.apply({ ...request(), venue: "cape-town" })).json();
  assert.match(hidden.results[0].error, /selected month and venue/);
  assert.equal(filtered.writes.length, 0);
});

test("partial failures preserve successful shows, locks, special states and stale revisions", async () => {
  const rows = [row("ok"), row("locked"), row("sold", "sold_out"), row("buyout"), row("stale"), row("fail")];
  const h = harness(rows, { locks: ["locked"], buyouts: ["buyout"], stale: ["stale"], fail: ["fail"] });
  const data = await (await h.apply(request(rows.map((r) => ({ id: r.id, status: "active" }))))).json();
  assert.equal(data.results.filter((r: { success: boolean }) => r.success).length, 1);
  assert.deepEqual(h.writes.map((w) => w.id), ["ok"]);
  assert.equal(data.results.length, 6);
});

test("out-of-view and changed statuses cannot write; already-matching actions do not rewrite", async () => {
  const h = harness([row("a", "inactive")]);
  const data = await (await h.apply(request([{ id: "a", status: "active" }, { id: "hidden", status: "active" }]))).json();
  assert.ok(data.results.every((r: { success: boolean }) => !r.success));
  assert.equal(h.writes.length, 0);
  assert.equal((await (await h.apply(request([{ id: "a", status: "inactive" }]))).json()).results[0].success, true);
  assert.equal(h.writes.length, 0);
});

test("audit failure after a successful write reports saved status with a warning, never a false unsaved result", async () => {
  const h = harness([row("a")], { auditFail: ["a"] });
  const result = (await (await h.apply(request())).json()).results[0];
  assert.equal(result.success, true);
  assert.equal(result.status, "inactive");
  assert.match(result.warning, /audit/);
});

test("batch processing limits concurrency and does not retry failures", async () => {
  let active = 0;
  let peak = 0;
  let calls = 0;
  const results = await runShowAvailabilityBatch(Array.from({ length: 11 }, (_, i) => ({ id: String(i), status: "active" })), async (show) => {
    calls += 1; active += 1; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1)); active -= 1;
    if (show.id === "2") throw new Error("failure");
    return { id: show.id, success: true, status: "inactive" };
  });
  assert.equal(peak, 4); assert.equal(calls, 11); assert.equal(results.length, 11);
  assert.equal(results[2].success, false);
});

test("individual PATCH retains lock, duplicate and audit paths; bulk stays on the existing API", () => {
  const patch = route.slice(route.indexOf("export async function PATCH"));
  for (const code of ["ensureNoConflictingShowLocks", "findDuplicateActiveShow", "toSupabaseShow(show)", "auditAndNotifyShowChange", "loadShowCustomPricingMap"]) assert.ok(patch.includes(code));
  const admin = readFileSync("src/app/admin/page.tsx", "utf8");
  assert.match(admin, /window\.confirm\(`\$\{action === "open"/);
  assert.match(admin, /setBulkAvailabilitySelection\(\[\]\)/);
  assert.match(admin, /setShows\(\(current\) => current\.map/);
});

test("single and bulk show changes share the same per-show audit and deferred Wallet behaviour", async () => {
  const audit: Array<{ action: string; changedFields: string[] }> = [];
  const deferred: Array<() => Promise<void>> = [];
  const notified: string[] = [];
  const notify = routeFunction("auditAndNotifyShowChange", {
    diffAuditFields: (before: { status: string }, after: { status: string }) => ({
      changedFields: before.status === after.status ? [] : ["status"], beforeValues: {}, afterValues: {},
    }),
    showAuditFields: ["status"],
    normalizeShowLocation: (value: string) => value,
    getShowReference: (show: { id: string }) => show.id,
    recordAuditEvent: async (_client: unknown, _staff: unknown, _user: unknown, entry: typeof audit[number]) => { audit.push(entry); },
    after: (work: () => Promise<void>) => deferred.push(work),
    notifyAppleWalletShow: async (_client: unknown, id: string) => { notified.push(id); },
  });
  const auth = { serviceClient: {}, staffProfile: {}, user: {} };
  await notify(new Request("https://example.test"), auth, row("a"), row("a", "inactive"));
  assert.equal(audit.length, 1); assert.equal(audit[0].action, "show.edit");
  assert.equal(deferred.length, 1); assert.deepEqual(notified, []);
  await deferred[0](); assert.deepEqual(notified, ["a"]);
  await notify(new Request("https://example.test"), auth, row("a"), row("a"));
  assert.equal(audit.length, 1); assert.equal(deferred.length, 1);
});
