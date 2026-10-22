# Phase 50.13A - Quotation Workflow Verification & UX Polish

Zingara is live Production. Continue from Phase 50.13 with diagnosis-first, surgical verification and correction. Preserve all existing functionality, business data, financial controls, permissions, mappings and Xero safety boundaries.

## Goal

Verify the complete secure quotation journey, the approved banking-confirmation attachment, Sales acceptance notifications and Invoice Requests, then correct only inconsistent control styling in the existing Zingara x Xero workspace.

## Banking confirmation

- Verify the active private document `Account Confirmation Letter - Aug 2026 (2).pdf`, version 1, approved by Kaden Damon on 22 October 2026.
- Confirm private storage, authorised retrieval, quotation-email attachment, versioning and replacement permissions without replacing or modifying the document.

## Quotation workflow

- Verify Create Quote -> PDF -> branded email -> secure customer view -> explicit exact-version acceptance -> Sales confirmation -> Request Invoice -> Accounts queue.
- Use isolated fixtures for financial data and authorised internal identities. Never send to genuine customers or create a real Xero invoice.
- Before any Production test that persists a quotation, acceptance, request or email record, identify the exact records and obtain explicit approval.
- Confirm both PDFs, branded HTML, greeting/reference, secure CTA, provider acceptance evidence and one idempotent Sales notification.
- Confirm Request Invoice is acceptance-gated, exact-version, duplicate-safe, attributed to Sales and visible in the Accounts queue. Preserve Tristan/Rachelle conversion permissions, Wagheeda reminder eligibility and the reminder toggle OFF.

## UX polish

- Audit only the existing Zingara x Xero workspace: mappings, venue selection, banking controls, quote/invoice actions, search/filters, document table, details modals, public acceptance controls and invoice-request actions.
- Apply the established rounded black/champagne-gold language, pill actions, compact spacing, consistent heights, hierarchy and responsive alignment.
- Preserve the approved layout and functionality. Do not redesign the module or modify unrelated Admin areas.

## Safety

- Keep `XERO_LIVE_SYNC_AUTHORISED=false` and synchronisation paused.
- Do not create Xero contacts, invoices, payments or credit notes; allocate payments; change mappings; send genuine customer communications; or modify bookings, tickets, Table Plan or financial records.
- Preserve all 16 approved Xero mappings and unrelated working-tree changes.

## Verification and release

- Verify the complete workflow, secure acceptance, banking attachment, Sales confirmation, invoice-request lifecycle, Accounts permissions, reminder toggle OFF, responsive layouts and performance.
- Run focused tests, TypeScript, changed-file ESLint, `git diff --check` and Production build.
- Commit and deploy only verified UI or functional corrections. Do not deploy merely to repeat verification and do not activate live Xero synchronisation.

Final status target: Phase 50.13A complete - Quotation workflow verified and UX refined.
