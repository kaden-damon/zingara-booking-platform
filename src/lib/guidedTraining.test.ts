import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  guidedTrainingModules,
  syntheticBuyoutPackage,
  validateBuyoutTrainingBooking,
  validateCorporateTrainingBooking,
  validateStandardTrainingBooking,
} from "./guidedTraining.ts";

test("all three guided modules are versioned and have unique stable controls", () => {
  assert.deepEqual(
    guidedTrainingModules.map((module) => module.id),
    ["standard-booking", "corporate-booking", "buyout"],
  );
  for (const trainingModule of guidedTrainingModules) {
    assert.ok(trainingModule.version > 0);
    assert.ok(trainingModule.steps.length >= 7);
    assert.equal(
      new Set(trainingModule.steps.map((step) => step.controlId)).size,
      trainingModule.steps.length,
    );
  }
});

test("standard training uses the production booking validation", () => {
  assert.deepEqual(
    validateStandardTrainingBooking({
      email: "avery.daniels@example.com",
      guests: 4,
      name: "Avery Daniels",
      phone: "+27821234567",
    }),
    {},
  );
  assert.equal(
    validateStandardTrainingBooking({
      email: "invalid",
      guests: 0,
      name: "",
      phone: "1",
    }).partySize,
    "Enter a valid number of guests.",
  );
});

test("corporate training separates rate selection from payment and review", () => {
  const corporate = guidedTrainingModules.find(
    (module) => module.id === "corporate-booking",
  );
  assert.ok(corporate);
  assert.equal(corporate.steps[7]?.key, "rate");
  assert.equal(corporate.steps[7]?.controlId, "training-booking-rate");
  assert.deepEqual(corporate.steps[7]?.validValues, ["standard", "complimentary"]);
  assert.equal(corporate.steps[8]?.key, "payment");
  assert.equal(corporate.steps[8]?.prepare?.controlId, "training-booking-payment-option");
  assert.equal(corporate.steps[8]?.controlId, "training-booking-review");
});

test("corporate and buyout training use production financial validation", () => {
  const corporate = validateCorporateTrainingBooking({
    guests: 20,
    paymentBasis: "invoice-outstanding",
    showId: "academy-cpt-show",
    total: 24000,
    venue: "cape-town",
    zoneId: "royal-booths",
  });
  assert.equal(corporate?.outstandingAmount, 24000);
  assert.equal(corporate?.paymentStatus, "pending-payment");

  const buyout = validateBuyoutTrainingBooking(400);
  assert.equal(buyout.error, null);
  assert.equal(buyout.commercials.totalAmount, syntheticBuyoutPackage.totalAmount);
});

