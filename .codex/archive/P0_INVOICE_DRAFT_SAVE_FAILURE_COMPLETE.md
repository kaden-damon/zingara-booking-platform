# P0 - Invoice Draft Save Failure - Complete

DATE: 29 OCTOBER 2026

## Incident

Booking `ZNG-4UGGV9` appeared to ignore `SAVE DRAFT` for Tristan Chetty.

## Root Cause

The booking has no billing address. Server validation correctly rejected the
draft with `Add a billing address.`, but the workspace displayed the error
outside and behind the open editor modal. Staff therefore saw no visible result.
The blank gratuity VAT field was not defective; gratuity is correctly non-VAT.

## Correction

- Added shared client-side draft validation aligned with server requirements.
- Displayed the validation summary and field-specific errors inside the editor.
- Mapped authoritative server validation messages to the relevant field.
- Cleared field errors as staff correct the input.
- Refreshed Financial Documents and opened the saved draft after persistence.
- Preserved all server-side accounting, VAT, permission, idempotency and Xero
  safeguards.

## Financial Verification

- Ticket sales: `R17,490.00`, VAT inclusive.
- Booking fee: `R10.00`, VAT inclusive.
- Gratuity: `R2,188.00`, non-VAT.
- Subtotal: `R17,405.40`.
- VAT: `R2,282.60`.
- Total: `R19,688.00`.
- Booking is fully paid; no values were changed.

## Scope

A bounded Production audit found 3,690 fully paid bookings eligible for direct
invoicing without an existing invoice. Of those, 3,577 lack a billing address
and 923 lack a billing email, so the visibility defect affected the shared
workflow rather than only this booking.

Tristan's active Super Admin profile and existing invoice-conversion permission
were verified from authoritative staff configuration. QA did not impersonate
his browser session.

## Verification

- 9 focused tests passed.
- TypeScript, changed-file ESLint and `git diff --check` passed.
- Production build passed.
- Authenticated Production UI showed the error summary and
  `Add a billing address.` beside the empty field.
- The Production database still contains no invoice for `ZNG-4UGGV9`.
- No Xero write, customer email, booking change or payment change occurred.

## Release

- Application commit: `4a822c8bc2add6f05f9f25cdbc1113f493c9e529`.
- Previous Production rollback point:
  `94146d948f693d19224bdffa4026f48560b4ee69`.
- Production business-data delta: zero.

P0 COMPLETE - INVOICE DRAFT SAVING RESTORED.
