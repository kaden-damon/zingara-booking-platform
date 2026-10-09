import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildVerifiedReviewUrl,
  canPublishReview,
  createReviewToken,
  getPublishedReviewAggregates,
  getReviewEligibilityReason,
  getReviewGuestType,
  getSafePublicDisplayName,
  getSafePublicDisplayNameFromFullName,
  getVisiblePublicReviews,
  hashReviewToken,
  parsePublicReviewFilters,
  toPublicReviewPayload,
  validateReviewSubmission,
  type PublicReviewRecord,
} from "./reviews.ts";
import { wixPreviewReviews } from "./wixPreviewFixtures.ts";
import { openReviewToken, sealReviewToken } from "./reviewTokenVault.ts";

const root = process.cwd();
const migrationPath = `${root}/supabase/migrations/20261001120000_phase_43_verified_guest_reviews.sql`;
const publicRoutePath = `${root}/src/app/api/reviews/[token]/route.ts`;
const publicFeedPath = `${root}/src/app/api/reviews/public/route.ts`;
const adminRoutePath = `${root}/src/app/api/admin/reviews/route.ts`;
const adminPanelPath = `${root}/src/app/admin/ReviewsAdminWorkspace.tsx`;
const workflowPath = `${root}/src/lib/workflows/automatedWorkflows.ts`;
const customerEmailPath = `${root}/src/lib/email/customerEmail.ts`;
const adminPagePath = `${root}/src/app/admin/page.tsx`;
const wixBackendPath = `${root}/docs/wix-reviews/reviews.web.js`;
const wixFrontendPath = `${root}/docs/wix-reviews/reviews-page.js`;
const wixPreviewPath = `${root}/src/app/review/wix-preview/page.tsx`;
const manualMigrationPath = `${root}/supabase/migrations/20261004210000_phase_43_5_manual_review_invitations.sql`;
const bookingEligibilityMigrationPath = `${root}/supabase/migrations/20261005073000_phase_43_review_eligibility_without_checkin.sql`;
const manualInvitationRoutePath = `${root}/src/app/api/admin/bookings/review-invitations/route.ts`;
const workflowAdminRoutePath = `${root}/src/app/api/admin/workflows/route.ts`;

const eligible = {
  archivedAt: null,
  bookingReference: "ZNG-ABC123",
  bookingStatus: "confirmed",
  paymentStatus: "fully_paid",
  showDate: "2026-09-20",
  showTime: "17:00:00",
};

function review(overrides: Partial<PublicReviewRecord> = {}): PublicReviewRecord {
  return {
    featured: false,
    id: "review-public-id",
    publicDisplayName: "Chanel D.",
    publicationConsent: true,
    publishedAt: "2026-10-01T10:00:00Z",
    rating: 5,
    reviewText: "A memorable and beautifully produced evening.",
    status: "published",
    venue: "johannesburg",
    verifiedGuest: true,
    ...overrides,
  };
}

test("secure review tokens are random, opaque and hash deterministically", () => {
  const first = createReviewToken();
  const second = createReviewToken();
  assert.notEqual(first, second);
  assert.equal(first.length >= 40, true);
  assert.match(hashReviewToken(first), /^[a-f0-9]{64}$/);
  const url = buildVerifiedReviewUrl("https://book.zingara.co.za/", first);
  assert.equal(url, `https://book.zingara.co.za/review/${first}`);
  assert.doesNotMatch(url, /ZNG-|customer|booking/i);
});

test("review token envelopes can be reused without storing a plaintext token", () => {
  const token = createReviewToken();
  const secret = "local-review-test-secret";
  const envelope = sealReviewToken(token, secret);
  assert.equal(openReviewToken(envelope, secret), token);
  assert.doesNotMatch(JSON.stringify(envelope), new RegExp(token));
  assert.equal(openReviewToken(envelope, "wrong-secret"), null);
});

