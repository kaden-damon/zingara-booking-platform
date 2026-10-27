# P0 - Table Plan Company & Booker Identification

Completed: 27 October 2026

## Root cause

Table Plan booking retrieval hydrated customers but not linked Companies. The UI
and exports therefore had only the customer/booker identity and labelled it as
the guest name. Booking-level company snapshots existed for Corporate and legacy
records, but the recently introduced Companies relationship was not integrated
into the Table Plan data path.

## Correction

- Added one bounded, batched Companies lookup to the existing Admin booking
  aggregate and selected-performance Table Plan export.
- Added one shared company resolver: linked trading name, linked legal name,
  booking-level historical name, then blank.
- Added Company and Booker fields to Table Plan assignment cards, assigned table
  details, legacy assignment cards, the Table Plan workbook, its Notes sheet,
  Daily Manifest, and Floor Manifest.
- Preserved all existing financial columns, formulas, assignments, capacity,
  booking state, permissions, and workflow behavior.
- Preserved existing Corporate operational PDF company/booker handling, which
  already uses the linked company before the booking snapshot.

## Production evidence

- 378 bookings carry company evidence: 294 linked, 84 booking-level only.
- Johannesburg: 161 linked and 63 booking-level only.
- Cape Town: 133 linked and 21 booking-level only.
- No broken company links were found.
- 63 data-import bookings carry company evidence: 62 linked and one booking-level
  historical record (`DP-NK9BQC`, Tyrone Pharmacy).
- 11 linked bookings retain older snapshots that differ from their linked
  company; the linked company is now displayed without mutating history.
- `ZNG-8TSKBL` has an unlinked company snapshot matching the booker name and is
  retained unchanged for authorised operational review rather than guessed or
  automatically linked.

## Verification

- Company resolution tests: 3 passed.
- Table Plan workbook and route tests: 6 passed.
- TypeScript passed.
- `git diff --check` passed.
- Webpack Production build passed.
- Changed-file lint introduced no new errors. Two pre-existing Admin effect-rule
  errors and an unrelated stale Phase 51 pagination source assertion remain.
- Production baseline before release: `ffee647d179c828dc05db75958cb7a44e1af0298`.
- Rollback point: `ffee647d179c828dc05db75958cb7a44e1af0298`.
- Production business-data delta: zero.
