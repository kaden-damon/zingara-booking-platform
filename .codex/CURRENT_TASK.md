# P0 - Invoice Draft Save Failure

STATUS: COMPLETE

DATE: 29 OCTOBER 2026

## Incident

- Booking: `ZNG-4UGGV9`.
- User: Tristan Chetty.
- `SAVE DRAFT` produces no visible result and no invoice draft appears in
  Booking Details -> Financial Documents.

## Goal

Trace the shared direct booking-invoice workflow through the authenticated UI,
API validation and database persistence. Correct the smallest confirmed defect,
surface field-level validation clearly, and verify that a successful local draft
appears immediately without sending anything to Xero or a customer.

## Safety

- Production diagnosis is read-only.
- Use rollback-only fixtures for persistence verification.
- Do not alter booking or payment values.
- Do not create a real customer invoice or customer communication.
- Preserve VAT, accounting, permission, idempotency and Xero safeguards.
- Preserve unrelated working-tree files.

## Verified Result

- Root cause: the booking has no billing address. The API correctly rejected
  the draft, but the UI rendered that rejection behind the open editor modal,
  making `SAVE DRAFT` appear inactive.
- The blank gratuity VAT field is valid. Gratuity remains non-VAT and the
  authoritative total reconciles to `R19,688.00`.
- The editor now validates required fields before submission and displays the
  error summary and exact field message inside the modal.
- A successful save refreshes Financial Documents and opens the persisted
  draft immediately.
- Tristan Chetty remains authorised through his active Super Admin profile and
  the existing invoice-conversion allowlist.
- Production UI verification displayed `Add a billing address.` beside the
  field without issuing a write request.
- A final Production read confirmed that booking `ZNG-4UGGV9` still has zero
  invoice documents. No Xero or customer communication was triggered.

## Verification

- 9 focused invoice-draft, booking-invoice and document-math tests passed.
- TypeScript passed.
- Changed-file ESLint passed.
- `git diff --check` passed.
- Production build passed.
- Vercel Production deployment completed successfully.

## Release

- Application commit: `4a822c8bc2add6f05f9f25cdbc1113f493c9e529`.
- Rollback point: `94146d948f693d19224bdffa4026f48560b4ee69`.
- Production business-data delta: zero.
