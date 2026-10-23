# Phase 50.4I - Xero Controlled Live Activation

## Status

COMPLETE - CONTROLLED LIVE SYNC ACTIVE

## Verified Production state

- Source baseline: `0f6e13e63e1820a05905493512ccd6afd7d7b462`.
- Activation deployment: `dpl_FWVCJU2X8FGFKjHDDRk1S6Fm2fmc`.
- Correct tenant: Zingara Productions (Pty) Ltd.
- Webhook key: rotated, stored as a Vercel Production Secret, deployed and validated by Xero Intent to Receive.
- Invalid webhook signatures fail closed with HTTP 401.
- `XERO_LIVE_SYNC_AUTHORISED=true`.
- Connection status: connected; `sync_paused=false`.
- Immutable activation timestamp: `2026-10-23T14:21:07.624934Z` (16:21:07 SAST).
- Accounting mappings: 16/16 approved and unchanged.
- Outbound queue: empty.
- Existing local documents: five; all remain local-only and unlinked to Xero.
- Xero financial records created during activation: zero.

## Active scope

Only future invoice conversions manually submitted by the authoritative Tristan Chetty or Rachelle Smuts staff identities can enter the Xero outbox. The invoice must be created after the immutable activation timestamp and originate from the accepted, invoice-requested quotation version.

Historical documents, existing drafts, automatic payment allocations, refunds, credit notes and bulk synchronisation remain excluded. Idempotency, bounded worker claims, leased retries, exact-version completion and venue-specific mappings remain enforced.

## Walkthrough release

The existing six-step Quote & Invoice Management walkthrough now explains the active future-only manual Xero workflow and exclusions. The version remains `quote-invoice-management-2026-10-23-v2`; acknowledgements are not reset.

## Verification

- 29 focused walkthrough and Xero tests passed in the release run.
- TypeScript, changed-file ESLint and `git diff --check` passed.
- Production build passed with the pre-existing ticket-PDF tracing warning only.
- Production Admin and public booking routes returned HTTP 200.
- The P0 two-seater releases remain in the deployed history.
- Phase 50.14 was untouched.

## Business-data delta

One authorised Xero connection-state mutation: status changed from `sync_paused` to `connected`, `sync_paused` changed to false, and the immutable activation timestamp plus audit evidence were recorded. No booking, customer, payment, ticket, capacity or Xero financial record changed.
