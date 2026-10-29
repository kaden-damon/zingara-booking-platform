# Phase 59.1 - Surgical COMP Correction Complete

DATE: 29 OCTOBER 2026

STATUS: COMPLETE

## Outcome

All three complimentary categories now follow the authoritative rule:

- Standard COMP: guest payable `R0`; internal cash-up value `R550` per guest.
- Media COMP: guest payable `R0`; internal cash-up value `R550` per guest.
- Tradex COMP: guest payable `R0`; internal cash-up value `R550` per guest.

Internal values are operational reporting values only. They do not create
revenue, payments, balances, payment links or PayFast requests.

## Table Plan

- Standard COMP remains in the existing COMP field.
- Media remains in column S.
- Tradex remains in column T.
- Values derive from the current guest count and are kept out of actual payment
  and revenue totals.
- Generated Johannesburg and Cape Town workbooks verified category placement,
  summary formulas, shifted references and zero payable/payment values.

## Verification

- 46 focused tests passed.
- TypeScript passed.
- Changed-file ESLint passed with no new errors.
- `git diff --check` passed.
- Production build passed using the supported webpack builder.
- Production database checks confirmed the obsolete chargeable-COMP branch is
  absent and seating/table-fit safeguards remain active.

## Release

- Application commit: `37e15fdca7a0e59f97e21d134eb3da28709457a1`.
- Migration: `20261029235964_phase_59_1_comp_cashup_only`.
- Deployment: successful.
- Rollback point: `fbfb1a5`.
- Business-data delta: none. No booking, customer, payment, ticket, Xero or
  historical financial record was altered.

PHASE 59.1 COMPLETE - COMP VALUES CORRECTED.
