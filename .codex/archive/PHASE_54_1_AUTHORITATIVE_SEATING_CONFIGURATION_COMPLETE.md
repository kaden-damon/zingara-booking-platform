# Phase 54.1 - Authoritative Seating Configuration

STATUS: COMPLETE

DATE: 28 OCTOBER 2026

## Configuration

- Authority: Richard's `Table Plan Template.xlsx`.
- Source SHA-256: `43bf6bca8d0e1094aba7f05b01cc945a992dc4c77e590750db9d3dcfcd88a5b7`.
- Cape Town version 1: approved, immutable and venue-specific.
- Johannesburg version 1: approved, immutable and venue-specific.
- Golden Circle: 23 tables / 120 guests.
- Middle Ring: 24 tables / 125 guests.
- Private Booths: 23 tables / 138 guests.
- Royal Balcony (ESA): 4 tables / 32 guests.
- Total per venue: 74 tables / 415 guests.
- Table 400 is authoritatively classified as Middle Ring.

## Operational Safety

- The configuration is additive; the legacy operational catalogue remains
  unchanged at 83 rows, including 79 physical records and 640 configured
  maximum seats.
- All 34,019 show-table rows remain unchanged, including 1,179 overrides and
  1,025 merged child rows.
- All existing temporary tables, assignments, bookings, payments, tickets,
  exports and ticket-sale capacities remain unchanged.
- Automatic assignment is disabled for both venues.
- No performance has adopted the new layout.
- The future availability function is service-only and returns no rows before
  explicit performance adoption.

## Protected Exceptions

- Forty-four current/future performances and 101 zone exposures are queued for
  controlled reconciliation.
- The earlier Phase 54.0 count was 41. Applying the approved correction that
  moves table 400 from Golden Circle to Middle Ring reveals three additional
  performance exceptions; no show behavior was changed.

## Verification

- 18 focused seating, atomic assignment and temporary-table tests passed.
- TypeScript, changed-file ESLint and `git diff --check` passed.
- The migration executed successfully against the Production schema inside a
  rolled-back transaction before release.
- The supported webpack Production application build compiled successfully.
- The existing performance-budget helper cannot parse webpack's client
  manifest format; no application bundle code changed in this database-only
  phase.
- Post-migration Production reconciliation confirmed two versions, eight zone
  rows, 148 table rows, two disabled venue settings, zero adoptions and 44
  pending reconciliation records.

## Release

- Implementation commit: `faaf34e61e1389f92cd5db6074577b6c4a62445b`.
- Vercel deployment: `dpl_HLoWnodAxYWnKx35RNgCmDH4HbeG` (`READY`).
- Rollback point: `fb0d65a1135d685cc467704b278e4da233693626`.

## P0 Production Table Visibility Repair

- Root cause predates Phase 54.1: Phase 37 seeded physical rows only for shows
  active on 25 August 2026. Later activation did not seed the catalogue.
- Repaired 31 current/future performances using the unchanged operational
  79-row catalogue; 14 affected shows contained 152 active bookings / 1,918
  guests.
- Cape Town, 15 December 2026 at 18:00 was restored from zero to 79 permanent
  rows while preserving 28 active bookings / 198 guests and its temporary row.
- Added a service-only idempotent repair function, status-change safeguard,
  append-only audit evidence and a migration completeness guard.
- Phase 54.1 approved 74-table versions remain dormant with zero performance
  adoptions; automatic assignment remains disabled.
- Production data delta: 2,449 additive permanent `show_tables` rows and 31
  repair audit events only.
- P0 commit: `d287e65397204ee4d45f3ab8b4ba7d923c61840a`.
- P0 deployment: `dpl_G9D7W9ZMRQSBgRyyDMQeDpfFipWb`.
- P0 rollback: `0fee678944d3cfc97f7d2690d825318ff6d6ba84` / prior deployment
  `dpl_GW9qmvprHLWZ7qQtXK8Yxbu6YDHm`; additive restored rows remain retained.
- Production business-data delta: configuration metadata only; no booking,
  assignment, capacity, payment, ticket or financial record changed.