test("legitimate completed bookings do not require check-in while invalid bookings fail", () => {
  const now = new Date("2026-10-01T12:00:00+02:00");
  assert.equal(getReviewEligibilityReason(eligible, now), null);
  assert.equal(
    getReviewEligibilityReason({ ...eligible, bookingStatus: "cancelled" }, now),
    "cancelled",
  );
  assert.equal(
    getReviewEligibilityReason({ ...eligible, showDate: "2026-10-02" }, now),
    "show_not_completed",
  );
  assert.equal(
    getReviewEligibilityReason({ ...eligible, bookingReference: "TEST-REVIEW" }, now),
    "synthetic_booking",
  );
});

test("automated review classification stays truthful to persisted check-in evidence", () => {
  assert.equal(
    getReviewGuestType({ checkedIn: true, invitationType: "automated_verified" }),
    "verified",
  );
  assert.equal(
    getReviewGuestType({ checkedIn: false, invitationType: "automated_verified" }),
    "invited",
  );
  assert.equal(
    getReviewGuestType({ checkedIn: true, invitationType: "manual_email" }),
    "invited",
  );
});

test("one-star and five-star submissions are valid but no implicit rating is accepted", () => {
  for (const rating of [1, 5]) {
    const result = validateReviewSubmission({
      contactRequested: rating === 1,
      publicationConsent: true,
      rating,
      reviewText: "The experience gave me enough detail to share useful feedback.",
    });
    assert.equal("value" in result, true);
  }
  assert.match(
    validateReviewSubmission({
      contactRequested: false,
      publicationConsent: false,
      rating: null,
      reviewText: "The experience gave me enough detail to share useful feedback.",
    }).error ?? "",
    /star rating/i,
  );
});

test("review text rejects whitespace, HTML, scripts and extreme payloads", () => {
  for (const reviewText of ["     ", "<b>This review contains markup that must be rejected.</b>", "<script>alert(1)</script>", "x".repeat(2001)]) {
    const result = validateReviewSubmission({
      contactRequested: false,
      publicationConsent: false,
      rating: 3,
      reviewText,
    });
    assert.equal("error" in result, true);
  }
});

test("public display names never require full identity", () => {
  assert.equal(getSafePublicDisplayName({ firstName: "Chanel", surname: "Dawson" }), "Chanel D.");
  assert.equal(getSafePublicDisplayName({ firstName: "Chanel", surname: null }), "Chanel");
  assert.equal(getSafePublicDisplayName({ firstName: null, surname: "Dawson" }), "Zingara Guest");
  assert.equal(getSafePublicDisplayNameFromFullName("Sarah Marie Molefe"), "Sarah M.");
});

test("publication requires consent and low ratings follow the same rule", () => {
  assert.equal(canPublishReview({ action: "publish", publicationConsent: false, status: "needs_review" }), false);
  assert.equal(canPublishReview({ action: "publish", publicationConsent: true, status: "needs_review" }), true);
  assert.equal(canPublishReview({ action: "unpublish", publicationConsent: true, status: "published" }), true);
});

test("public payload contains only approved presentation fields", () => {
  const payload = toPublicReviewPayload(review());
  assert.deepEqual(Object.keys(payload ?? {}).sort(), [
    "displayName",
    "featured",
    "guestType",
    "publicReviewId",
    "publishedAt",
    "rating",
    "reviewText",
    "venue",
    "verifiedGuest",
  ]);
  assert.equal(toPublicReviewPayload(review({ publicationConsent: false })), null);
  assert.equal(toPublicReviewPayload(review({ status: "not_published" })), null);
});

test("aggregates include published consented reviews only and retain venue breakdown", () => {
  const result = getPublishedReviewAggregates([
    review({ id: "one", rating: 5 }),
    review({ id: "two", rating: 1 }),
    review({ id: "three", publicationConsent: false, rating: 2 }),
    review({ id: "four", rating: 3, status: "not_published", venue: "cape-town" }),
  ]);
  assert.equal(result.publishedCount, 2);
  assert.equal(result.averageRating, 3);
  assert.equal(result.ratingDistribution[1], 1);
  assert.equal(result.ratingDistribution[5], 1);
  assert.equal(result.venues.johannesburg.publishedCount, 2);
  assert.equal(result.venues["cape-town"], undefined);
});

