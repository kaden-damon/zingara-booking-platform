import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// @ts-expect-error Node's built-in TypeScript test runner requires the extension.
import {
  hasAcknowledgedStaffTour,
  latestStaffTourVersion,
  staffTourOpenEvent,
  staffTourPages,
} from "./staffOnboarding.ts";

test("staff onboarding is versioned and concise", () => {
  assert.equal(latestStaffTourVersion, "quote-invoice-management-2026-10");
  assert.equal(staffTourOpenEvent, "zingara-open-staff-feature-walkthrough");
  assert.equal(staffTourPages.length, 6);
  assert.equal(new Set(staffTourPages.map((page) => page.id)).size, 6);
  assert.ok(staffTourPages.every((page) => !("icon" in page)));
  assert.match(staffTourPages[0]?.title ?? "", /Quote & Invoice Management/);
  assert.match(staffTourPages[3]?.body ?? "", /Request Invoice/);
  assert.match(staffTourPages[4]?.body ?? "", /Tristan and Rachelle/);
  assert.match(staffTourPages.at(-1)?.supporting ?? "", /Academy/);
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

test("walkthrough records completion or skip and can reopen from Academy", () => {
  const authSource = readFileSync(
    new URL("./supabase/auth.ts", import.meta.url),
    "utf8",
  );
  const tourSource = readFileSync(
    new URL("../app/admin/StaffOnboardingTour.tsx", import.meta.url),
    "utf8",
  );
  const adminSource = readFileSync(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(authSource, /staffTourAcknowledgementMetadataKey/);
  assert.match(authSource, /staffTourAcknowledgedAtMetadataKey/);
  assert.match(tourSource, /finishTour\("skipped"\)/);
  assert.match(tourSource, /finishTour\("completed"\)/);
  assert.match(tourSource, /window\.addEventListener\(staffTourOpenEvent/);
  assert.match(tourSource, /document\.querySelector/);
  assert.match(tourSource, /operationalDialogIsOpen/);
  assert.match(adminSource, /Quote &amp; Invoice Walkthrough/);
  assert.match(adminSource, /window\.dispatchEvent\(new Event\(staffTourOpenEvent\)\)/);
});
