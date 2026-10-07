import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's built-in TypeScript test runner requires the extension.
import {
  hasAcknowledgedStaffTour,
  latestStaffTourVersion,
  staffTourPages,
} from "./staffOnboarding.ts";

test("staff onboarding is versioned and concise", () => {
  assert.equal(latestStaffTourVersion, "full-show-buyouts-2026-10");
  assert.equal(staffTourPages.length, 7);
  assert.equal(new Set(staffTourPages.map((page) => page.id)).size, 7);
  assert.ok(staffTourPages.every((page) => !("icon" in page)));
  assert.match(staffTourPages.at(-1)?.supporting ?? "", /stay unchanged and need to be moved manually/);
});

test("only the current release acknowledgement suppresses the tour", () => {
  assert.equal(
    hasAcknowledgedStaffTour({
      user_metadata: { zingara_staff_tour_version: latestStaffTourVersion },
    } as never),
    true,
  );
  assert.equal(
    hasAcknowledgedStaffTour({
      user_metadata: { zingara_staff_tour_version: "older-release" },
    } as never),
    false,
  );
  assert.equal(hasAcknowledgedStaffTour(null), false);
});
