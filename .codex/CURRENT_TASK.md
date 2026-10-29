# P0 - Invoice Draft Save Failure

STATUS: IN PROGRESS

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
