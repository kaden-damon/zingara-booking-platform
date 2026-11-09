import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Admin session restoration is bounded and reports upstream failures", () => {
  const auth = readFileSync(
    new URL("./supabase/auth.ts", import.meta.url),
    "utf8",
  );
  const adminPage = readFileSync(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );
  const staffProfiles = readFileSync(
    new URL("./supabase/staffProfiles.ts", import.meta.url),
    "utf8",
  );

  assert.match(auth, /adminAuthTimeoutMs = 12_000/);
  assert.match(auth, /Promise\.race/);
  assert.match(auth, /throwOnError/);
  assert.match(adminPage, /new AbortController\(\)/);
  assert.match(adminPage, /controller\.abort\(\), 12_000/);
  assert.match(adminPage, /Staff authentication is temporarily unavailable/);
  assert.match(staffProfiles, /signal: options\.signal/);
  assert.match(staffProfiles, /if \(options\.throwOnError\)/);
});

