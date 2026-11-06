# Phase 1 - Full Show Buyout Seating

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Objective

Enable authorised Box Office staff to divide a Full Show Buyout across the
existing seating zones, manually claim suitable physical tables, see the
result on Floor & Arrivals and export the completed arrangement through the
existing Table Plan path without changing the booking or its finances.

## Existing Functionality Reused

- Full Show Buyout booking and `corporate_buyouts` control records.
- Existing corporate multi-zone entitlement editor and four authoritative
  seating-zone definitions.
- Show-specific permanent, temporary and merged table inventory.
- Existing Floor Layout table claims and Table Plan export generation.
- Existing Admin authentication, staff roles, audit conventions and dynamic
  Floor data loading.

## Implementation

- Added one collapsed `Plan Buyout Seating` control to the existing buyout
  banner in Floor & Arrivals. The planner is dynamically loaded only for the
  selected Full Show Buyout.
- Box Office allocates the full booking guest count across Golden Circle,
  Middle Ring, Private Booths and Royal Balcony. Allocated and remaining totals
  remain visible, and the allocation cannot save until it reconciles exactly.
- After the section split is saved, each allocated zone exposes only tables
  valid for that show and zone. Staff manually select the required table or
  tables; the platform never automatically splits or assigns a buyout.
- Table capacity must cover the zone guest total before save. Existing valid
  claims remain available, and conflicting or already claimed tables cannot be
  selected.
- Saved claims feed the existing Floor Layout and Table Plan export path. The
  original booking reference, customer, guest total and all financial values
  remain authoritative and unchanged.

## Server Integrity

- Migration `20261106020000_phase_1_full_show_buyout_seating.sql` adds the
  narrowly scoped, service-role-only persistence functions and supporting
  records for buyout section/table plans.
- Mutations are atomic and lock the buyout, booking and selected show tables.
  They enforce staff permissions, active buyout ownership, exact guest-total
  reconciliation, show/zone identity, table capacity, unique claims and
  concurrent conflict prevention before writing immutable audit evidence.
- Ordinary Standard and Corporate seating logic, strict single-table automatic
  allocation and authorised manual Box Office controls are unchanged.

## Box Office Workflow

The workflow has three stages:

1. In Floor & Arrivals, select the performance and open `Plan Buyout Seating`.
2. Enter the four section guest totals and save once they equal the booking's
   authoritative guest total.
3. Open each allocated section, select its approved physical tables and save.

The number of table selections depends on the operational seating plan. There
is no extra screen and no confirmation popup.

## Verification

- Focused unit/regression tests: 31/31 passed.
- TypeScript, targeted ESLint and whitespace checks passed.
- Core Turbopack build and Admin performance budget passed:
  1,292,213 / 1,320,000 raw bytes and 312,991 / 320,000 gzip bytes; largest
  Admin chunk 168,736 / 170,000 gzip bytes.
- A final CSS-only build passed with the supported Webpack builder after the
  local environment blocked Turbopack's temporary worker port. No dependency,
  request, polling, query or background-processing change was introduced.
- Rollback-only Production database exercise created a synthetic 10-guest
  buyout, allocated 4 guests to Golden Circle and 6 to Middle Ring, claimed one
  4-seat and one 6-seat table, and verified 10 allocated guests, 10 selected
  seats and five audit events. The enclosing transaction was rolled back.
- Table Plan regression verification covers multi-zone buyout claims, correct
  per-table quantities, merged/temporary table compatibility and booking
  financial values counted once.

## Authenticated Production Verification

Read-only reference:

- Venue/performance: Johannesburg, 10 November 2026, 17:00.
- Booking: `ZNG-DA5D8B36`, NTT DATA - Internet Solutions.
- Guests: 350.
- Buyout state: awaiting payment, revision 1.

The authenticated Kaden session confirmed the new control in the actual Floor
workspace. Opening it showed the four approved zones and capacities (120, 125,
138 and 32), `Allocated 0 / 350`, `Remaining 350`, and a disabled Save action.
Desktop and 390 x 844 mobile inspection confirmed the planner is contained,
all four zone names are fully visible and the underlying Floor Layout remains
available immediately below it. No field was changed and no save occurred.

## Release Evidence

- Local core commit: `65c0a5ed`.
- Core Production commit: `4ee80df22ba10c5c0b53d5c24c65ecd5c5dffb86`.
- Mobile readability Production commits:
  `464d3266421cc2b2ff050a9aa9efe70099d789f8`,
  `2994ea2a1f27255d21fcc406a56d527d2e512ec7`, and
  `485b9c44ccbe1ca5f8b97b36121ab373ec366735`.
- Core deployment: `5bf2NdpoiNrpXWdPgL4pYkuQ8Leq`.
- Final deployment: `7uU2uhHaMbtXaY549sJhtBSJSN6d`, READY.
- Linked Production migration applied successfully before UI verification.

## Data Delta, Performance & Rollback

- Production business-data delta: none. The reference booking remains at 350
  guests with zero zone entitlements and zero table claims. No booking,
  seating, table, capacity, payment, ticket, customer or financial record was
  changed.
- Closed-state overhead is one small dynamically imported trigger. The planner
  reuses data already loaded for the selected Floor performance; it adds no
  polling, repeated query or background task.
- Rollback is an application redeploy to the parent commit. The additive
  migration can remain dormant. If removal is required, drop only the new
  Phase 1 functions/supporting objects after confirming no plans have been
  saved. No business-data rollback is required for this release.

## Outstanding Issues

None within Phase 1. Real buyout section totals and table selections remain an
intentional Box Office operational decision and were not entered during QA.
