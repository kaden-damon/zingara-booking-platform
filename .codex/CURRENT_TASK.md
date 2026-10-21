# Phase 50.4D — Xero final configuration and bank account resolution

User-authorised scope: diagnose the existing Production Xero integration, verify both bank identities, configure Tristan's discount/refund treatment using existing infrastructure, and release only verified corrections.

## Baseline and isolation

- Repository: kaden-damon/zingara-booking-platform.
- Isolated checkout from origin/main: ab53cca75f4fe3463a2a518b234c88807481e898.
- Original checkout and its unrelated user changes are untouched.
- Initial Production baseline: ab53cca75f4fe3463a2a518b234c88807481e898.
- A concurrent authorised Xero release landed during verification. This checkout was fast-forwarded to b53dc4e2b544225f09c86fd073ff012e80bd6273, preserving its bank, discount, refund and explicit-selection fixes rather than duplicating them.
- Release rollback: dpl_5NteujsJkJRtQFsWSsAnn9TeHrVN / zingara-booking-platform-2u2v2q120-kaden-damons-projects.vercel.app at b53dc4e.

## Mandatory boundaries

- XERO_LIVE_SYNC_AUTHORISED=false; sync remains paused.
- Bounded read-only Xero discovery; never log credentials or full bank numbers.
- Verify organisation Zingara Productions (Pty) Ltd and immutable Account IDs.
- No guessed bank identities; unmatched accounts remain unapproved.
- Preserve all 12 approved venue mappings, OUTPUT3 15% VAT and deposit part-payments.
- Discounts reduce the original venue sales account (JHB 205, CPT 205-01); existing discount calculations unchanged.
- Refunds require a credit note against the original Xero invoice; missing invoice means manual reconciliation. Preserve approval, reconciliation, audit and idempotency controls.
- No real invoices, contacts, payments, credit notes, refunds, chart/account changes, historical imports, customer messages, bookings/tickets/capacity changes or webhook activation.
- Configuration changes only where verified and authorised; no Production business-data changes.

## Work

1. Confirm Production commit/deployment and rollback; inspect current discovery/scopes/tenant/mappings.
2. Diagnose complete bounded bank discovery and masked immutable identities.
3. Make minimal configuration/runtime/UI corrections using existing infrastructure.
4. Run mocked focused Xero tests, TypeScript, changed-file ESLint, diff checks and Production webpack build.
5. Commit authorised files, push main and deploy Production only if changes required; reverify paused state and no financial writes.
6. Report exact findings and remaining blockers honestly; do not claim completion until verified.

## Progress

- Read root AGENTS.md and installed Next.js route-handler guide.
- Found original checkout 17 commits behind main with unrelated edits; isolated latest baseline.
- Found later discovery correction 9d7e6de already on baseline; reviewing that implementation before changes.
- Bounded authenticated Production discovery verified the correct organisation and both requested bank identities. All 12 active BANK accounts had EnablePaymentsToAccount=false, including both uncoded target accounts; the previous payment-account filter excluded them. Actual bank identifiers are masked and live Account IDs are retained only in local evidence/configuration, not source code.
- Production scopes include accounting.settings.read; no scope change is needed. XERO_LIVE_SYNC_AUTHORISED=false, connection sync_paused=true, no webhook key configured.
- All 12 existing approved mappings snapshotted read-only; four local draft documents, zero outbox/contact-mapping/webhook/reconciliation records before release.
- The concurrent Production release already approved both verified BANK mappings and both venue discounts, giving 16 approvals. The original 12 approvals and zero financial outbox/contact/webhook/reconciliation counts remain intact. These existing approvals are reused without rewriting them.
- Discarded overlapping local draft changes after preserving a local patch. Only remaining verified corrections are implemented: source-specific approved Account IDs at payment execution, official credit-note Allocations request shape, prevention of original-invoice identity overwrite, and masked PayFast UI/error text.
- Existing original-invoice refund/contact/tax checks, authorisation boundary, durable idempotency, and manual reconciliation behaviour are preserved. No automatic financial activity is enabled. No operational discount calculations are changed.
- 44 focused mocked Xero tests pass. Final TypeScript, changed-file ESLint, git diff --check and Production webpack build pass against b53dc4e.
- Production environment rechecked: XERO_LIVE_SYNC_AUTHORISED=false; no webhook key configured. Runtime connection remains sync_paused=true.
- The authorised release uses the existing GitHub main → Vercel Production pipeline, so ignored environment files and local read-only audit evidence are never uploaded as application source.
- Final commit/deployment identifiers and post-release verification are reported in the chat and local verification evidence. No financial round-trip or webhook activation is authorised by this task.
- No Production mapping writes or financial/business-data mutations have been performed by this checkout.
