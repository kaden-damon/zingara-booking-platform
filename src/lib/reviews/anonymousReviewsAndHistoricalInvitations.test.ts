import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canPublishReview,
  getAnonymousReviewIdentityWarnings,
  reviewPublicationPolicyVersion,
  toPublicReviewPayload,
  validateReviewSubmission,
  type PublicReviewRecord,
} from "./reviews.ts";

const root = process.cwd();
const migrationPath = `${root}/supabase/migrations/20261009123000_phase_48_5_anonymous_reviews.sql`;
const publicationFixMigrationPath = `${root}/supabase/migrations/20261009150000_phase_48_6_anonymous_publication_constraint.sql`;
const privacyToggleMigrationPath = `${root}/supabase/migrations/20261009190000_review_privacy_toggle_policy.sql`;

function review(overrides: Partial<PublicReviewRecord> = {}): PublicReviewRecord {
  return {
    featured: false,
    id: "public-review-id",
    publicDisplayName: "Nomsa D.",
    publicationConsent: false,
    publicationConsentMode: "anonymous",
    publicationMode: "anonymous",
    publishedAt: "2026-10-09T08:00:00Z",
    rating: 5,
    reviewText: "A wonderful evening with excellent service and performances.",
    status: "published",
    venue: "johannesburg",
    verifiedGuest: true,
    ...overrides,
  };
}

test("submission preserves explicit public, anonymous and private choices", () => {
  for (const mode of ["public", "anonymous", "private"] as const) {
    const result = validateReviewSubmission({
      contactRequested: false,
      publicationConsent: mode === "public",
      publicationConsentMode: mode,
      rating: 5,
      reviewText: "A detailed review that is long enough for safe submission.",
    });
    assert.equal("value" in result && result.value.publicationConsentMode, mode);
  }
});

test("privacy toggle defaults to normal publication and records the policy choice", () => {
  const normal = validateReviewSubmission({
    contactRequested: false,
    privacyRequested: false,
    publicationConsent: undefined,
    rating: 5,
    reviewText: "A detailed review that is long enough for safe submission.",
  });
  const privateRequested = validateReviewSubmission({
    contactRequested: false,
    privacyRequested: true,
    publicationConsent: undefined,
    rating: 5,
    reviewText: "A detailed review that is long enough for safe submission.",
  });
  assert.deepEqual("value" in normal && {
    mode: normal.value.publicationConsentMode,
    policy: normal.value.publicationPolicyVersion,
    privacy: normal.value.privacyRequested,
  }, { mode: "public", policy: reviewPublicationPolicyVersion, privacy: false });
  assert.deepEqual("value" in privateRequested && {
    mode: privateRequested.value.publicationConsentMode,
    policy: privateRequested.value.publicationPolicyVersion,
    privacy: privateRequested.value.privacyRequested,
  }, { mode: "anonymous", policy: reviewPublicationPolicyVersion, privacy: true });
});

test("anonymous moderation needs explicit anonymous consent and private stays blocked", () => {
  assert.equal(canPublishReview({ action: "publish_anonymous", publicationConsentMode: "anonymous", status: "needs_review" }), true);
  assert.equal(canPublishReview({ action: "publish_anonymous", publicationConsentMode: "private", status: "needs_review" }), false);
  assert.equal(canPublishReview({ action: "publish", publicationConsentMode: "anonymous", status: "needs_review" }), false);
  assert.equal(canPublishReview({
    action: "publish_anonymous",
    publicationConsentMode: "public",
    publicationPolicyVersion: reviewPublicationPolicyVersion,
    privacyRequested: false,
    status: "needs_review",
  }), true);
  assert.equal(canPublishReview({ action: "publish_anonymous", publicationConsentMode: "public", status: "needs_review" }), false);
  assert.equal(canPublishReview({
    action: "publish",
    publicationConsent: true,
    publicationConsentMode: "public",
    publicationPolicyVersion: reviewPublicationPolicyVersion,
    privacyRequested: true,
    status: "needs_review",
  }), false);
});