test("guided training launches real Production workflows behind a synthetic write boundary", async () => {
  const [launcher, overlay, progressRoute, executeRoute, startRoute, adminPage, bookPage, buyout, migration] = await Promise.all([
    readFile("src/app/admin/GuidedTraining.tsx", "utf8"),
    readFile("src/app/admin/GuidedTrainingOverlay.tsx", "utf8"),
    readFile("src/app/api/admin/training/guided/route.ts", "utf8"),
    readFile("src/app/api/admin/training/guided/execute/route.ts", "utf8"),
    readFile("src/app/api/admin/training/guided/start/route.ts", "utf8"),
    readFile("src/app/admin/page.tsx", "utf8"),
    readFile("src/app/book/page.tsx", "utf8"),
    readFile("src/app/admin/CorporateBuyoutCreator.tsx", "utf8"),
    readFile(
      "supabase/migrations/20261022193000_phase_50_14_guided_training_progress.sql",
      "utf8",
    ),
  ]);

  assert.doesNotMatch(launcher, /StandardWorkflow|CorporateWorkflow|BuyoutWorkflow/);
  assert.match(launcher, /\/api\/admin\/training\/guided\/start/);
  assert.match(launcher, /fetchSupabaseApi<GuidedTrainingBootstrap>/);
  assert.match(overlay, /document\.addEventListener\(eventName, advance\)/);
  assert.doesNotMatch(overlay, /document\.addEventListener\(eventName, advance, true\)/);
  assert.match(overlay, /document\.addEventListener\("click", guard, true\)/);
  assert.doesNotMatch(overlay, /document\.addEventListener\("pointerdown", guard, true\)/);
  assert.doesNotMatch(overlay, /window\.location\.assign/);
  assert.match(overlay, /router\.push\("\/admin\?section=academy&academySection=guided-training"\)/);
  assert.match(overlay, /zingara-guided-training-navigate/);
  assert.match(overlay, /training-guide-shake/);
  assert.match(overlay, /STEP \{stepIndex \+ 1\} OF/);
  assert.match(overlay, /\{exiting \? "SAVING" : "EXIT"\}/);
  assert.match(overlay, /\/api\/admin\/training\/guided\?module=/);
  assert.match(overlay, /fetchSupabaseApi<ProgressBootstrap>/);
  assert.match(overlay, /fetchSupabaseApi<\{ accepted: true \}>/);
  assert.match(overlay, /persistenceRef\.current === "preview-session"/);
  assert.match(overlay, /completedRecordRef\.current && !isComplete/);
  assert.match(overlay, /keepalive: true/);
  assert.match(overlay, /router\.replace\(`\/admin\?guidedTraining=/);
  assert.match(overlay, /window\.visualViewport/);
  assert.match(overlay, /scrollIntoView\(\{ behavior, block: "center", inline: "nearest" \}\)/);
  assert.match(overlay, /ref=\{guideRef\}/);
  assert.match(overlay, /findVisibleTrainingElement/);
  assert.match(overlay, /data-training-scope/);
  assert.doesNotMatch(overlay, /trainingClearance|document\.body\.style\.paddingBottom/);
  assert.match(progressRoute, /requireActiveStaff/);
  assert.doesNotMatch(progressRoute, /roleOf\(auth\.staffProfile\) !== "super-admin"/);
  assert.match(progressRoute, /verifyGuidedTrainingPreviewSession/);
  assert.match(executeRoute, /persisted: false/);
  assert.match(executeRoute, /process\.env\.NODE_ENV === "production"/);
  assert.doesNotMatch(executeRoute, /\.from\(|createBooking|createCorporateBuyout|payfast|xero/i);
  assert.match(startRoute, /httpOnly: true/);
  assert.match(startRoute, /sameSite: "strict"/);
  assert.match(startRoute, /browserOrigin\(request\)/);
  assert.match(startRoute, /request\.headers\.get\("host"\)/);
  assert.match(adminPage, /dynamic\(\(\) => import\("\.\/GuidedTraining"\)/);
  assert.match(adminPage, />Guided Training<\/button>/);
  assert.doesNotMatch(
    adminPage,
    /process\.env\.NODE_ENV !== "production"\s*&&\s*currentStaff\?\.role === "super-admin"/,
  );
  assert.match(
    adminPage,
    /academySection === "guided-training"\s*\? "guided-training"/,
  );
  assert.doesNotMatch(
    adminPage,
    /process\.env\.NODE_ENV !== "production"\s*&&\s*typeof guidedTrainingParam/,
  );
  assert.match(launcher, /\? "Retake"/);
  assert.doesNotMatch(launcher, /Completed - Review/);
  assert.match(launcher, /aria-label="Completed"/);
  assert.match(launcher, /\? "Continue"/);
  assert.match(launcher, /: "Start"/);
  assert.match(adminPage, /guidedTrainingPreviewStaff/);
  assert.match(adminPage, /preview\?\.persistence === "preview-session"/);
  assert.match(adminPage, /trainingBootstrap=/);
  assert.match(bookPage, /GuidedTrainingOverlay/);
  assert.doesNotMatch(
    bookPage,
    /process\.env\.NODE_ENV !== "production"\s*&&\s*typeof guidedTrainingParam/,
  );
  assert.match(bookPage, /createGuidedTrainingReference/);
  assert.match(bookPage, /training-booking-payment-option/);
  assert.match(bookPage, /training-booking-rate/);
  assert.match(bookPage, /training-booking-review/);
  assert.doesNotMatch(bookPage, /\/api\/admin\/training\/guided\/execute/);
  assert.match(buyout, /createGuidedTrainingReference/);
  assert.doesNotMatch(buyout, /\/api\/admin\/training\/guided\/execute/);
  assert.match(buyout, /Use the supplied Company and Contact/);
  assert.match(buyout, /zingara-guided-training-completed/);
  assert.doesNotMatch(launcher, /synthetic|demo|simulation|· v\{/i);
  assert.doesNotMatch(overlay, /Synthetic workflow|Synthetic · v/i);
  assert.match(overlay, /BOOKING COMPLETE/);
  assert.match(overlay, /You&apos;ve successfully completed this training module\./);
  assert.match(migration, /unique \(staff_profile_id, module_id, module_version\)/);
  assert.match(migration, /Completion is not trainer-verified proficiency/);
});
