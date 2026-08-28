import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedRefundStaffProfileIds,
  canProcessRefund,
} from "./refundAuthorization.ts";

const oldKadenTestProfileId = "47e832a4-76e4-4fc2-b4f9-f554b8d0f31a";

test("allows the two approved active finance staff profiles", () => {
  assert.equal(
    canProcessRefund(
      { active: true, id: approvedRefundStaffProfileIds.kaden },
      true,
    ),
    true,
  );
  assert.equal(
    canProcessRefund(
      { active: true, id: approvedRefundStaffProfileIds.wagheedaAbrahams },
      true,
    ),
    true,
  );
});

test("denies another Super Admin profile", () => {
  assert.equal(
    canProcessRefund(
      { active: true, id: "00000000-0000-4000-8000-000000000001" },
      true,
    ),
    false,
  );
});

test("denies the old Kaden test profile", () => {
  assert.equal(
    canProcessRefund({ active: true, id: oldKadenTestProfileId }, true),
    false,
  );
});

test("denies normal staff even when the profile ID is approved", () => {
  assert.equal(
    canProcessRefund(
      { active: true, id: approvedRefundStaffProfileIds.kaden },
      false,
    ),
    false,
  );
});

test("denies inactive or missing staff profiles", () => {
  assert.equal(
    canProcessRefund(
      { active: false, id: approvedRefundStaffProfileIds.kaden },
      true,
    ),
    false,
  );
  assert.equal(canProcessRefund(null, true), false);
});