test("anonymous public payload never emits the stored guest display name", () => {
  const payload = toPublicReviewPayload(review());
  assert.equal(payload?.displayName, "Anonymous");
  assert.doesNotMatch(JSON.stringify(payload), /Nomsa D\./);
  const currentPolicyPayload = toPublicReviewPayload(review({
    publicationConsent: true,
    publicationConsentMode: "public",
    publicationPolicyVersion: reviewPublicationPolicyVersion,
    privacyRequested: false,
  }));
  assert.equal(currentPolicyPayload?.displayName, "Anonymous");
  assert.doesNotMatch(JSON.stringify(currentPolicyPayload), /Nomsa D\./);
  assert.equal(toPublicReviewPayload(review({ publicationConsentMode: "private", publicationMode: null })), null);
});

test("identifying text is flagged before anonymous publication", () => {
  assert.deepEqual(
    getAnonymousReviewIdentityWarnings(
      "Nomsa can be reached at nomsa@example.com or 082 555 0199 for ZNG-ABC123.",
      "Nomsa D.",
    ).sort(),
    ["booking reference", "email address", "guest name", "phone number"].sort(),
  );
  assert.deepEqual(getAnonymousReviewIdentityWarnings("A wonderful evening from start to finish.", "Nomsa D."), []);
});

test("migration preserves historical private consent and enforces anonymous publication atomically", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /when publication_consent then 'public'[\s\S]*else 'private'/);
  assert.match(sql, /publication_consent_mode <> 'anonymous'/);
  assert.match(sql, /REVIEW_ANONYMOUS_CONSENT_REQUIRED/);
  assert.match(sql, /respond_to_review_anonymous_permission/);
  assert.match(sql, /anonymous_permission_granted/);
  assert.match(sql, /anonymous_permission_declined/);
  assert.doesNotMatch(sql, /set publication_consent_mode = 'anonymous'[\s\S]*where publication_consent = false/i);
});

test("anonymous publication removes the legacy named-consent constraint without weakening consent", async () => {
  const sql = await readFile(publicationFixMigrationPath, "utf8");
  assert.match(sql, /drop constraint if exists guest_reviews_check1/);
  assert.match(sql, /publication_consent_mode = 'public'[\s\S]*publication_mode = 'named'[\s\S]*publication_consent = true/);
  assert.match(sql, /publication_consent_mode = 'anonymous'[\s\S]*publication_mode = 'anonymous'[\s\S]*publication_consent = false[\s\S]*publication_consented_at is not null/);
  assert.match(sql, /moderation_status <> 'published'/);
});

test("privacy-toggle policy is immutable, versioned and preserves historical private reviews", async () => {
  const [sql, form, workspace, terms] = await Promise.all([
    readFile(privacyToggleMigrationPath, "utf8"),
    readFile(`${root}/src/app/review/[token]/ReviewSubmissionClient.tsx`, "utf8"),
    readFile(`${root}/src/app/admin/ReviewsAdminWorkspace.tsx`, "utf8"),
    readFile(`${root}/src/lib/royalDecrees.ts`, "utf8"),
  ]);
  assert.match(sql, /review_privacy_requested boolean/);
  assert.match(sql, /review_publication_policy_version text/);
  assert.match(sql, /review-publication-2026-10-09-v1/);
  assert.match(sql, /REVIEW_GUEST_CONTENT_IMMUTABLE/);
  assert.doesNotMatch(sql, /update public\.guest_reviews[\s\S]*where review_privacy_requested is null/i);
  assert.match(form, /Request Review Private/);
  assert.match(form, /role="switch"/);
  assert.match(form, /aria-checked=\{privacyRequested\}/);
  assert.match(form, /useState\(false\)/);
  assert.doesNotMatch(form, /Publish with name|Publish as Anonymous|Keep my review private|type="radio"/);
  assert.match(workspace, /Publish Anonymously/);
  assert.doesNotMatch(workspace, /Request Anonymous Permission|requestAnonymousPermission/);
  assert.match(terms, /If Request Review Private is on, the review may only be published as Anonymous/);
});

