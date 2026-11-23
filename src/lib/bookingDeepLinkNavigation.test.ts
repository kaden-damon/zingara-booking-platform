import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { runInNewContext } from "node:vm";

const source = fs.readFileSync("src/app/admin/page.tsx", "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map<string, string>();
let floorHref = "";
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name && ["handleAdminDeepLink", "handleServiceWorkerMessage", "selectFloorEditingShow", "selectBookingShow"].includes(node.name.text)) functions.set(node.name.text, node.getText(ast));
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === "a" && node.children.some((child) => ts.isJsxText(child) && child.text.trim() === "Open Floor")) {
    const href = node.openingElement.attributes.properties.find((prop) => ts.isJsxAttribute(prop) && prop.name.getText(ast) === "href") as ts.JsxAttribute;
    floorHref = (href.initializer as ts.JsxExpression).expression!.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);

const shows = [
  { id: "jhb-dec-2-evening", supabaseId: "db-jhb-dec-2-evening", date: "2026-12-02", time: "18:00", location: "johannesburg" },
  { id: "cpt-dec-2-evening", supabaseId: "db-cpt-dec-2-evening", date: "2026-12-02", time: "18:00", location: "cape-town" },
  { id: "jhb-dec-2-lunch", supabaseId: "db-jhb-dec-2-lunch", date: "2026-12-02", time: "12:00", location: "johannesburg" },
];

function fixture(loadedShows = shows, permitted = ["cape-town", "johannesburg"]) {
  const state: Record<string, unknown> = { selectedShowId: "stale-nov-24", activeAdminTab: "analytics", activeOperationsTab: "daily-booking-manifest", manifestLocationFilter: "cape-town", bookingSearch: "stale", bookingShowFilter: "old-show", bookingDateFilter: "2026-11-24", bookingLocationFilter: "cape-town", bookingPerformanceFrom: "2026-11-24", bookingPerformanceTo: "2026-11-24" };
  const ref = { current: "" };
  const setters = Object.fromEntries([...source.matchAll(/\b(set[A-Z]\w*)\(/g)].map((match) => [match[1], (value: unknown) => { const name = match[1].slice(3); state[name[0].toLowerCase() + name.slice(1)] = value; }]));
  const context = { ...setters, URL, encodeURIComponent, console, staff: { role: "super-admin" }, waitlist: [], permittedManifestLocations: permitted,
    handledAdminDeepLinkRef: ref,
    window: { location: { href: "https://example.test/admin", origin: "https://example.test", pathname: "/admin", search: "" }, history: { pushState() {} } },
    getShowByIdentity: (id: string) => loadedShows.find((show) => show.id === id || show.supabaseId === id),
    normalizeShowLocation: (location: string) => location,
    getBlankMergeSelections: () => ({}),
    handle: undefined as unknown as (url: string) => void,
    notification: undefined as unknown as (event: unknown) => void,
  };
  const code = [...functions.values()].join("\n") + "\nhandle=handleAdminDeepLink;notification=handleServiceWorkerMessage;";
  runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { state, ref, context, handle: context.handle, notification: context.notification };
}

test("Open Floor carries the booking's exact show identity, not today's date or current selection", () => {
  assert.ok(floorHref);
  const href = new Function("booking", `return ${floorHref}`)({ showId: "db-jhb-dec-2-evening", reference: "ZNG-X94SUT" });
  assert.equal(href, "/admin?section=floor&show=db-jhb-dec-2-evening");
});

test("floor links select exact venue, date and performance despite stale state", () => {
  for (const show of shows) {
    const f = fixture();
    f.handle(`https://example.test/admin?section=floor&show=${show.supabaseId}`);
    assert.equal(f.state.selectedShowId, show.id);
    assert.equal(f.state.manifestLocationFilter, show.location);
    assert.equal(f.state.activeAdminTab, "operations");
    assert.equal(f.state.activeOperationsTab, "floor");
    assert.equal(f.state.expandedTableId, "");
  }
});

test("show links wait for existing hydration, reject unavailable/restricted shows and never substitute a show", () => {
  const loaded: typeof shows = [];
  const f = fixture(loaded);
  f.handle("/admin?section=floor&show=db-jhb-dec-2-evening");
  assert.equal(f.ref.current, "");
  assert.equal(f.state.selectedShowId, "stale-nov-24");
  loaded.push(...shows);
  f.handle("/admin?section=floor&show=db-jhb-dec-2-evening");
  assert.equal(f.state.selectedShowId, "jhb-dec-2-evening");
  const restricted = fixture(shows, ["cape-town"]);
  restricted.handle("/admin?section=floor&show=db-jhb-dec-2-evening");
  assert.equal(restricted.state.activeAdminTab, "analytics");
  assert.match(source, /\}, \[currentStaff, waitlist, shows\]\)/);
});

test("booking show links clear conflicting search, venue and date filters", () => {
  const f = fixture();
  f.handle("/admin?section=bookings&show=db-jhb-dec-2-evening");
  assert.equal(f.state.activeAdminTab, "bookings");
  assert.equal(f.state.bookingShowFilter, "db-jhb-dec-2-evening");
  assert.equal(f.state.bookingSearch, "");
  assert.equal(f.state.bookingDateFilter, "all");
  assert.equal(f.state.bookingLocationFilter, "all");
  assert.equal(f.state.bookingPerformanceFrom, "");
  assert.equal(f.state.bookingPerformanceTo, "");
});

test("notifications can reopen the same intended show after staff navigate elsewhere", () => {
  const f = fixture();
  const event = { data: { type: "ZINGARA_NOTIFICATION_NAVIGATE", url: "/admin?section=floor&show=db-jhb-dec-2-evening" } };
  f.notification(event);
  f.state.selectedShowId = "stale-nov-24";
  f.state.activeAdminTab = "bookings";
  f.notification(event);
  assert.equal(f.state.selectedShowId, "jhb-dec-2-evening");
  assert.equal(f.state.activeAdminTab, "operations");
});

test("other existing booking/accounting links retain their destination and generic Floor links remain supported", () => {
  const f = fixture();
  f.handle("/admin?section=bookings&booking=ZNG-X94SUT");
  assert.equal(f.state.bookingSearch, "ZNG-X94SUT");
  f.handle("/admin?section=xero&booking=ZNG-X94SUT");
  assert.equal(f.state.activeAdminTab, "xero");
  f.handle("/admin?section=floor");
  assert.equal(f.state.activeOperationsTab, "floor");
  assert.doesNotMatch(functions.get("handleAdminDeepLink")!, /fetch|getBookings|getShows|supabase/i);
});
