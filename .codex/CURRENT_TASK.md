# P0 Table Plan Export & Seating Classification Integrity

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 3 NOVEMBER 2026

## Incident And Correction

- JHB 3 November 2026 placed numbered temporary table `408` in Middle Ring and
  omitted yellow repeated headings in a large dynamic export.
- The prior permanent-table fix covered only the exact 74 master codes. The
  temporary-plan allocator could continue from legacy cross-zone numbers.
  Sixteen retained temporary rows across four performances have this mismatch.
- Exact numeric table codes now export in the approved number families while
  preserving the booking's authoritative `ORIGINAL ZONE`. Named temporary
  tables and merged codes retain their show-specific saved section.
- Future temporary plans allocate atomically inside the selected zone family.
  Existing rows were not renamed or rewritten.
- Phase 64's unconditional `D79:K79` fill clearing mutated shared Excel styles.
  It now clears only recognised red fills on cloned styles, preserving every
  yellow repeated heading.

## Verification And Release

- Focused tests: 16/16 passed. TypeScript, changed-file ESLint, whitespace
  validation and the Next.js Webpack Production build passed.
- Migration `20261103135000_p0_table_plan_seating_classification.sql` applied.
- Fresh authenticated Production exports:
  `Zingara_Table_Plan_JHB_2026-11-03 (2).xlsx` and
  `Zingara_Table_Plan_CPT_2026-11-03 (2).xlsx`.
- JHB table `408` now appears under `GOLD CIRCLE`; Brenton Veeran remains 10
  guests and `ORIGINAL ZONE` remains `Middle Ring`. All JHB and CPT repeated
  headings are yellow; Notes, payment, COMP and dietary columns remain present.
- Application commit: `6af231b0`.
- Production deployment: `dpl_3h1g2KJyEmpSRs5DjMe64vqX4r8D`, Ready and aliased
  to `book.zingara.co.za` at 13:54:10 SAST.
- Rollback: revert `6af231b0` and restore the previous function definition from
  `20260910143000_phase_41_1x_a_incremental_temporary_capacity_recovery.sql`.
- Business-data delta: zero.

## Archive

- `.codex/archive/P0_TABLE_PLAN_EXPORT_SEATING_CLASSIFICATION_INTEGRITY_COMPLETE.md`

---

# P0 Box Office Seating Override Booking Failure

STATUS: COMPLETE - MIGRATED AND DEPLOYED

DATE: 3 NOVEMBER 2026

## Incident

- Authorised Box Office two-seater overrides reached the final booking step but
  failed before persistence with `Booking transaction failed`.
- Production recorded 13 failed `create_booking` events across five booking
  references between 12:38:01 and 16:24:28 SAST on 2 November 2026.
- All five failed references have zero bookings, payments and tickets, confirming
  retries did not create duplicate business records.

## Root Cause And Correction

- `enforce_two_seater_booking_limit()` is a `BEFORE INSERT` trigger. It consumed
  the valid override and linked `booking_id = NEW.id` before the new booking row
  existed, causing foreign-key error `23503`.
- Migration `20261103090000_p0_two_seater_override_creation_fk.sql` makes only
  that foreign key `DEFERRABLE INITIALLY DEFERRED`, so it is checked after the
  booking insert completes in the same transaction. Failed transactions still
  roll back authorization consumption and audit evidence atomically.
- Checkout errors now distinguish booking persistence failures from actual
  PayFast preparation failures. Complimentary creation errors no longer claim
  that payment could not be started.
- Roles, mandatory reasons, quota enforcement, capacity validation, one-table
  automatic assignment, payment logic and ticket rules are unchanged.

## Verification And Release

- Focused two-seater tests passed 10/10; complimentary tests passed 7/7;
  provenance tests passed 5/5; TypeScript and migration dry-run passed.
- Existing unrelated `paymentStart` source assertions and a direct Node module
  resolution test remain stale; neither failure references the changed logic.
- Production constraint verification reports `condeferrable=true` and
  `condeferred=true`.
- A rollback-only Production transaction exercised the formerly failing
  pre-insert relationship and persisted zero fixture rows.
- Authenticated Production Admin loaded successfully after deployment. No live
  booking, payment, ticket or customer record was created for QA.
- Application commit: `a4910fc4`.
- Migration applied: `20261103090000_p0_two_seater_override_creation_fk.sql`.
- Production deployment: `dpl_82X7gxcMgKiSiededRQxCxVyFaa3`, Ready and aliased
  to `book.zingara.co.za` at 09:28:46 SAST.
- Business-data delta: none. Only the foreign-key timing metadata changed.

## Previous Task: Meta Pixel & Conversions API Integration

STATUS: COMPLETE - META CAPI VERIFIED AND ACTIVE FOR FUTURE ELIGIBLE PAYMENTS

DATE: 3 NOVEMBER 2026

## Objective

Complete the existing consent-gated Meta Pixel and verified PayFast Purchase
Conversions API integration without duplicating the Phase 56.1 outbox or
affecting booking and payment workflows.

## Verified Baseline

- Meta Pixel already records PageView, ViewContent, InitiateCheckout and
  AddPaymentInfo only after Marketing consent and never on Admin routes.
- Phase 56.1 already provides ITN-authoritative payment-level Purchase events,
  an atomic destination outbox, bounded retries, leases and idempotency.