test("Reviews uses bounded list data and loads selected history on demand", async () => {
  const [route, workspace] = await Promise.all([
    readFile(`${root}/src/app/api/admin/reviews/route.ts`, "utf8"),
    readFile(`${root}/src/app/admin/ReviewsAdminWorkspace.tsx`, "utf8"),
  ]);
  assert.match(route, /pageSize.*10/);
  assert.match(route, /\.range\(from, from \+ input\.pageSize - 1\)/);
  assert.match(route, /input\.includeDetails && reviewIds\.length/);
  assert.match(route, /staff_profiles"\)\.select\("id,full_name"\)\.in\("id", actorIds\)/);
  assert.match(workspace, /details: "true"/);
  assert.match(workspace, /new AbortController\(\)/);
  assert.match(workspace, /setDebouncedSearch/);
  assert.match(workspace, /pageSize: "10"/);
  assert.match(workspace, /Page \{page\} of \{pageCount\}/);
  assert.match(workspace, /\{result\.total\} matching review/);
  assert.match(workspace, />\s*Previous\s*</);
  assert.match(workspace, />\s*Next\s*</);
  assert.doesNotMatch(workspace, /getBookings\(/);
});

test("historical permission evidence remains available without an Admin request action", async () => {
  const [route, workspace] = await Promise.all([
    readFile(`${root}/src/app/api/admin/reviews/anonymous-permission/route.ts`, "utf8"),
    readFile(`${root}/src/app/admin/ReviewsAdminWorkspace.tsx`, "utf8"),
  ]);
  assert.match(route, /review_anonymous_permission_requests/);
  assert.match(route, /recordAuditEvent/);
  assert.doesNotMatch(workspace, /Request Anonymous Permission|requestAnonymousPermission/);
});

test("historical operation is dry by default, bounded, resumable and threshold protected", async () => {
  const [route, historical, scheduler, workflows] = await Promise.all([
    readFile(`${root}/src/app/api/workflows/reviews/historical/route.ts`, "utf8"),
    readFile(`${root}/src/lib/workflows/historicalReviewInvitations.ts`, "utf8"),
    readFile(`${root}/src/app/api/workflows/reviews/run/route.ts`, "utf8"),
    readFile(`${root}/src/lib/workflows/automatedWorkflows.ts`, "utf8"),
  ]);
  assert.match(historical, /2026-09-01T00:00:00\+02:00/);
  assert.match(historical, /historicalReviewApprovedMaximum = 542/);
  assert.match(historical, /historicalReviewBatchSize = 25/);
  assert.match(historical, /plan\.eligible > historicalReviewApprovedMaximum/);
  assert.match(historical, /\.eq\("status", "paused"\)/);
  assert.match(historical, /status === "completed" \|\| status === "failed"/);
  assert.match(route, /startHistoricalReviewInvitations/);
  assert.match(scheduler, /continueHistoricalReviewInvitations/);
  assert.match(workflows, /reviewWindow/);
  assert.match(workflows, /maxDeliveries/);
  assert.match(workflows, /claimOneTimeEmailCommunication/);
  assert.match(workflows, /workflowDeliveryConcurrency = 3/);
});

test("normal review scheduler route and cadence remain unchanged", async () => {
  const [vercel, route] = await Promise.all([
    readFile(`${root}/vercel.json`, "utf8"),
    readFile(`${root}/src/app/api/workflows/reviews/run/route.ts`, "utf8"),
  ]);
  assert.match(vercel, /7,22,37,52 \* \* \* \*/);
  assert.doesNotMatch(vercel, /historical/);
  assert.match(route, /workflowKey = "post_show_review"/);
  assert.match(route, /mode: "send"/);
});
