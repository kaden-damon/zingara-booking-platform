# Invoice & Refund Workflow Integrity

**Date:** 10 November 2026  
**Status:** Deployed; application corrections verified; provider execution and authenticated UI verification pending

## Scope

Investigate Tristan's invoice and refund reports, correct confirmed shared
integration defects, preserve all financial history, and avoid real Xero or
PayFast transactions during QA.

## Xero Reconciliation

Booking `ZNG-4UGGV9` is confirmed, fully paid and financially reconciled:

- Booking value / paid: R19,688.00
- Ticket and booking-fee value: R17,500.00
- Gratuity: R2,188.00, non-VAT
- VAT: R2,282.60
- Outstanding: R0.00
- PayFast transaction: one complete payment; no refund

Local invoice `ZD-001001` contains the same R19,688.00 total and correct
approved Johannesburg account/tax mappings. Xero is connected, live sync is
enabled and required mappings are approved. The document's outbox failed once
with HTTP 400 and was blocked before Xero assigned a contact, invoice ID or
invoice number.

### Root cause

The generated Xero Contact Number used `ZINGARA-CUSTOMER-` plus a UUID, which
is 53 characters. Xero documents a 50-character maximum. The HTTP transport
discarded Xero's validation body, retaining only `Xero request failed (400).`
The document therefore remained `pending` while its outbox was `blocked`, and
the UI offered no safe retry.

### Correction

- Stable contact numbers now use a 24-character SHA-256 identity suffix and
  remain below Xero's maximum.
- Xero validation summaries and element errors are retained without tokens or
  request secrets.
- Terminal worker failures set local documents to `action_required`.
- A server-authorised, atomic retry reuses the existing outbox identity,
  replaces the invalid payload, resets its lease and records an audit event.
- Only the existing authorised invoice converters can see/use Retry Xero.
- The worker still searches Xero by the stable local reference before create,
  preserving duplicate prevention.

`Draft`, `Awaiting Xero` and `Awaiting Accounts` remain correct before Xero
success. The defect was their stale presentation after a terminal provider
failure.

## PayFast Refund Reconciliation

PayFast's query endpoint is authoritative for whether a full refund uses the
original `PAYMENT_SOURCE`, requires `BANK_PAYOUT`, or is `NOT_AVAILABLE`.
Banking details are therefore legitimate only when PayFast returns bank payout.
The application does not collect them for payment-source refunds and does not
attempt unsupported methods.

Production retained six failed attempts across two bookings:

- Four attempts stopped after a refundable eligibility result.
- Two attempts reached refund submission and retained only a generic provider
  failure.

The old sanitiser dropped nested refund-method data and the old error parser
dropped nested provider explanations. The exact historical reasons cannot be
reconstructed from retained evidence and are not inferred.

### Correction

- Refund POST transport now matches PayFast's official SDK JSON request path
  while preserving the required alphabetised signature inputs.
- Nested provider rejection messages are retained and shown to authorised
  Finance staff.
- Sanitised evidence now retains funding type and full-refund method, never
  bank account data.
- `PAYMENT_SOURCE` refunds continue automatically; `BANK_PAYOUT` continues to
  stop for authorised manual handling.
- Password confirmation, one-payment full-refund eligibility, idempotency and
  unknown-outcome reconciliation locks are unchanged.

Partial refunds and bookings paid by multiple provider transactions remain
outside the current automated workflow and require Finance review.

## Verification

- `npx tsx --test src/lib/payfast/refunds.test.ts src/lib/xero/xeroRuntime.test.ts src/lib/xero/xeroActivation.test.ts`: 30/30 passed.
- Focused ESLint: passed.
- Next.js 16.3.4 webpack Production build and TypeScript: passed.
- Supabase migration dry run: only
  `20261110170000_invoice_sync_retry_integrity.sql`.
- Migration applied successfully; one blocked document was reconciled from
  stale `pending` to `action_required`.
- Post-release financial safety query: zero new refund attempts, zero Xero
  retries, zero target Xero invoices and zero target contact mappings.
- Public and Admin shells: HTTP 200. Unauthenticated Xero API: HTTP 401.

Direct authenticated UI verification could not be completed because Chrome
reported that the Mac was locked after physical input. This is recorded as an
explicit verification gap rather than treated as success.

## Release

- Application commit: `b9ea8255906c8823f31a3da1c1025db96eab0c13`
- Production deployment: `dpl_3oAt2E1sx9vMifDLyged2CabzxGz`
- Deployment state: Ready
- Ready at: 10 November 2026, 14:07:10 SAST
- Migration: `20261110170000_invoice_sync_retry_integrity.sql`

## Business-data Delta

- Changed: local sync status for `ZD-001001`, `pending` to
  `action_required`, so the terminal provider failure is visible.
- Unchanged: bookings, payments, refunds, invoice amounts, VAT, gratuity,
  Xero provider records, Xero contacts, customer communications and accounting
  history.

## Pending Authorised Steps

1. Restore an authenticated Admin session and visually confirm the Action
   Required status and Retry Xero control.
2. Tristan or Rachelle must review and explicitly select Retry Xero if the real
   invoice should now be created. That action was not executed during QA.
3. Confirm a future eligible `PAYMENT_SOURCE` refund through the normal
   authorised Finance workflow. No real refund was permitted as a test.

## Xero P0 Follow-up - 10 November 2026

The original HTTP 400 remains the only provider attempt. Audit evidence records
the initial queue action by Tristan at 09:41:19 SAST on 30 October 2026 and no
`xero_invoice_sync_retried` event. The old transport did not retain Xero's
response body, so the historical validation message is not recoverable; the
53-character Contact Number and Xero's 50-character limit remain the verified
cause supported by the retained request evidence.

Production connection evidence at 14:31 SAST confirmed the approved Zingara
tenant was connected, live sync was active, health had no error, ZAR was the
base currency and all required Johannesburg invoice mappings were approved.
The Vodacom `ZQ-001004` remains a sent, local-only historical quote for
R510,000.00, distinct from the later R684,400.00 booking record. It was not
repriced, regenerated or submitted.

A second application defect was corrected: Settings -> Integrations -> Sync
Attention used the legacy generic outbox retry, which only requeued the stored
payload and would have resent the invalid 53-character Contact Number. It now
identifies `ZD-001001 · ZNG-4UGGV9` and opens the invoice for the existing
authorised rebuilt-payload retry. The legacy shortcut fails closed server-side.
The document list reports `Action Required` rather than `Not connected`, while
the integration independently reports LIVE SYNC ACTIVE. Approved mappings now
show a disabled `Approved` state unless their values are changed.

- Follow-up commit: `94d91fe265931ac5a91b7aa6ee3cdbca8585ad67`
- Production deployment: `dpl_FqLvhT613c5QF9TcYqDh48ScCJuW`
- Deployment state/source: Ready; `main` at `94d91fe`
- Focused Xero tests: 51/51 passed
- Changed-file ESLint: passed
- Next.js compile and TypeScript: passed
- Authenticated Production UI: verified LIVE SYNC ACTIVE, approved mappings,
  linked attention item, Action Required status and Retry Xero control
- Public shell: HTTP 200; unauthenticated Xero API: HTTP 401
- Business-data delta: none

The real invoice remains deliberately unsubmitted. Tristan or Rachelle must
review `ZD-001001` and explicitly select Retry Xero under the existing Accounts
authority. Successful provider invoice creation, Xero invoice number and Xero
status can only be independently confirmed after that authorised action.
