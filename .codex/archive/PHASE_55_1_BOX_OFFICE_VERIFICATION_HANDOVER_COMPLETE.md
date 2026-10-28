# Phase 55.1 - Box Office Verification & Handover

STATUS: COMPLETE

DATE: 28 OCTOBER 2026

## Production Verification

Authenticated Floor & Arrivals inspection confirmed the existing Box Office
control surface is operational: automatic assignment state, 70% limit, occupancy,
waiting bookings, available tables and seats, mandatory reason, pause/resume,
assignment progress, manual assignment, temporary/merged tables and the 10-day
review reminder. Server routes enforce booking/table permissions and venue scope;
venue-wide controls require settings access.

The interface correctly separates public ticket capacity, protected grandfathered
capacity and physical table seating. The approved standard remains:

- Golden Circle: 120
- Middle Ring: 125
- Private Booths: 138
- Royal Balcony: 32
- Total: 415 across 74 permanent tables

One confirmed UI defect was corrected without changing layout or behavior: queue
summaries now use correct singular/plural wording.

## Assignment Handover

The authoritative remaining queue contains 303 bookings / 4,370 guests across 58
performances:

- 196 / 1,785: grandfathered capacity exceptions.
- 66 / 494: no safe table combination.
- 34 / 120: no physical table seats available.
- 5 / 1,950: Buyouts requiring manual planning.
- 2 / 21: insufficient physical table seats.

The complete prioritised workbook is:

`reports/Phase_55_1_Box_Office_Assignment_Handover_2026-10-28.xlsx`

It includes management summary, full booking queue and performance summary sheets,
with customer/company, payment position, available physical seating, exact reason
and required Box Office action for every booking.

## Safety And Performance

- Existing 1,149 automatic assignments / 10,416 guests remain unchanged.
- Zero application requests, polling loops, effects, migrations or database work
  were added.
- Focused seating and permission tests passed (20); TypeScript, changed-file ESLint,
  diff checks and the Production webpack build passed.
- Desktop Production UI was inspected directly. Authenticated mobile UI inspection
  was unavailable and is not claimed.
- No exports, bookings, seating arrangements, capacities, payments, tickets, Xero
  data or financial records changed.

## Release

- Commit: `d45d805`.
- Vercel Production: successful.
- Rollback: `5c1bf38e73ddf10945fcd1ca14c1d0166bb69c2a`.
- Business-data delta: none.

PHASE 55.1 COMPLETE - BOX OFFICE READY FOR OPERATIONAL HANDOVER.