test("public filters are allowlisted, bounded and unambiguous", () => {
  const valid = parsePublicReviewFilters(
    new URLSearchParams("venue=johannesburg&featured=true&limit=6&page=2"),
  );
  assert.deepEqual("value" in valid ? valid.value : null, {
    featured: true,
    limit: 6,
    page: 2,
    venue: "johannesburg",
  });
  for (const query of [
    "venue=durban",
    "featured=false",
    "limit=25",
    "limit=all",
    "page=0",
    "status=published",
  ]) {
    assert.equal("error" in parsePublicReviewFilters(new URLSearchParams(query)), true);
  }
});

test("Wix feed filtering and pagination expose only published consented reviews newest first", () => {
  const all = getVisiblePublicReviews(wixPreviewReviews, {
    featured: null,
    limit: 2,
    page: 1,
    venue: null,
  });
  assert.equal(all.total, 4);
  assert.deepEqual(all.records.map((item) => item.publicDisplayName), ["Chanel D.", "Lerato M."]);
  assert.equal(all.records.some((item) => item.publicDisplayName === "Private Guest"), false);
  assert.equal(all.records.some((item) => item.publicDisplayName === "Not Published"), false);

  const capeTownPageTwo = getVisiblePublicReviews(wixPreviewReviews, {
    featured: null,
    limit: 1,
    page: 2,
    venue: "cape-town",
  });
  assert.equal(capeTownPageTwo.total, 2);
  assert.equal(capeTownPageTwo.records[0]?.publicDisplayName, "Priya S.");

  const featured = getVisiblePublicReviews(wixPreviewReviews, {
    featured: true,
    limit: 12,
    page: 1,
    venue: null,
  });
  assert.deepEqual(featured.records.map((item) => item.publicDisplayName), ["Chanel D.", "Lerato M."]);
});

test("serialized public reviews contain no linked customer, booking, payment, moderation or token data", () => {
  const internalFixture = {
    ...review(),
    bookingReference: "ZNG-PRIVATE1",
    customerEmail: "private@example.com",
    customerId: "11111111-1111-4111-8111-111111111111",
    moderationNote: "Call +27 82 555 0199",
    paymentAmount: 999,
    tokenHash: "super-secret-token",
  };
  const serialized = JSON.stringify(toPublicReviewPayload(internalFixture));
  assert.doesNotMatch(serialized, /private@example\.com|\+27 82|ZNG-|DP-|moderation|payment|token|customerId/i);
  assert.deepEqual(Object.keys(JSON.parse(serialized)).sort(), [
    "displayName",
    "featured",
    "guestType",
    "publicReviewId",
    "publishedAt",
    "rating",
    "reviewText",
    "venue",
    "verifiedGuest",
  ]);
});

test("migration enforces one review per booking and immutable moderation evidence", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /booking_id uuid not null unique references public\.bookings/);
  assert.match(sql, /public_id uuid not null unique default gen_random_uuid\(\)/);
  assert.match(sql, /unique \(booking_id\)/);
  assert.match(sql, /moderation_status text not null default 'needs_review'/);
  assert.match(sql, /moderation_status <> 'published' or publication_consent/);
  assert.match(sql, /insert into public\.guest_review_events/);
  assert.match(sql, /REVIEW_STALE_REVISION/);
  assert.match(sql, /REVIEW_GUEST_CONTENT_IMMUTABLE/);
  assert.match(sql, /guest_reviews_protect_guest_wording/);
  assert.match(sql, /guest_reviews_public_newest_idx/);
  assert.match(sql, /guest_reviews_public_featured_idx/);
  assert.match(sql, /set_guest_review_featured/);
  assert.match(sql, /get_public_review_aggregates/);
  assert.match(sql, /REVIEW_FEATURE_REQUIRES_PUBLISHED_CONSENT/);
  assert.match(sql, /'featured'.*'unfeatured'/s);
  assert.match(sql, /revoke all on function public\.get_public_review_aggregates/);
  assert.doesNotMatch(sql, /delete from public\.guest_reviews/i);
});

