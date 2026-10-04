import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's built-in TypeScript test runner requires the extension.
import {
  isStaffSessionCurrent,
  staffSessionValidAfterMetadataKey,
} from "./staffSessionCutoff.ts";

function requestWithIssuedAt(issuedAt: number) {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iat: issuedAt })).toString("base64url");
  return new Request("https://book.zingara.co.za/api/admin/staff", {
    headers: { Authorization: `Bearer ${header}.${payload}.signature` },
  });
}

test("staff session cutoff rejects only older staff tokens", () => {
  const user = {
    app_metadata: { [staffSessionValidAfterMetadataKey]: 1_800_000_000 },
  } as never;

  assert.equal(isStaffSessionCurrent(requestWithIssuedAt(1_799_999_999), user), false);
  assert.equal(isStaffSessionCurrent(requestWithIssuedAt(1_800_000_000), user), true);
  assert.equal(isStaffSessionCurrent(requestWithIssuedAt(1_800_000_001), user), true);
});

test("accounts without a staff rollout cutoff are unchanged", () => {
  assert.equal(
    isStaffSessionCurrent(requestWithIssuedAt(1), { app_metadata: {} } as never),
    true,
  );
});
