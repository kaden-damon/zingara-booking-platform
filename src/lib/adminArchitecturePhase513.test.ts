import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Academy content remains complete after extraction", async () => {
  const content = await readFile(
    new URL("../app/admin/academyContent.ts", import.meta.url),
    "utf8",
  );

  const moduleInventory = content.match(
    /export const academyModules:[\s\S]*?export const allAcademyModuleIds/,
  )?.[0];
  assert.equal(moduleInventory?.match(/estimatedMinutes:/g)?.length, 15);
  assert.match(content, /id: "creating-a-booking"/);
  assert.match(content, /title: "Creating a Booking"/);
  assert.match(content, /id: "recent-changes"/);
});

test("heavy Admin features remain independently loaded", async () => {
  const page = await readFile(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /void import\("\.\/academyContent"\)/);
  assert.doesNotMatch(page, /import \{[^}]*academyArticles[^}]*\} from "\.\/academyContent"/s);
  assert.match(page, /dynamic\(\(\) =>\s*import\("\.\/CompactBookingList"\)/);
  assert.match(page, /dynamic\(\s*\(\) => import\("\.\/CorporateBookingOperationsPanel"\)/);
  assert.match(page, /dynamic\(\(\) =>\s*import\("\.\/CustomerIdentityEditor"\)/);
  assert.match(page, /dynamic\(\(\) => import\("\.\/ManagementAnalytics"\)\)/);
});

test("active edit heartbeats retain their operational cadence", async () => {
  const page = await readFile(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    page,
    /heartbeatBookingEditLock\([\s\S]*?window\.clearInterval\(timer\)/,
  );
  assert.match(
    page,
    /heartbeatShowEditLock\([\s\S]*?window\.clearInterval\(timer\)/,
  );
  const lockHeartbeatIntervals = page.match(/}, 30000\);/g)?.length ?? 0;
  assert.ok(lockHeartbeatIntervals >= 2);
  assert.match(page, /startVisiblePolling\(refreshBookingEditLocks, 30_000\)/);
  assert.match(page, /startVisiblePolling\(refreshShowEditLocks, 30_000\)/);
});
