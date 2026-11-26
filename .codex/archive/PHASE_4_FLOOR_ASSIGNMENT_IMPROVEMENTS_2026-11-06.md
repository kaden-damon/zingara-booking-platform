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

Initial code release e369c48 / dpl_yFBFaFbznKjSTKCX89qJ7Jki5ALQ did not promote:
compilation/TypeScript passed, but the existing largest initial Admin gzip-chunk
budget failed170115/170000 bytes. Aggregate319229/320000 and raw1312362/1320000
passed. Scoped correction uses the existing next/dynamic named-export pattern to
load this restricted Floor-only widget on demand. Budgets remain unchanged; no
unrelated PDF tracing-warning refactor. Exact Production build/gate being checked.

## Interrupted-Task Production Stability Check — 24 November 2026

Actual live alias: READY d0da167 / dpl_8BCv2zaSZ2GNTduyJafKohLHCYhc. Main e369c48
failed its Admin bundle budget and was not promoted. Uncommitted lazy-load/test/
record work preserved; local Turbopack cannot bind its PostCSS worker port in the
managed environment. No prior build/verification processes remain running.

Public booking page/show list/settings respond200;59 future performances span
both venues. No availability GET or checkout submission: availability GET invokes
hold cleanup. Used a bounded READ ONLY transaction for both venues/four zones.
Permanent public caps120/125/138/32 total415; PB6–8; GC/MR/RB Standard1–19 remains
the original booking rule, distinct from individual table capacity. Authorised
temporary/legacy operational capacity and staff-closed zones remain separate.

Sampled CPT26 November18:00/JHB25 November17:00:53 assigned active bookings,
zero compatibility failures and zero orphaned active claims. Ten unconfigured
table rows are all unclaimed and last updated25 August, not introduced by the
recent releases. No automatic data corrections. Forty checkout-validation,
eligibility and allocation tests pass on domain code identical to live d0da167.

No new Production regression found in checked scope. No application/Production
changes, new commit, deployment, real booking/payment/seating or communications
action during this check. No physical-device or completed-payment claim. Preserve
Frontend2.0. Remaining work is the unreleased UI cleanup/performance gate plus
pre-existing unconfigured inventory review, not an active Production outage.
Evidence: local-evidence/production-stability-readonly-2026-11-24.json.

## Seating Stabilisation — 24 November 2026

User explicitly retires the zone-wide editor, superseding the earlier cleanup.
Removed FloorBookingLimits component/import/render and its venue-settings RPC
save path. Stale bookingLimit requests return400 without writes; ordinary venue
settings saves retain the protected limits. No settings/database migration or
business-row edits. Existing restricted table-seat controls/permissions, PB6-8,
23 booths per venue, effective fits and public caps120/125/138/32 remain intact.

Sixteen focused regression tests, TypeScript, changed-file lint and optimised
Webpack build pass. Reused prior40 checkout/allocator tests and53 compatible
Production assignments. Local Turbopack worker port restriction persists; clean
Vercel build and unchanged performance budgets remain mandatory release gates.
Before-state checkpoint: /private/tmp/zingara-seating-stabilisation-before-20261124.tgz.
Main's failed e369c48 and pending lazy-loading work reconciled selectively through
editor removal, not blind revert; historical records/evidence preserved. No
Frontend2.0, bookings, payments, table claims or communication changes.

Release evidence:29e9114ae2c8af271863d1e15eb8c80ff99fbbff pushed to Main;
dpl_9fYJScCreVyCBiKkJfgP8qHmyjjo READY, exact live alias verified18:03 SAST.
Clean Vercel npm run build passed existing budgets unchanged: raw1309326/1320000,
gzip318165/320000, largest gzip169055/170000. Seventy-three live assets confirm
editor absent and original table-seat controls/profile identity retained. Both
venues' live settings PB6-8/public120/125/138/32 unchanged; public booking/list
HTTP200 and protected unauthenticated writes401. No business-data mutations.
Evidence: local-evidence/seating-stabilisation-production.json. Final records-only
commit retains this exact application; no outstanding seating regression found
within checked scope. Pre-existing legacy inventory review remains separate.

## Temporary Table Permission Restoration — 26 November 2026

Status: verified; authorised Production release in progress. Existing task only.

