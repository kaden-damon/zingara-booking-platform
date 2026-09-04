import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Floor mutations refresh only the selected show booking cohort", async () => {
  const admin = await source("../app/admin/page.tsx");
  const client = await source("./supabase/bookings.ts");
  const route = await source("../app/api/admin/bookings/route.ts");

  assert.match(admin, /getBookings\(\{ showId: authoritativeShowId/);
  assert.doesNotMatch(
    admin.slice(
      admin.indexOf("async function refreshAssignedShowState"),
      admin.indexOf("async function planSelectedInitialFloor"),
    ),
    /getBookings\(\)/,
  );
  assert.match(client, /searchParams\.set\("showId", options\.showId\)/);
  assert.match(route, /query = query\.eq\("show_id", showId\)/);
});

test("Floor assignment and table mutations expose in-flight success states", async () => {
  const admin = await source("../app/admin/page.tsx");

  for (const label of [
    "ASSIGNING...",
    "ASSIGNED ✓",
    "ADDING...",
    "ADDED ✓",
    "SAVING...",
    "SAVED ✓",
    "MERGING...",
    "MERGED ✓",
    "ENABLING...",
    "DISABLING...",
  ]) {
    assert.match(admin, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
