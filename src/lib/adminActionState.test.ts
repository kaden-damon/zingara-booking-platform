import assert from "node:assert/strict";
import test from "node:test";

import {
  canStartAdminAction,
  replaceAffectedRecord,
} from "./adminActionState.ts";

test("pending actions reject duplicate submission", () => {
  assert.equal(canStartAdminAction("idle"), true);
  assert.equal(canStartAdminAction("error"), true);
  assert.equal(canStartAdminAction("pending"), false);
});

test("authoritative success replaces only the affected local record", () => {
  const records = [
    { id: "show-a", status: "active" },
    { id: "show-b", status: "active" },
  ];

  assert.deepEqual(
    replaceAffectedRecord(records, { id: "show-b", status: "inactive" }),
    [
      { id: "show-a", status: "active" },
      { id: "show-b", status: "inactive" },
    ],
  );
});
