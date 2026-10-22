# Phase 50.13 - Invoice Requests & Accounts Notifications

Zingara is live Production. Extend the existing Quote & Invoice Management and Staff Emails architecture with the smallest safe implementation. Preserve all booking, payment, Xero, permission, audit, performance and business-data safeguards.

## Goal

Allow authorised Sales staff to send secure quotations, receive exact-version customer acceptance and request an invoice after acceptance. Tristan and Rachelle may review and convert eligible accepted quotations through the existing Finance workflow. Wagheeda receives reminders but does not gain conversion permission. Add one consolidated daily reminder using the existing Microsoft 365 and Zingara HTML email infrastructure.

## Customer quotation acceptance

- Quotation emails use the existing branded HTML shell and Microsoft 365 delivery. They include the exact quotation PDF, the active approved Confirmation of Banking Details PDF and a secure `VIEW & ACCEPT QUOTE` link.
- Fail closed when no authoritative active banking confirmation exists. Never expose private storage URLs.
- Acceptance links are unpredictable, stored hashed, bound to quote ID/version/customer/amount/currency/snapshot and invalidated by revision. Opening a link never accepts it.
- Provide a compact public mobile-friendly quotation page with exact details, PDF download and explicit `ACCEPT QUOTATION` action. No login is required and no internal UUID is exposed.
- Acceptance is atomic, exact-version and idempotent, records immutable evidence, never changes financial values and never creates an invoice.
- On successful acceptance, send one idempotent branded confirmation to the responsible Sales staff identity. The accepted quote then becomes eligible for `REQUEST INVOICE`.

## Banking confirmation document

- Add a compact `CONFIRMATION OF BANKING DETAILS` panel inside the existing Zingara x Xero Integration workspace.
- Store PDFs in existing private Supabase Storage with MIME, signature and size validation. Retain immutable versions and keep one authoritative active version.
- Existing authorised staff may view the current document. Only the verified Kaden Damon and Wagheeda staff profile IDs may upload or replace it; enforce this server-side and audit every replacement.
- Previously sent quotation deliveries retain the banking-document version used. This document is a communication attachment only and never changes Xero, PayFast or invoice accounting configuration.

## Invoice request workflow

- Add `REQUEST INVOICE` only for accepted, invoice-eligible quotations with no outstanding request and no linked invoice.
- Record the exact accepted quote/version, requesting staff identity and timestamp, and immutable audit evidence.
- Make requests server-side idempotent and concurrency-safe. Requesting an invoice must not create an invoice, change pricing, contact a customer or trigger Xero.
- Use the lifecycle `ACCEPTED -> INVOICE REQUESTED -> INVOICED`. Failed conversion leaves the request outstanding and safely retryable. Successful authoritative conversion preserves request history and exposes the linked invoice status to Sales.
- Add a compact `INVOICE REQUESTED` filter to the existing Accounts workspace. Do not create another approval screen.

## Permissions

- Preserve existing Sales quote creation, draft editing, delivery, acceptance visibility, venue scope and status access.
- Sales may request invoices but may not convert them, override accepted values, change accounting mappings or trigger Xero synchronisation.
- Only verified Tristan and Rachelle staff identities may convert requested quotations, subject to existing Finance/management permission checks.
- Wagheeda receives reminder access only and must not gain conversion permission.

## Xero boundary

- Reuse the existing Xero integration, organisation, 16 mappings, identity, VAT, gratuity, discount, deposit, payment and reconciliation safeguards.
- Keep `XERO_LIVE_SYNC_AUTHORISED=false`. Do not create live Xero contacts, invoices, payments or credit notes, process history, or invent a disconnected financial workflow.

## Daily reminder

- Add `INVOICE REQUEST REMINDERS` under Communications -> Staff Emails using existing persisted settings and permissions. Default OFF; changing the toggle must not send immediately.
- Resolve Tristan, Rachelle and Wagheeda from authoritative staff profiles. Never invent addresses.
- Run once each scheduled morning, only when enabled and valid outstanding requests exist. Send one consolidated branded email, not one per quote.
- Include the bounded outstanding count and summary rows for quote reference, customer/company, amount and request date, plus `VIEW INVOICE REQUESTS` linking to the filtered Accounts queue.
- Deduplicate by reporting date, preserve retries and delivery auditing, and distinguish provider acceptance from inbox delivery. Suppress empty, invoiced, invalid, cancelled and superseded requests.

## UX and performance

- Reuse existing black/gold rounded controls and existing Quote Management layouts. Show compact `REQUEST INVOICE`, `INVOICE REQUESTED` and `INVOICED` states.
- Use bounded server-side queries and existing pagination. No global hydration, per-quote requests, unnecessary polling or impact to public booking, Box Office, payments, Xero or Admin performance.

## Verification and release

- Test quote creation/editing/delivery/acceptance, both PDF attachments, secure token expiry/revocation, revised-version invalidation, duplicate acceptance prevention, Sales notification idempotency, banking upload permissions/private retrieval/version preservation, accepted-version protection, request idempotency, queue/filter, venue permissions, Sales restrictions, Tristan/Rachelle conversion, Wagheeda reminder-only access, conversion failure/retry/completion, invoice identity, sync-disabled behavior, reminder recipients/content/toggle/empty suppression/idempotency, and existing workflows.
- Use fixtures and mocked financial/email writes. Do not send customer communications, daily reminders or create real invoices during QA.
- Verify responsive behavior at 1440px, 900px and 390px where authenticated rendering is available.
- Run focused tests, TypeScript, changed-file ESLint, `git diff --check`, migration validation and Production build.
- Commit only authorised changes, push to main, deploy to Vercel Production and verify the workflow. Keep the reminder toggle OFF and live Xero sync paused.
- Preserve unrelated user-owned changes and record baseline and rollback.

Final status: Phase 50.13 complete - Customer Quote Acceptance, Banking Details & Invoice Requests verified.
