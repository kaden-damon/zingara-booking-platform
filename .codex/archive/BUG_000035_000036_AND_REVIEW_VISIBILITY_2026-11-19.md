# Priority Booking And Review Issues - 035 / 036 / Missing Reviews

STATUS: CONFIRMED CORRECTIONS RELEASED / PRODUCTION VERIFIED; FINANCIAL AND SPECIFIC-REVIEW FOLLOW-UP SEPARATE

DATE: 19 NOVEMBER 2026

## Continuity And Safety

- Continued the existing task/worktree after the interrupted connection/browser
  session. Read AGENTS, CURRENT_TASK, README and relevant gratuity/payment/
  amendment/Reviews records. Baseline main 3b3c40d5a3e6c06fc89484c681ad2cf5ca74f177.
- Preserved all unrelated Markdown, Vodacom evidence, checkpoints and Frontend 2.0.
  No booking, payment, review, moderation, customer communication or historical
  financial record was changed during investigation or verification.
- The isolated fixture-only browser command exited with a selector timing error
  before completing its assertions. Browser cleanup ran; no task-owned QA process
  remained at recovery. No browser retest or Production browser navigation used.

## BUG-000035 - Historical Gratuity, Not A New Collection Defect

- Original issue and private courtney.png attachment recovered read-only. The
  exact matching booking is ZNG-VNS6DS, Courtney, 10 guests, customer_public /
  online, created 2 September 2026 before the 5 November venue-paid transition.
- Stored subtotal R12,500 less R1,250 discount = R11,250. Historical 12.5%
  calculation is R1,406.25, retained as the then-recorded whole-Rand R1,406.
  Total/paid R12,656, outstanding R0. The screenshot matches these values.
- Confirmed PayFast-linked payment row: R12,656 allocated, provider gross
  R12,666, separate R10 transaction fee, confirmed provider-linked receipt.
  This supports recorded collection, not merely an invented display allocation.
  Independent bank settlement was not queried or claimed.
- No per-booking exception evidence found; consistent with the original policy
  before the recorded 5 November 23:10:59 SAST transition for new public bookings.
  Existing creation pricing now excludes Standard upfront gratuity and preserves
  Corporate rules. Tests cover both, plus the historical collected label.
- No correction to this historical booking/payment, refund or automatic repricing
  is justified. Any discretionary refund would require separate authorisation.

## BUG-000036 - Deposit Instalment Mistaken For Added Ticket Obligation

- Original creation was 16 guests, not 17: 20 October, total R26,483, including
  R500 Kosher and R2,943 historically charged gratuity. Retain that rounding.
- On 3 November Michael Davis increased 16 to 17; existing native reconciliation
  used saved paymentModel=deposit / depositPerPerson=R550 as the entire additional
  obligation. Total became R27,033 rather than adding the R1,440 ticket and its
  applicable historical R180 gratuity. The difference at that amendment was
  R1,070; a full saved-agreement increase would have produced R28,103.
- Rasmus's R28,040 excludes gratuity on the Kosher component and differs from the
  stored historical composition/rounding. It must not be forced into this record.
- Actual PayFast booking allocations R8,800 + R18,233 = R27,033; provider gross
  R8,810 + R18,243 = R27,053 includes two R10 fees, not extra ticket revenue.
- On 16 November staff reduced 17 to 16 through the established paid retained-
  total path: total/paid R27,033 and outstanding R0 deliberately preserved.
  R1,440 bar-credit wording exists only in operational notes; not proof of a
  funded structured transfer. Current customer remediation needs agreement/
  bar-credit review, not an automatic R1,070 debt, refund or accounting adjustment.
- Confirmed prospective correction: eligible native per-person increases use
  the saved full ticket rate independently of deposit instalments. Add historical
  gratuity only when already charged and not pay-at-venue; round on added-ticket
  subtotal. Preserve the original payment plan/provenance and all paid amounts.
- Fixed Corporate/Buyout, explicit legacy/manual deposit agreements, temporary
  table pricing, COMP, ambiguous-pricing guards and paid reductions remain on
  their existing paths. No historical backfill or current-booking save.
- API compares the submitted added-guest preview against the authoritative
  current calculation before saving. Already-open tabs with missing/old R550
  previews receive actionable 409 ADDED_GUEST_PRICE_REVIEW_REQUIRED, not a silent
  R1,620 amendment. Existing booking-context query is reused; no extra query.
- The atomic SQL overload also requires that reviewed amount and rejects a
  mismatch before writes. The original eight-argument function is unchanged;
  legacy callers keep their existing path during rollout. Install the protected
  overload before deploying its caller, so no price changes silently mid-release.
- Read-only scope query found 35 distinct native deposit-increase candidates.
  This is a review population, NOT 35 confirmed debts or a quantified loss.

## Reviews Visibility

- Read-only Production counts: Needs Review 45, Published 743, Not Published 39
  (827 total). Exact deployed nested list query returns the latest Needs Review
  rows successfully with correct count/sort; no query regression reproduced.
- Charlie remains active Super Admin, all venues, communications:manage granted.
  No permission or venue restriction explains the inspected recent records.
- Recent examples remain present: Kayla M., Owen J. and Nomthetho M. were
  explicitly published by Charlie on 19 November and belong in Published;
  Christine N. is Not Published. Latest Piet S. remains Needs Review.
  Submitted-event orphan count is zero; this is not proof against deletion of
  an unspecified record. No review was recreated, republished or modified.
