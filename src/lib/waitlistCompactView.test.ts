import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Waitlist opens in Compact view and keeps Expanded view available", async () => {
  const page = await source("../app/admin/page.tsx");

  assert.match(
    page,
    /useState<WaitlistViewMode>\("compact"\)/,
  );
  assert.match(page, /\["compact", "expanded"\]/);
  assert.match(page, /setWaitlistViewMode\("compact"\)/);
});

test("Waitlist filters reuse the selected performance and combine with search", async () => {
  const page = await source("../app/admin/page.tsx");

  assert.match(page, /Performance & Venue/);
  assert.match(page, /waitlistStatusFilter/);
  assert.match(page, /waitlistGuestCountFilter/);
  assert.match(page, /waitlistSourceFilter/);
  assert.match(page, /filterWaitlistEntries/);
});

test("compact entries preserve all existing operational actions", async () => {
  const list = await source("../app/admin/WaitlistEntryList.tsx");

  assert.match(list, />Promote<\/button>/);
  assert.match(list, />Convert To Booking<\/button>/);
  assert.match(list, />Remove<\/button>/);
  assert.match(list, /Available Seating/);
  assert.match(list, /aria-expanded=\{isExpanded\}/);
});
