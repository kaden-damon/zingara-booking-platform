# Phase 54.3 - Table Reconciliation & Auto-Assignment Activation

STATUS: IN PROGRESS

DATE: 28 OCTOBER 2026

## Objective

Reconcile future Production performances against Richard's approved 74-table,
415-seat master and progressively activate the Phase 54.2 automatic assignment
engine without changing existing bookings, assignments or operational table
decisions.

## Production Diagnosis

- Future performances audited: 189.
- Every operational catalogue matches 71 of 74 approved table identities.
- Shared structural differences: table 400 is currently Golden Circle rather
  than the approved Middle Ring; approved permanent tables 406 and 506 are
  absent from the operational catalogue.
- Active performances already contain bookings or table decisions. They cannot
  be safely reconciled without backlog assignment or overwriting operational
  evidence and therefore remain disabled.
- Safe rollout cohort: 62 inactive future performances (57 Cape Town and 5
  Johannesburg) with no booking records, assignments, overrides or merges and
  only untouched catalogue-default capacity differences.

## Implementation Boundary

- Reconcile and activate only the verified zero-booking cohort.
- Populate the approved permanent table capacities and make those permanent
  tables assignable without changing ticket-sale capacities.
- Preserve all additional operational, temporary, merged and historical rows.
- Record a reconciliation decision and evidence snapshot for all 189 shows.
- Enable the venue-level gate only after the safe cohort is adopted.
- Keep existing performances with bookings, assignments, overrides, merges or
  unexplained capacity differences disabled and in the manual workflow.
- Never process the existing assignment backlog.
- Preserve the 70% threshold, 10-day review reminder, notification
  deduplication and audited manual pause/resume controls.

## Verification

- Approved 74 tables and four zone totals reconcile to 415 at both venues.
- Only zero-booking, zero-assignment performances are changed.
- Existing table rows and assignments remain unchanged outside the safe cohort.
- Standard and Corporate atomic assignment remains zone-bound and fail-safe.
- Buyouts and multi-zone bookings remain manual.
- Existing exports, ticket capacity, pricing, payments, tickets and Xero remain
  unchanged.
- Focused tests, TypeScript, changed-file ESLint, migration rehearsal,
  `git diff --check`, Production build and post-release Production checks.
