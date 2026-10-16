import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyBulkReview, getReviewContactState, parseReviewAdminFilters } from "./reviewAdmin.ts";
import { validateReviewSubmission } from "./reviews.ts";

const root = process.cwd();
const migrationPath = `${root}/supabase/migrations/20261016113000_phase_49_9_review_management_simplification.sql`;

function validSubmission(rating: number, contactRequested: boolean) {
  return validateReviewSubmission({
    ambienceRating: 5,
    contactRequested,
    foodRating: 5,
    publicationConsent: true,
    privacyRequested: false,
    rating,
    reviewText: "A complete review with enough detail for validation.",
    serviceRating: 5,
    valueRating: 5,
  });
}

test("contact requests are accepted only for overall ratings one to three", () => {
  const low = validSubmission(3, true);
  const high = validSubmission(4, true);
  assert.ok("value" in low && low.value.contactRequested);
  assert.ok("value" in high && !high.value.contactRequested);
});

test("review filters validate taxonomy values and rating boundaries", () => {
  const parsed = parseReviewAdminFilters(new URLSearchParams({
    contact: "contact_requested",
    privacy: "private",
    rating: "5",
    reply: "not_replied",
    venue: "cape-town",
  }));
  assert.deepEqual(parsed, {
    value: {
      contact: "contact_requested",
      privacy: "private",
      rating: 5,
      reply: "not_replied",
      venue: "cape-town",
    },
  });
  assert.ok("error" in parseReviewAdminFilters(new URLSearchParams({ rating: "6" })));
  assert.ok("error" in parseReviewAdminFilters(new URLSearchParams({ venue: "durban" })));
});

test("contact state prioritises authoritative follow-up evidence", () => {
  assert.equal(getReviewContactState({ contactedAt: "2026-10-16T10:00:00Z", contactRequested: true }), "contacted");
  assert.equal(getReviewContactState({ contactedAt: null, contactRequested: true }), "contact_requested");
  assert.equal(getReviewContactState({ contactedAt: null, contactRequested: false }), "not_contacted");
});

test("bulk publication prefers named consent, preserves anonymous consent, and excludes unsafe text", () => {
  const base = {
    id: "review-id",
    publicationConsent: true,
    publicationPolicyVersion: "review-publication-2026-10-09-v1",
    privacyRequested: false,
    publicDisplayName: "Guest D.",
    reviewText: "A wonderful evening with excellent service and food.",
    revision: 1,
    status: "needs_review" as const,
  };
  assert.equal(classifyBulkReview({ ...base, publicationConsentMode: "public" }).action, "publish");
  assert.equal(classifyBulkReview({ ...base, publicationConsent: false, publicationConsentMode: "anonymous" }).action, "publish_anonymous");
  assert.equal(classifyBulkReview({ ...base, publicationConsent: false, publicationConsentMode: "private" }).action, null);
  assert.equal(classifyBulkReview({ ...base, publicationConsent: false, publicationConsentMode: "anonymous", reviewText: "Email me at guest@example.com after the show." }).action, null);
});

test("guest form hides and clears contact requests for four and five stars", async () => {
  const form = await readFile(`${root}/src/app/review/[token]/ReviewSubmissionClient.tsx`, "utf8");
  assert.match(form, /if \(value >= 4\) setContactRequested\(false\)/);
  assert.match(form, /rating !== null && rating <= 3/);
  assert.match(form, /Request Review Private/);
  assert.match(form, /Yes, Submit/);
});

test("contact state is audited and successful replies mark contact only after provider acceptance", async () => {
  const [migration, replyRoute] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(`${root}/src/app/api/admin/reviews/reply/route.ts`, "utf8"),
  ]);
  assert.match(migration, /set_guest_review_contacted/);
  assert.match(migration, /contact_marked/);
  assert.match(migration, /contact_undone/);
  assert.match(migration, /replied_at = v_now/);
  assert.ok(replyRoute.indexOf("sendZingaraEmail") < replyRoute.indexOf("complete_guest_review_reply"));
});

test("admin review loading remains bounded and applies combined filters server-side", async () => {
  const route = await readFile(`${root}/src/app/api/admin/reviews/route.ts`, "utf8");
  assert.match(route, /pageSize.*10/);
  assert.match(route, /\.range\(from, from \+ input\.pageSize - 1\)/);
  assert.match(route, /input\.filters\.rating/);
  assert.match(route, /input\.filters\.contact/);
  assert.match(route, /input\.filters\.reply/);
  assert.match(route, /input\.filters\.privacy/);
  assert.match(route, /allowedVenues\(auth\.staffProfile\.venue_scope\)/);
});

test("bulk publishing is bounded, confirmed in the UI, and excludes low ratings", async () => {
  const [route, workspace] = await Promise.all([
    readFile(`${root}/src/app/api/admin/reviews/bulk-publish/route.ts`, "utf8"),
    readFile(`${root}/src/app/admin/ReviewsAdminWorkspace.tsx`, "utf8"),
  ]);
  assert.match(route, /const publishBatchSize = 50/);
  assert.match(route, /\.gte\("rating", 4\)/);
  assert.match(route, /\.eq\("moderation_status", "needs_review"\)/);
  assert.match(route, /moderate_guest_review/);
  assert.match(route, /recordAuditEvent/);
  assert.match(workspace, /Eligible/);
  assert.match(workspace, /Named/);
  assert.match(workspace, /Anonymous/);
  assert.match(workspace, /Excluded/);
  assert.match(workspace, /Publish \$\{bulkPreview\.eligible\} Reviews/);
});

test("contact details are detail-only, actionable, and absent from public APIs", async () => {
  const [workspace, adminRoute, publicRoute, wix] = await Promise.all([
    readFile(`${root}/src/app/admin/ReviewsAdminWorkspace.tsx`, "utf8"),
    readFile(`${root}/src/app/api/admin/reviews/route.ts`, "utf8"),
    readFile(`${root}/src/app/api/reviews/public/route.ts`, "utf8"),
    readFile(`${root}/docs/wix-reviews/reviews.web.js`, "utf8"),
  ]);
  assert.match(workspace, /mailto:/);
  assert.match(workspace, /Your Zingara Experience – Review Follow-Up/);
  assert.match(workspace, /navigator\.clipboard\.writeText/);
  assert.match(workspace, /Copied!/);
  assert.match(adminRoute, /input\.includeDetails[\s\S]*customers/);
  assert.doesNotMatch(publicRoute, /contacted_at|replied_at|mobile|recipient_email/);
  assert.doesNotMatch(wix, /contacted_at|replied_at|mobile|recipient_email/);
});
