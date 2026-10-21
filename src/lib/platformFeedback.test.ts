import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  dedupePlatformFeedbackCandidates,
  getPlatformFeedbackEligibilityReason,
  platformFeedbackGreeting,
  platformFeedbackMessage,
  validatePlatformFeedbackSubmission,
  type PlatformFeedbackCandidate,
} from "./platformFeedback.ts";
import {
  createPlatformFeedbackToken,
  hashPlatformFeedbackToken,
  openPlatformFeedbackToken,
  sealPlatformFeedbackToken,
} from "./platformFeedbackTokenVault.ts";

const root = process.cwd();
const migration = `${root}/supabase/migrations/20261021110000_phase_50_10_platform_feedback.sql`;
const refinementMigration = `${root}/supabase/migrations/20261021123000_phase_50_10_feedback_questionnaire.sql`;

const completeAnswers = {
  bookingDevice: "mobile",
  checkoutEase: 4,
  paymentConfidence: "yes",
  rating: 5,
  seatingEase: 4,
  showDateEase: 5,
} as const;

function candidate(overrides: Partial<PlatformFeedbackCandidate> = {}): PlatformFeedbackCandidate {
  return {
    archivedAt: null,
    bookingId: crypto.randomUUID(),
    bookingOrigin: "customer_public",
    bookingSource: "online",
    bookingStatus: "confirmed",
    customerId: crypto.randomUUID(),
    email: "guest@example.com",
    firstName: "Guest",
    paymentStatus: "paid",
    showId: crypto.randomUUID(),
    venue: "cape-town",
    ...overrides,
  };
}

test("only genuine customer-initiated online bookings are eligible", () => {
  assert.equal(getPlatformFeedbackEligibilityReason(candidate()), null);
  assert.equal(getPlatformFeedbackEligibilityReason(candidate({ bookingOrigin: "admin_manual" })), "not_customer_initiated");
  assert.equal(getPlatformFeedbackEligibilityReason(candidate({ bookingSource: "corporate-direct" })), "not_customer_initiated");
  assert.equal(getPlatformFeedbackEligibilityReason(candidate({ bookingStatus: "cancelled" })), "ineligible_lifecycle");
  assert.equal(getPlatformFeedbackEligibilityReason(candidate({ paymentStatus: "refunded" })), "ineligible_payment");
});

test("recipient deduplication is case-insensitive and retains one booking identity", () => {
  const first = candidate({ email: "Guest@Example.com" });
  const second = candidate({ email: " guest@example.com " });
  const third = candidate({ email: "another@example.com" });
  assert.deepEqual(dedupePlatformFeedbackCandidates([first, second, third]), [first, third]);
});

test("approved copy works for named and fallback greetings", () => {
  const message = platformFeedbackMessage("Kaden", "https://book.zingara.co.za/feedback/token");
  assert.match(message, /^Dearest Kaden,/);
  assert.match(message, /A little magic happens long before the curtain rises/);
  assert.match(message, /With love,\n\nThe Zingara Family/);
  assert.equal(platformFeedbackGreeting(null), "Dearest Zingarian,");
  assert.doesNotMatch(message, /upcoming performance|broken|survey/i);
});

test("all structured answers are required, comment is optional, and contact is low-rating only", () => {
  assert.deepEqual(validatePlatformFeedbackSubmission(completeAnswers), {
    value: { ...completeAnswers, comment: null, contactRequested: false },
  });
  assert.deepEqual(validatePlatformFeedbackSubmission({ ...completeAnswers, contactRequested: true, rating: 3 }), {
    value: { ...completeAnswers, comment: null, contactRequested: true, rating: 3 },
  });
  assert.deepEqual(validatePlatformFeedbackSubmission({ ...completeAnswers, contactRequested: true, rating: 4 }), {
    value: { ...completeAnswers, comment: null, contactRequested: false, rating: 4 },
  });
  assert.ok("error" in validatePlatformFeedbackSubmission({ rating: 0 }));
  assert.ok("error" in validatePlatformFeedbackSubmission({ ...completeAnswers, bookingDevice: "phone" }));
  assert.ok("error" in validatePlatformFeedbackSubmission({ ...completeAnswers, showDateEase: 0 }));
  assert.ok("error" in validatePlatformFeedbackSubmission({ ...completeAnswers, comment: "<script>x</script>", rating: 2 }));
});

test("feedback and approval tokens are random, hashed, and encrypted", () => {
  const token = createPlatformFeedbackToken();
  const secret = "fixture-secret";
  assert.match(hashPlatformFeedbackToken(token), /^[a-f0-9]{64}$/);
  const envelope = sealPlatformFeedbackToken(token, secret);
  assert.notEqual(envelope.ciphertext, token);
  assert.equal(openPlatformFeedbackToken(envelope, secret), token);
  assert.equal(openPlatformFeedbackToken(envelope, "wrong-secret"), null);
});

