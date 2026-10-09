import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { calculateReviewRatingAverage, isReviewAttentionRating } from "./reviewRating.ts";

const migration = readFileSync(new URL("../../../supabase/migrations/20261005170000_phase_46_2_review_management_notifications.sql", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../workflows/reviewManagement.ts", import.meta.url), "utf8");
const submission = readFileSync(new URL("../../app/api/reviews/[token]/route.ts", import.meta.url), "utf8");
const runner = readFileSync(new URL("../../app/api/workflows/run/route.ts", import.meta.url), "utf8");
const cronAuthorization = readFileSync(new URL("../workflows/cronAuthorization.ts", import.meta.url), "utf8");
const card = readFileSync(new URL("../../app/admin/ReviewManagementWorkflowCard.tsx", import.meta.url), "utf8");
const reviewWorkspace = readFileSync(new URL("../../app/admin/ReviewsAdminWorkspace.tsx", import.meta.url), "utf8");

test("ratings 1 and 2 require attention while 3 to 5 remain normal", () => {
  assert.equal(isReviewAttentionRating(1), true);
  assert.equal(isReviewAttentionRating(2), true);
  assert.equal(isReviewAttentionRating(3), false);
  assert.equal(isReviewAttentionRating(5), false);
});

test("daily summary shares the authoritative analytics average", () => {
  assert.equal(calculateReviewRatingAverage([1, 3, 5]), 3);
  assert.equal(calculateReviewRatingAverage([]), null);
  assert.match(workflow, /calculateReviewRatingAverage/);
  assert.match(workflow, /Published: \$\{published\}/);
  assert.match(workflow, /Awaiting review: \$\{awaiting\}/);
  assert.match(workflow, /cptAverage/);
  assert.match(workflow, /jhbAverage/);
});

test("submission persistence triggers one retry-safe internal alert without failing the guest response", () => {
  assert.match(submission, /!submitted\.idempotent/);
  assert.match(submission, /sendImmediateReviewAlert/);
  assert.match(submission, /Management alert failed after review persisted/);
  assert.match(migration, /unique \(review_id\)/);
  assert.match(migration, /status = 'failed'/);
});

test("daily summaries run at 08:00 SAST and advance through sent or empty reporting periods", () => {
  assert.match(migration, /default '08:00:00'/);
  assert.match(workflow, /Africa\/Johannesburg/);
  assert.match(workflow, /\.in\("status", \["sent", "skipped"\]\)/);
  assert.match(workflow, /complete\("skipped"\)/);
  assert.match(workflow, /periodStart >= periodEnd/);
});

test("both workflows use configured active staff plus the shared Kaden management-copy resolver", () => {
  assert.match(workflow, /review_management_configuration/);
  assert.match(workflow, /member\.active && member\.email/);
  assert.match(workflow, /resolveInternalOperationalRecipients/);
  assert.match(workflow, /kadenManagementEmail/);
  assert.match(migration, /nicky-annedebeer@zingara\.co\.za/);
  assert.doesNotMatch(migration, /aswin@zingara\.co\.za/);
});

test("emails are branded, contain safe Admin links and omit review tokens and booking contact data", () => {
  assert.match(workflow, /createBrandedCustomerEmail/);
  assert.match(workflow, /\/admin\?section=reviews&reviewId=/);
  assert.match(workflow, /Submitted .*SAST/);
  assert.match(workflow, />VIEW REVIEW</);
  assert.doesNotMatch(workflow, /review_token|token_hash|customer_email|customer_phone|booking_reference/);
  assert.match(reviewWorkspace, /query\.get\("reviewId"\)/);
});

test("preview is no-send and both workflow switches remain independent", () => {
  assert.match(card, /New Review Alert/);
  assert.match(card, /Daily Review Summary/);
  assert.match(card, /No-send preview/);
  assert.match(card, /immediateEnabled/);
  assert.match(card, /dailyEnabled/);
  assert.doesNotMatch(card, /sendZingaraEmail/);
});

test("the existing authenticated scheduler retries alerts and runs the daily summary", () => {
  assert.match(runner, /runReviewManagementWorkflows\(serviceClient\)/);
  assert.match(runner, /isAuthorisedWorkflowCronRequest/);
  assert.match(cronAuthorization, /process\.env\.CRON_SECRET/);
  assert.match(cronAuthorization, /process\.env\.WORKFLOW_CRON_SECRET/);
  assert.match(workflow, /runPendingReviewAlerts/);
  assert.match(workflow, /runDailyReviewSummary/);
});

test("review moderation, Wix eligibility and customer communication are not mutated", () => {
  assert.doesNotMatch(workflow, /moderate_guest_review|set_guest_review_featured|get_public_review/);
  assert.doesNotMatch(workflow, /sendOperationalCustomerEmail/);
  assert.doesNotMatch(workflow, /from\("guest_reviews"\)\.(?:insert|update|delete)/);
});
