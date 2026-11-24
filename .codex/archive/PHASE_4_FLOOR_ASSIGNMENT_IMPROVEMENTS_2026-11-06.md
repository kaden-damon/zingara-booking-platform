# Phase 4 - Floor Assignment Improvements

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Objective

Let authorised Box Office staff see and immediately claim any suitable
available table from Floor & Arrivals while preserving seating integrity,
strict single-table automatic allocation and existing financial workflows.

## Root Cause

- The shared floor planner called `findBestTableAllocation`, which deliberately
  returned only the first best-fit table even when several valid tables were
  available.
- The Floor queue wrapped that one recommendation in redundant confirmation
  state for both ordinary and Corporate/manual assignments.
- The authoritative atomic database claim already supplied the required table
  lock, capacity validation, duplicate prevention, idempotency and audit trail;
  the missing behaviour was in option discovery and the interaction layer.

## Implementation

- Added `findSuitableTableAllocations` and exposed all valid single-table
  options on each floor booking plan. Sorting remains deterministic: exact and
  best fits first, followed by capacity and table code.
- Each option displays `Table N · X seats`; the first option adds `· BEST`.
- Clicking an option calls the established assignment endpoint immediately.
  Confirmation dialogs and their duplicate state were removed.
- Direct assignment reloads the current authoritative plan, validates that the
  selected table is still suitable for the requested booking zone and submits
  exactly one table to `assign_corporate_booking_zone_tables_atomic`.
- Existing valid merged tables remain single operational tables. No table
  combinations or automatic splits were introduced. Multi-zone bookings retain
  one manual claim workflow per authorised zone allocation.

## Integrity Verification

- Focused tests: 26/26 passed across suitability ordering, Floor presentation,
  Corporate allocation and strict no-split behaviour.
- `npx tsc --noEmit`: passed.
- Targeted ESLint: zero errors; one pre-existing warning for an unused legacy
  parameter in `src/lib/zingaraDemo.ts`.
- `git diff --check`: passed.
- Production Webpack build: passed. The local Turbopack worker could not open
  its temporary process port in the restricted environment, so the supported
  Webpack builder was used for the release build.
- Bundle comparison stayed within the existing Admin budgets: 1,243,872 raw,
  299,943 gzip and 169,872 largest gzip chunk. The change adds no request,
  polling, dependency, background work or extra render-time calculation.

## Production Evidence

- Rollback-only database verification used JHB 13 November 2026 booking
  `ZNG-3QXAJU`, two guests in Middle Ring, and exact Table 208. The first atomic
  claim succeeded; the repeat returned `idempotent: true`; the transaction was
  rolled back. Follow-up reads confirmed the booking remained unassigned and
  Table 208 remained available with its original timestamps.
- Kaden's authenticated Production session showed `ZNG-3QXAJU` with nine
  suitable tables: 208, 209, 210, 206, 204, 205, 211, 203 and 214. Every button
  included capacity and Table 208 was marked `BEST`.
- Additional live queue cards displayed all four suitable Private Booth tables,
  while Royal Balcony bookings with no valid fit remained unassigned and linked
  to Table Management. No assignment was executed.
- The actual rendered queue was visually verified on desktop and at a 390 x
  844 responsive viewport. Cards, labels and table buttons remained contained
  and readable.

## Release

- Local implementation commit: `a518532e`.
- Production application commit:
  `3781a9c81492467db246c509b8419ae82e052885`.
- Vercel deployment: `ASBVZxBEFBF7q1V6rineCcpyEQyk`.
- Deployment status: READY / healthy, reported by Vercel on 6 November 2026.
- Migration: none.
- Rollback: redeploy the prior Production commit; no schema or data rollback is
  required.
- Business-data delta: zero. No live booking, seating assignment, table,
  payment, ticket, customer, communication or financial record changed.

## Final Status

PHASE 4 COMPLETE - FLOOR ASSIGNMENT IMPROVEMENTS LIVE.

## 23 November 2026: Booking Performance Deep Links

Reported ZNG-X94SUT (Johannesburg, 2 December) Open Floor opened 24 November.
Confirmed two UI navigation causes: the link was only /admin?section=floor,
without booking show identity; the shared URL handler read show= but applied it
only to the Bookings filter, never Floor selection. Existing automatic-assignment
notifications already carry show= and were therefore affected by the same omission.
No booking lookup, booking/seating correction or financial change needed.

Open Floor now includes booking.showId; no generic shortcut when identity is
missing. Existing shared handler resolves getShowByIdentity (ID/database alias),
reuses selectFloorEditingShow and applies matching permitted manifest location.
It waits for the existing show load via shows dependency and returns without
substituting a performance for an unavailable/out-of-scope ID. No added queries.
Existing Floor selector synchronises its date/month/venue from exact show ID.