Confirmed cause:1ad9b4e extended the permanent-seat named-editor gate into manual
temporary create/capacity/status edits and reviewed temporary-capacity plans.
Before that change, those operations used existing table-management permissions.
Client create handler/button/temporary seats and reviewed-plan button became
disabled for other otherwise authorised table managers; API also rejected them.
Fresh read-only verification confirmed Kaden/Fatima active profile IDs still match
the allowlist. Not another staff/auth identity mismatch; no new issue report with
this specific symptom found in the bounded recent issue check.

User explicitly approved "Restore original table-management access", then twice
requested resume without repeating the investigation or further approvals. This
supersedes ONLY the temporary-capacity named-editor restriction described in the
24November follow-up above. Permanent table-seat/capacity controls and protected
merged-table capacity edits retain existing Kaden/Fatima restrictions. Roles and
stored permissions are unchanged, not redefined or widened to new staff groups.

Smallest correction:
- Admin createTable guard/button and temporary seat input reuse tables:manage.
  Non-temporary seat controls retain canEditFloorCapacity. Existing reviewed
  temporary-plan creation no longer uses the permanent-seat allowlist.
- show-tables POST still requires active staff, tables:manage and permitted venue;
  only true temporary operational tables are exempted from the named capacity gate.
  Physical set-capacity and other protected capacity mutations remain restricted.
- floor-capacity-plan POST reuses its existing bookings:manage AND tables:manage
  authorizer, operational show status, snapshot checks and bounded atomic creation.
  Initial plans that configure permanent capacity remain restricted in floor-plan.
- No new controls, APIs, dependencies, queries, database migration, physical-seat
  changes, booking assignment changes, permission rows or public capacity changes.
  Permanent GC120/MR125/PB138/RB32=415, PB6-8, merge/manual seating/no automatic
  splitting and existing assigned-booking safeguards remain unchanged.

Removal uses the EXISTING Blocked status after releasing any assignment; it does
not invent a delete workflow. Assigned tables must stay reserved. Temporary rows
and audit history remain intact; release puts booking back in Assignment Queue.

Verification:
-80 focused tests passed:31 Floor controls/plans/allocator/table assignment/merge/
  temporary-capacity checks plus49 single-table options, merged assignment and
  BUG37/38/39/balance-allocation regressions. TypeScript and changed server/test
  ESLint passed; pre-existing whole-Admin lint debt not represented as resolved.
- Both venues PASSED authenticated lifecycle fixtures using actual serverAdmin
  session/undertaking/role logic, actual show-tables and floor-capacity-plan GET/POST
  handlers and unchanged installed SQL assignment/release/table-capacity guards.
  Create8 seats -> edit/rename10 seats/custom price -> reload actual GET -> assign6
  -> reject blocking assigned table -> reject shrinking to5 -> release -> block
  -> reload confirms removed from available choices while row retained.
- Actual deferred assignment checks forced AFTER the atomic operation, matching
  Production transaction boundaries. Invalid shrink rejected by original
  TABLE_OCCUPANCY_OUT_OF_RANGE guard; no partial persisted fixture changes. Existing
  handler reports this database rejection as500; error mapping was not changed in
  this surgical permission fix. Assigned block409, wrong venue/role403, no session401.
- Receipts and QR identities unchanged across both fixture workflows. UI flags
  covered by source/handler regression tests; no new layout/styling introduced.
- Fixture authority is isolated/local, not real staff credentials. Actual SQL
  functions execute against pg_temp copies with ROLLBACK; local state snapshots
  persist between fixture requests for reopen verification. No real Production
  table, booking, payment, ticket or communication mutation. No authenticated
  Production browser tab was available; genuine staff live actions and physical
  iPhone checks not claimed. Reviewed bulk-plan creation gate is source/regression
  verified; full bulk-plan creation not repeated against live shows.
- Private evidence: local-evidence/temporary-table-original-functions.json,
  temporary-table-assignment-assert.json, temporary-table-workflow.cjs and
  temporary-table-workflow-results.json. Existing checkpoints remain untouched.

Baseline before release: Main6203a65d5adfb8c17ef6c93bad7fb14974770bbc,
dpl_A2LFVitMPTwUiHvNAe28srNAyf2A READY. Pending documentationc576a1d is included
in the authorised release. No migrations/ledger repair or Frontend2.0 changes.
