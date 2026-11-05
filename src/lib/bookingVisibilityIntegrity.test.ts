import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("automatic assignment excludes active Full Show Buyouts from its waiting queue", async () => {
  const migration = await source(
    "../../supabase/migrations/20261106013000_p0_booking_visibility_integrity.sql",
  );

  assert.match(
    migration,
    /not exists \(\s*select 1\s*from public\.corporate_buyouts buyout[\s\S]*buyout\.booking_id = booking\.id[\s\S]*buyout\.state in/,
  );
  assert.doesNotMatch(
    migration,
    /(insert into|update|delete from) public\.(bookings|shows|show_tables|corporate_buyouts)/i,
  );
});

test("Floor explains unallocated Buyout guests without assigning them to a zone", async () => {
  const [adminPage, assignmentPanel] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/admin/AutomaticTableAssignmentPanel.tsx"),
  ]);

  assert.match(adminPage, /selectedShow\?\.fullShowBuyout/);
  assert.match(adminPage, /guests await manual section planning/);
  assert.match(adminPage, /Zone totals remain empty until Box Office records the seating plan/);
  assert.match(assignmentPanel, /All eligible bookings have tables/);
});
