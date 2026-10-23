# Phase 50.4I - Xero Controlled Live Activation

Controlled live activation completed on 23 October 2026.

## Production

- Source baseline: `0f6e13e63e1820a05905493512ccd6afd7d7b462`.
- Activation deployment: `dpl_FWVCJU2X8FGFKjHDDRk1S6Fm2fmc`.
- Activation timestamp: `2026-10-23T14:21:07.624934Z` (16:21:07 SAST).
- Organisation: Zingara Productions (Pty) Ltd.
- `XERO_LIVE_SYNC_AUTHORISED=true` in Vercel Production.
- Connection status: connected; sync is not paused.
- Accounting mappings: 16/16 approved and unchanged.
- Outbound queue: empty.
- Xero-linked documents: zero.

## Security

- Xero webhook Intent to Receive: OK.
- Rotated webhook key is stored as a Vercel Production Secret and was included in the activation deployment.
- Invalid webhook signatures are rejected with HTTP 401 before persistence.
- OAuth tenant discovery and encrypted token refresh succeeded.

## Authorised scope

Only future invoice conversions manually submitted by Tristan Chetty or Rachelle Smuts are admitted. The immutable activation cutoff excludes all historical documents and existing drafts. Automatic payment allocations, refunds, credit notes and bulk synchronisation remain excluded. Stable versioned idempotency, bounded leasing, retry limits and atomic provider-identity completion remain enforced.

## Walkthrough

The existing Quote & Invoice Management walkthrough text was updated to describe controlled live Xero invoice creation and its exclusions. Its version remains `quote-invoice-management-2026-10-23-v2`, preserving every acknowledgement.

## Verification

- 29 focused walkthrough and Xero tests passed in the release run; the preceding readiness run passed 31 focused Xero tests.
- TypeScript passed.
- Changed-file ESLint passed.
- `git diff --check` passed.
- Production build passed with the existing ticket-PDF tracing warning only.
- Admin and public booking routes returned HTTP 200.
- No invoice, contact, payment, refund, credit note or other Xero financial record was created.
- Production business-data delta: one Xero connection activation timestamp/status audit mutation only.
- Phase 50.14 was untouched.
