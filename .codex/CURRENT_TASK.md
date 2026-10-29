# Phase 59.1 - Surgical COMP Correction

STATUS: IN PROGRESS

DATE: 29 OCTOBER 2026

## Authoritative Rule

- Standard, Media and Tradex COMP bookings are fully complimentary.
- Guest payable, payment received and outstanding balance are always `R0`.
- Each category carries an internal cash-up value of `R550` per guest only.
- The internal value is not booking revenue, a payment or a financial obligation.

## Scope

- Correct new internal Standard booking creation without changing the three
  category controls.
- Keep payment, PayFast and payment-link paths unavailable for every COMP type.
- Derive cash-up values from the current guest count in Table Plan exports:
  Standard COMP, Media column S and Tradex column T.
- Reconcile all shifted workbook formulas and verify both venue exports.
- Preserve existing booking, ticket, seating and historical financial records.

## Safety

- No historical booking or financial backfill.
- No customer communication or Production QA booking.
- No changes to ordinary paid booking calculations.
- Preserve unrelated working-tree files.
