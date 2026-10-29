# Phase 59.1 - Surgical COMP Correction

STATUS: COMPLETE

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

## Completed Correction

- Standard, Media and Tradex remain fully complimentary at `R0` payable,
  `R0` paid and `R0` outstanding.
- No COMP category creates a payment record, payment request or PayFast link.
- The internal cash-up value is derived as `R550 x current guest count` only
  when generating operational Table Plan values.
- Standard COMP uses the existing COMP field, Media uses column S and Tradex
  uses column T. The values are excluded from revenue, payments received and
  outstanding balances.
- Guest-count amendments preserve the normal complimentary reconciliation path
  and recalculate the export value from the amended guest count.
- The Phase 59 chargeable-COMP database branch was removed without rewriting
  any booking, payment or customer row.

## Verification

- 46 focused COMP and Table Plan tests passed.
- Generated workbook validation passed for Johannesburg and Cape Town across
  Standard, Media and Tradex COMP categories.
- TypeScript passed.
- Changed-file ESLint passed with no new errors; three existing warnings remain
  in the booking route.
- `git diff --check` passed.
- Next.js Production build passed with the supported webpack builder.
- Production database verification confirmed the chargeable-COMP branch is
  absent while table-fit and complimentary increase safeguards remain active.
- Production audit found no Media or Tradex Phase 59 financial records requiring
  correction; no historical backfill was performed.

## Release

- Application commit: `37e15fdca7a0e59f97e21d134eb3da28709457a1`.
- Vercel deployment: successful on 29 October 2026.
- Production migration: `20261029235964_phase_59_1_comp_cashup_only`, applied
  and recorded in migration history.
- Rollback point: `fbfb1a5`.
- Production business-data delta: zero booking, customer, payment, ticket, Xero
  or financial-record changes. Only the reconciliation function definition and
  migration history changed.