- Production initially had 357 consented attribution records and 299 successful GA4
  Purchase deliveries. No Meta outbox rows or historical Meta backlog exist.
- `META_PIXEL_ID` and `META_CAPI_ACCESS_TOKEN` are present as Production-only
  Vercel secrets. Their values were not exposed.
- Global server Purchase authority and attribution capture are active. Meta is
  not yet an enabled destination.

## Implementation

- Use the server-provided `META_PIXEL_ID` for both browser Pixel and CAPI instead
  of a duplicated source-code constant.
- Keep the CAPI access token server-only and send it in the Authorization header,
  never in source, browser bundles, URLs, logs or records.
- Default to supported Graph API `v26.0`, while retaining an optional validated
  environment override.
- Keep Purchase server-only when the Phase 56.1 server path is authorised. Each
  verified PayFast deposit, balance or full payment uses its own stable payment
  event ID and actual ZAR transaction value.
- Add a management-only readiness endpoint with two deliberately separate checks:
  a passive token identity check and an optional synthetic Test Events delivery
  check. Dataset delivery is never inferred from unrelated object-read access.

## Verification

- Focused advertising and consent tests: 27/27 passed.
- Final provider-readiness regression tests: 12/12 passed.
- TypeScript passed.
- Changed-file ESLint passed.
- Diff validation passed.
- The local full build reached an existing compiler-worker restriction in three
  unrelated Admin files. Vercel's clean Production build remains the release
  gate; no failure referenced changed Meta files.

## Production Release

- Application commits: `84f9ba441ce15993b3222bf1e7285b4fe0390eed`,
  `cef67e910988dd137cdb8bfd80563cd76acb960d` and
  `c6c2caf19e31a24ab3639eb65f0e9faba30b0e22`. Follow-up commit
  `59e63b0dedd4299b62d22f239a2f56d97731671b` adds only sanitised provider
  error reporting to the protected readiness check.
- Vercel automatically redeployed the corrected Production secret as deployment
  `9WYg3HZTR3MrmhYCi2tRq3U4C55Y`, Ready on 3 November 2026 at 08:21:15 SAST.
  Follow-up deployment `94SwdXrVC19XyhYV4PSx1dq8B57S` reached Ready at
  08:26:29 SAST and is the active Production release.
- Authenticated Production Admin loaded successfully. The management-only
  readiness request reached Meta without exposing credentials or sending an
  event.
- The protected retest used the corrected Production secret and Meta rejected
  the configured dataset/token readiness lookup with HTTP 400, provider code
  100, null subcode, type `OAuthException` and sanitised message
  `(#100) Missing Permission`. The failure is permission-related; dataset
  identity and provider acceptance therefore remain unverified.
- Production now contains 301 successful GA4 deliveries and still contains zero
  Meta outbox rows.

## Permission Error Resolution

- The HTTP 400 `OAuthException` code 100 `(#100) Missing Permission` came from
  `GET /v26.0/{dataset_id}?fields=id`. That operation tests dataset-object read
  access, not the `POST /v26.0/{dataset_id}/events` operation used by CAPI.
- Commit `8ee27acf6cd2792ffcd438217ea7dcb06404e37a` replaces that false gate with
  `GET /v26.0/me?fields=id` for passive token authentication and an optional
  synthetic, non-Purchase Test Events POST for actual delivery proof.
- Production deployment `dpl_DHSfS6PtdspULodkuUNf45W7jz32` was Ready and
  aliased to `book.zingara.co.za` on 3 November 2026 at 08:44:58 SAST.
- Authenticated Production verification returned HTTP 200 with
  `tokenAccepted=true`, `deliveryVerified=false`, `datasetMatches=null` and
  `testEventRequired=true`. The existing token is active; dataset delivery has
  not yet been tested because no `META_CAPI_TEST_EVENT_CODE` is configured.
- Production contains 304 successful GA4 outbox rows and zero Meta rows. No
  Purchase, synthetic event or historical conversion was queued or sent by
  this correction.

## Safe Activation Boundary

- Jurelle supplied a dataset Test Events code on 3 November 2026. It was stored
  as a protected Production-only setting, used once, and removed immediately
  after verification. Its value was not recorded in source, logs or Markdown.
- The protected `POST /v26.0/{dataset_id}/events` check returned HTTP 200 with
  `accepted=true`, `deliveryVerified=true`, `datasetMatches=true` and
  `tokenAccepted=true`. Meta therefore accepted the configured token for event
  delivery to the configured dataset.
- The check sent one synthetic `ZingaraCapiReadiness` Test Events event. It was
  not a Purchase and contained no customer data, booking data or payment data.
- Meta CAPI was enabled for future eligible payments from
  `2026-11-03T07:50:53Z` (`09:50:53 SAST`). The existing consent, authoritative
  PayFast confirmation, payment-level idempotency and browser/server
  deduplication controls remain unchanged.
- Activation deployment `dpl_2zx9DHZGFJcikzPiyZ2AY7ShdnGS` reached Ready and
  was aliased to `book.zingara.co.za` on 3 November 2026. The preceding
  test-setting deployment was `dpl_EQWqmCY8VDurww4kn5sMUxdTHPcH`.
- Post-activation Production evidence contains 307 succeeded GA4 outbox rows and
  zero Meta rows. No historical payment was queued or replayed; Meta rows can be
  created only for eligible verified payments occurring on or after the
  activation timestamp.
