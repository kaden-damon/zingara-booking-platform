# Phase 56.1 - Purchase Conversion Tracking & Attribution

STATUS: COMPLETE - DEPLOYED DISABLED

DATE: 29 OCTOBER 2026

## Implementation

- Verified PayFast ITN payments are the sole Purchase authority.
- A service-role-only conversion outbox provides payment-and-destination
  idempotency, atomic claims, bounded retries, leases and sanitized provider
  evidence without blocking payment confirmation or ticket issuance.
- Meta CAPI, GA4 Measurement Protocol and Google Ads click-conversion delivery
  use the successful payment transaction amount in ZAR and a stable opaque
  payment event ID. Deposits, balances and full payments remain distinct.
- Public booking attribution supports consented UTM, Meta click/browser and
  Google click identifiers plus the GA client ID, with a 90-day expiry and no
  customer PII.
- Zero-value complimentary completion no longer emits `AddPaymentInfo`.
- The legacy browser Purchase path is suppressed when the new server path is
  authorised, preventing browser/server double counting.

## Activation Boundary

- Production attribution capture, global delivery and all three destinations
  remain disabled.
- Each destination requires its own explicit UTC activation timestamp. Payments
  before that timestamp can never be queued by the recovery scan, preventing
  historical backfill when a provider is enabled later.
- GA4 requires a Measurement Protocol API secret for `G-PP7C1SBY8N`.
- Meta requires a verified CAPI Graph version and access token for dataset
  `1434578967806435`; no Meta account login was attempted.
- Direct Google Ads upload requires verified OAuth credentials, developer token,
  customer ID and an upload-click conversion action. The authenticated Google
  session has no account matching the supplied conversion ID, so Jurelle must
  confirm whether Ads imports GA4 Purchase or uses a separate action. Direct Ads
  delivery must remain disabled if GA4 import is the authoritative conversion.

## Verification

- Focused advertising tests: 10 passed.
- TypeScript and changed-file ESLint passed with no errors; existing warnings in
  legacy files remain unchanged.
- Migration dry run and application succeeded. Row-level security is active.
- Production verification immediately after migration: zero attribution rows,
  zero outbox rows and zero queued conversions.
- Production webpack build passed. No fabricated provider event was sent, so no
  live provider acceptance is claimed.

## Release

- Rollback application commit: `6f0cfbaaed32870824f587b704f774382cf198f9`.
- Migration: `20261029143000_phase_56_1_purchase_conversion_outbox.sql`.
- Application commit and Vercel deployment are recorded in the final report for
  the commit containing this phase record.
- Business-data delta: two empty protected tracking tables and their service-role
  queue functions. No booking, payment, ticket, customer, Xero or financial
  record changed; no conversion was queued or transmitted.

PHASE 56.1 COMPLETE - VERIFIED PURCHASE CONVERSION TRACKING DEPLOYED DISABLED.

## Meta Activation Follow-up - 3 November 2026

- Existing Pixel funnel events, consent controls, PayFast ITN authority,
  payment-level outbox idempotency and retry safeguards were retained.
- Production initially contained 357 consented attribution rows and 299 successful GA4
  Purchase deliveries, confirming the shared server outbox is operational.
- No Meta outbox rows or historical Meta backlog existed before activation.
- Production Vercel configuration contains `META_PIXEL_ID` and
  `META_CAPI_ACCESS_TOKEN` as protected secrets. No secret value was exposed.
- The follow-up removes the duplicated dataset constant, passes the same
  server-provided dataset ID to Pixel and CAPI, defaults to Graph API `v26.0`,
  and keeps the token out of URLs and browser code.
- Purchase remains server-only under the authorised Phase 56.1 path: one stable
  event identity and actual ZAR value per verified PayFast deposit, balance or
  full-payment transaction. Browser funnel events do not create Purchases.
- A management-only readiness check verifies dataset identity and token access
  without sending a fabricated conversion.
- Focused advertising and consent tests passed 27/27; the final readiness suite
  passed 9/9. TypeScript, changed-file lint and diff validation passed.
- Application commits `84f9ba441ce15993b3222bf1e7285b4fe0390eed`,
  `cef67e910988dd137cdb8bfd80563cd76acb960d` and
  `c6c2caf19e31a24ab3639eb65f0e9faba30b0e22` reached Production. Final Vercel
  deployment `HodNbxDY9HVQde6Cqyb6WAbh4cqi` was Ready at 08:04:25 SAST.
