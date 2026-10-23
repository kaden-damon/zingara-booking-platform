import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminPageUrl = new URL("../app/admin/page.tsx", import.meta.url);

test("large local searches defer result work without changing controlled inputs", async () => {
  const source = await readFile(adminPageUrl, "utf8");

  assert.match(source, /useDeferredValue/);
  assert.match(
    source,
    /const deferredCorporateSearch = useDeferredValue\(corporateSearch\)/,
  );
  assert.match(source, /value=\{corporateSearch\}/);
});

test("calendar shows are indexed once rather than filtered for every day", async () => {
  const source = await readFile(adminPageUrl, "utf8");

  assert.match(source, /const showCalendarShowsByDay = useMemo/);
  assert.match(source, /showsByDay\.set\(day, \[show\]\)/);
  assert.match(source, /showCalendarShowsByDay\.get\(day\) \?\? \[\]/);
  assert.doesNotMatch(
    source,
    /const getCalendarShowsForDay = \(day: number\) =>\s*visibleShowCalendarShows\.filter/,
  );
});

test("inactive workspaces do not prepare Academy or operational summaries", async () => {
  const source = await readFile(adminPageUrl, "utf8");

  assert.match(
    source,
    /activeAdminTab === "academy" && academyWorkspace === "learning"/,
  );
  assert.match(
    source,
    /activeAdminTab === "overview" \|\| activeAdminTab === "operations"/,
  );
  assert.match(source, /if \(activeAdminTab !== "operations"\)/);
  assert.match(source, /activeAdminTab === "communications"\s*\? shows\.filter/);
});

test("authoritative lock and server booking search safeguards remain intact", async () => {
  const source = await readFile(adminPageUrl, "utf8");

  assert.match(source, /heartbeatBookingEditLock/);
  assert.match(source, /heartbeatShowEditLock/);
  assert.match(source, /bookingSearch\.trim\(\) \? 300 : 0/);
  assert.match(source, /void loadBookingList\(\)/);
});