- Confirmed independent edge defect: publishing/filter changes can remove the
  final page while the client stays on that out-of-range page, showing an empty
  list despite remaining records. Clamp to the current final page through the
  existing fetch flow, clear invalid selection and retain explicit-selection,
  stale-response, status/search/filter/venue and action-identity protections.
  Ordinary requests unchanged; only necessary out-of-range recovery fetch occurs.
- Asked for one guest name/reference to identify Charlie's specific missing
  review. No example supplied yet. Do NOT mark that report conclusively resolved
  from counts alone or equate the edge fix with proof of the reported cause.

## Completed Verification

- 33 focused tests pass: native/full/deposit pricing, Standard/Corporate gratuity,
  historical collection, rounding, COMP, paid reductions, review page boundaries,
  selection recovery and existing server permission/venue protections.
- Local PGlite executes the actual deployed amendment definition plus the guarded
  migration: reproduces old +R550, verifies corrected +R1,620, retained deposit
  provenance/paid amount/fitting table, venue-paid/full/legacy/temporary/COMP and
  paid-reduction cases, stale rejection and atomic rollback on a late audit error.
- TypeScript and whitespace pass. Changed modules are ESLint-clean except the
  two-line transport addition in Admin page: its two pre-existing hook errors
  and 59 warnings exactly match HEAD, verified by rule/message comparison.
  No unrelated lint cleanup or new dependency was introduced.
- Production schema rollback-only compilation succeeds, service-only execution
  retained (anonymous false/service true). Final reviewed-price overload MD5:
  b3c8b55125a98ac9561f48111a6b456a; unchanged original signature MD5:
  4a04d2041ca867e849cb12acd334517d. Initial replacement candidate eafef22a9a8539933020dabcbdd8d9f6
  was rollback-only and superseded by this rollout-safe overload; never applied.
- Before-release booking fingerprint (two affected bookings):
  c04fbab6d8e4c6b54c452dba98e927be; payment fingerprint:
  494f8e4fc3bece84a53676f1d8b98317. Compare after release without saving records.

## Release

- Scoped commit cbfa9892fea79bedca0ed26ad70c30a0cf45b535 pushed to main.
  Only nine directly related code/test/migration files plus this task archive
  committed. Accumulated CURRENT_TASK and unrelated dirty records excluded.
- Applied migration 20261119160000 and its ledger entry atomically before the
  application caller rollout. Reviewed-price overload MD5 exactly
  b3c8b55125a98ac9561f48111a6b456a; original eight-argument MD5 still
  4a04d2041ca867e849cb12acd334517d. Anonymous false, service-role execute true.
- Vercel Production dpl_3smm6P6GimmKbpRRw1zLRTGitBQ7 READY, exact-SHA GitHub
  Vercel status success, serving https://book.zingara.co.za. Deployment URL:
  https://zingara-booking-platform-bgv66g74v-kaden-damons-projects.vercel.app.
  Live alias independently inspected; /admin HTTP 200, unauthenticated
  /api/admin/reviews HTTP 401 (permissions not bypassed).
- Actual installed SQL pricing block reproduced in a READ ONLY transaction
  against ZNG-RLKP77's current snapshot: R1,620 full additional obligation;
  stale R550 preview rejected. No full amendment/save executed in Production.
- Post-release fingerprints exactly equal before-release values:
  bookings c04fbab6d8e4c6b54c452dba98e927be;
  payments 494f8e4fc3bece84a53676f1d8b98317.
  ZNG-RLKP77 remains 16 guests, total/paid R27,033, balance R0;
  ZNG-VNS6DS remains 10 guests, total/paid R12,656, balance R0.
- New live verification evidence supersedes earlier review-status counts:
  still 827 records, now 745 Published and 82 Not Published; zero Needs Review.
  The three inspected recent reviews still exist. Latest 60 moderation events
  are attributed to Charlie: 50 needs_review -> not_published, two published,
  one published_anonymous, seven published -> not_published. These include
  actions through 15:18:46 SAST on 19 November. Moderation intent is not inferred.
  Recorded status transitions explain an emptied Needs Review queue; use existing
  Published/Not Published tabs. This release changed no review/moderation record.
- The confirmed page-boundary defect is corrected; no claim of fresh live
  authenticated browser QA. Charlie's particular allegedly missing record still
  needs a name/reference to conclusively identify it. Do not automatically
  republish or undo her moderation without case-specific evidence/authority.
- Any historical undercharge/bar-credit/customer financial remediation remains
  separately authorised work. No refunds, new charges, repricing, messages,
  customer/accounting changes or Frontend 2.0 work occurred. Final task/release
  evidence updated locally without another unnecessary deployment.

## Quick Needs Review Verification - 19 November 2026

- Exactly one read-only Production count query grouped moderation/publication
  status: needs_review 0; published/named 623; published/anonymous 122;
  not_published 82. Total 827, matching the previous final verification.
- Existing Admin Reviews underlying PostgREST query, first page/10 rows, no
  search or extra filters, both allowed venues, latest-reply left embed and
  existing sorting: HTTP 200, Content-Range */0, zero rows. No pending records
  are being excluded by this query; filters/venue restrictions cannot explain
  a different pending count when the global authoritative count is already zero.
- Important verification boundary: this is the endpoint's underlying query,
  not a newly captured authenticated /api/admin/reviews HTTP response. No existing
  logged-in Production Admin tab was available; no credentials/session were
  created or changed, no navigation or extensive browser QA performed.
- Previously recorded Charlie moderation events explain the emptied queue.
  Published/Not Published remain the appropriate existing views. No review
  recreation, republishing, data/history mutation or code defect identified.
- Conclusion: reported Needs Review 0 is correct. Stop; no correction, tests,
  commit, push or deployment required. Specific historical missing-review
  identification remains separate from this verified zero-pending conclusion.
