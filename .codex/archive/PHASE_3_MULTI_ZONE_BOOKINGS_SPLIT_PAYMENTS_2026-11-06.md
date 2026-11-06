# Phase 3 - Multi-Zone Bookings & Split Payments

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Objective

Allow authorised Box Office staff to allocate guests across multiple seating
zones and mix Paid and COMP guests inside one Standard or Corporate booking,
without duplicating booking, seating or payment systems.

## Existing Functionality Reused

- The existing Standard and Corporate booking journey and pricing services.
- Standard COMP, Media and Tradex category rules from the established COMP
  workflow.
- Existing zone-capacity, temporary-table and show-specific operational
  capacity calculations.
- Phase 1 Full Show Buyout manual multi-zone seating, which remains separate
  because buyouts use their agreed-price financial lifecycle.
- Existing Booking Details, Floor & Arrivals zone entitlements, Table Plan
  financial rendering, PayFast reconciliation and audit infrastructure.

## Implementation

- Added a compact allocation editor to Payment & Review. It is off by default
  and adds no screen or confirmation. Each allocation row contains:
  seating zone, Paid quantity, COMP quantity and COMP category.
- Standard and Corporate bookings may use one or more zones. Allocated guests
  must equal the booking total and each selected zone must contain at least one
  guest. Duplicate zone rows, negative quantities and unsupported categories
  are rejected.
- The booking API recalculates all chargeable values from authoritative zone
  prices and Paid quantities. COMP values remain internal reporting values and
  do not become revenue, payments or outstanding balances.
- Allocation mode never automatically assigns, splits or merges physical
  tables. The booking proceeds to the existing manual Box Office seating path.
- The additive migration creates persisted booking guest allocations and
  service-role-only atomic functions. Advisory locks protect booking, show and
  zone capacity from concurrent over-allocation. Requests are idempotent and
  write immutable before/after audit evidence.
- Table Plan includes concise allocation detail and category internal values,
  while booking financials and payments remain represented once. Booking
  Details exposes a read-only allocation summary and Floor & Arrivals consumes
  the existing authoritative zone entitlements.

## Box Office Workflow

1. Open the existing Create Standard Booking or Corporate conversion flow.
2. Complete show, guest, seating and customer details as usual.
3. In Payment & Review, select `Split Zones / Paid + COMP` once.
4. Enter zone rows and Paid/COMP quantities until the live total matches the
   booking guest count, then review and create through the existing action.

There is no additional page and no new confirmation. Tables remain a separate
manual Box Office step.

## Financial & Capacity Verification

- Same-zone fixture: 10 Golden Circle guests, 5 Paid and 5 Standard COMP.
- Corporate fixture: mixed Golden Circle and Middle Ring Paid/COMP allocations
  using Media and Tradex classifications.
- Standard multi-zone fixture: 10 guests across Golden Circle and Middle Ring,
  with 8 Paid and 2 COMP guests.
- Server-calculated totals charged only Paid quantities, preserved the
  established fee/deposit/gratuity path and produced R0 payable for an all-COMP
  allocation. Existing payment attempts and PayFast ITN ownership were not
  changed.
- Rollback-only Production transactions proved capacity validation, atomic
  persistence, audit creation and idempotent retry behavior. A repeated call
  returned `already_exists`. All fixtures were rolled back; the final persisted
  QA booking count is zero.

## Tests & Performance

- Focused Node tests: 35 passed.
- TypeScript: passed.
- Targeted ESLint: zero errors; six pre-existing warnings in touched legacy
  surfaces.
- `git diff --check`: passed.
- Supported Next.js Webpack Production build: passed, including 27 static
  pages and route generation. The default local Turbopack build was prevented
  by the host from opening its temporary CSS worker port; this was an
  environment restriction rather than an application failure.
- Admin bundle measurement remained within the established raw and gzip
  budgets. The change adds no dependency, polling, extra page-load request,
  repeated database query or background process.

## Production Verification

- Migration applied: `20261106030000_phase_3_multi_zone_split_payments.sql`.
- Application commit:
  `82a940a3a606dd39080d5c9b83148d8c773f79a0`.
- Vercel deployment: `GwwsAugWGdcrhPmW6yCW7VaWSSgM`, completed successfully.
- Kaden's authenticated Production Admin session opened the existing Standard
  booking workflow for a Johannesburg performance. Payment & Review visibly
  exposed `Guest Allocation On`, Add Zone, seating-zone, Paid, COMP and COMP
  Type controls with immediate allocation totals.
- Chrome responsive inspection at 390 x 844 confirmed the existing booking
  layout and allocation controls remain readable and contained. No Create
  Booking action was taken.

## Data Integrity & Rollback

- Business-data delta: zero. No real booking, allocation, payment, seating,
  table, ticket, customer, communication or financial record changed.
- Rollback the application by redeploying the parent commit. The additive
  migration can safely remain dormant; removing its functions/table is
  optional because no live allocation was created during QA.

## Intentional Boundaries

- Existing bookings show their allocation read-only in Booking Details. Phase
  3 does not introduce silent post-creation repricing or allocation mutation.
- Full Show Buyouts continue to use the Phase 1 manual section/table planner
  and their existing agreed-price rules rather than the new per-guest mixed
  Paid/COMP editor.