test("platform feedback is structurally private and customer campaign remains approval-gated", async () => {
  const [sql, refinementSql, publicApi, campaign, approval, form] = await Promise.all([
    readFile(migration, "utf8"),
    readFile(refinementMigration, "utf8"),
    readFile(`${root}/src/app/api/reviews/public/route.ts`, "utf8"),
    readFile(`${root}/src/lib/platformFeedbackCampaign.ts`, "utf8"),
    readFile(`${root}/src/app/api/admin/platform-feedback/approval/route.ts`, "utf8"),
    readFile(`${root}/src/app/feedback/FeedbackSubmissionClient.tsx`, "utf8"),
  ]);
  assert.match(sql, /status text not null default 'awaiting_approval'/);
  assert.match(sql, /Never eligible for public Reviews API, Wix, featuring/);
  assert.match(refinementSql, /Never eligible for public Reviews API, Wix, featuring/);
  assert.doesNotMatch(publicApi, /platform_feedback/);
  assert.match(campaign, /PLATFORM_FEEDBACK_CAMPAIGN_NOT_APPROVED/);
  assert.match(approval, /Kaden Damon,full_name\.ilike\.Nicky-Anne De Beer/);
  for (const question of [
    "How was your overall booking experience?",
    "How easy was it to find your show and date?",
    "How easy was it to choose your seating?",
    "How was the checkout and payment process?",
    "What could we make better?",
    "Did you feel safe and confident making your payment online?",
    "Which device did you use to book?",
  ]) assert.match(form, new RegExp(question.replace(/[?]/g, "\\?")));
  assert.match(form, /rating !== null && rating <= 3/);
  assert.match(form, /YES, SUBMIT/);
  assert.match(form, /Mobile phone/);
  assert.match(form, /Can't remember/);
});

test("admin integration is bounded, filtered, reply-safe, and separate from publishing", async () => {
  const [route, admin, reply, reviewWorkspace] = await Promise.all([
    readFile(`${root}/src/app/api/admin/platform-feedback/route.ts`, "utf8"),
    readFile(`${root}/src/app/admin/PlatformFeedbackAdminWorkspace.tsx`, "utf8"),
    readFile(`${root}/src/app/api/admin/platform-feedback/reply/route.ts`, "utf8"),
    readFile(`${root}/src/app/admin/ReviewsAdminWorkspace.tsx`, "utf8"),
  ]);
  assert.match(route, /\.range\(from, from \+ pageSize - 1\)/);
  for (const filter of ["venue", "rating", "device", "showDateDifficulty", "seatingDifficulty", "checkoutDifficulty", "paymentConfidence", "contactRequest", "contacted"]) assert.match(route, new RegExp(filter));
  assert.match(admin, /Platform Feedback/);
  assert.match(reviewWorkspace, /Platform Feedback/);
  assert.ok(reply.indexOf("sendZingaraEmail") < reply.indexOf("complete_platform_feedback_reply"));
  assert.doesNotMatch(admin, /Publish Anonymously|Mark featured|Unpublish/);
});

test("email management is isolated, default-off, editable, and approval-gated", async () => {
  const [sql, refinementSql, settings, editor, approval, mailer, runner] = await Promise.all([
    readFile(migration, "utf8"),
    readFile(refinementMigration, "utf8"),
    readFile(`${root}/src/app/admin/EmailNotificationsSettings.tsx`, "utf8"),
    readFile(`${root}/src/app/admin/PlatformFeedbackCampaignSettings.tsx`, "utf8"),
    readFile(`${root}/src/app/api/admin/platform-feedback/approval/route.ts`, "utf8"),
    readFile(`${root}/src/lib/email/platformFeedbackEmail.ts`, "utf8"),
    readFile(`${root}/src/lib/platformFeedbackCampaign.ts`, "utf8"),
  ]);
  assert.match(sql, /automation_enabled boolean not null default false/);
  assert.match(refinementSql, /A little favour from Zingara/);
  assert.match(settings, /Booking Experience Feedback/);
  assert.match(editor, /Edit Email/);
  assert.match(editor, /Send Test Email/);
  assert.match(editor, /Send Campaign/);
  assert.match(approval, /recipientStaffProfileIds/);
  assert.match(approval, /template: campaign\.template/);
  assert.match(mailer, /input\.template\?\.subject/);
  assert.match(mailer, /includeSecurityNotice: false/);
  assert.match(runner, /PLATFORM_FEEDBACK_AUTOMATION_DISABLED/);
  assert.match(runner, /current\.status === "approved"/);
});