Notification clicks reset only the handled-link deduplication marker so clicking
the same notification after browsing another show reopens its actual destination.
Ordinary rerenders still do not continually overwrite staff choices. Shared
selectBookingShow clears stale search, venue, specific-date and range state for
show-filter links and calendar buyout review; normal filter controls unchanged.

Other existing booking links inspected: customer history, converted Corporate
booking, staff guidance, review/payment shortcut, Dineplan links, push/email
booking references, ticket return paths and accounting/document links. Exact
reference searches already bypass ordinary browsing filters in authorised data;
accounting routing retains priority. Generic Quick Start links have no booking
context and intentionally remain generic. No speculative unrelated modifications.

Verification: 16 focused tests pass (six actual AST-handler/URL tests, five login
return-path regressions and five Review Payment regressions). Covers both venues,
same-date different times, identity aliases, stale dates/venue, existing hydration,
restricted/unavailable IDs, notification reopening, reference/accounting routing,
and no API calls. TypeScript/test ESLint/whitespace pass. Broader existing suites
also run: navigationUx has one old Dineplan label assertion; adminNavigation has
two old assertions omitting Communications. Failures confirmed against unchanged
HEAD code/tests, unrelated to this correction and preserved rather than rewritten.

Synthetic local Chromium at 320/1280px executes actual generated link and handler:
stale CPT/24 November state changes to JHB/2 December/18:00 and Floor tab; no
errors or external requests. Evidence local-evidence/booking-deep-link-browser-
results-2026-11-23.json and retained fixture. Not physical Safari or signed-in
Production staff QA. Only Admin page and focused test in release scope; no
database, APIs, permissions, dependencies, business data or Frontend 2.0 changes.

Release commit **75c747bb0b291183d816b812350a6d694f035de9**, pushed to main;
Git-triggered Vercel Production **dpl_9yRVrHxPDAtziVp6UQKoSBixsyVu**, **READY**,
exact SHA and book.zingara.co.za alias verified. Live `/admin` HTTP 200;
`/_next/static/immutable/chunks/37f57dhpfpo_d.js` contains the booking-specific
Floor URL and shared show-context handler. Verification 23 November 19:57:12 SAST.
Evidence: local-evidence/booking-deep-link-production-deployment-2026-11-23.json
and booking-deep-link-production-http-2026-11-23.json. No authenticated Production
staff session was available; live signed-in click/booking access is not claimed.
The actual navigation handler was exercised locally at mobile/desktop widths.
Only Admin page and its regression test committed; Markdown/evidence stay local
with all unrelated work and rollback checkpoints intact. No Production data writes.
# Private Booth Controls Follow-Up — 24 November 2026

Scope confirmed for both venues and exactly 23 existing booths, excluding 13.
Existing Floor/venue-settings workflow extended with per-venue Standard booking
minimum/maximum controls across the four zones. Only active Kaden/Fatima identities
with existing Floor permissions and venue scope can save, enforced in the API and
atomic audited database setter. General settings saves preserve restricted limits.

Private Booth defaults are 6–8. Other Standard zone ranges remain 1–19; existing
Corporate eligibility is unchanged. The approved layout and public caps remain
120/125/138/32 (415). Eight-guest fit is independent of the six-seat public baseline;
no booth, booking, table-capacity, assignment, payment or temporary seating rows are
rewritten. Existing automatic single-unit, manual move, initial Floor plan and
assignment compatibility paths reuse the same booth fit. No automatic splitting.

48 focused tests, TypeScript and optimised build pass. Existing capacity checks
pass except one pre-existing obsolete presentation-string assertion. Changed
helpers/APIs lint clean (three pre-existing warnings in bookings route); unchanged
page-effect lint errors recorded, not refactored. Mocked real-component Chromium
320/1280px verifies PUT save, loading/error recovery, venue isolation and no overflow.
No physical iPhone or authenticated Production staff QA claimed.

Migration rollback-only checks passed identity restrictions, Kaden/Fatima writes,
venue independence, invalid bounds, stale settings, 23 booth fits, excluded booth13,
protected capacities and unchanged public caps. No persistent mutation during QA.
Private rollback snapshot and screenshots retained under local-evidence/booth-*.
Release commit **61d15649f6a39faeed631ecd2f626956876e6aba**, pushed to Main.
Production **dpl_GqA5ViYHSe8SfiwSb13p3ZXSFn9L**, **READY**, exact SHA and
book.zingara.co.za alias verified 24 November 2026 at 16:24 SAST. Live Admin asset
`2l5pe09knwqhz.js` contains Floor controls; Admin/public settings HTTP200;
unauthenticated settings PUT401. Actual settings: both venues PB6–8, other zones
unchanged1–19. Read-only database verification confirms 23 approved booths per
venue, excludes13, baseline138, public caps120/125/138/32, eight-guest fit on the
23 approved identities, 12 extended fit paths and no direct anon/authenticated
setter access. Scoped migration20261124153000 applied and recorded alone.

