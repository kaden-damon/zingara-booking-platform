import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's built-in TypeScript test runner requires the extension.
import {
  hasAcknowledgedStaffTour,
  latestStaffTourVersion,
  staffTourPages,
} from "./staffOnboarding.ts";

test("staff onboarding is versioned and concise", () => {
  assert.equal(latestStaffTourVersion, "navigation-simplified-2026-10");
  assert.equal(staffTourPages.length, 3);
  assert.equal(new Set(staffTourPages.map((page) => page.id)).size, 3);
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
