# Phase 50.4F - Xero final verification and controlled activation

Zingara is live Production. Continue the existing Xero integration without rebuilding or duplicating it. Diagnose first and make only the smallest verified corrections.

## Goal

Complete the remaining Xero readiness checks and ensure the existing Quote & Invoice workflows are operationally ready for authorised Sales staff, while keeping all live financial synchronisation paused pending separate explicit approval.

## Current-state verification

- Confirm current Git HEAD, Production deployment and rollback point.
- Verify the OAuth connection, connected organisation, all 16 approved mappings, webhook configuration and `XERO_WEBHOOK_KEY` presence, `XERO_LIVE_SYNC_AUTHORISED`, outbound workers, reconciliation and existing local accounting documents from current Production evidence.
- Do not rely on previous phase reports where current evidence is available.
- Never expose credentials, tokens or signing keys.

## Webhook and security

- If the webhook key exists, verify signature validation, tenant identity, idempotency, retries and bounded processing using safe fixtures and read-only Production evidence.
- If it is absent, document the exact secure configuration steps and stop at the human security boundary.
- Reuse the existing webhook infrastructure. Do not reconnect OAuth or expand scopes without separate authorisation.

## Sales and accounting workflows

- Verify role-appropriate Sales access to Quote & Invoice Management, existing customer selection, Corporate booking links, approved line items, pricing/VAT, branded PDFs, acceptance, invoice conversion and status viewing.
- Preserve management and financial permissions; never grant unrestricted accounting access.
- Verify the flow from quote creation through acceptance, invoice conversion, Xero allocation/reconciliation and Zingara status updates with mock/demo transports only.
- Preserve customer, booking, quote/invoice and provider identities; Xero-generated numbers; venue mappings; VAT, gratuity, discounts, deposits; PayFast/EFT separation; and refund/credit-note controls.

## Testing and release boundary

- Use an authorised demo organisation or isolated fixtures for all write-path tests. Do not create live Xero contacts, invoices, payments or credit notes.
- Verify contact mapping, quote acceptance, invoice creation, partial/full payments, status reconciliation, duplicate prevention, webhook handling, retries and refund credit notes for Johannesburg and Cape Town mappings.
- Run focused Xero/Sales tests, TypeScript, changed-file ESLint, `git diff --check` and Production build.
- Commit and deploy only a verified in-scope application fix. Do not deploy merely to repeat verification.
- Keep `XERO_LIVE_SYNC_AUTHORISED=false`. Do not process existing drafts, historical records or queued writes.
- Do not modify bookings, payments, tickets, capacity, Table Plan, customer identities or unrelated Admin modules.

## Activation boundary

After all readiness checks, stop and request explicit approval for controlled live activation. State exactly which future document types and events would synchronise. No live financial synchronisation is authorised by this task.

Final status: Phase 50.4F - Xero integration verified; awaiting controlled live activation.
