# Phase 50.4G - Xero Live Activation

Zingara is live Production. Complete the remaining Xero readiness work for the existing Quote & Invoice Management workflow without enabling financial writes before the final human approval boundary.

## Authorised scope

- Verify the live OAuth connection, approved tenant, 16 accounting mappings, webhook readiness, environment gate, Accounts permissions, sync worker, reconciliation, and pending documents/jobs.
- Reuse the existing Phase 49.0-50.4F Xero infrastructure.
- Resolve verified technical blockers with the smallest safe changes.
- Prepare only future, manually approved invoice conversions by Tristan Chetty and Rachelle Smuts.
- Exclude historical documents, existing drafts, bulk synchronisation, payment allocations, refunds, credit notes, and unauthorised staff actions.
- Update the Quote & Invoice walkthrough only if activation changes the staff workflow and a new version is genuinely required.

## Safety boundary

- Keep `XERO_LIVE_SYNC_AUTHORISED=false` until the webhook security checks pass and Kaden explicitly approves the exact activation scope.
- Do not create real Xero contacts, invoices, payments, refunds, or credit notes during verification.
- Do not process historical or existing local documents.
- Preserve all mappings, booking/payment/ticket/capacity data, audit evidence, idempotency, reconciliation, and unrelated changes.
- Keep Phase 50.14 Guided Training untouched.

## Production baseline

- `main`, `origin/main`, and Production deployment: `a073560490d682ed585380a43223c743dbf628b6`.
- Rollback point before Phase 50.4G: `a073560490d682ed585380a43223c743dbf628b6`.
- Connected tenant: Zingara Productions (Pty) Ltd; connection remains `sync_paused`.
- Production has 16 approved mappings, no Xero-linked local documents, no outbox rows, no webhook receipts, and no open reconciliation exceptions.
- `XERO_LIVE_SYNC_AUTHORISED=false` and `XERO_WEBHOOK_KEY` is not configured.

## Verified activation blockers

- The existing enable action would promote every paused outbox row. Even though Production currently has no rows, this violates the approved future-only activation contract.
- The activation path does not require a configured webhook signing key.
- The existing document queue action is broader than the approved initial scope.

## Required correction

- Record an immutable first live-activation cutoff on the selected Xero connection.
- Never bulk-release paused outbox rows when synchronisation is enabled.
- Require a configured webhook signing key before connection activation.
- Permit initial live document queueing only for invoice drafts converted from a valid accepted/requested quotation, created after the activation cutoff, and actioned by Tristan or Rachelle with existing Finance authority.
- Leave pre-activation drafts and all non-invoice operations unavailable to this initial activation path.
- Preserve the existing manual retry, idempotency, bounded worker, mapping, and reconciliation safeguards.

## Verification and release

- Run focused Xero activation, permission, idempotency, worker, webhook, and invoice-request tests.
- Run TypeScript, changed-file ESLint, `git diff --check`, migration validation, and Production build.
- Commit, push, and deploy only the verified technical readiness correction.
- Keep live sync paused after deployment and report the exact Xero Developer/Vercel actions required for webhook setup and final activation approval.

## Verified implementation - 23 October 2026

- Controlled activation records an immutable first-activation timestamp and never releases historical paused work.
- Only Tristan Chetty or Rachelle Smuts can atomically queue a future invoice converted from the exact accepted/requested quotation version.
- The initial worker claims invoice document creation only; payments, refunds, credit notes, existing drafts, historical records and bulk work remain excluded.
- Invoice creation retries check the stable Zingara reference before writing, and provider identity plus local completion are recorded atomically.
- Webhooks require a valid signature, deduplicate event keys and ignore tenants other than the selected connected organisation.
- Reconciliation is bounded to Xero invoices already linked by this workflow and cannot import historical provider documents.
- The existing workflow runner supplies bounded retries and reconciliation without polling; both remain no-ops while the environment gate is false.
- The Feature Walkthrough copy now reflects the controlled Accounts workflow without issuing another version or resetting acknowledgements.
- Production remains paused with no outbox rows, linked Xero documents, webhook receipts or reconciliation exceptions.
- Focused tests: 54 passed. TypeScript, changed-file ESLint, `git diff --check`, migration dry-run, Production schema lint and Production build passed.
- Existing unrelated ticket-integrity schema was verified before repairing its missing Supabase migration-history entry; no ticket or booking data changed.