- The authenticated management-only readiness check reached Meta without
  sending an event, but Meta rejected the configured dataset/token lookup with
  HTTP 400, code 100, type `OAuthException` and safe classification
  `request_rejected`. Dataset identity and provider acceptance are not verified.
- Meta CAPI was therefore not activated. No activation timestamp was set, no
  Meta outbox row exists and no Purchase event or historical backlog was sent.
- Post-release Production evidence: 359 consented attribution rows and 300 GA4
  Purchase rows, all GA4 rows successful, with zero Meta rows. Booking, payment,
  ticket and financial data were unchanged.
- Required next action: provide a CAPI access token generated for the exact
  configured dataset with Conversions API permission, repeat readiness, then
  set a fresh UTC activation timestamp. A Meta Test Events code is additionally
  required for an Events Manager test-event receipt; no fabricated Purchase was
  sent.

### Corrected Credential Retest - 3 November 2026

- The corrected `META_CAPI_ACCESS_TOKEN` and existing `META_PIXEL_ID` were
  verified as present, protected Production-only Vercel secrets without exposing
  either value.
- Vercel automatically redeployed the corrected secret as deployment
  `9WYg3HZTR3MrmhYCi2tRq3U4C55Y`, Ready at 08:21:15 SAST.
- Follow-up commit `59e63b0dedd4299b62d22f239a2f56d97731671b`
  added sanitised provider messages to the management-only readiness response;
  tests passed 9/9 with TypeScript, changed-file lint and diff validation.
- Production deployment `94SwdXrVC19XyhYV4PSx1dq8B57S` was Ready at
  08:26:29 SAST. The authenticated protected retest reached Meta without
  generating a conversion.
- Meta again rejected readiness with HTTP 400, code 100, null subcode, type
  `OAuthException` and sanitised message `(#100) Missing Permission`. This is a
  permissions failure; dataset identity and provider acceptance remain
  unverified.
- CAPI remains disabled and no activation timestamp was set. Production contains
  301 successful GA4 outbox rows and zero Meta rows, proving no historical or
  current Purchase was sent or queued by the retest.
- Jurelle must grant the token's system user access to the configured dataset
  with the required Conversions API permission, or provide a replacement token
  with that permission. A Meta Test Events code is still required for test-event
  receipt verification after readiness succeeds.

### Meta Permission Root Cause Resolution - 3 November 2026

- The earlier permission conclusion was not supported by the operation tested.
  The failing request was `GET /v26.0/{dataset_id}?fields=id`, which requires
  dataset-object read access and is not the CAPI event-delivery operation.
- Meta CAPI delivery uses `POST /v26.0/{dataset_id}/events`. Commit
  `8ee27acf6cd2792ffcd438217ea7dcb06404e37a` now separates passive token
  authentication from actual Test Events delivery verification.
- The passive management-only check uses `GET /v26.0/me?fields=id`, sends no
  event and does not require dataset-management access. The optional POST check
  requires a validated `META_CAPI_TEST_EVENT_CODE` and sends one synthetic
  `ZingaraCapiReadiness` event, never a Purchase and never customer data.
- Production deployment `dpl_DHSfS6PtdspULodkuUNf45W7jz32` reached Ready and
  was aliased to `book.zingara.co.za` at 08:44:58 SAST.
- Authenticated Production verification returned HTTP 200 with
  `tokenAccepted=true`, proving the configured token is active. Delivery and
  dataset association remain deliberately unclaimed because no Test Events code
  is configured: `deliveryVerified=false`, `datasetMatches=null` and
  `testEventRequired=true`.
- Focused readiness tests passed 12/12. TypeScript, changed-file ESLint and diff
  validation passed.
- Production contains 304 successful GA4 outbox rows and zero Meta rows. CAPI
  remains disabled, no activation timestamp was set, and no event or historical
  conversion was transmitted by the readiness correction.
- No token regeneration or permission change is currently justified. Jurelle's
  only remaining action is to supply a Test Events code from the configured
  dataset. Successful receipt of that isolated POST is the required proof before
  future-only Meta CAPI activation.