test("public review submission is server validated, rate limited and service-role mediated", async () => {
  const route = await readFile(publicRoutePath, "utf8");
  assert.match(route, /checkRateLimit/);
  assert.match(route, /resolveVerifiedReviewContext/);
  assert.match(route, /submit_verified_guest_review/);
  assert.match(route, /validateReviewSubmission/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});

test("concurrent invitation creation resolves the one-booking uniqueness race", async () => {
  const server = await readFile(`${root}/src/lib/reviews/reviewServer.ts`, "utf8");
  assert.match(server, /saveError\.code === "23505"/);
  assert.match(server, /racedInvitation/);
  assert.match(server, /reused: true/);
});

test("moderation is permission and venue scoped without guest content mutation", async () => {
  const [route, panel] = await Promise.all([
    readFile(adminRoutePath, "utf8"),
    readFile(adminPanelPath, "utf8"),
  ]);
  assert.match(route, /communications:manage/);
  assert.match(route, /allowedVenues/);
  assert.match(route, /normalized\.includes\("all"\)/);
  assert.match(route, /moderate_guest_review/);
  assert.match(route, /set_guest_review_featured/);
  assert.match(route, /Only a published, consented review can be featured/);
  assert.match(route, /recordAuditEvent/);
  assert.doesNotMatch(route, /p_review_text|p_rating/);
  assert.match(panel, /Needs Review/);
  assert.match(panel, /Published/);
  assert.match(panel, /Not Published/);
  assert.match(panel, /Mark featured/);
  assert.match(panel, /Remove featured/);
  assert.doesNotMatch(panel, /setReviewText|setRating/);
});

test("public feed cannot expose private context or unapproved reviews", async () => {
  const route = await readFile(publicFeedPath, "utf8");
  assert.match(route, /eq\("moderation_status", "published"\)/);
  assert.match(route, /publication_consent_mode\.eq\.public/);
  assert.match(route, /publication_consent_mode\.eq\.anonymous/);
  assert.match(route, /publication_mode\.eq\.anonymous/);
  assert.match(route, /public_id/);
  assert.match(route, /publicReviewContractVersion/);
  assert.match(route, /get_public_review_aggregates/);
  assert.match(route, /limit: 180/);
  assert.match(route, /max-age=0, must-revalidate/);
  assert.match(route, /process\.env\.NODE_ENV === "production"/);
  assert.doesNotMatch(route, /\.select\("id,/);
  assert.doesNotMatch(route, /customer_id|booking_reference|email|phone|moderation_note/);
  assert.doesNotMatch(route, /Access-Control-Allow-Origin|stale-while-revalidate/);
});

test("Wix handoff uses a backend web module without a second review store or browser secret", async () => {
  const [backend, frontend, preview, handoff] = await Promise.all([
    readFile(wixBackendPath, "utf8"),
    readFile(wixFrontendPath, "utf8"),
    readFile(wixPreviewPath, "utf8"),
    readFile(`${root}/docs/wix-reviews/README.md`, "utf8"),
  ]);
  assert.match(backend, /wix-web-module/);
  assert.match(backend, /webMethod/);
  assert.match(backend, /Permissions\.Anyone/);
  assert.match(backend, /wix-fetch/);
  assert.match(backend, /book\.zingara\.co\.za\/api\/reviews\/public/);
  assert.match(backend, /MAXIMUM_PAGE_SIZE = 24/);
  assert.doesNotMatch(backend, /api[_-]?key|secret|wix-data|cms/i);
  assert.match(frontend, /backend\/reviews\.web/);
  assert.match(frontend, /publicReviewId/);
  assert.match(frontend, /loadMore/);
  assert.match(frontend, /venueFilter/);
  assert.match(frontend, /reviewsEmpty/);
  assert.match(frontend, /reviewsError/);
  assert.match(preview, /process\.env\.NODE_ENV === "production"/);
  assert.match(preview, /notFound\(\)/);
  assert.match(handoff, /backend only/i);
  assert.match(handoff, /Cape Town \(`\/capetownhome`\): after Gallery and before Contact Details \/ newsletter/);
  assert.match(handoff, /Johannesburg \(`\/joburghome`\): after Our Brand Partners and before Contact Details \/ newsletter/);
  assert.match(handoff, /Do not add or render a Reviews section on either live homepage/);
});

test("existing post-show workflow resolves recipient-specific links and remains disabled by default", async () => {
  const [workflow, admin, mailer, workflowAdminRoute] = await Promise.all([
    readFile(workflowPath, "utf8"),
    readFile(adminPagePath, "utf8"),
    readFile(customerEmailPath, "utf8"),
    readFile(workflowAdminRoutePath, "utf8"),
  ]);
  assert.match(workflow, /getOrCreateVerifiedReviewLink/);
  assert.match(workflow, /getReviewPreviewUrl/);
  assert.match(workflow, /findDuplicateSentCommunication/);
  assert.match(workflow, /sendOperationalCustomerEmail/);
  assert.match(admin, /workflowKey: "post_show_review"/);
  assert.match(admin, /enabled: false/);
  assert.match(admin, /\/api\/admin\/workflows/);
  assert.match(workflowAdminRoute, /new URL\(request\.url\)\.origin.*review\/preview/s);
  assert.match(mailer, /ticket\|payment\|find-booking\|book\|review/);
  assert.match(mailer, /createZingaraEmailCta/);
});

test("manual invitations extend review grain while automated invitations stay one per booking", async () => {
  const [sql, route, server] = await Promise.all([
    readFile(manualMigrationPath, "utf8"),
    readFile(manualInvitationRoutePath, "utf8"),
    readFile(`${root}/src/lib/reviews/reviewServer.ts`, "utf8"),
  ]);
  assert.match(sql, /review_invitations_one_automated_per_booking_idx/);
  assert.match(sql, /review_invitations_manual_email_identity_idx/);
  assert.match(sql, /drop constraint if exists guest_reviews_booking_id_key/);
  assert.match(route, /normalized_email/);
  assert.match(route, /createReviewToken/);
  assert.match(route, /sealReviewToken/);
  assert.match(route, /manualReviewInvitationLimitPerHour/);
  assert.match(route, /communications:manage/);
  assert.match(route, /bookings:manage/);
  assert.match(route, /hasVenueAccess/);
  assert.match(server, /eq\("invitation_type", "automated_verified"\)/);
  assert.match(server, /getReviewGuestType/);
});

test("database review submission accepts booking-only invitations and verifies only attended automated guests", async () => {
  const sql = await readFile(bookingEligibilityMigrationPath, "utf8");
  assert.match(
    sql,
    /v_verified :=[\s\S]*invitation_type = 'automated_verified'[\s\S]*ticket_status::text = 'checked_in'/,
  );
  assert.doesNotMatch(
    sql,
    /or\s*\(\s*v_verified\s+and\s+not exists/i,
  );
  assert.match(sql, /verified_guest[\s\S]*v_verified/);
});

test("review pages preserve explicit consent, contact choice and mobile layout", async () => {
  const [source, server] = await Promise.all([
    readFile(`${root}/src/app/review/[token]/ReviewSubmissionClient.tsx`, "utf8"),
    readFile(`${root}/src/lib/reviews/reviewServer.ts`, "utf8"),
  ]);
  assert.match(source, /publicationConsent/);
  assert.match(source, /contactRequested/);
  assert.match(source, /aria-label="Star rating"/);
  assert.equal((source.match(/data-review-star="standalone"/g) ?? []).length, 1);
  assert.match(source, /\[1, 2, 3, 4, 5\]\.map/);
  assert.doesNotMatch(source, /h-12 w-12 border text-2xl/);
  assert.match(source, /visibleRating !== null && value <= visibleRating/);
  assert.match(source, /ArrowRight.*ArrowUp/s);
  assert.match(source, /ArrowLeft.*ArrowDown/s);
  assert.match(source, /tabIndex=\{rating === value \|\| \(rating === null && value === 1\)/);
  assert.match(source, /aria-pressed=\{contactRequested === value\}/);
  assert.match(source, /rounded-2xl/);
  assert.match(source, /rounded-full bg-\[#D8C36A\]/);
  assert.match(source, /Guest D\./);
  assert.match(source, /Preview only\. No review was submitted\./);
  assert.match(server, /publicDisplayName: isAutomated[\s\S]*getSafePublicDisplayName/);
  assert.match(source, /sm:/);
  assert.doesNotMatch(source, /useState<number>\(5\)/);
  assert.doesNotMatch(source, /context\.firstName\} and my surname initial/);
});
