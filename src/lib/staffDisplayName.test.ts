import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's built-in TypeScript test runner requires the extension.
import { resolveStaffDisplayName } from "./staffDisplayName.ts";

test("prefers a human-readable staff name over email", () => {
  assert.equal(
    resolveStaffDisplayName({
      email: "kaden@kaden.co.za",
      full_name: "Kaden Damon",
    }),
    "Kaden Damon",
  );
});

test("uses email only when no usable staff name exists", () => {
  assert.equal(
    resolveStaffDisplayName({
      email: "staff@zingara.co.za",
      full_name: "staff@zingara.co.za",
    }),
    "staff@zingara.co.za",
  );
});

test("preserves the name of an archived historical staff profile", () => {
  assert.equal(
    resolveStaffDisplayName({
      active: false,
      email: "historical@example.com",
      full_name: "Historical Staff",
    }),
    "Historical Staff",
  );
});

test("fails safely when a linked staff profile has no display identity", () => {
  assert.equal(resolveStaffDisplayName({}), "Unknown Staff");
  assert.equal(resolveStaffDisplayName(null), undefined);
});

test("display resolution does not mutate authoritative staff identity", () => {
  const staff = Object.freeze({
    email: "aswin@example.com",
    full_name: "Aswin Lingard",
  });

  assert.equal(resolveStaffDisplayName(staff), "Aswin Lingard");
  assert.deepEqual(staff, {
    email: "aswin@example.com",
    full_name: "Aswin Lingard",
  });
});
