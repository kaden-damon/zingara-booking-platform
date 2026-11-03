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
- Production contains 357 consented attribution rows and 299 successful GA4
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
- Focused advertising and consent tests passed 27/27; TypeScript, changed-file
  lint and diff validation passed. Production activation and provider
  verification remain pending the controlled release.
