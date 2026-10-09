import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canPublishReview,
  getAnonymousReviewIdentityWarnings,
  toPublicReviewPayload,
  validateReviewSubmission,
  type PublicReviewRecord,
} from "./reviews.ts";

const root = process.cwd();
const migrationPath = `${root}/supabase/migrations/20261009123000_phase_48_5_anonymous_reviews.sql`;
const publicationFixMigrationPath = `${root}/supabase/migrations/20261009150000_phase_48_6_anonymous_publication_constraint.sql`;

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

test("anonymous moderation needs explicit anonymous consent and private stays blocked", () => {
  assert.equal(canPublishReview({ action: "publish_anonymous", publicationConsentMode: "anonymous", status: "needs_review" }), true);
  assert.equal(canPublishReview({ action: "publish_anonymous", publicationConsentMode: "private", status: "needs_review" }), false);
  assert.equal(canPublishReview({ action: "publish", publicationConsentMode: "anonymous", status: "needs_review" }), false);
});

test("anonymous public payload never emits the stored guest display name", () => {
  const payload = toPublicReviewPayload(review());
  assert.equal(payload?.displayName, "Anonymous");
  assert.doesNotMatch(JSON.stringify(payload), /Nomsa D\./);
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

test("Reviews uses bounded list data and loads selected history on demand", async () => {
  const [route, workspace] = await Promise.all([
    readFile(`${root}/src/app/api/admin/reviews/route.ts`, "utf8"),
    readFile(`${root}/src/app/admin/ReviewsAdminWorkspace.tsx`, "utf8"),
  ]);
  assert.match(route, /pageSize.*20/);
  assert.match(route, /\.range\(from, from \+ input\.pageSize - 1\)/);
  assert.match(route, /input\.includeDetails && reviewIds\.length/);
  assert.match(route, /staff_profiles"\)\.select\("id,full_name"\)\.in\("id", actorIds\)/);
  assert.match(workspace, /details: "true"/);
  assert.match(workspace, /new AbortController\(\)/);
  assert.match(workspace, /setDebouncedSearch/);
  assert.doesNotMatch(workspace, /getBookings\(/);
});

test("permission request is staff-authorised, guest-specific, audited and suppression-aware", async () => {
  const route = await readFile(`${root}/src/app/api/admin/reviews/anonymous-permission/route.ts`, "utf8");
  assert.match(route, /communications:manage/);
  assert.match(route, /allowedVenues/);
  assert.match(route, /publication_consent_mode !== "private"/);
  assert.match(route, /sendOperationalCustomerEmail/);
  assert.match(route, /kind: "post_show_review"/);
  assert.match(route, /recordAuditEvent/);
  assert.match(route, /review_anonymous_permission_requests/);
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