Production evidence: local-evidence/booth-production-release.json and
booth-production-database.json. No real booking, table, assignment, payment,
historical data or communications mutation. Source-only scoped commit; all
unrelated local work and Frontend 2.0 preserved. Markdown records updated locally.
Authenticated staff save and physical iPhone QA are not claimed.

## Floor Controls Regression Correction — 24 November 2026

Read-only follow-up confirmed release61d15649 used the auth-user session ID in
a staff-profile allowlist, hiding the new panel from both intended editors.
The booth-specific JSX branch also removed the original seat editor. Previous
live verification established deployed assets/settings and unauthenticated
denial, not correct authenticated visibility; this limitation was material.

Session now carries the existing staffProfileId separately, leaving authentication
identity and permissions unchanged. Floor uses the correct identity and existing
permission. Both per-venue Booking sizes and original Table seats controls render
together. The old physical bounds, save handler/API, assigned-pax, capacity and
concurrency safeguards are retained. No business data or database changes.

Physical seat saves and temporary-capacity mutations now enforce Kaden/Fatima
server-side. Capacity-plan creation and initial plans that configure capacity
have the same gate; assignment-only workflows and non-capacity notes retain their
existing access. No extra normal-usage queries, dependencies or new workflows.

Seven targeted actual-serializer/handler tests, TypeScript and focused lint pass.
Eight 320/1280px component combinations verify both editors/venues, saves and
coexistence, unauthorised hiding/disabled seats and no overflow. Production
permission metadata confirms no direct authenticated table write/RPC bypass.
No real seating/configuration writes or physical iPhone verification during QA.
Source and all19 outstanding Markdown records committed/pushed as explicitly
requested in **1ad9b4e6b32b285d07e50362f9aa89e9e35dd3d9**. Production
**dpl_8xMKMxxsHRXpf3txrbigYRRRzC46**, **READY**, exact SHA and live alias
verified24 November2026,17:15 SAST. AdminHTTP200; served controls chunk
`1psaii18m06y2.js` includes both Booking sizes and Save table seats; shared chunk
`0y6sws4w_j_4r.js` includes staffProfileId handling. Settings and seat-capacity
write routes deny unauthenticated requests with401. Live caps120/125/138/32
and both venues' PB6–8 limits unchanged. No real seating or staff save during QA.

Evidence retained in local-evidence/floor-controls-regression-production-code.json,
floor-controls-regression-browser.json and mobile/desktop screenshots. This final
record follow-up changes Markdown only; no further application changes. Refresh
Admin to pick up the corrected session payload/client. No Production data writes,
migrations, live staff mutation, physical iPhone claim or Frontend2.0 changes.

## Seating Limits Scope And UX Cleanup — 24 November 2026

Original single-guest Standard change ce85b69 and pre61d15649 server guard confirm
GC/MR/RB1–19 is the Standard booking range (one allowed,20+ rejected), not physical
table occupancy. Base seatingZones2–20 is not the current Standard override.
Approved GC/MR individual tables vary2–10, RB2–8; public zone caps remain
120/125/138/32. PB booking6–8 retained for both venues. No numeric default or
Production configuration correction was justified; changing booking defaults to
table bounds would remove existing single-guest and larger Standard functionality.

Existing panel moved inside Floor & Arrivals below performance selection, renamed
Seating Limits, initially collapsed. Four compact equal cards / one Save Changes,
explicit venue-wide Standard scope, no redundant explanatory paragraph. Reuses
existing audited saves only for dirty zones; bounded four calls, no requests on
open/no-op, validation before writes, and explicit partial-failure recovery that
retains remaining edits. No duplicated API or new database functionality.

17 focused tests, TypeScript, component lint and optimised build pass. Real
component Chromium checks320/390/1280px pass initial collapse, one save, correct
placement/column counts, partial retry, venue isolation, no overflow and numeric
text fit. Screenshot inspected. APIs mocked; no physical iPhone/live staff writes.
Existing server permissions, original seat editors, all business rules, bookings,
assignments, authorised temporary seating and Frontend2.0 preserved. Release
pending; evidence local-evidence/seating-limits-browser-results.json/screenshots.
