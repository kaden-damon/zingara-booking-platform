# Phase 54.10 - Final Seating Conflict Resolution

STATUS: IN PROGRESS

DATE: 28 OCTOBER 2026

## Objective

Minimise the remaining manual assignment queue by correcting only proven,
unambiguous physical-table configuration defects and atomically assigning
bookings that safely fit Richard's approved 74-table / 415-seat layout.

## Baseline

- Application and `origin/main`:
  `2eaf25985042dcf7baf1baffabc632c17c0d6854`.
- Active assignment queue: 1,533 bookings / 15,326 guests across 69 future
  performances.
- Threshold-held: 1,235 bookings across 44 performances; no authorised active
  override exists.
- No queued performance currently passes the approved-layout eligibility check.

## Diagnosis

- 16 performances have configuration-only defects that can be corrected without
  changing an existing assignment.
- Five of those performances remain legitimately held by the 70% threshold.
- Eleven below-threshold performances contain 31 bookings eligible for an
  atomic assignment attempt after configuration repair.
- Fifty-three performances contain genuine assigned-table, zone-capacity or
  structural conflicts and must remain manual.

## Safety Boundary

- Never move or overwrite an existing table claim, temporary/merged table,
  override or manual arrangement.
- Never exceed approved table or zone capacity or underfill a table against its
  minimum occupancy rule.
- Preserve the 70% default and every existing authorised override; do not
  manufacture a threshold exception.
- Preserve show status, ticket availability, booking values, payments, tickets
  and all financial records.
- Record every configuration correction and successful assignment with
  immutable audit evidence.
