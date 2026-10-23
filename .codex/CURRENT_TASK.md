# Phase 50.16A - Booking Details document access

Zingara is live Production. Add compact, authorised access to existing quotations and invoices from the existing Booking Details popup without duplicating documents, records, renderers or accounting workflows.

## Authorised scope

- Show only quotations and invoices linked to the exact open booking.
- Distinguish quotations, local invoice drafts and Xero-issued invoices.
- Provide View PDF and Download PDF actions through the existing authoritative renderer and permissions.
- Preserve the existing Zingara x Xero workspace as the full accounting workspace.
- Keep Xero live synchronisation and Invoice Request reminders OFF.
- Do not touch Phase 50.14 Guided Training.

## Performance requirements

- Make no document request during ordinary Booking Details loading.
- Load documents only after staff explicitly open the section.
- Use an exact-reference, venue-authorised, bounded server query.
- Load full document data and the PDF renderer only when View PDF or Download PDF is selected.
- Cache a generated PDF for the life of the open Booking Details view so View and Download do not render it twice.
- Preserve Phase 50.12 Admin performance improvements and avoid polling, global hydration or per-row requests.

## Baseline

- Starting commit: `1b853465fc7f8cd8fd9f4f931a306d39a510327b`.
- Starting `main` matched `origin/main`.
- Untracked `output/` and `tmp/` are preserved local Phase 50.16 evidence and are excluded from this release.
- Rollback point: `1b853465fc7f8cd8fd9f4f931a306d39a510327b`.

## Release gates

- Focused document-access, Xero PDF and permission tests.
- TypeScript, changed-file ESLint, `git diff --check` and Production build.
- Authenticated Production verification of normal Booking Details loading, lazy document loading, document labels, PDF view/download and unchanged walkthrough responsiveness.
- No Production booking, payment, ticket, capacity, customer, quotation, invoice or Xero data mutation.

## Implementation and local verification - 23 October 2026

- Added one compact `Quotes & Invoices` section immediately after Booking Overview in the existing Booking Details popup.
- Reused the existing Xero document records, role permissions, venue scope and `createXeroDocumentPdf` renderer; no document or financial record is duplicated.
- Added an exact booking-reference lookup that verifies the authoritative booking and performance venue before returning quote or invoice summaries.
- The lookup is capped at 100 linked documents, ordered deterministically and limited to quotation and invoice kinds.
- Normal Booking Details loading makes zero document requests. The linked-document request runs once only after staff select `Open`.
- Full document data and the PDF renderer load only after `View PDF` or `Download PDF`; the generated PDF is cached for the open view.
- Quotations, invoice drafts and issued invoices have distinct labels.
- Production QA found and corrected a duplicate React sibling key between the new document panel and the existing Corporate operations panel. Repeated booking refreshes now reconcile one document panel instead of retaining duplicate instances.
- The Production-build Admin chunk changed from 1,003,179 bytes to 1,003,306 bytes (+127 bytes, +0.013%). The panel is a separate 6,247-byte lazy chunk.
- Focused Xero, PDF, permissions and document-access tests: 55 passed.
- TypeScript: passed.
- Changed-file ESLint: passed. The unchanged large Admin page retains 56 historical warnings and two baseline `set-state-in-effect` findings outside this phase; lint completed with those two baseline findings excluded and zero errors.
- `git diff --check`: passed.
- Production build: passed with the pre-existing `ticketPdfServer.ts` filesystem-tracing warning outside this phase.
- No migration or Production business-data mutation is required.
