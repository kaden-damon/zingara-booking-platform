# Phase 54.13 - Table Capacity Correction & UX Simplification

STATUS: COMPLETE

DATE: 28 OCTOBER 2026

## Summary

Phase 54.13 corrected safely inheritable permanent-table capacities from Richard's
approved master and simplified the existing Box Office automatic-assignment
controls without changing ticket-sale, seating or financial rules.

The Johannesburg performance on 18 December 2026 at 17:00 had been correctly
excluded from whole-layout adoption because its operational table catalogue did
not exactly match the master. Hybrid assignment could use its existing layout,
but the deliberately conservative migration path had left 39 eligible permanent
tables without capacities. Those missing capacities caused `SEATS NOT SET` and
prevented otherwise safe assignments.

## Production Result

- 1,884 safely matched permanent-table capacities corrected across 55 future
  performances in both venues.
- Target show: 39 capacities corrected; 10 bookings / 50 guests safely assigned;
  waiting queue reduced from 10 bookings / 50 guests to zero.
- Target show remains below its threshold at 88 of 415 guests (21.2%), with no
  manufactured override and 51 tables / 272 seats available after assignment.
- Nine configured conflicts and three missing master matches on the target remain
  protected and explicitly unresolved.
- 1,244 non-matching future rows remain disabled for management review: 1,209
  unknown table codes and 35 zone mismatches.

## Safeguards

- Only exact venue, table-code and normalized-zone matches with a null capacity
  and the legacy missing-capacity marker were eligible.
- Assigned, temporary, merged, manually overridden, blocked and already configured
  tables were protected.
- Existing seating was not moved or overwritten.
- Ticket-sale capacities, show statuses, availability, exports, payments, tickets,
  financial records and the 70% approval mechanism were unchanged.

## Verification And Release

- Focused and regression tests, TypeScript, ESLint, migration validation and
  rollback rehearsal, diff checks, Production build and performance budgets passed.
- Production commit: `b028ceab82683b757e8612de7536f09a7018ab88`.
- Deployment: `dpl_8R5udSkiAfSPfE2XgebjSVgA7P1E` (`READY`).
- Rollback: `965773f1a6c2cbf0995749631de7c344693116ee`.
- Production business-data delta: 1,884 guarded capacity/configuration updates,
  10 safe booking table assignments and table claims, and immutable audit events.

PHASE 54.13 COMPLETE - TABLE CAPACITIES CORRECTED & BOX OFFICE SIMPLIFIED.
