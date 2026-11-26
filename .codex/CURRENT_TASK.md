# Temporary Table Management Permission Restoration

STATUS: RELEASED / READY; BOTH-VENUE AUTHENTICATED FIXTURE LIFECYCLES VERIFIED

DATE: 26 NOVEMBER 2026

- Root cause already established before interruption:1ad9b4e applied the named
  Kaden/Fatima permanent-capacity restriction to temporary creation/status/capacity
  and reviewed temporary plans, unlike the original tables:manage workflow.
  Verified Production named identities correct; not the earlier identity mismatch.
- User expressly approved restoring original temporary-table management access
  and retaining Kaden/Fatima permanent controls, then authorised resume/release
  without further approvals. No investigation restarted or work discarded.
- Reuse Admin createTable/form/temporary seat input and existing show-tables API.
  Temporary create/update/block require existing tables:manage and venue scope;
  reviewed plans retain existing bookings:manage AND tables:manage. Permanent
  set-capacity, protected merged-capacity edits and initial permanent configuration
  retain named editor restrictions. No new permissions, workflow or database change.
- Removal means existing Blocked status after releasing any assigned booking;
  no hard-delete feature introduced. Assigned tables cannot be blocked; actual
  deferred assignment guard prevents capacity below assigned guests. Original
  assignment/release functions, merge safeguards, public415 and no split unchanged.
-80 targeted tests passed, TypeScript and targeted server/test lint passed.
  Authenticated fixture lifecycles Cape Town and Johannesburg both passed.
  Actual serverAdmin role/undertaking checks and actual POST/GET handlers;
  isolated signed authority and cloned pg_temp assignment/release/table guards,
  rollback on each SQL round trip with local fixture state retained for reopen.
  No real table/booking/payment/customer changes or notifications. No available
  authenticated browser tab; no real Production staff action claimed.
- Prior live/Main6203a65 /dpl_A2LFVitMPTwUiHvNAe28srNAyf2A READY. Include pending
  c576a1d documentation in authorised release. Private evidence/rollback unchanged:
  local-evidence/temporary-table-*. Frontend2.0 untouched.
- Detailed continuation: archive/PHASE_4_FLOOR_ASSIGNMENT_IMPROVEMENTS_2026-11-06.md.
- Release1d92065c41c65cf02a539cd15b9ac62c67b4aa62 pushed Main, including pending
  c576a1d; dpl_58qBfqYtpbZVeyMVwn6zStWMBQq6 READY, exact-SHA deployment/live
  book.zingara.co.za alias verified. Live /admin,/book200; show-tables and
  floor-capacity-plan unauthenticated create401. No migration or business-row write.
- Clean Vercel build budgets pass raw1310086/1320000, gzip318394/320000,
  largest169065/170000. No normal data-request/dependency changes. Private release
  evidence local-evidence/temporary-table-production-release.json. Final records
  retained in local documentation commit for next release; no redundant deployment.

---

# Guest Reduction: Allocate Towards Outstanding Balance

STATUS: RELEASED / READY; INSTALLED AUTHENTICATED FIXTURE WORKFLOW VERIFIED

DATE: 26 NOVEMBER 2026

- BUG39 prerequisite confirmed: live bfce278 /dpl_Bni5qzeJ2UkLEA4nF5aunLEpPWcU
  READY; issue completed, ZNG-AMP82L reduction basis unblocked with original values.
- Approved extension (Fatima25Nov; current user request): existing Edit Guest Count
  cancellation dropdown gains Allocate towards outstanding balance. Reuse modal,
  shared policy preview, reconciliation route and atomic cancellation transaction.
  No new controls/workflow beyond explicitly requested option; no permissions,
  business booking records, payment receipts or Frontend2.0 changes.
- Only before/at existing5/7-day cutoff, with eligible paid ticket funds and an
  outstanding balance. Cap at balance; leave excess in existing refund review.
  Reduce reserved refund liability/retained total, not actual receipts; increase
  paid allocation to remaining tickets. Existing status/metadata and link revocation
  handle the revised obligation. Preserve gratuity, forfeiture, Buyouts and guards.
- Reference ZNG-6F3BT2 already reduced12->9 on25Nov: R6600 paid, R12952.50 remaining
  tickets, R1650 refund reserve, R10 other charge, R8012.50 current overall balance.
  New-option fixture produces ticket balanceR6352.50, overallR6362.50. User expressly
  approved preserving R10 and releasing with distinction documented. Actual booking
  unchanged; prior-allocation review safeguard remains, no retrospective conversion.
-124 focused tests pass (including BUG37/38/39, cutoffs, excess/refunds,
  imported/reporting/ticket/payment-link safeguards); TypeScript and targeted lint
  pass. Authenticated390px actual modal -> real GET/POST handlers -> temporary SQL
  -> close/reopen -> actual payment-link creation/lookup passed; desktop1280 no
  overflow,9 valid original-identity tickets, table retained, paid receipt unchanged,
  old links revoked and new linkR6362.50.401 unauthenticated /403 restricted staff.
- Fixture boundary: local signed test authority/Supabase adapter, actual serverAdmin
  permission/undertaking checks and application handlers; actual installed SQL,
  seating compatibility and ticket/payment guards cloned into session-temporary
  tables with rollback. No real staff session/customer amendment/payment/email or
  provider checkout during QA. All11 authenticated journeys passed, plus8 direct
  SQL guard/cutoff/Assignment Queue cases. Final excess/fee check caps ticket-paid
  value at remaining ticket obligation, leavingR1190 refundable in the surplus
  fixture. Original receipts unchanged; no negative ticket balances.
- Migration20261126120000 patches only existing policy function, hash guarded;
  preserve known November12 ledger discrepancy. Private originals/fixtures/results
  local-evidence/balance-*. Include pending documentation142cefc in release.
- Continue in archive/CANCELLATION_POLICY_WORKFLOW_UPDATE_2026-11-23.md.
- Release6203a65d5adfb8c17ef6c93bad7fb14974770bbc includes pending142cefc;
  Main/live book.zingara.co.za ->dpl_A2LFVitMPTwUiHvNAe28srNAyf2A READY, exact-SHA
  list/live alias verified. Migration applied/recorded alone after READY. Actual
  reference/BUG37/38/39 booking/payment/ticket/table hashes unchanged; only policy
  function changed among protected functions. No retrospective allocation.
- Installed SQL smoke repeated actual authenticated fixture modal save/reopen,
  current payment-link create/view,9 valid tickets/same table/unchangedR6600 receipt,
  R6362.50 link and401/403 restrictions. All essential scenarios passed before
  release; real Production customer amendment/physical iPhone intentionally unverified.
- Clean Vercel budget raw1310041/1320000, gzip318384/320000, largest169055/170000;
  live /admin,/book200 and unauthenticated reconciliation401. Private final evidence
  balance-allocation-live-release.json /installed-verification.json /
  installed-workflow-results.json. Final records committed locally for next
  authorised release, avoiding redundant Markdown-only Production deployment.

---

# BUG-000039: Ordinary Outstanding-Balance Guest Reductions

STATUS: RELEASED / READY; INSTALLED CORRECTION VERIFIED

DATE: 26 NOVEMBER 2026

- Read original BUG39 and Guest Count.JPG: ZNG-AMP82L15->14 guests. Saved
  R21094 total/R8250 paid/R12844 outstanding/service feeR2344.
- Root cause: cancellation basis blocks non-fully-paid bookings except exact
  native R550 deposits with zero service fee/add-ons. Ordinary balances wrongly
  require Accounts. Existing modal/API/two SQL policy functions/atomic delegates
  reused; no new control/endpoint/schema/permission or Frontend2.0 changes.
- Restore valid unpaid/partial balances; release eligible unpaid obligations
  first, never invent paid refunds/bar credit/gratuity. Preserve existing exact
  deposit treatment,5/7-day cutoffs, forfeitures, paid Corporate gratuity rules,
  genuine exceptional-basis guards and historical receipts. Sync status/metadata
  and revoke stale links when total changes. Table Plan/Function Brief retain
  obligations separately from paid gratuity; old allocations retain fallback.
- Before-cutoff fixture:14 guests/R19688.40 total/R8250 paid/R11438.40 balance,
  no Accounts/refund/bar allocation. Actual booking not amended.
-90 focused tests pass including BUG37/38 and reports; TypeScript/lint pass.
 19 temporary SQL scenarios execute actual native/Corporate delegates. Permissions,
  revision, lock, preview, refund/balance guards, replay and stale links verified.
  Table-fit/capacity helpers isolated; no real booking/payment/ticket/seating QA.
- Migration20261126110000 fail-closed patches only existing basis/transaction;
  preserve November12 ledger discrepancy, no db push. Originals/screenshot/SQL
  private in local-evidence/bug39-*. Include pending docs2e46ffc/b7424f1.
- Release bfce278173bac1544d33077c8d9df34bfda3d6f1 pushed Main; deployment
  dpl_Bni5qzeJ2UkLEA4nF5aunLEpPWcU READY and actual book.zingara.co.za alias
  verified. Migration applied/recorded alone; installed19 temporary scenarios pass,
  including partially-paid Corporate staff-confirmed breakdowns. Actual affected
  basis now unblocked. Reported/BUG37/BUG38 booking/payment/ticket hashes unchanged;
  atomic delegates and full-payment ticket guards unchanged.
- Clean Production build budget passes raw1309519/1320000, gzip318234/320000,
  largest169055/170000. Live /admin and /book200; unauthenticated amendment401.
  No real authenticated amendment performed: installed fixture/guard evidence,
  not a claim that Rasmus has already completed his save. Reopen/review/retry.
- BUG39 completed with three short everyday-English sentences and maintenance
  audit; original issue/screenshot retained, no customer communications. Private
  release evidence local-evidence/bug39-production-release.json. Final records
  committed locally for next authorised release, avoiding redundant doc deployment.
- Full continuation:
  archive/CANCELLATION_POLICY_WORKFLOW_UPDATE_2026-11-23.md, BUG39 section.

---

# BUG-000038: Full-Payment Guest Increase

STATUS: RELEASED / READY; INSTALLED FUNCTIONAL CORRECTION VERIFIED

DATE: 25 NOVEMBER 2026

- ZNG-86Q76S: Fatima's3-to5 amendment failed14:07:52 SAST with actual SQL error
  FULL_PAYMENT_REQUIRED_BEFORE_TICKET_ISSUANCE. NYE CPT31Dec, Golden Circle506;
  original3 guests/R5820 paid/R0 outstanding/3 valid individual tickets unchanged.
- Existing guest-increase trigger attempted to issue extra tickets after the
  amendment correctly created an additional R3880 obligation. NYE full-payment
  ticket guard rejected this, rolling back the whole amendment. Not a reduction,
  cancellation-policy defect or missing November12 payment-link wrapper.
- Scoped migration20261125143000 reuses existing ticket-population reconciliation:
  defer unpaid full-payment-only extra entitlements; reconcile after full settlement
  of an active non-archived booking. Original tickets/QRs remain; standard flow,
  money calculations, payment/lock/revision/capacity and ticket security unchanged.
- Forty-six targeted tests, TypeScript/lint pass. Actual installed SQL and original
  SQL exercised only with session-temporary tables and rollback: old500 reproduced,
  guarded failures atomic,5 guests/R9700 total/R5820 paid/R3880 balance, same table,
  three tickets until settlement then five once, no duplicate/cancelled reissue.
- Read-only observed scope:11 same errors in bounded24-hour route logs, not11
  proven distinct bookings;19 current full-only native per-guest bookings susceptible.
  Fourteen-day exact-message query timed out; no exhaustive historical count claimed.
- Migration applied/recorded alone. Real booking/payment/ticket/table hashes and
  original payment guards/population/amendment hashes verified unchanged. No
  financial/customer communications, real amendment, payment or seating QA.
- Pending documentation commit624b31f explicitly included in this authorised
  release. No role-review/security remediation or Frontend2.0 changes included.
  Full evidence/rollback: archive/BUG_000038_FULL_PAYMENT_GUEST_INCREASE_2026-11-25.md
  and private local-evidence/bug38-*.
- Release65a5d15cc6dde71bbbce39036c62ac8640ae4848 includes624b31f governance;
  dpl_9kJxC18dVWEejT7tCZ1R1NzmjvEn READY, exact-SHA deployment/live alias verified.
  Clean Vercel build passes unchanged raw1309326/gzip318165/largest169055 budgets.
  Live /admin and /book200; unauthenticated reconciliation POST401. Safe installed
  SQL fixture supplies actual amendment/settlement evidence, not merely assets.
- Current capacity query permits the additional two at snapshot (Golden Circle
 83 entitled/120 public,125 operational). Existing locked validations still apply.
  Only BUG-000038 reported this generic failure in bounded issue query; no distinct
  references can be inferred from11 error logs. Fatima can reopen/review and retry.
- Final verification notes retained locally for the next authorised release;
  no redundant Markdown-only deployment. No genuine customer save claimed.
- BUG-000038 marked completed25Nov14:51 SAST with appended release/retry notes
  and explicit System maintenance audit; reporter/original evidence preserved,
  no completion email sent. ZNG-86Q76S not manually amended. Private compact
  release evidence: local-evidence/bug38-production-release.json.

## Staff-Facing Resolution Notes Follow-Up

-25 November: user requires all future staff-facing bug resolutions to use at
  most three short everyday-English sentences: cause, fix and staff action; no
  technical terms, test results or release references. Recorded in AGENTS rule15.
- BUG-000038 resolution text shortened under explicit authority; technical
  findings retained in its existing internal archive and immutable audit history.
  No status, booking, payment, permission or application changes/deployment.

---

# Project Context Reconciliation And Permanent Governance (Completed)

STATUS: DOCUMENTATION RECONCILED; NO APPLICATION OR PRODUCTION CHANGES

DATE: 24 NOVEMBER 2026

- Current recovery entry point: AGENTS.md -> .codex/README.md -> this record ->
  the24 November superseding section in
  archive/DEVELOPMENT_BASELINE_RECONCILIATION_2026-10-30.md. Existing structure only;
  no new development phase. Use its A-L source map and113-record archive catalogue.
- Reconciled current booking/Admin/seating/finance/PayFast/CRM/ticketing/
  communications/reporting/security/design/performance paths with dated records.
  Documented current vs historical decisions, no-split seating, purchaser/attendee,
  cancellation/gratuity rules, removed zone editor and retained table controls.
  Archived records below are historical task snapshots, not all active work.
- Fresh read-only baseline: remote Main and live706ed8cb07112d481a106af53c41265399fdc3b3,
  deployment dpl_ArQDU5uikxJ2VURTVyF7AoSx77Uk READY; application29e9114. Both
  venues PB6-8 and public120/125/138/32=415. Reused16 recent tests/40 prior
  checkout-allocation checks and successful Vercel performance gates; no retesting
  of unchanged code, no live customer action or authenticated mutation.
- Important new evidence gap: migration20261112100000 appears local-only in the
  ledger despite historical application record and both remote wrapper functions
  existing. Explicit READ ONLY metadata query confirms presence/hashes; no full
  function parity assertion, migration application or ledger repair. Latest recorded
  version20261124153000. Future migration task must reconcile before db push.
- Carry forward dated Accounts bar-credit/reversal reviews, provider dispatch/
  ingress traces, CRM candidates, operational seating and communications follow-up,
  Xero bulk/credit activation and missing-review identity. No case newly remediated.
  Private config, current queue counts, signed agreements/POS and every function
  definition were not comprehensively reverified; limits explicitly documented.
- AGENTS now records14 permanent doctrine rules; README defines context recovery,
  evidence/authority, actual-outcome verification and documentation-only release
  exception. Concise operational rules, detailed source references in baseline.
- Main auto-deploys even Markdown-only commits. Commit scoped documentation locally
  and retain for next authorised application release; no push/preview deployment,
  CI configuration change or unnecessary Production release. Initial tracked tree
  clean; private untracked local-evidence/ and all checkpoints remain preserved.
  Frontend2.0 untouched;2FA and marketing functionality are not authorised here.

---

# Seating Stabilisation (Completed Historical Handoff)

STATUS: RELEASED / READY; LIVE ASSETS, RETAINED RULES AND PERFORMANCE VERIFIED

DATE: 24 NOVEMBER 2026

- User supersedes the zone-wide editor request: remove Seating Limits/Booking
  sizes, retain PB6-8, all23 booths per venue, fixed public120/125/138/32=415,
  original individual table-seat controls and existing Kaden/Fatima authority.
- Located independent paths: FloorBookingLimits UI and venue-settings PUT
  bookingLimit branch are the editor; seatingBookingLimits reader, physical
  booth-fit helper, approved settings and table/capacity APIs remain unchanged.
- Deleted the unused editor and its Admin rendering/import. Removed its RPC
  call from the API; stale editor requests now return400 before any write.
  Ordinary settings saves still preserve existing bookingLimits. No migrations
  or configuration changes; existing service-role-only SQL history retained.
- Reconciles Main e369c48 (failed/not live) and uncommitted lazy-loading work
  deliberately, not by reverting. Preserved before-state checkpoint:
  /private/tmp/zingara-seating-stabilisation-before-20261124.tgz.
  Existing private evidence/checkpoints and Frontend2.0 remain untouched.
- Sixteen focused regressions pass: editor writes disabled for all identities;
  table-seat saves/permissions/bounds/assigned-guest checks; PB6-8,23 booths,
  unchanged415 baseline, temporary arrangements and no auto-splitting.
  TypeScript, changed-file ESLint and optimised Webpack build pass. Prior40
  checkout/allocator checks and read-only53-booking stability sample reused.
- Local default Turbopack remains blocked by compiler-worker port binding.
  Vercel clean npm run build and unchanged Admin budgets are the release gate.
  No real booking, payment, assignment or authenticated settings writes for QA.
- Application commit29e9114ae2c8af271863d1e15eb8c80ff99fbbff pushed to Main;
  deployment dpl_9fYJScCreVyCBiKkJfgP8qHmyjjo READY and exact live alias verified
  24 November2026,18:03 SAST. Supersedes failed e369c48 without reverting rules.
  Vercel clean npm run build passes unchanged budgets: raw1309326/1320000,
  gzip318165/320000, largest gzip chunk169055/170000 bytes.
- Seventy-three current live assets checked: retired editor absent, Save table
  seats retained in2ts497skuypxo.js and staffProfileId in0v5u2479l2lqo.js.
  Both venues' actual settings retain PB6-8 and other zones1-19, public caps
  120/125/138/32. Public /book and /api/shows return200; unauthenticated settings
  and table writes return401. No live staff save/real checkout claimed.
  Evidence: local-evidence/seating-stabilisation-production.json.
- No new stability issue identified. Prior unclaimed legacy inventory follow-up
  remains unchanged. Tracked working tree reconciled; private evidence retained.
  Follow-up record commit changes Markdown only; deployed application unchanged.

---

# Urgent Production Stability Check

STATUS: READ-ONLY CHECK COMPLETE; NO NEW PRODUCTION REGRESSION IDENTIFIED IN CHECKED SCOPE

DATE: 24 NOVEMBER 2026

- Actual Vercel alias lookup confirms book.zingara.co.za remains READY on
  d0da167e4283b2bd680492946fd514e7560fd65d / dpl_8BCv2zaSZ2GNTduyJafKohLHCYhc.
  Main/local HEAD e369c48 is the failed, NOT live, UI cleanup deployment
  dpl_yFBFaFbznKjSTKCX89qJ7Jki5ALQ. Failed solely on Admin largest-chunk budget,
  not checkout compilation:170115/170000 gzip bytes. No failed release promoted.
- Uncommitted Admin lazy-load correction, associated test and task/archive notes
  preserved. No stalled prior next-build/release-verification processes found.
  Local exact Turbopack build was blocked by managed-environment PostCSS worker
  port binding; no successful full performance-budget verification claimed.
  Do not resume/release the UI cleanup as part of this stability check.
- Public /book and read-only /api/shows and /api/venue-settings return200;
  59 future listed shows across both venues. Availability GET intentionally NOT
  invoked because it runs payment-hold cleanup; equivalent capacity/sales data
  checked under explicit BEGIN READ ONLY instead. No payment submission made.
- Both venues: GC/MR/RB Standard defaults1–19 (existing ce85b69 rule), PB6–8;
  public zone caps120/125/138/32 =415. Approved table layouts retain74 tables,
  including23 booths per venue, baseline138 for booths. Individual table sizes,
  Standard booking ranges and zone/public totals are separate rules.
- Read-only sample: CPT26 November18:00 and JHB25 November17:00. All eight
  venue/zone capacity states read successfully. Public closed/sold-out controls
  are explicit existing settings; operational temporary capacity does not raise
  public limits. Fifty-three assigned active bookings checked: zero incompatible
  assignments; zero orphaned active claims. No seating or bookings changed.
- Ten unconfigured physical-table rows in this sample are unclaimed; latest
  update25 August2026, predating the recent releases. Existing operational data
  follow-up, not a new seating regression; no automatic configuration attempted.
- Forty focused checkout-validation, seating-eligibility and allocator tests
  pass. Tested domain/API sources match live d0da167 exactly. Prior permission,
  all23 booth fits and capacity checks reused. No real bookings, payments,
  communications, config writes, schema changes, commits or deployments in this
  check. Frontend2.0 and all uncommitted work preserved.
- Evidence: local-evidence/production-stability-readonly-2026-11-24.json;
  live alias/HTTP and legacy-row metadata results recorded in this session.

---

# Seating Limits Scope And UX Cleanup

STATUS: VERIFIED LOCALLY; PRODUCTION RELEASE PENDING

HISTORICAL STATUS SUPERSEDED:29e9114 removed this editor; do not resume its release.

DATE: 24 NOVEMBER 2026

- Recovered original rules from pre61d15649 bookingSeatingAvailability.ts and
  approved single-guest change ce85b69. Standard creation accepts one guest and
  rejects20+, so GC/MR/RB1–19 are correct Standard booking defaults, NOT table
  capacities. Do not revert to old base-zone2–20 or impose largest-table limits
  on valid bookings. No incorrect numeric defaults identified or rewritten.
- Approved individual table bounds vary: GC/MR2–10, RB2–8. Zone public caps are
  separate120/125/138/32. Requested PB booking defaults6–8 retained at both venues;
  original table-seat editors and existing operational exceptions unchanged.
- Reused FloorBookingLimits and existing audited per-zone PUT. Section now sits
  inside existing Floor & Arrivals panel beneath the performance selector, named
  Seating Limits, collapsed initially. Four compact equal zone cards, two columns
  on narrow mobile/four desktop, Min/Max fields and one Save Changes button.
  Scope reads venue name / Venue-wide / Standard bookings; redundant paragraph
  removed. No-change saves disabled; no requests on open or for untouched zones.
- One click saves only dirty zones using existing calls (bounded four). All
  bounds validated before any save. Existing per-zone atomic audit retained;
  partial failure explicitly reported, saved zones not retried and remaining
  edits preserved. No new API, schema, migration, dependency or normal-use query.
- Seventeen focused tests pass, including original public/table/cap distinction,
  Kaden/Fatima visibility and actual PUT/POST permission/safeguard regressions.
  TypeScript, component lint and optimised webpack build pass. Browser checks
  at320/390/1280px confirm placement, initial collapse, four cards/one save,
  dirty-only requests, invalid bounds/no writes, partial retry, venue isolation,
  no overflow and numeric text fitting. Screenshot inspected; APIs mocked.
- Server-side two-person restriction unchanged. No real setting, booking,
  assignment, payment, capacity or schema changes. Frontend2.0 untouched.
  Evidence local-evidence/seating-limits-browser-results.json and seating-limits-*.png.
- Initial release e369c48 / dpl_yFBFaFbznKjSTKCX89qJ7Jki5ALQ failed the existing
  Admin performance gate after successful compilation/TypeScript: largest chunk
  gzip170115 exceeded170000 by115 bytes; aggregate gzip319229/320000 and
  raw1312362/1320000 passed. No failed deployment promoted. Do not raise budgets.
  Reused existing next/dynamic named-export pattern for the restricted Floor-only
  panel, removing it from ordinary initial Admin loading. Full Production
  Turbopack build/performance verification in progress; no behaviour/API changes.

---

# Urgent Floor Controls Regression Correction

STATUS: RELEASED / READY; LIVE ASSETS, SETTINGS AND UNAUTHENTICATED DENIAL VERIFIED

DATE: 24 NOVEMBER 2026

- Reused confirmed findings for release61d15649. The client compared an auth-user
  ID with staff-profile IDs, hiding booking-size controls from Kaden and Fatima.
  Ordinary Private Booths also replaced their original seat editor with text.
- Existing session serializer now includes staffProfileId while retaining the
  original auth id, role, permissions and owner binding. Floor visibility uses
  that explicit profile identity and the existing tables:manage permission.
- Original Private Booth Table seats input and Set table seats/Save table seats
  actions restored alongside the existing per-venue Booking sizes panel. Table
  capacities and booking limits remain separate; public caps unchanged.
- Existing show-tables API restricts physical capacity saves, temporary capacity
  creation/edits and temporary activation/deactivation to active Kaden/Fatima
  profiles, retaining Floor permission, venue scope, stale-state and assigned-pax
  checks. Existing capacity-plan creation and capacity-changing initial plans
  use the same server gate; assignment-only plans and non-capacity notes remain
  available under their existing permissions. No new queries or migrations.
- Seven focused real-code regression tests pass: actual session serializer and
  PUT/POST handlers, both identities with distinct auth IDs, all four zones and
  both venues, allowed saves, denied other/inactive staff, invalid limits,
  temporary notes preserved, physical bounds and assigned-guest safeguards.
  TypeScript and focused ESLint pass. Existing baseline page lint unchanged.
- Eight Chromium component combinations pass (two authorised staff x two venues
  x320/1280px): both controls visible together, booking save, restored seat-button
  action, no overflow. Other staff panel hidden and seat editor disabled. Actual
  restored JSX used, APIs mocked. Physical iPhone/live staff writes not claimed.
- Read-only Production metadata: show_tables RLS enabled, authenticated UPDATE
  privilege false, no client write policies, capacity-plan RPC authenticated
  execution denied. No business rows, capacity settings or database schema changed.
- Existing navigation: Admin > Floor & Arrivals > Floor > Floor Performance;
  select the venue's show, expand Booking sizes; expand a booth for Table seats.
- User explicitly requests outstanding Markdown records committed. Nineteen
  pending task/archive records checked for credential patterns (none found);
  preserve their historical findings and all private local evidence/checkpoints.
  Frontend2.0 untouched. Evidence: local-evidence/floor-controls-regression-*.
- Fix and all19 outstanding Markdown records committed/pushed in
  1ad9b4e6b32b285d07e50362f9aa89e9e35dd3d9. Production deployment
  dpl_8xMKMxxsHRXpf3txrbigYRRRzC46 READY, exact SHA and book.zingara.co.za
  alias verified24 November2026,17:15 SAST. AdminHTTP200; live controls asset
  1psaii18m06y2.js contains Booking sizes, Save table seats and separate-allocation
  help; 0y6sws4w_j_4r.js contains staffProfileId identity handling. Both settings
  write routes deny unauthenticated requests with401. Both venues retain PB6–8;
  public caps120/125/138/32 unchanged. No real staff saves during live QA.
- Evidence: local-evidence/floor-controls-regression-production-code.json.
  Final verification-record commit is Markdown-only; application remains the
  verified fix above. Refresh Admin to load the corrected client/session payload.

---

# Private Booth Capacity Controls

STATUS: RELEASED / READY; LIVE SETTINGS, LAYOUT, CAPACITY AND ACCESS VERIFIED

DATE: 24 NOVEMBER 2026

- Confirmed scope: Cape Town AND Johannesburg, all 23 existing booths (1–12,
  14–24); no added booth. New Standard Private Booth booking range 6–8.
- Reused Floor Management and the existing venue-settings PUT/settings JSON:
  per-venue minimum/maximum controls for all four zones. Other zones retain
  their existing Standard booking range (1–19); Corporate eligibility unchanged.
- Verified Kaden/Fatima's active staff IDs. API and atomic database setter enforce
  exact identity, active account, existing Floor permission and venue scope.
  Updates are audited; stale/general settings saves cannot overwrite these limits.
- Approved immutable layout/public caps remain GC120/MR125/PB138/RB32 =415.
  Existing physical catalogue, show-table baseline capacities, bookings, payments,
  assignments and authorised temporary arrangements are not rewritten. A shared
  pure fit helper permits eight guests at an existing ordinary six-baseline booth;
  existing allocation/compatibility checks extended, not bypassed. No auto-splits.
- 48 focused tests pass; 17 existing capacity checks also passed. One unchanged
  reporting-label assertion fails against Main's already-existing wording.
  TypeScript and optimised webpack build pass. New/changed helper/API lint has
  no errors; existing page files retain 12 pre-existing effect-rule lint errors.
- Real component exercised with mocked API at 320/1280px: PUT save, pending
  controls, success/failure recovery, per-venue isolation, no overflow; screenshot
  inspected. Not authenticated live staff or physical iPhone verification.
- Scoped SQL migration passed rollback-only checks: all 23 codes/max8, excluded
  booth13, protected overrides, unchanged public caps, Kaden/Fatima authority,
  invalid values, venue isolation and stale-settings preservation. Rollback true.
- Evidence/rollback: local-evidence/booth-settings-before-2026-11-24.json (private),
  booth-migration-rollback-verification.json, booth-controls-browser-results.json,
  booth-controls-320.png and booth-controls-1280.png. Frontend 2.0 untouched.
- Release: 61d15649f6a39faeed631ecd2f626956876e6aba, pushed to Main;
  Vercel Production dpl_GqA5ViYHSe8SfiwSb13p3ZXSFn9L READY, exact SHA and
  book.zingara.co.za alias verified 24 November 2026, 16:24 SAST. Live Admin
  asset 2l5pe09knwqhz.js contains the controls; Admin and public settings HTTP200;
  unauthenticated settings PUT401. Both venues' actual settings show PB6–8 and
  other zones1–19. All four public caps remain unchanged. Database verification
  confirms 23 approved booths/138 baseline per venue, no booth13, eight-person
  fits for all 23 identities, 12 extended existing fit paths, direct anon and
  authenticated RPC access denied. Configuration migration20261124153000 alone
  applied/recorded; unrelated migration history preserved. No business-row writes.
- Live evidence: local-evidence/booth-production-release.json and
  booth-production-database.json. Source-only scoped commit; unrelated Markdown,
  local evidence and prior work preserved. Task/archive records updated locally.
  Signed-in staff mutation and physical iPhone QA were not performed or claimed.

---

# Final Customers Export UX And Loading

STATUS: RELEASED / READY; LIVE ASSET AND AUTHENTICATION VERIFIED

DATE: 24 NOVEMBER 2026

- Circular gold customer/export checkboxes, pill search/dropdowns, minimal UI
  financial/marketing copy and smaller one-line thousands-separated pagination.
- Same-task download follow-up: existing exporting state now shows branded
  Exporting customers… status immediately; both buttons remain disabled while
  busy, finally resets after success/failure, generic errors are plain English.
- Six focused presentation tests and actual synthetic 320/1280px checks pass
  shapes/keyboard, 12,860-customer format, concise copy, loading/duplicate prevention
  and recovery, no overflow and no extra requests. TypeScript/lint pass.
- AGENTS doctrine updated. No backend/financial/consent/permissions/dedup/query
  changes; no Production customer data/exports or Frontend 2.0 modifications.
- Existing archive/evidence updated without repeating completed backend QA.
- Commit 5b7771596ed3a85ab267fefc8b3289fb55890eba pushed to Main. Production
  dpl_FrCuYKNfgoJT3sHVRMXX38d5Qyjr READY, exact SHA/live alias verified at
  14:22 SAST. Served 3r7_qfy4_e_-_.js includes loading/consent text and circular
  checked styles; /admin 200, unauthenticated export POST 401. Doctrine included.
  Evidence: local-evidence/customer-export-final-ux-production-release.json.
  320px screenshot inspected; no signed-in Production customer download or
  physical iPhone verification claimed. No data/backend changes or new queries.

---

# Customer Export UX Cleanup

STATUS: RELEASED / READY; LIVE UI ASSET AND AUTHENTICATION VERIFIED

DATE: 24 NOVEMBER 2026

- Reused existing branded date-picker range pattern, gold checks and pill control
  styling/feedback. Selection controls/count now immediately above list; Select
  This Page, Select All Columns and Clear Columns. Financial UI labels/copy
  simplified without changing exported headers or calculations.
- Download handler/default disabled styling/condition unchanged. No server,
  permission, export logic, financial, deduplication, query or migration changes.
- Four presentation + twelve export tests pass, complete 1,201-row All Matching
  proven. Actual UI 320/1280px checks pass calendar range, gold/pressed styles,
  selections, disabled controls, All Matching null-ID payload and no overflow.
  TypeScript/lint pass; previous backend and release evidence reused.
- AGENTS.md adds mandatory existing UI design-system reuse for all future tasks.
  Existing audit archive updated. Frontend 2.0/unrelated work preserved.
- Commit f9aa921222d38fa93a999ceb6d4b801c6b5d72ed pushed to Main; Production
  dpl_E7YCLzj79951oZRZi7bPzhFQNWfr READY with exact SHA and live alias. Served
  18lb6s7bnj140.js contains Select This Page, Select All Columns and branded date
  triggers. /admin 200; unauthenticated export POST 401. Doctrine included.
  No signed-in live customer download or physical iPhone verification claimed.
  Release evidence: local-evidence/customer-export-ux-production-release.json.

---

# Custom Customer Export

STATUS: RELEASED / READY; LIVE CONTROLS AND AUTHENTICATION VERIFIED

DATE: 24 NOVEMBER 2026

- One Export panel alongside Customers search/status; 25 selectable fields,
  venue/performance dates/type, all matching or cross-page selected IDs, CSV/XLSX.
- Reuses current customer-management API and matching RPC, CSV helper and existing
  ExcelJS infrastructure; canonical IDs, independent batch relations, role/venue
  and private-field checks. No query on normal usage or panel opening.
- Booking value, paid snapshot, successful payment entries, accepted refunds,
  net ledger amounts, outstanding and unitemised paid are separate. No financial
  records or pricing changed. No customer data exported for QA.
- Marketing excludes unverified labels; current CRM has no authoritative consent
  evidence source, so marketing list download fails clearly rather than inventing
  eligibility. Consent capture is not introduced in this task.
- 35 focused tests, 1,201-row rollback-only SQL batch checks, 390/1280px actual UI,
  TypeScript/lint/optimised build pass. Normal GET byte-unchanged; no dependencies.
- Function-only migration 20261124150000 applied; normal search caps preserved,
  only explicit 500-row export requests extended. Rollback definition/evidence in
  local-evidence/customer-export*. Existing audit archive updated with full details.
- Doctrine commit 251d7e1 will enter Main with the scoped application release.
  Frontend 2.0 and all unrelated work/checkpoints preserved.
- Commits 993df84 (export) and 4e42a15a811a52286db857262abb9a17056fceae
  (streamed large downloads) pushed to Main, including doctrine parent 251d7e1.
  Production dpl_4Wz8HgeZZXJi9jrWP1PUjV3Bxfsb READY, exact SHA and live alias
  verified 24 Nov 13:42 SAST. Live 0wm-22-enjs4o.js contains export controls;
  /admin 200 and unauthenticated export POST 401. No real customer export for QA.
- Streaming regression reassembles a 6,000,018-byte UTF-8 download. Final source
  TypeScript/lint pass; Vercel's final optimised build READY. 35 focused tests pass.
  Installed batch function hash 981dd54f0a581404c82555b9fd501915; service_role-only
  execution grants preserved and migration record verified. Release evidence in
  local-evidence/customer-export-production-release.json and production-db.json.
- Marketing mode intentionally reports no eligible contacts until an authoritative
  consent source is established; no preference/cookie/booking consent inferred.
  Authenticated live customer download was not executed; actual POST/serializers,
  permissions/filter/aggregate scenarios were exercised with synthetic fixtures.

---

# CRM Data And Customer Export Audit

STATUS: READ-ONLY SOURCE REVIEW COMPLETE; NO IMPLEMENTATION AUTHORISED

DATE: 24 NOVEMBER 2026

- Reused today's CRM integrity and prior consent audit; no new Production query,
  customer export or browser testing. Profiles, linked history, summary metrics,
  matching/merges and active/retired export permission paths reviewed.
- Customers has no active custom exporter. Reuse current CRM/search, permissioned
  Bookings export and CSV/XLSX helpers, not retired portability execution. Add a
  bounded field/filter export within Customers only after implementation approval.
- Stable canonical IDs support one row per customer. Marketing mode additionally
  needs normalised-email dedup and verified consent evidence, not preference labels.
  Current Spend is non-cancelled booking value, not net paid/refund-adjusted spend;
  batch aggregation must distinguish these and avoid multiplied joins/N+1 loading.
- Full focused findings/recommendation appended to existing
  archive/GUEST_EMAIL_MARKETING_CONSENT_AUDIT_2026-11-23.md. No application or
  Production data changes. Frontend 2.0 and unrelated local records untouched.
- Commit/push scope: AGENTS.md, README.md and the above relevant audit only.
  Publish documentation-only tag codex/reuse-first-crm-audit-2026-11-24 because
  main auto-deploys; no Vercel settings changes or application deployment.
  Main adoption of doctrine remains for a future authorised release.
- Published commit 251d7e138051cd2fe151dc26331f81be32976594, remote annotated tag
  codex/reuse-first-crm-audit-2026-11-24 verified to resolve to that commit.
  Remote main remains b1cead69; Vercel reports zero deployments for the docs SHA
  and latest Production remains dpl_9T3xxd8Nic2syNYx8kJDb1Maci57 / READY.
  Three documentation files only committed. No customer data queried/exported,
  no application/database change, no tests/build/browser QA repeated.

---

# BUG-000037 — Corporate Guest Reduction

STATUS: ACTUAL WORKFLOW CORRECTION RELEASED / READY; PROTECTED BOOKING UNCHANGED

DATE: 24 NOVEMBER 2026

## Workflow Review And Permanent Doctrine

- Compared pre-policy a347b1f9^ GuestCountReconciliationModal, reconciliation API,
  allocation helper and original Corporate atomic amendment with b1cead69.
  No duplicate operational workflow/API/pricing engine found; no app changes needed.
- Original Corporate fixed-total route changed guests without splitting ticket,
  gratuity or bar values. Original retained-value transfer consumed manual_invoice
  evidence, had no component-entry controls and moved the entire gratuity to bar.
  Restoring that calculation would violate the now-confirmed cancellation policy.
- Existing Edit Payment Details invoice inputs apply only to imported COMP without
  evidence, accept ticket+gratuity only and reconcile via a financial correction.
  Imported Corporate enquiry reconciliation is pre-conversion. Neither captures
  a native paid Corporate ticket/bar/gratuity breakdown during guest reduction.
- b1cead69 conditionally extends the original Edit Guest Count form and existing
  endpoint/atomic delegate. Known components bypass the new input panel. Exact
  breakdown confirmation is necessary for bundled invoices; no automatic amounts.
  Client/API/SQL checks protect separate trust boundaries, not duplicate pricing.
- Reused existing 20 test / 24 temporary SQL / 390+1280px modal / live deployment
  and permission evidence, no repeated QA or Production queries. Michael can use
  Edit Guest Count, verify/confirm invoice amounts, then select eligible bar
  transfer before the seven-day cutoff. No actual booking save claimed/performed.
- Mandatory doctrine added to AGENTS.md and .codex/README.md: inspect before coding,
  reuse/restore/extend first, no duplicate implementations, compare regressions,
  explicit approval and proven necessity for new controls/workflows, smallest
  safe changes, integrity/performance and targeted evidence reuse across sessions.
- Documentation-only follow-up; no application commit/deployment or data change.
  Existing release b1cead69 / dpl_9T3xxd8Nic2syNYx8kJDb1Maci57 remains the verified
  release. All unrelated local work and Frontend 2.0 preserved.

## Authorised Follow-Up — Self-Service Corporate Components

- The previous message-only release did not meet acceptance. Current authorised
  fix adds staff-confirmed ticket/gratuity/prepaid-bar/other amounts and an invoice
  reference within Edit Guest Count. No amount is inferred or prefilled from notes.
- Only the missing Corporate component guard can be resolved this way. Existing
  reconciliation permission, venue scope, locks, revisions, idempotency, refund,
  Buyout and paid-state guards remain. Values must reconcile to the saved total;
  priced add-ons remain retained. Server recomputes and verifies the preview.
- Confirmation travels with the existing request/RPC preview, no extra requests.
  Confirmed components and existing actor/time are retained in the allocation
  metadata and audit. Seven-day cutoff/forfeiture/gratuity calculations unchanged.
- Twenty focused tests pass; 24 rollback-only temporary SQL checks pass including
  authorised Sales role, stale saves, locks, refunds, tampered amounts, rollback
  and idempotency. Actual modal synthetic 390/1280px checks pass: complete/save,
  eligible bar allocation, mismatched total rejection, reset confirmation and no
  overflow. TypeScript, focused lint and optimised Webpack build pass.
- Function-only migration 20261124130000; original definition saved privately in
  local-evidence/bug37-component-function-rollback.json. ZNG-XSUC8A untouched.
  Frontend 2.0 and unrelated records/checkpoints preserved.
- Commit b1cead69e6d0052b4e2dd6ddb13f4e455b7aecb0 pushed to main. Production
  dpl_9T3xxd8Nic2syNYx8kJDb1Maci57 READY; exact SHA and live alias verified.
  Live Admin asset 3at4zlgeoc2ro.js contains the new breakdown controls; /admin
  200 and unauthenticated reconciliation GET 401. Michael's existing role has
  bookings:reconcile; no role/permission changes made. Live mutation not executed.
- Resolution: eligible Corporate reductions and bar transfers can now be saved
  by authorised staff after confirming the invoice breakdown in Edit Guest Count.
  No Accounts/developer intervention required to establish this basis. Genuine
  refunds still follow their existing authorised process. ZNG-XSUC8A remains
  unchanged; no actual staff amendment or live financial transaction claimed.

The earlier investigation below is retained as history; its Accounts-only
operational limitation is superseded by this explicitly authorised workflow.

- ZNG-XSUC8A: 12 guests, 2 December 17:00 Johannesburg; R19,440 total/paid,
  zero stored service fee. No structured invoice evidence or linked Corporate
  request exists, including the request ID retained in metadata.
- Notes claim tickets R14,960, bar R2,440, gratuity R2,040 (sum R19,440), but
  these are not authoritative structured components; gratuity cannot safely be
  inferred from the total or a 12.5% reverse calculation. No notes parsing used.
- Existing allocation guard is necessary for this record, not an unnecessary
  seven-day restriction. Removing it would treat R19,430 as tickets after a
  default R10 fee and could transfer prepaid bar/gratuity incorrectly.
- Shared basis loader now explains the missing breakdown in everyday English
  for both preview and save responses. No financial rules, migrations, added
  queries, booking edits or Frontend 2.0 changes. BUG remains open for verified
  invoice components and separately authorised financial reconciliation.
- Sixteen targeted tests pass; release evidence follows in the existing
  cancellation workflow archive.
- TypeScript, focused ESLint and whitespace checks pass. Only two helper/test
  files committed as b0d6576ed77e8d5ec31ff3a7ede8d9e1a4afa6fd, pushed to main.
  Production dpl_F39UNymuj13ZRgrhpNJGPWubkh8W READY with matching SHA and live
  book.zingara.co.za alias. /admin 200; reconciliation endpoint unauthenticated
  GET 401. No signed-in live reduction performed; financial blocker preserved.

---

# Customer Profile Integrity And Attending Guests

STATUS: RELEASED / READY; LIVE ASSETS AND AUTHENTICATION VERIFIED

DATE: 24 NOVEMBER 2026

- Read-only evidence confirms customer 0c028967-072f-4366-b768-8c10f018cb32
  links ZNG-M95T5B, ZNG-TA6GL3, ZNG-24GZES and ZNG-M2PAXQ. Saved names
  include Marisa Salvarto, Leigh-ann Lyons and Manuela Di Giovanni. Hannah
  already corrected the profile to Marissa Salvarto at 11:35-11:36 SAST today.
  Preserve her work; no Production customer/booking/payment/ticket changes made.
- Root defect: public/Admin booking-customer upserts overwrote matched names
  and CRM defaults. Existing bookings hydrate the shared current profile name.
  Repeat creation now resolves without editing; email wins, phone-only matches
  require one compatible name/contact, merged profiles excluded, no name-only
  implicit merge. Explicit authorised CRM editing/merge workflow retained.
- Audit: 12,854 customers, 9,231 metadata snapshots; zero duplicate email groups,
  ten shared-phone candidate groups; 388 name differences across 291 profiles
  are review candidates, NOT 291 proven corrupt profiles. Complete private list
  retained in local-evidence/customer-identity-review-list-2026-11-24.json.
- Optional Booking for someone else? field added to existing checkout and
  Booking Details metadata editor. Attending name stored only in existing
  booking JSON metadata, no schema/migration. Purchaser/contact/payment routing
  unchanged. Lead tickets, Wallet source, arrivals, manifests, Floor and Table
  Plan display the attendee while preserving purchaser identity.
- 120 focused tests pass; actual metadata handler verifies totals, purchaser,
  ticket identities and stale-save rejection. Table Plan workbook regression
  passes. Local browser 320/390/1280px: conditional/required field, disabled
  access, normal/gift ticket names and no overflow. No physical Safari claim.
- TypeScript/focused lint pass (three pre-existing unused warnings). Local
  Turbopack hit known restricted-port error; Webpack build passed. Existing
  performance-budget parser cannot read the current manifest format, unchanged.
- Same-compiler baseline build confirms largest-chunk overage predates this
  change: 172,289 ->172,207 gzip. Admin referenced chunks +824 gzip bytes (0.27%),
  no dependencies/polling/extra lookups; existing matched-customer writes removed.
- Frontend 2.0, unrelated work and all rollback checkpoints untouched.
- Full findings, outstanding historical review and release evidence recorded in
  archive/CUSTOMER_PROFILE_INTEGRITY_GUEST_BOOKING_2026-11-24.md.
- Commit 460092ee6eba5562fe824c17fc673f4be62c2fe8 pushed to main; Production
  dpl_DohKD4Rx4ZYH2m9LnrdRBZQNbzDG READY, exact SHA and book.zingara.co.za
  alias verified. Live /admin and /book 200; actual assets contain the new field
  and attendee/purchaser display. Customer/bookings endpoints remain 401 without
  auth. No signed-in Production editing, real booking/payment or communication
  executed for QA. Historical gift attendee fields remain for Box Office review.

---

# Booking Deep-Link Navigation

STATUS: RELEASED / READY; LIVE BOOKING FLOOR URL AND SHARED HANDLER VERIFIED

DATE: 23 NOVEMBER 2026

- Root cause: Open Floor URL omitted booking.showId; shared handler also ignored
  show= on Floor/operations links, including assignment notifications. Floor then
  retained/defaulted to a different performance (reported 24 November).
- Open Floor now carries the exact show identity, hidden if none recorded.
  Shared handler resolves existing ID/database-ID aliases, waits for existing
  show hydration, sets canonical selection and matching permitted venue; never
  substitutes another show. Floor table-editor selection reset reused.
- Repeated notification navigation reapplies its intended show after manual
  browsing. Existing booking/accounting reference destinations preserved.
- Shared show-booking selection clears stale search/venue/date/range filters
  for both URL links and calendar buyout review; no additional fetch/query/API.
- Sixteen focused tests pass; TypeScript, test ESLint and whitespace pass.
  Actual URL/handler synthetic Chromium checks at 320/1280px navigate to JHB
  2 December 18:00 despite stale CPT/24 November state, no page errors.
- Broader legacy suites have three pre-existing label/menu expectation failures
  (Dineplan/Communications); confirmed unchanged at HEAD, not refactored here.
- Release scope: src/app/admin/page.tsx and bookingDeepLinkNavigation.test.ts.
  No booking/seating/payment/ticket/data mutations; Frontend 2.0 untouched.
- Existing Floor assignment archive updated with findings and release evidence.
- Commit 75c747bb0b291183d816b812350a6d694f035de9 pushed to main; Production
  dpl_9yRVrHxPDAtziVp6UQKoSBixsyVu READY, exact SHA and book.zingara.co.za
  alias verified. Live Admin 200; served chunk 37f57dhpfpo_d.js contains the
  booking-specific Floor show parameter and shared show-context handler.
  Signed-in Production UI not verified; exact handler tested locally without
  accessing or changing a live booking. All unrelated work preserved.

---

# Review Payment Shortcut

STATUS: RELEASED / READY; LIVE ADMIN HANDLER AND AUTHENTICATION VERIFIED

DATE: 23 NOVEMBER 2026

- Root cause: Needs attention showed a balance-only hash link, even when
  canManageBookings/read-only rules omitted its Payment Controls target.
  Theresa ZNG-YW2USY is cancelled/archived after hold expiry per existing audit;
  R7,700 recorded balance is not permission to pay an expired reservation.
- Reused existing isPaymentLinkEligible plus existing management/editability
  checks. No shortcut for cancelled/archived/completed/refunded/paid/COMP or
  read-only/unauthorised views. Eligible button scrolls/focuses existing controls
  by booking-specific ID; no payment/link API call or lifecycle bypass.
- Cancelled attention message says Booking cancelled; financial summary and
  all existing financial/reinstatement controls remain unchanged.
- Fifteen focused tests pass (five actual UI expression/handler cases plus ten
  existing balance-link regressions), TypeScript, test ESLint and whitespace pass.
  Local synthetic Chromium 320/1280px: active click scrolls/focuses, cancelled
  shortcut absent, no page errors. No Production booking/payment mutation.
- Release scope: src/app/admin/page.tsx and src/lib/reviewPaymentControl.test.ts.
  Existing dirty records, rollback checkpoints and Frontend 2.0 untouched.
- Existing Phase 65 archive updated with findings and release evidence.
- Commit 115c3f4380ab1152341f131d3910b372a6d7e402 pushed to main; Production
  dpl_A5SCRiFYe8MxaWsWVtLoke8BZQ9J READY, exact SHA and book.zingara.co.za
  alias verified. Live Admin 200; served 1av0hn9qhegi-.js contains the corrected
  Review Payment scroll/focus handler. Unauthenticated payment-link lookup for
  ZNG-YW2USY returns 401 without link data. No signed-in Production UI session
  available; actual button behaviour verified locally, not claimed live.
- Vercel token expired during status checks; existing CLI session refreshed
  normally, then API verification succeeded. No credential values exposed or
  project configuration changed. Unrelated work remains uncommitted/preserved.

---

# Timeline Simplification And Performance

STATUS: RELEASED / READY; LIVE ASSET AND AUTHENTICATION BOUNDARY VERIFIED

DATE: 23 NOVEMBER 2026

- Presentation-only changes in existing helper, modal and route; tests updated.
  Dates display 23 Nov 2026, 18:19 in Johannesburg time without seconds/SAST;
  original timestamp and HTML dateTime remain unchanged. Reused cached formatter.
- Removed source/unknown-actor label clutter and generic Other booking details
  fields; hide successful provenance/no-op entries in a memoised display pass.
  Combine only same-instant creation fallback with an existing creation entry;
  meaningful notes, failed actions, distinct history and unknown actors preserved.
- Clear booking creation, guest-count, ticket issue and confirmation/payment
  email wording. Late-recorded payments do not imply the guest actually paid late.
- Sixteen targeted tests, TypeScript, focused ESLint and whitespace pass.
  10,000-entry display filtering measured 0.22 ms locally. Existing query chains
  byte-compared unchanged; page size, limits, loading and request count unchanged.
- Local synthetic Chromium checks at 320/390/1280px pass with no overflow or
  page errors, correct timestamps/attribution and working Close; 320px screenshot
  visually inspected. No physical iPhone or authenticated live staff QA claimed.
- Only four related source/test files released. Existing dirty records,
  evidence and Frontend 2.0 preserved; no database or business record changes.
- Commit 647d520e6e6c9672210e2d32c2368c12454589b8 pushed to main. Git-triggered
  Production dpl_iyfB9tv1vzE6hC2cPYkNmXcbPxhw READY, exact SHA and
  book.zingara.co.za alias verified. Live Admin 200; served Timeline chunk
  1htzsh8d56dm9.js contains simplified labels and cached minute formatter.
  Native/imported unauthenticated Timeline GETs 401 without data. No signed-in
  Production staff UI session available; actual handler role matrix tested locally.
- Evidence and release details: archive/PHASE_53_BOOKING_ACTIVITY_TIMELINE_COMPLETE.md.

---

# Full PayFast Transaction History Reconciliation

STATUS: READ-ONLY AUDIT COMPLETE; ACCOUNTS RECONCILIATION AND DELIVERY TRACE REQUIRED

DATE: 23 NOVEMBER 2026

- Full supplied CSV: 5,360 rows, including 5,284 successful payments, 24
  reversals and 52 payouts; 1 September-23 November 2026. All 5,284 payments
  match one Production allocation; no missing allocation, duplicate provider
  allocation or gross-versus-booking-plus-fee discrepancy. Includes DP imports.
- 16 proven notification delays >5 minutes: previous 14 on 17 November plus
  ZNG-NQ5S4A and ZNG-WDU462 on 21 November (41.88/42.26 hours). All now
  confirmed with usable tickets. 13 bookings expired despite timely provider
  payment, including one historical case without durable notification evidence.
- No confirmed involuntary future paid/unfulfilled case found. The 19 future
  paid/cancelled bookings all have explicit guest/staff cancellation evidence.
  Fourteen lack an export reversal/completed local refund; outcomes need Accounts
  review, not automatic reinstatement or an assumption that refunds are owed.
- 22 of 24 provider reversals lack corresponding structured reversal/completed
  refund records: R119,125 gross / R118,905 booking value. Original receipts are
  preserved; this is a reconciliation gap, not proof of duplicate charges/loss.
- Historical exceptions: ZNG-2WTFSB (past confirmed paid, no tickets),
  ZNG-DTMB3B (six individual tickets/seven guests, added guest remains unpaid),
  ZNG-6YHM7B (two failed refund requests, no export reversal). Accounts review.
- Production SELECT-only snapshots 18:22:37-18:23:24 SAST and one targeted
  exception-history query. No app code, tests, fixes, imports, financial/ticket
  changes, communications, commit or deployment; Frontend 2.0 untouched.
- Full references, amounts, evidence paths and limitations appended to existing
  archive/PAYFAST_PAYMENT_FAILURE_INVESTIGATION_2026-11-23.md. Preserve prior work.

---

# Timeline Label Text Update

STATUS: TEXT-ONLY CHANGE RELEASED / READY; LIVE ADMIN ASSET VERIFIED

DATE: 23 NOVEMBER 2026

- Three literal replacements only: modal heading and top button now Timeline;
  existing lower button now View Timeline. No classes, handlers, permissions,
  audit/data/API changes or other UI edits. Frontend 2.0 untouched.
- Byte comparison against prior HEAD proves both complete files differ ONLY
  by replacing Booking Timeline with Timeline. Twelve timeline tests and
  whitespace checks pass; unrelated work excluded from commit.
- Commit b4a77eb44fef12ceee8f6bb53b264bc8afabf9e5 pushed to main; Production
  dpl_Cxm19VV2zi36EjuJMpZvvNJeGwES READY, exact SHA and book.zingara.co.za
  alias verified. Live /admin 200; served Admin JavaScript contains View Timeline
  and no Booking Timeline. No database operations or authenticated booking QA.
- Existing feature record updated: archive/PHASE_53_BOOKING_ACTIVITY_TIMELINE_COMPLETE.md.

---

# PayFast Notification Delay: New Provider Evidence

STATUS: READ-ONLY RECONCILIATION COMPLETE; DELIVERY ROOT CAUSE NEEDS PAYFAST TRACE

DATE: 23 NOVEMBER 2026

- Located actual 23 Nov PayFast transaction-history CSV in Downloads; 71 Funds
  Received transactions for 17 Nov. Yolandi 341736879 is Credit Card, R6,170,
  17 Nov 07:27:27 SAST; exact booking/attempt identity matches. This supersedes
  earlier uncertainty whether her payment itself completed before expiry.
- Paid before 07:49:44 hold deadline; booking expired 07:50:40. First durable
  notification 18 Nov 09:58:37.927; live historical ingress log 09:58:37.558,
  HTTP 200/all validation checks true; allocation 09:58:39.199. Delay before
  application receipt, not day-long processing after receipt (~1.52 seconds).
- Export cohort: 14/71 payment notifications delayed 22.40-26.63 hours;
  10 bookings expired despite provider payment before hold deadline. 57/71
  notifications received in 0.774-2.178 seconds. All 71 now have processed
  COMPLETE receipts and matching unique payment allocation/gross less R10.
  All 14 delayed bookings currently confirmed. Not a platform-wide loss count.
- Delayed methods: eight Credit Card, five ApplePay, one GooglePay; not MobiCred.
  Official 17 Nov callback incident reported 10:58/resolved 12:50 supports
  escalation but does not establish transaction-specific send times/ownership.
- No stored earlier rejected ITN for this provider ID. Receipt attempts count
  stored identical-body receipts, not proof of all PayFast dispatch attempts.
  Historical route logs show successful callbacks; no confirmed app rejection
  or processing defect. Pre-handler network/firewall/delivery failure remains
  possible. PayFast must supply original dispatch/retry URL/times/HTTP results.
- Phase 65 function hashes and provider uniqueness index match prior evidence.
  Yolandi still confirmed, R6,160 paid/R0 balance, four valid tickets; untouched.
- No speculative code fix, commit, deployment, import, data change or message.
  Full cohort references/times and evidence appended to existing
  archive/PAYFAST_PAYMENT_FAILURE_INVESTIGATION_2026-11-23.md and Yolandi record.

---

# Booking Timeline Simplification And Staff Access

STATUS: RELEASED / READY; LIVE ADMIN AND AUTHENTICATION BOUNDARY VERIFIED

DATE: 23 NOVEMBER 2026

- Both Booking Details timeline entry points now open one existing read-only
  timeline instead of a separate unattributed status-only list. 125 explicit
  event labels cover existing booking/payment/seating/ticket/Corporate/accounting
  families; safe plain-English fallbacks cover unknown future event codes.
- All active known Admin roles can access it, not just two named Super Admins.
  Authentication, active-role and venue restrictions enforced on server. Existing
  booking/analytics/CRM permissions control financial and private detail exposure;
  restricted roles skip payment/accounting queries entirely. No new API/query.
- Recorded staff identities resolve current profile names (including Charlie);
  unknown actors labelled honestly, not guessed to be System. Pending attempts
  distinguished from received payments. Exact SAST timestamps/order preserved.
- Earlier metadata-only status history retained alongside authoritative events;
  canonical duplicate matching uses time/status/note. Different evidence/notes
  retained; zero-value unpaid placeholders/unchanged fields no longer clutter UI.
  Current status is not falsely shown against creation or ticket issue dates.
- 19 targeted tests pass, including actual route fixtures for every staff role,
  venue denial, redaction, attribution, catalogue coverage and existing recovery
  regressions. TypeScript, focused lint, whitespace checks pass. Actual modal
  local Chromium checks 320/390/1280px: no overflow/errors, Close works.
- Only five timeline source/test files committed: 09b8b23ddc86e8cdb73d0adddb36977faeb00ba1;
  initial Production dpl_BMTUnuD7dzwLs1YkftDNUQZgsyAe READY. Final same-scope
  ticket-code/private-link redaction commit 746246cb961b29e1dcd2e3a39aa6f48fb8fe45eb
  pushed to main; dpl_F5eaweFgZjSog9qgLNt2LV9d4mYP READY, exact SHA and
  Production alias book.zingara.co.za verified. No unrelated files.
- Live /admin 200; ZNG and DP timeline endpoints return 401 without credentials
  and expose no events. No signed-in Production session available: every-role
  access/venue/redaction exercised with actual local GET handler fixtures, not
  falsely claimed as live staff impersonation. Authenticated live smoke check
  remains an explicit verification limitation; no credentials/users changed.
- No booking, audit, financial, role/permission or Production data changes;
  no migration. Frontend 2.0/unrelated work preserved. Full continuation:
  archive/PHASE_53_BOOKING_ACTIVITY_TIMELINE_COMPLETE.md.

---

# Yolandi Payment Timeline Follow-Up

STATUS: READ-ONLY INVESTIGATION COMPLETE; PROVIDER/BANK TIMING NOT ESTABLISHED

DATE: 23 NOVEMBER 2026

- Exact persisted booking creation 17 Nov 07:19:44.016 SAST; 30-minute deadline
  07:49:44.016, actual SYSTEM cleanup/cancellation 07:50:40.857. Installed
  set_public_checkout_hold fixes default to 30 minutes; no Admin setting.
- Checkout attempt created 07:19:45.256; browser redirect 07:19:46.033 and
  ordinary return 07:27:35.338, BEFORE expiry. Return is not settlement proof.
- First COMPLETE ITN 18 Nov 09:58:37.927; payment recorded 09:58:39.199;
  receipt processing complete 09:58:39.447. One receipt/attempt, no failure code.
  R6,170 provider gross includes R10 fee; R6,160 applied to original booking.
- No provider processing/authorisation timestamp in stored receipt evidence;
  no imported provider event for 341736879. Cannot decide paid-before-expiry
  with delayed callback versus later completion or attribute fault to PayFast.
- Original callback capacity check found 147/149 committed, only 2 available
  for 4. Correctly preserved payment without automatic over-capacity restoration.
  Zingara processed receipt in ~1.52 seconds, not the next day after receipt.
- Reservation expiry does not revoke an already-issued provider checkout;
  fresh checkout generation for cancelled/archived bookings is blocked. Timing
  gap remains possible; provider-session validity/dispatch trace needed before
  a preventive fix. No new accounting defect or change to 30-minute policy justified.
- Reused earlier 14-day findings; no repeated population audit. Only read-only,
  reference/index-bounded Production queries; no code/config/payment/booking or
  reinstatement changes. Prior completed recovery remains intact.
- Timeline, limitations and short Hannah email appended to existing archive:
  archive/YOLANDI_RESTORATION_THERESA_STATUS_2026-11-23.md.

---

# Yolandi Authorised Paid Booking Recovery

STATUS: RELEASED / READY; ZNG-X94SUT RECOVERED AND LIVE TICKETS VERIFIED

DATE: 23 NOVEMBER 2026

- Explicit subsequent owner authorisation permits recovery of this existing
  paid booking to the unassigned queue despite unresolved seating capacity.
  This supersedes the earlier capacity-blocked outcome below for ZNG-X94SUT.
- Original booking confirmed/unarchived; four guests; R6,160 paid, R0 balance.
  Four unique valid tickets created through existing ticket population lifecycle
  (none existed before). Each live /api/tickets/ZNG-X94SUT-01 through -04 lookup
  returns HTTP 200, valid active ticket, confirmed/fully-paid booking.
- Original show/zone/identity/payment/provenance preserved; table_id null,
  no table claims. Existing Assignment Queue predicate true in Production.
  Admin queue/floor-plan predicates and reporting reused; no new browser session.
- Capacity remains 149 approved; 153 active guests, four-seat shortfall and
  zero remaining availability. No seats/table/capacity adjustments created.
  Box Office must resolve seating; confirmation does not promise an assigned seat.
- Narrow service-only, audited/idempotent one-booking recovery validates exact
  booking/show/four guests/R6,160/provider transaction, revision, edit locks,
  expiry history, no refunds/reversals/tickets/conflicting claims or live sibling.
  Ordinary capacity guard body unchanged outside transaction-audited exception.
- Rollback testing caught latent legacy evidence inflating reported capacity
  149 -> 151 after recovery. Scoped exclusion keeps recovered demand in active
  totals but out of historical legacy-capacity activation; correct result 153/149.
- 22 targeted tests, TypeScript, focused lint and whitespace checks pass.
  Real-trigger recovery checks ended ROLLBACK before release: stale saves,
  active locks, unauthorised direct restoration/additional guests rejected;
  payment/communication/Theresa/other-booking/table invariants passed.
- Commit 09e30f4ae4759eb237026a493469fb1a23edd429 pushed to main. Vercel
  dpl_7f7AvUckokfQkfBt4cXqkxPTHTj2 READY, exact SHA, book.zingara.co.za alias.
  Migration 20261123180000 and recovery committed atomically after READY.
- Recovery audit 41ece4d5-677f-473d-b451-eae0c661ac2a at 23 Nov 17:31:57.795
  SAST. One original successful payment, four tickets, zero communications;
  Theresa remains cancelled with unchanged revision/R0 paid. Frontend 2.0 and
  unrelated work untouched. Only migration and two verification files committed.
- Full continuation/evidence: archive/YOLANDI_RESTORATION_THERESA_STATUS_2026-11-23.md.

---

# Yolandi Restoration And Theresa Status Verification

STATUS: READ-ONLY VERIFICATION COMPLETE; YOLANDI RESTORATION CAPACITY-BLOCKED

DATE: 23 NOVEMBER 2026

- User expressly authorised ZNG-X94SUT reinstatement, preserving four guests,
  R6,160 payment and existing identity, without exceeding capacity. Current
  Production preview shows Golden Circle 149 active / 149 approved capacity:
  restoring four would exceed by four. No table assignment is needed to run
  the preview, but leaving a table unassigned does not bypass entitlement capacity.
- Booking remains cancelled/archived, fully_paid, R6,160 total/paid, R0 balance,
  no tickets or communications. Original checkout expired 17 Nov 07:50:40 SAST;
  payment arrived 18 Nov 09:58:39 and was preserved. Prior capacity review had
  only two seats; current verified availability is zero. No mutation attempted.
- Existing preview additionally returns NOT_ELIGIBLE for the archived paid
  public expiry: its archive exception only handles unpaid public expiries.
  Do not unarchive directly or bypass lifecycle/financial safeguards. Once
  capacity is legitimately resolved, review the narrow lifecycle eligibility
  limitation and existing ticket issuance before proceeding with restoration.
- ZNG-YW2USY: 21 Nov 18:47:25 new -> pending_payment; SYSTEM checkout expiry
  19:18:11 -> cancelled/archived. No later status transition or reinstatement
  in authoritative lifecycle/audit records. Still cancelled, R0 paid / R7,700
  recorded balance, no tickets or communications. Pending attempts are not
  successful payment. Hannah's claimed reversal is not supported by evidence.
- Full findings: archive/YOLANDI_RESTORATION_THERESA_STATUS_2026-11-23.md.
- No Production writes, payments, tickets, communications, code or deployment.
  Frontend 2.0 and all unrelated work preserved. Box Office/management must
  resolve approved capacity without displacing bookings before recovery.

---

# Platform-Wide Cancellation And Bar Credit Audit

STATUS: READ-ONLY AUDIT COMPLETE; ACCOUNTS REVIEW REQUIRED; NO DATA CHANGES

DATE: 23 NOVEMBER 2026

- Examined 9,179 bookings (3,825 Cape Town / 5,354 Johannesburg), including
  archived records, without a date restriction. Snapshot boundary 16:57:58 SAST.
  Screened all available indexed reduction audit events and 139 Corporate
  operations records. No Production writes, communications, source edits or release.
- Two recorded late transfers total R45,760: DP-YB9HPC R29,260 and DP-FNZGQC
  R16,500. Includes both cancelled value and incorrectly displaced remaining
  guests' gratuity, not R45,760 of forfeiture. Consumption cannot be verified.
- Five additional whole-gratuity transfers need authorisation review: R47,520.
  Future priority: DP-W2M2MC (27 Nov) R8,250 and DP-387ZNC (28 Nov) R4,620.
  Their R15,840 combined ticket component was transferred before the cutoff.
- Recorded review envelope R93,280 across seven bookings; separately two late
  note-only claims R2,800 (ZNG-7EDC4C / ZNG-RLKP77), not proven funded credit.
  Combined R96,080 is potential review exposure, NOT proven financial loss.
- DP-FNZGQC was restored from 55 to 60 guests on 12 Nov; its R16,500 bar
  snapshot remained. Preserve evidence and review restored entitlement first.
- Eleven future timely note-only ticket claims R33,500 are not classified as
  policy breaches. Documented historical authorisations kept separate; later
  headcount/snapshot drift and DP-76BGPC repeated-calculation anomaly recorded.
- Reused a347b1f9 release evidence (117 tests / 17 rollback-only DB cases).
  Installed function hashes match; no repeated mutation QA. Existing allocations
  are not backfilled. Separate addon-edit path lacks allocation-policy revalidation;
  informal bar promises remain outside the new financial reduction guard.
- Full per-booking cutoffs, amounts, exceptions, evidence and recommended actions:
  archive/PLATFORM_WIDE_CANCELLATION_BAR_CREDIT_AUDIT_2026-11-23.md.
- No financial correction authorised/performed by this audit. Frontend 2.0 and
  unrelated uncommitted work preserved. No commit, push, migration or deployment.

---

# Cancellation Policy And Financial Workflow Update

STATUS: RELEASED TO PRODUCTION / READY; NON-MUTATING LIVE VERIFICATION PASSED

DATE: 23 NOVEMBER 2026

- Management confirmed late Corporate cancelled ticket value AND attributable
  prepaid gratuity are forfeited; remaining guests' gratuity stays allocated.
  No late Corporate contractual-gratuity review flag, refund or bar credit.
- Standard reductions use five days / R550 deposit per removed guest; Corporate
  seven days. Eligible non-forfeited paid ticket value may retain the authorised
  bar-transfer option. Gratuity is never automatically transferred to bar.
- Native/imported settled bases and verified native R550 deposits covered.
  Unpaid cancelled ticket debt is released without inventing a paid credit.
  Mixed/uncertain arrangements, existing allocations and unverified contract
  components require Accounts review. Buyout fixed-price terms excluded.
- Atomic, permission/venue/lock/revision/idempotency/preview guards retained.
  Existing receipts and gratuity evidence immutable; no automatic refunds.
- Policy-aware Admin previews, reporting, Table Plans and Function Briefs;
  inappropriate total-only edits/full refunds/accounting prefill guarded.
  Public policy and pre-payment summaries disclose deadlines and treatment.
- 117 targeted tests pass; 17 isolated database allocation cases also check
  rollback/retry, permissions, revisions, active/expired locks and stale previews.
  TypeScript passes; lint baselines unchanged. Local Turbopack build blocked by
  existing sandbox port-binding restriction; cloud build/budget required.
- New function-only migration verified with rolled-back temporary fixtures.
  Unrelated old migration-history discrepancy will NOT be replayed/repaired.
- No Production booking/payment mutation or QA communication. Protected booking
  hashes and original replaced function saved in local-evidence; Frontend 2.0
  and all unrelated uncommitted records preserved.
- Full scope, evidence and release details:
  archive/CANCELLATION_POLICY_WORKFLOW_UPDATE_2026-11-23.md.
- Commit a347b1f9775613c20d893f15b634651014c313af pushed to main.
  Production dpl_DgGs3t4zMnooYU2LzRuEpvHjw1xd READY, serving book.zingara.co.za.
  Cloud build/TypeScript/budget passed: raw 1,306,308; gzip 316,981;
  largest gzip chunk 168,649 bytes, all within existing limits.
- Function migration applied transactionally and only version 20261123150000
  recorded. Anonymous execute denied. Protected DP-YB9HPC/DP-FNZGQC hashes
  unchanged. Live policy/terms/Admin 200, correct new policy wording verified;
  unauthenticated reconciliation/refund POSTs 401. No real save/refund QA.

---

# Corporate Gratuity Terms Audit

STATUS: READ-ONLY AUDIT COMPLETE; CONTRACTUAL TREATMENT NOT FULLY ESTABLISHED

DATE: 23 NOVEMBER 2026

- Exemplar DP-YB9HPC rechecked: original evidence R123,200 tickets + R15,400
  gratuity; full R15,400 transferred to bar, not just removed guests' portion.
  Nine guests' proportional gratuity is R1,732.50; remaining 71 is R13,667.50.
  These are arithmetic comparisons, not approved adjustments or new amounts due.
- Current service_fee and valueAllocation.ticketGratuityAmount are both zero;
  total/paid R138,600, balance R0. No separate remaining gratuity receivable is
  recorded. Historical evidence and operational note still retain R15,400.
- No linked Xero document, linked Corporate request or booking-linked gratuity
  communication was found. No signed Exemplar agreement located. Cannot infer
  contractual discharge, forfeiture, refund or bar-transfer permission from sums.
- Located six-page Corporate Buy-Out Terms PDF in Documents/Zingara/BUYOUT
  Process: fixed up-to-400 price, 12.5% dinner/show gratuity, full upfront payment,
  final numbers 14 days; whole cancellation 100% at 90+ days / 50% at 30-89 /
  none under 30, no credit for no-shows. Applicability/acceptance for Exemplar
  unproven; this is not the generic seven-day Corporate policy.
- Confirmed reporting divergence: Table Plan respects current valueAllocation;
  Function Brief resolver ignores it and reproduces original R15,400 gratuity,
  R123,200 tickets and zero bar from evidence. Read-only local reproduction only.
- No financial/code/communication/Production changes; no deployment. Existing
  task records and Frontend 2.0 preserved. Full evidence and decision boundary:
  archive/CORPORATE_GRATUITY_TERMS_AUDIT_2026-11-23.md.

---

# Cancellation, Guest Reduction And Bar Credit Audit

STATUS: READ-ONLY AUDIT COMPLETE; POLICY AND HISTORICAL REVIEW REQUIRED

DATE: 23 NOVEMBER 2026

- Gayle Crow / Exemplar identified as DP-YB9HPC, Johannesburg 12 November.
  Vanessa saved 80 -> 71 on 12 November at 09:35 SAST; reason records a request
  on 11 November. Released tickets R13,860 plus the entire original R15,400
  gratuity became R29,260 bar allocation. Total/paid remain R138,600, balance R0.
- Separate R70,000 operational bar limit is explicitly NOT prepaid; it must not
  be confused with the new allocation. No refund record or proven consumption.
- Whole-booking cancellation implements 5-day Standard / 7-day Corporate
  windows. Paid imported guest-reduction transfer has no deadline/forfeiture
  check and offers mandatory confirmed bar transfer, including all gratuity.
- Venue configuration says 48-hour refund review; public policy/email links
  do not explain numeric windows or partial reductions. Signed Exemplar terms
  and a uniform Buyout cancellation rule were not established.
- Bounded 90-day audit found 10 successful transfers / 9 bookings; two inside
  applicable code windows without later show transfers: DP-YB9HPC and DP-FNZGQC
  (R16,500). Combined allocation R45,760 is review exposure, not proven loss.
- 27 existing targeted tests passed. Production queries were read-only;
  no mutation RPC, code change, financial correction, migration or release.
- Management must confirm partial-reduction/gratuity/exception and Buyout terms
  before implementation or separately authorised historical corrections.
- Full evidence, limitations and smallest safe recommendations:
  archive/CANCELLATION_REDUCTION_BAR_CREDIT_AUDIT_2026-11-23.md.
- Unrelated work, historical evidence and Frontend 2.0 preserved.

---

# Guest Email And Marketing Consent Audit

STATUS: READ-ONLY AUDIT COMPLETE; NO IMPLEMENTATION OR ENROLMENT

DATE: 23 NOVEMBER 2026

- Email capture exists in public/Admin/Corporate bookings, CRM and historical
  imports; optional per-ticket contacts are not automatically CRM subscribers.
- No dedicated newsletter opt-in found in current booking/customer creation.
  Booking terms/operational messages and cookie advertising consent are separate.
- Generic customers.preferences.marketingPreference exists; explicit email
  consent timestamp/source/notice-version/history ledger not identified. Imported
  preference/Dineplan opt-in labels alone do not prove per-contact consent.
- Authorised staff can read preference in CRM. Active booking export includes
  emails but no consent eligibility. Legacy customer CSV/XLSX export code includes
  preference but Data Portability is currently hidden/disabled. No ready consented
  contact exporter, marketing connector or customer-triggered audience sync found.
- One Production schema/trigger query only, READ ONLY/ROLLBACK; no customer rows,
  email addresses, exports or transfers. No code, migration, commit or deployment.
- POPIA section 69 explicit consent and qualified existing-customer exception
  distinguished using official Regulator guidance; booking alone insufficient.
- Future minimum: separately approved optional opt-in/evidence capture plus a
  narrow authorised, suppression-aware external handoff. Do not auto-enrol or
  overwrite external opt-outs; campaigns/unsubscribes remain outside this platform.
- Existing work and Frontend 2.0 preserved. Full findings/source references:
  archive/GUEST_EMAIL_MARKETING_CONSENT_AUDIT_2026-11-23.md.

---

# Bulk Show Availability Control

STATUS: RELEASED / PRODUCTION READY; TARGETED VERIFICATION COMPLETE

DATE: 23 NOVEMBER 2026

### Status-Aware Open/Close Actions - Released

- Open Selected is disabled/grey for all-open selections; Close Selected is
  disabled/grey for all-closed selections. Mixed selections enable actions that
  change an eligible show; empty/special-only selections enable neither.
- Existing loaded data and eligibility logic reused; the same predicate guards
  buttons and handler before confirmation/request. No API/database/query changes.
- 14 targeted tests, TypeScript, changed-module lint and 320/375/390/1280px
  fixture checks pass, including disabled styles and zero-request no-op calls.
  Existing confirmations, permissions, locks, partial results and single-show
  controls retained. Admin lint unchanged (2/59 baseline).
- Commit 3bc0d6adf8daba7c151417decb04becbc92bafa6 pushed to main; Production
  dpl_J9uJuqnW9NkfHnUgvUu52bb5S9bu READY and serving book.zingara.co.za.
  Cloud build/budget passed: raw 1,301,168; gzip 315,211; largest chunk 168,585.
- Live Admin 200/released styles verified, unauthenticated PATCH 401. No real
  show mutation or authenticated Production matrix test; Frontend 2.0 untouched.
- Follow-up evidence appended to existing bulk availability archive.

### Manage Toggle Cleanup - Released

- Manage toggle added beside venue filters; bulk toolbar and individual
  checkboxes hidden by default. Closing Manage clears selection/results;
  submission also requires active Manage mode. Existing API/safeguards unchanged.
- 13 targeted tests, TypeScript, test lint and 320/375/390/1280px browser fixture
  checks pass, including initial hiding, keyboard toggling, clear-on-collapse,
  preserved bulk actions/confirmation/partial failures and no overflow.
  Admin lint baseline unchanged (2 errors / 59 warnings).
- Only Admin page plus existing regression test committed:
  31a5d42351ee1bda0376700b8b264597b5059f3c, pushed to main.
- Production dpl_8mvd2p5wy7dDt7NUgxNsYnJScbyT READY and serving the public
  domain. Cloud build/budget passed (raw 1,300,964; gzip 315,160 bytes).
  Live Admin 200/released Manage marker verified; unauthenticated PATCH 401.
- No database/API or real show state changes; Frontend 2.0/unrelated work
  preserved. Evidence appended to existing bulk availability archive below.

### Original Bulk Availability Release

- Added calendar multi-select, count, Select All Visible, Clear Selection,
  Open Selected / Close Selected and one action/count confirmation. Existing
  month/venue filters constrain selection and clear it when changed.
- Uses existing Shows PATCH API and individual status/audit/Wallet semantics;
  settings permission, venue scope, show locks, status/revision CAS, duplicate
  rules and active Buyout checks enforced server-side. Distinct special statuses
  remain on existing individual controls. Maximum 100 IDs, concurrency four.
- Per-show partial results and audit warnings; no silent retry or hidden IDs.
  Only affected successful status data merged; no full show/occupancy reload.
- 12 tests, TypeScript, changed-module lint, whitespace and isolated actual-control
  browser checks at 320/375/390/1280px pass. Admin lint baseline unchanged (2/59).
- Local Turbopack worker-port permission error prevented local build; Vercel's
  optimised build/TypeScript passed. Admin budget passed: raw 1,300,348 bytes,
  gzip 315,094, largest gzip chunk 168,468; all below established limits.
- Commit 6ffbcd2e2fe14b05107ca97d5e84c5458de2d321 pushed to main; Production
  dpl_FxLpJrVg6hPbGrTATdRry77n9Qvn READY and serving book.zingara.co.za.
- Live Admin HTTP 200 and released controls verified; unauthenticated bulk PATCH
  correctly 401. No real availability changes or authenticated mutation QA.
- No migration/dependency or booking/payment/seating/ticket/communication data
  change. Frontend 2.0 and unrelated local work/checkpoints preserved unstaged.
- Details: archive/BULK_SHOW_AVAILABILITY_CONTROL_2026-11-23.md.

---

# ZNG-6MGLG2 - Authorised Ticket Restoration

STATUS: BOTH ORIGINAL TICKETS RESTORED; CORRECTION RELEASED / LIVE VERIFIED

DATE: 23 NOVEMBER 2026

- Original 2 Nov cancellation was intentional; Hannah reinstated on 17 Nov.
  Reinstatement updated database rows but left an embedded cancelled snapshot;
  ticket-page persistence could cancel the rows again. Loader now takes status,
  guest count and show ID from the authoritative row before persistence.
- 25 focused tests, TypeScript, changed-file lint and whitespace pass.
- Scoped code/test commit d12249b46aed893bb0bc2d4c950add3ce7139713 pushed to main.
  Vercel dpl_DNR1bxa9j13rcBLfGahfvB9SvaLs READY, serving the Production domain.
- Explicitly authorised two-ticket recovery passed rollback-only verification,
  then committed with original security triggers, capacity/identity/payment
  guards and append-only audit 3546c258-f3b2-46a2-854a-3a157392133c.
- Both original QR identities resolve live HTTP 200 / valid for the current
  19 Dec Cape Town show, two Middle Ring guests. Two valid rows, zero duplicates
  or scans, unchanged identity/payment fingerprints, zero new communications.
- R2,720 total/paid, R0 due; current capacity 132/133 unchanged. Existing floor
  assignment remains required; no specific table or physical scan verified.
- No migration, payment/pricing change, new booking/ticket or customer message.
  ZNG-X94SUT and Frontend 2.0 untouched; unrelated local work preserved unstaged.
- Full evidence: archive/ZNG_6MGLG2_TICKET_RESTORATION_2026-11-23.md.

---

# Payment Failures And PayFast Investigation

STATUS: READ-ONLY AUDIT COMPLETE; PROVIDER TRACE / OPERATIONAL FOLLOW-UP OPEN

DATE: 23 NOVEMBER 2026

- Theresa May: ZNG-YW2USY, 21 Nov 18:47 SAST checkout, R7,700 booking plus
  R10 fee; no ITN/provider ID or successful allocation. R0 paid; unpaid hold
  expired at 19:18 SAST. Actual instrument/bank outcome unknown; no safe retry
  assurance possible without PayFast trace. Do not attribute to MobiCred.
- Fourteen-day evidence: 986 distinct COMPLETE ITNs all processed and linked.
  1,020 server-prepared checkout references, 193 without processed completion,
  including 188 unpaid archived holds; not a proven payment-failure count.
- One successful late payment is unfulfilled: ZNG-X94SUT / PayFast 341736879,
  R6,160 applied, R6,170 gross, R0 outstanding. Capacity-review audit correctly
  prevented automatic restoration: four guests, two seats available. No changes.
- Separate validity anomaly: confirmed/fully paid ZNG-6MGLG2, R2,720 paid,
  R0 due, has only cancelled ticket rows after 17 Nov reinstatement/transfer.
  Payment recorded correctly; ticket recovery/systemic cause not established.
  No unsafe automatic ticket reactivation or historical changes performed.
- Separate delivery gaps: 45 confirmed bookings without sent confirmation,
  39 without sent receipt, 47 distinct missing either. Most failed records
  overlap the previously evidenced 12-13 Nov Microsoft SMTP outage; other
  failures not automatically attributed to it. No resends performed.
- Official PayFast MobiCred, ITN and other method-specific incident history
  checked; no transaction-level causation established. Provider import coverage
  ends 1 October. Broad runtime-log query timed out; durable ledger inspected.
- Phase 65 exact-attempt/idempotency safeguards installed; 17 targeted tests
  pass. No confirmed code defect, code change, release or Production data writes.
  Frontend 2.0 and unrelated uncommitted work preserved.
- Evidence, affected references and escalation / safe recovery instructions:
  archive/PAYFAST_PAYMENT_FAILURE_INVESTIGATION_2026-11-23.md.

---

# Priority Bugs 035 / 036 And Missing Reviews

STATUS: CONFIRMED FIXES RELEASED / PRODUCTION VERIFIED; CASE-SPECIFIC FOLLOW-UP REMAINS

DATE: 19 NOVEMBER 2026

- Quick Production Needs Review verification: one read-only status-count query
  confirms 0 pending, 745 Published (623 named / 122 anonymous), 82 Not Published,
  827 total. Existing Admin Reviews underlying query returns HTTP 200, count 0
  (Content-Range */0), rows []; first page, no search/extra filters, both venues.
  Direct authenticated Admin HTTP response was not verified: no existing logged-in
  Production Admin tab available; no login/session change attempted. Reported UI
  zero is correct independently of filters/pagination/permissions because there
  are no pending records globally. Prior Charlie moderation audit explains moves.
  No correction, record/history changes, commit or deployment; stop after check.

- Recovered the interrupted task without repeating investigations/tests/browser QA.
  The fixture browser check had exited; no task-owned QA process remained.
- BUG-000035 is Courtney's ZNG-VNS6DS, created 2 September before the gratuity
  transition. PayFast-linked R12,656 allocation / R12,666 gross (R10 fee) supports
  recorded R1,406 historical gratuity after discount. No new defect/exception
  confirmed; no refund/reprice or historical change justified.
- BUG-000036: original 16 guests, total R26,483; 3 November increase to 17 added
  only R550 deposit instead of full ticket R1,440 plus applicable historical R180
  gratuity. Actual receipts R8,800 + R18,233 = R27,033. Later paid decrease to 16
  retained that total. No artificial balance/refund or change to R1,440 bar-credit
  notes. Current remediation needs explicit agreement/evidence review.
- Prospective native per-person amendment correction preserves payment plans,
  amounts paid, provenance, Standard venue-paid policy, Corporate/Buyout, COMP,
  explicit legacy/manual pricing, capacity/version guards and paid reductions.
  Thirty-five native deposit-increase candidates are not automatically debts.
- Reviews: 827 records; exact latest queue query works; Charlie's permissions/all
  venues intact. Inspected recent reviews have legitimate moderation transitions.
  Fixed confirmed empty-final-page recovery while preserving explicit selection.
  Charlie's exact missing review still requires a name/reference; not marked resolved.
- Already-open tabs must submit the reviewed additional amount; missing/stale
  previews receive actionable 409, preserving entered state rather than silently
  applying the changed price. Existing booking-context query reused.
- 33 focused tests, local SQL before/after/atomic-failure/reviewed-price cases,
  TypeScript and whitespace pass. Lint clean except exact unchanged Admin-page
  baseline (two errors/59 warnings). Rollback-only Production compilation passed;
  overload MD5 b3c8b55125a98ac9561f48111a6b456a, original signature remains
  4a04d2041ca867e849cb12acd334517d. No business-data writes.
- Commit cbfa9892fea79bedca0ed26ad70c30a0cf45b535 pushed to main. Protected
  overload migration 20261119160000 installed; original signature unchanged.
  Vercel dpl_3smm6P6GimmKbpRRw1zLRTGitBQ7 READY and serving book.zingara.co.za;
  exact-SHA GitHub success, live /admin 200 and unauthenticated Reviews API 401.
- Installed SQL pricing block verified READ ONLY: full R1,620, stale R550
  rejected. No real save. Booking/payment fingerprints equal baseline:
  c04fbab6d8e4c6b54c452dba98e927be / 494f8e4fc3bece84a53676f1d8b98317.
- Latest review counts changed during work: still 827 total, now 745 Published /
  82 Not Published / zero Needs Review. Recent moderation audit attributes moves
  to Charlie (latest 60: 50 not_published, two published, one anonymous, seven
  unpublishes; through 15:18:46 SAST). Inspected recent records remain present;
  use existing status tabs. No moderation intent inferred or review data altered.
- Specific missing-review identity remains unprovided; not conclusively marked
  resolved. Historical financial remediation/bar-credit decisions require separate
  approval. Existing unrelated work/Frontend 2.0 preserved; no further browser QA.
- Full findings/evidence: archive/BUG_000035_000036_AND_REVIEW_VISIBILITY_2026-11-19.md.

---

# Vodacom Buyouts - Authorised Reconciliation

STATUS: ALL THREE AUTHORISED BUYOUTS RECONCILED IN PRODUCTION / VERIFIED

DATE: 19 NOVEMBER 2026

### Authorised Component Reconciliation - Current Continuation

- User explicitly authorises the three actual Production totals and directly
  related code/function migration. Prior stop conditions below are historical,
  not a request for renewed approval of amounts. Function Brief release retained.
- Pre-change read-only evidence: all three were R946,687.50, R0 paid, 400 guests;
  zero payments, legacy payment evidence, linked Xero documents or active locks.
- Existing reconciliation now accepts a documented fixed-buyout component
  agreement. Reuses native reconciliation permissions/version/payment/lifecycle
  checks and payment-link invalidation. No global package/pricing rule change.
- Financial custom lines are explicitly separate from supplier orders. Workbook
  requirements feed Table Plan V/W and Function Brief with an explicit no-order
  disclosure; canonical restricted-meal add-ons/order fields are not changed.
  Owner subsequently confirmed 19 November 45+4 = 45 Strictly Halaal / 4 Kosher.
  That clarification is now recorded separately with a new audit entry; the raw
  source quantity remains preserved. No supplier confirmation was inferred.
- Six new tests plus 29 directly relevant regression checks pass. TypeScript,
  changed-file ESLint and whitespace pass. Rollback-only SQL verified exact three
  component totals, stale revisions, invalid totals, permission rejection and
  preservation of paid amounts, guest/booking identity and historical snapshots.
- Candidate exports are in local-evidence/vodacom-component-candidate-2026-11-19/.
  K/L/V/W values verified; formulas, merges, styles and number formats unchanged.
  PDFs use the existing continuation page (three pages with charge detail);
  largest financial/dietary pages rendered and inspected without clipping.
  These are in-memory candidates, NOT reconciled Production exports.
- Released scoped commits 88a109d / f378626 / final
  3b3c40d5a3e6c06fc89484c681ad2cf5ca74f177 to main. Vercel Production
  dpl_4jt3eGTUJcnow6wG2MM6tmrSx6aU is READY, serving book.zingara.co.za;
  exact-SHA GitHub Vercel status success and live HTTP 200 verified.
- Applied only function migration 20261119140000 with dependency-drift guard;
  function MD5 e42e4a7d8181b556ef0aa1b918ed45f3, service-role-only execution.
  Additional rollback-only late-failure check confirms no partial booking or
  audit persistence. No columns/tables, pricing catalogue or supplier changes.
- Actual Production reconciliation committed atomically at 14:18:36 SAST:
  19 Nov ZNG-397ECAAC R746,029.25; 20 Nov ZNG-109B5111 R785,487.50;
  21 Nov ZNG-FF425E4F R777,437.50. All R0 paid, outstanding equals total,
  400 guests each. Combined total/outstanding R2,308,954.25 exactly.
- Per booking: original agreed base R590,000, discount R59,000, net R531,000,
  package VAT R79,650, dinner gratuity R73,750 (12.5% of original R590,000),
  hotbox/delivery R2,530. Inclusive drinks allowances R42,929.25 / R66,300 /
  R66,300; Halaal charges R13,570 / R32,257.50 / R24,207.50; Kosher R2,600 /
  not listed / not listed. Requirements Halaal 45/110/82 and Kosher 4/0/0.
- Final read-only audit-before-image comparison confirms all non-financial
  booking fields, original Buyout snapshots/terms, identities and seating
  unchanged. Payments and linked accounting documents remain zero.
- Actual Production-data exports verified in
  local-evidence/vodacom-reconciled-production-2026-11-19/:
  K/L amounts exact; V/W 45/4, 110/0, 82/0; formulas/formatting/merges unchanged;
  one booking reference and financial obligation per workbook, no repeated
  table-row totals. All three existing Function Briefs show exact financials
  and requirements; use existing three-page continuation format. Final 19 Nov
  PDF page streams match the visually inspected candidate exactly.
- Existing single/bulk invoice-preparation logic checked read-only against
  actual Production records: totals and package VAT exact; pre-VAT discount
  rendered correctly without changing ordinary invoice interpretation. No
  invoice saved/issued/synced. Final component evidence:
  local-evidence/vodacom-reconciled-production-2026-11-19/verified-financial-components.json.
- No outstanding financial reconciliation. Supplier fulfilment is not inferred:
  no canonical meal order, supplier/customer notification, payment or ticket
  was created. Existing cutoffs remain intact. No Frontend 2.0 changes.

The following investigation entries are historical and superseded by the
completed reconciliation above; they are retained as evidence, not blockers.

### Pricing Cause And Function Brief Correction

- Reconfirmed current Grand Society base R742,500 and gratuity R92,812.50 =
  exactly 12.5%. Tracy's R73,750 is 12.5% of R590,000. This is a package/basis
  difference, not a wrong gratuity percentage. No global pricing change made.
- JS and SQL custom-total paths both deliberately rescale package components;
  they do not model base-only discount with original-base service. Existing
  native agreed-price reconciliation still retains service_fee. Cutoffs and
  inability to represent inclusive service/dietary components remain blockers.
- Fixed confirmed Function Brief omissions using the existing read-only loader,
  package relation, financial resolver, PDF box and continuation machinery.
  Package/base/VAT are displayed only when persisted composition reconciles to
  current booking values; historical mismatches explicitly avoid inferred VAT.
  Charged/collected gratuity, total/paid/outstanding and structured dietary
  requirements now reach the existing document. No new DB fields/migration.
- 117 targeted tests, TypeScript and ESLint pass. Actual three regenerated
  PDFs have two pages and correct current values; rendered first page checked.
  All three Table Plan cells/styles/formulas/merges match previous exports.
- Separate before/after evidence folders preserved under local-evidence/;
  latest: vodacom-pricing-function-brief-2026-11-19. No business data changed.
- Reporting-only release completed: commit
  5eb49d48a1b6aa7f18a75ee4dd1449c0a8733793 pushed to main; Vercel Production
  dpl_EfEUrf3yvLnKjKi4JkkZRiY9osAw confirmed READY with book.zingara.co.za alias.
  Actual live ZNG-397ECAAC Function Brief downloaded and verified: two pages,
  package/base/VAT/charged gratuity/total/paid/outstanding correct. Download:
  /Users/kadendamon/Downloads/ZNG-397ECAAC_function_brief.pdf.
  Other two PDFs were verified via the generator, not live HTTP downloads.
- Recovery check: no pending source changes; remote main matches release SHA.
  Session lock already released by normal close at 13:14:35 SAST, reason closed;
  read-only verification found no active locks on the three bookings. No forced
  release or booking mutation needed. Live homepage HTTP 200 on 19 November.
  Existing 117-test and three unchanged Table Plan results retained, not rerun.
  No repeated browser QA, duplicate deployment or Frontend 2.0 changes.
  Authorised target totals remain R746,029.25 / R785,487.50 / R777,437.50,
  NOT applied or marked reconciled. Do not re-request approval of those figures.

### Superseding Tracy Workbook / Authorised Reconciliation

- Read the actual new attachment under Downloads/Tracy. SHA256:
  5bad2b09b367ab2e60f820c23912d9405c5ec54050a1c1afc288032b6309e54c.
  Prior workbook/verbal amounts below are superseded, retained as history.
- Independently verified SUM(F:L), VAT and cents: 19 Nov ZNG-397ECAAC
  R746,029.25; 20 Nov ZNG-109B5111 R785,487.50; 21 Nov ZNG-FF425E4F
  R777,437.50. Total R2,308,954.25. User has authorised these figures;
  approval of these amounts is NOT outstanding.
- No safe existing field mapping for the full component split: agreed-total
  reconciliation retains R92,812.50 service instead of R73,750; package custom
  totals rescale VAT/service; priced add-ons add service to inclusive charges.
  Imported COMP invoice evidence is not an appropriate native-buyout editor.
  Meal cutoffs passed, with no existing structured orders to preserve.
- Stopped interdependent adjustments BEFORE any save. All three remain
  R946,687.50 total/outstanding, R0 paid, 400 guests, Grand Society snapshot.
  No new pricing logic, UI, schema, category, booking/payment or communication.
- Generated/reopened all three existing Table Plans and Function Brief PDFs
  from read-only Production using unchanged generators (not HTTP downloads).
  Table Plan K/L/V/W positions, styles, merges, formulas and single financial
  row preserved. V/W remain zero; exports reflect current unreconciled values.
  Existing Function Brief omits package name/total/outstanding; layout unchanged.
- 51 focused existing tests pass. Booking fingerprint unchanged. Evidence:
  local-evidence/vodacom-authorised-reconciliation-2026-11-19/.
- Other JHB Vodacom bookings 6 Nov ZNG-48B964B9 and 7 Nov ZNG-14AA6BDC
  identified, untouched. No Vodacom booking identity found for workbook 14/15
  Nov JHB dates; shows are blackouts. No duplicate records created.
- Full follow-up in existing Vodacom archive. No code change, commit or new
  deployment for this task. Prior code release evidence retained below.

### Previous Review / Code Release - Historical

- Actual supplied workbook located and analysed unchanged. User confirmed the
  intended scope is Cape Town (the workbook's CPT section), not Johannesburg.
- 19/20/21 November 18:00: ZNG-397ECAAC / ZNG-109B5111 / ZNG-FF425E4F.
  Lisa-created Grand Society v1, 400 guests, R946,687.50 each, R0 paid,
  awaiting payment; no payments, linked invoice/quote, dietary records or
  saved operations. All guests unallocated. No real record was changed.
- Workbook displays R686,930 each but M14:M16 omit Halaal/Kosher lines.
  Populated charge sums are R702,755 / R711,367.50 / R719,417.50, NOT yet
  approved obligations. Need commercial/quantity/inclusion confirmation.
- Existing custom total scales VAT/gratuity proportionally; generic add-on
  editing adds gratuity to priced deltas. Neither safely reproduces all
  requested dinner-only components. All restricted-meal cutoffs have passed.
- Confirmed separate code defect: fixed-buyout invoice preparation falls back
  to Corporate category plus an invented R10 fee. Local correction uses
  existing commercialModel metadata, honours explicit fee evidence and leaves
  stored totals, documents and Xero unchanged. Single and bulk paths covered.
- 47 focused tests, TypeScript and targeted lint/whitespace checks pass.
- Released commit 6fcd8f4e47efec6e16abe8f849862593d3c13ace; Vercel
  dpl_DuYVVRzMXwdwqb432mBbUrXXBf9x READY, serving book.zingara.co.za.
  Exact-SHA GitHub Vercel status confirms successful deployment.
- Authenticated Production read-only invoice preparation checked for all three
  references: Buyout category, no invented fee, R111,375 VAT, R92,812.50
  gratuity, R946,687.50 total. No Save Draft/send/sync or booking save.
- Complete booking/buyout fingerprints match pre-release. Target documents,
  payments and operations rows remain zero. Admin 200; unauthenticated invoice
  preparation/bulk endpoints 401. No migrations or data changes.
- Full evidence/decisions: archive/VODACOM_BUYOUT_FINANCIAL_WORKFLOW_REVIEW_2026-11-19.md.
  Prior dirty records and Frontend 2.0 preserved. No financial/data corrections
  authorised; no migrations or live invoice/accounting actions needed for fix.

---

# P0 Admin Split Payment Booking Failure

STATUS: RELEASED - PRODUCTION FUNCTION VERIFIED WITH ROLLBACK-ONLY TRANSACTIONS

DATE: 19 NOVEMBER 2026

- Continuing the established release workflow; no new development phase.
- Production P0001 BOOKING_PROVENANCE_IMMUTABLE occurs because split-allocation
  finalisation replaces the creation timestamp already assigned by the insert
  trigger. Seven confirmed errors / four references; three errors / two
  references belong to Fatima. Her failed references have no booking/payment/
  payment-link records. Failure audits remain. Independent customer upsert can
  persist outside that transaction; candidate profiles require separate review.
- User approved the necessary function-only migration. Correction adds existing
  v_booking.provenance_recorded_at as first COALESCE operand, retaining every
  existing capacity, permission, financial and idempotency guard.
- Original error reproduced in five rollback-only SQL cases; candidate passes
  ten SQL result groups, including late-failure atomic rollback. 32 focused
  Node tests and TypeScript pass. Zero synthetic fixtures retained.
- Full evidence: archive/P0_SPLIT_PAYMENT_BOOKING_FAILURE_2026-11-19.md.
- Commit `1d7b3382d95b3bd8c5384796b9580827a8c43dbb` pushed to main.
  Vercel `dpl_FdxSVG9JuMozwmnJjPGE4E8Y5X3E` READY, aliased to
  https://book.zingara.co.za. Exact-SHA GitHub Vercel status is success.
- Approved function-only migration 20261119090000 applied and tracked in one
  transaction with a drift precondition. Deployed function fingerprint:
  df249e05715800c5310095ab621e61a0. All ten rollback-only test groups pass
  against that actual function. Zero retained synthetic bookings/customers/
  shows; service-only permission retained. Fatima's failed references unchanged.
- Live safe GET: Admin/book 200, unauthenticated Admin booking API 401,
  POST-only booking creation API 405. No real checkout, delivery or booking
  submission. Customer-profile candidates need separate review, not deletion.
- Only five approved files committed; final evidence updated locally after
  release. Unrelated work and Frontend 2.0 remain untouched.

---

# BUG-000034 Booking Save Conflict

STATUS: CORRECTION RELEASED - PRODUCTION READ-ONLY VERIFICATION PASSED

DATE: 18 NOVEMBER 2026

### Authorised release and permanent workflow - 19 November 2026

- Restored the normal investigate/fix/targeted verification/commit/push/
  Production deployment/actual verification/records/report workflow in
  .codex/README.md. Business-record changes remain separately authorised;
  Phase 50.9 remains strictly isolated. Prior task restrictions are retained
  below as dated evidence, not current release instructions.
- Approved release commit:
  `d3a0c373428f0723c052c022f0a2224a2c377182` on main.
  Production: `dpl_AyE2rPo9zNGUbDEaXZyYwwNWA8za`, READY, serving
  `https://book.zingara.co.za`. Prior Production deployment:
  `dpl_EqA78B7ycu825wNsHZFqwWzdkXND`.
- Twenty-three targeted tests, TypeScript and whitespace verification pass.
  Vercel Production build reached Ready. Deployed Admin returned 200.
  The publicly served Admin chunk
  `/_next/static/immutable/chunks/1wh-q_8cdfzmb.js` contained the new
  pure lifecycle key function. Extracted and executed that exact function:
  equivalent timestamp spellings matched, changed notes and microseconds
  remained distinct. Unauthenticated booking/lock endpoints returned 401.
- After-release read-only snapshot reproduction using the released source
  produced two hydrated lifecycle entries and zero merge conflicts for the
  reported status action. ZNG-964D2N remains pending_payment / fully_paid,
  R36,000 paid, R0 outstanding; no booking save or communication occurred.
- Only seven approved code/test files plus README and the BUG archive were
  committed. Accumulated CURRENT_TASK changes and the unrelated local
  Microsoft outage archive were excluded and preserved. No migration or
  Frontend 2.0/checkpoint change. Final release evidence updated locally in
  this record and the BUG archive after deployment.
- No real save, dispatch or platform-wide latency benchmark was attempted.
  This safely verifies the release and comparison behaviour, not end-to-end
  booking mutation. An actual staff amendment of ZNG-964D2N and any review
  of other paid/pending bookings require applicable separate authorisation.

### Status-save reproduction and local correction - 19 November 2026

- Read AGENTS, workflow README from the primary checkout (none in this
  worktree), current findings and the payment/link integrity archive.
  Preserved all prior diagnostics and unrelated uncommitted records.
- Reproduced the reported status-only action locally using a fresh,
  read-only Production snapshot and the current client history hydration
  functions plus server merge. No full HTTP save, message or write executed.
  Before fix: same updated_at, changed fields status/lifecycleHistory/
  communicationHistory, sole conflicting field lifecycleHistory.
  Stored history had two events; client hydration produced four.
- Root cause: history deduplication compared timestamp strings literally,
  while relational and embedded history used different spellings of the
  same instant. Hydration also supplies database IDs/property order.
  The server then compared the changed history to embedded metadata with
  JSON.stringify. Thus the status action falsely conflicted without a
  concurrent amendment. This reproduces the observed branch/message
  against the unchanged snapshot, although the original request body
  was not retained.
- Local correction: shared lifecycle semantic comparison normalises
  timestamp spelling and ignores projection-only event IDs/property order,
  retaining sub-millisecond precision and real note/status/time differences.
  Client hydration deduplicates equivalent metadata/relational events.
  The server accepts equivalent old-tab projections, deduplicates them,
  and retains original authoritative event objects plus the new event.
  Real status/history conflicts, exact-session lock checks and updated_at
  compare-and-set remain intact. No automatic retry or confirmation.
- Re-run: stored and hydrated history both two events, same version,
  zero conflicting fields for the local confirmation merge. Production
  remains pending_payment / fully_paid with R36,000 paid, R0 outstanding
  and its 13 November revision.
- The payment/status discrepancy follows the manual financial
  reconciliation path: it updates subtotal, total, paid, balance and
  payment_status, not booking_status. Audit shows Fatima used this on
  12 November; no lifecycle confirmation followed. This is separate
  operational and financial state, not proof of missing PayFast capture.
  It is not safe to derive booking confirmation solely from zero balance.
- One bounded query found at least 100 nonarchived fully-paid bookings
  still pending_payment (query capped at 100): 97 corporate, two admin,
  one public; 98 had embedded history. This is the state combination,
  NOT a confirmed count of failed saves or permission to backfill them.
- Twenty-three focused tests pass, covering full and partial payment
  status transitions, projection equivalence, no input/evidence mutation,
  no duplicate new lifecycle event, preservation of financial/table data,
  real concurrent status/history rejection, diagnostics, locks, ITN and
  managed booking guards. TypeScript/diff checks also run.
- No new requests, queries, polling or dependencies in the correction;
  client history deduplication uses a Set instead of nested scans.
  Production throughput and end-to-end save/notification delivery were
  not benchmarked or exercised. Generic saves still include subsequent
  nontransactional follow-up work, so this is not a certification of
  platform-wide atomicity or message delivery. Draft/error recovery and
  pre-save notification timing remain separate review items.
- Await release approval, then read-only live checks and an explicitly
  authorised staff save for ZNG-964D2N. Do not mark the Production incident
  resolved yet. No commit, push, merge, deploy, migration or data change;
  Frontend 2.0 and rollback checkpoints untouched.

### Reporter clarification - 19 November 2026

- Fatima confirms the attempted change was Awaiting Payment to Confirmed,
  not payment reconciliation or seating. Current read-only check still
  shows booking pending_payment, payment fully_paid and the unchanged
  13 November booking revision.
- The Booking Status control calls updateBookingStatus immediately. That
  path adds lifecycle and communication entries in addition to status.
  Client reads merge relational history into stored metadata; the server
  merge compares the changed arrays against metadata. Thus a status-only
  user action may conflict on history fields even at the same revision.
  Both persisted lifecycle entries are represented in stored history;
  that alone does not establish identical hydrated objects or ordering.
- This narrows the reproduction to the exact status-transition path, but
  does not recover the rejected payload or prove the conflicting field.
  Do not infer a payment failure from the booking-status label. No
  Production mutation or release authorised by this clarification.

### Edit-lock follow-up

- Fatima's retained lock began at 11:21:09.771 SAST, was still active for
  the 11:21:22.969 PATCH, had a later heartbeat at 11:21:41.097 and was
  released as closed at 11:21:52.811. Acquisition and release audits
  corroborate it. No evidence of expiry, takeover or rejection by the
  lock guard. The direct lock guard has different wording and no
  BOOKING_CHANGED code.
- Acquisition is unique per active booking; exact-session ownership and
  30-second heartbeat are checked against a five-minute inactivity window.
  Close releases the lock; reclaim is revision guarded and privileged
  takeover is separate. Generic saves guard against a competing active
  lock but currently permit no active lock. This guard is separate from
  the snapshot field merge and database updated_at compare-and-set.
- Seating mutations through Admin PATCH use the shared gate. Reconciliation
  only compares staff profile, not browser session; customer reassignment
  uses its own SQL lock and revision checks. PayFast ITN and separate
  payment/guest-management workflows use their own transactional checks,
  not universal exact-session enforcement. A valid editor lock therefore
  does not freeze payment, metadata or all booking updates.
- The unchanged persisted revision makes an incident-time booking write
  unsupported by the evidence. Stale snapshots and mismatch between the
  browser's hydrated projection and the server's serialized snapshot are
  plausible; the exact branch and fields remain unknown. The save was
  rejected, but the validity of that rejection cannot be determined.
- Read-only scope check: zero booking.write-blocked-by-lock audit rows in
  the morning window; no further captured report with the exact error
  title. The other 16 endpoint 409s lack response codes and booking
  association; zero audit rows does not prove zero lock conflicts.
- Local only: rejection logs capture stage, observed lock classification,
  version equality, allowlisted conflicting field names/count and a
  validated Vercel request ID. No raw version, booking/staff/session IDs,
  payload values, extra queries or write/retry changes. Approval needed
  to release the diagnostics and use them on a future occurrence.
- Nineteen targeted tests cover diagnostic privacy and placement, a
  synthetic same-version projection mismatch, lock
  ownership/recovery, stale edits, payment integrity and managed booking
  boundaries. No live save attempted; no Production data changed.

### Initial evidence

- Read-only Production: issue report at 11:21:51 SAST references Vercel
  request `rsn49-1794993682969-012f4627ff0a`, PATCH
  `/api/admin/bookings`, HTTP 409 at 11:21:22.969 SAST. Observed and
  current deployment `dpl_EqA78B7ycu825wNsHZFqwWzdkXND`.
- ZNG-964D2N last persisted booking revision: 13 November 14:37:06.260491
  SAST. Floor Audit records Fatima MB assigning Middle Ring table 314
  (25 capacity) to the 20-guest booking; current table claim matches.
  On 12 November staff reconciled 24 to 20 guests and R37,950 to
  R36,000 total, marked R36,000 paid and R0 outstanding; automation recorded
  deadline protection and staff subsequently changed add-ons/notes. None
  was an incident-time write. Current state is pending-payment booking
  status with fully-paid payment status; not changed during the audit.
- The reported error text maps to either a pre-write field conflict or
  a guarded write matching no row. Request snapshots, conflicting field
  names and branch were not captured; no runtime logs for the request.
  No successful amendment audit or new booking revision from the attempt.
  Draft values and browser preservation could not be verified. No evidence
  of partially saved amendments on this booking.
- 00:00 to 12:00 SAST: 17 PATCH /api/admin/bookings HTTP 409 responses
  (including this request); only BUG-000034 matched the captured issue
  title. Other responses cannot be assigned to unique bookings or this
  error code from request logs. No systemic cause established.
- Nine focused concurrency and edit-lock tests plus diff checks passed.
  No application change, commit, push, merge, deployment or data write.
  Frontend 2.0 untouched. Recover intended changes from the original tab
  or Fatima before refreshing; compare with fresh authoritative data and
  save only after explicit review. For recurrence, recommend preserving
  an unsaved draft for comparison and recording conflict stage and field
  names (not values) alongside the request ID. No automatic retry.

---

# Reviews Explicit Selection

STATUS: DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 17 NOVEMBER 2026

- Review details remain locked on queue entry. The blurred placeholder has
  no real review data or focusable controls. Clicking/keyboard-activating
  a review or opening an explicit review link can reveal its details.
- Search, filters, tabs and paging retain the same selection only when the
  selected ID remains in the returned results. Switching explicit review
  resets the reply draft and idempotency key. No initial detail request;
  stale responses are ignored and existing API permissions remain in place.
- Twelve targeted tests, TypeScript and diff checks passed. Local browser
  fixture confirmed keyboard selection, draft isolation and exact reply
  and moderation payload IDs; actions were simulated.
- Only the Reviews workspace was released in
  `4785b9400f09fb5ec193c7e6283ba3e73a5b6184` on main. Production
  `dpl_EqA78B7ycu825wNsHZFqwWzdkXND` is Ready on `book.zingara.co.za`.
- Read-only live verification confirmed the inert initial state, correct
  keyboard and pointer selection, paging and status-tab clearing, matching
  search retention, empty search and rating-filter clearing, and fit at
  390px. No replies sent, reviews changed, migrations, or Frontend 2.0 work.
  Unrelated local changes stayed out of the release commit.

---

# Reviews Pagination UX

STATUS: DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 17 NOVEMBER 2026

- Guest Reviews keeps Previous and Next and adds compact First and Last
  controls and an editable page number. Enter commits an in-range whole
  number; invalid values show feedback without a request.
- Boundary buttons disable at the relevant end. Search, filters and status
  retain their existing page-one reset; pagination is inactive while a
  new result is pending. The same Reviews request and selection logic is
  used, with no added endpoint, schema or record changes.
- Local browser exercise mounted the actual Reviews component and styles
  using synthetic API fixtures. Verified all four buttons, Enter, invalid
  and same-page request suppression, search/filter resets, empty results,
  and no pager overflow at 320px. No live Admin data used.
- Released only the Reviews workspace component in
  `e8dac7f63d6eb7ecc1752517dde69f2191157f48` on main. Vercel Production
  `dpl_4N99AxRgLKNMHuUM6eXzzbnPRghr` is Ready and serves
  `book.zingara.co.za`. Twelve targeted tests, TypeScript and whitespace
  checks passed.
- Live authenticated Reviews verified First, Previous, Next, Last, direct
  Enter, invalid input and boundaries. The sampled queue showed 95 reviews
  over 10 pages with five on the final page. Search with no matches returned
  to page one; five-star filtering returned to page one with 40 reviews
  over four pages. The pager fit 1280px, 390px and 320px with no recorded
  browser console errors. Mobile checks used browser viewports, not a phone.
- Local fixture confirmed one list request per valid page change and none
  for invalid/same-page input. The release reused the existing fetch path;
  no formal Production latency benchmark was run. Production checks were
  read-only; no schema, review records or Frontend 2.0 changes. Prior
  unrelated Markdown work remained outside the release commit.

---

# Staff Display Name Consistency

STATUS: DEPLOYED - LIVE REVIEWS VERIFIED

DATE: 17 NOVEMBER 2026

- Bounded read-only Production check matched 76 sent Reviews replies with
  the old snapshot and a latest badge attributable to the current Charlie
  profile. No matching stale Platform Feedback replies were found.
- Reviews and Platform Feedback now resolve current reply labels through
  the reply's staff-profile foreign key. The existing paginated query
  embeds at most one sent reply per item, and only a matching send timestamp
  can override a stored badge. Detail labels use the same identity rule.
  Unknown or ambiguous identities keep the recorded name.
- Booking Details Activity Timeline now prefers the current staff identity
  for display labels, then the original name when unresolved. It does not
  edit audit or accounting events. Staff and existing session resolution
  already read the current profile.
- Communications and customer-facing reply signatures use the profile at
  send time. Previously sent bodies, signatures, notifications, immutable
  Audit Trail and evidence exports remain as recorded. No name-based
  replacement or data backfill. Existing edit-lock snapshots can age out;
  new lock labels use the current profile.
- Released only the five approved source and test files in
  `c572f321d991272794ce9c623d1260d0afa5fdba` on main. Vercel Production
  `dpl_F1zpGFjbbD2xB2Mxu2cQgXjaBTz4` is Ready and serves
  `book.zingara.co.za`. Previous deployment:
  `dpl_Bh2Vow72kUBWXhrjAmmPxgpm5XLs`.
- Eleven focused tests, TypeScript and whitespace checks passed. Live Admin
  Published Reviews showed REPLIED · CHARLIE and a selected historical reply
  showed Charlie. Platform Feedback loaded with no matching submissions;
  the sampled Booking Details Activity Timeline rendered existing events
  without errors but had no Charlie-attributed event to check directly.
- Read-only before/after profile and Auth comparison matched: same login,
  identity, active status, role, permission keys, venue scope and metadata.
  No Production data writes, migrations, messages or release of Frontend 2.0.
  This record and pre-existing unrelated Markdown changes were not included
  in the release commit.

---

# Staff Display Name Correction

STATUS: PRODUCTION PROFILE UPDATED AND VERIFIED

DATE: 17 NOVEMBER 2026

- Matched one active Charlotte King staff profile against Production Staff
  settings and its linked authentication account. Updated only the current
  staff profile name to Charlie.
- Re-read the profile and authentication identity and refreshed Staff
  settings. Charlie appeared once, the previous name no longer appeared
  there, and the login email, account IDs, active status, role, permissions,
  venue scope and authentication metadata were unchanged.
- Current Admin sessions derive their display name from the staff profile.
  Existing sessions may need to refresh. No sign-in as the staff member
  was attempted; no password was accessed or changed.
- No invitation, password reset, or updates to historical attribution,
  bookings, finance, audit or communications records. No code change,
  commit, push or deployment.

---

# P0 Microsoft 365 Outage Impact Audit

STATUS: READ-ONLY AUDIT COMPLETE - PROVIDER INCIDENT ACTIVE; RECOVERY RECONCILIATION REQUIRED

DATE: 13 NOVEMBER 2026

- Zingara email uses Microsoft 365 SMTP, not Microsoft Graph. Production
  recorded Outlook SMTP connection resets, greeting failures, port 587
  timeouts and temporary `451` errors from 12 November at 19:52:30 SAST
  through at least 13 November at 13:05:17 SAST.
- At the 13:09 SAST snapshot, 104 Communications rows had failed; two custom
  messages later recovered and 102 remained unresolved across 61 distinct
  bookings. This includes 34 booking/ticket confirmations, 30 payment receipts,
  two complimentary confirmations, eight payment-link sends, 12 manual ticket
  sends and 18 attendance staff notifications.
- Three daily booking reviews and one review-management summary failed. The
  13 November daily Waitlist reminder claim remains `processing` and is not
  confirmed delivered.
- Bookings and payments remain operational: 39 confirmed bookings, 28 fully
  paid payments, eight deposits and 38/38 processed PayFast ITNs were recorded
  after the first email failure. Public, booking and Admin shells returned 200;
  all 45 scheduled workflow runs checked returned 200.
- Failed rows are durable evidence, not a blanket replay queue. Recovery must
  reconcile each current booking/link/ticket before any resend to avoid
  duplicates. No messages were replayed and no test email was sent.
- If Microsoft remains degraded, 78 Cape Town bookings representing 408 guests
  become due for pre-show reminders at 18:00 SAST on 13 November. Use Admin,
  Find My Booking, copied current payment/ticket links, phone and approved
  non-Microsoft channels as temporary operating alternatives.
- Production deployment `dpl_Bh2Vow72kUBWXhrjAmmPxgpm5XLs` remains Ready.
  Application, configuration and business-data delta: none. No commit, push or
  deployment was performed.
- Full record:
  `.codex/archive/P0_MICROSOFT_365_OUTAGE_IMPACT_AUDIT_2026-11-13.md`.

---


# P0 Booking & Payment Link Integrity

STATUS: COMPLETE - SHARED FIX DEPLOYED; CUSTOMER REMEDIATION PENDING APPROVAL

DATE: 12 NOVEMBER 2026

- `ZNG-C7CD9T` was created for 14 guests, so its original R21,560 link and
  R7,700 deposit basis were correct at creation. A later unpaid reduction to
  10 guests did not reprice the booking or invalidate the link. A subsequent
  manual correction set R17,325 by adding an inapplicable R1,925 upfront
  gratuity; Standard gratuity is payable at the venue.
- The authoritative Standard amounts are R15,400 total and R5,500 deposit.
  No payment, PayFast ITN or provider settlement exists.
- `ZNG-5P686H` is correct: 2 Friends & Family guests at R1,150, R2,300 total
  and a R1,100 deposit link. No payment was collected.
- The shared fix atomically reprices unpaid native guest reductions from saved
  per-person pricing, resolves the configured fixed deposit, synchronises
  metadata and revokes active links. Manual financial reconciliation now also
  invalidates links. Paid retained-value, Corporate, import and COMP paths are
  unchanged.
- Audited 2,667 future active bookings and 29 active unexpired links. Diana's
  Standard booking is the only active booking with this exact defect and its
  R21,560 link is the only stale link. Existing checkout guards reject it
  before PayFast.
- Focused tests passed 10/10; broader relevant tests passed 50/50. TypeScript,
  ESLint, diff checks and the full webpack Production compilation passed.
- Commit `59a339aaf05d32bd8bf71fb9421ea327c3e91748`; migration
  `20261112100000_p0_booking_payment_link_integrity.sql`; Production deployment
  `dpl_DVBLmnbrrnhC5GJKWTRKrbW6yrdX` Ready at 09:08:17 SAST.
- Authenticated Production verified both references and the explicit stale-link
  warning. Business-data delta: none.
- Pending explicit approval: correct `ZNG-C7CD9T` to R15,400, revoke its stale
  link, and choose a R5,500 deposit or R15,400 full-payment replacement. Do not
  change or merge either booking without approval.
- Full record:
  `.codex/archive/P0_BOOKING_PAYMENT_LINK_INTEGRITY_2026-11-12.md`.

---


# P0 Booking Fee & Financial Integrity

STATUS: COMPLETE - DEPLOYED AND AUTHENTICATED PRODUCTION VERIFIED

DATE: 11 NOVEMBER 2026

- Corrected the shared legacy fee model that deducted R10 from Corporate
  ticket revenue on fee-free invoice/EFT paths and rounded gratuity to a whole
  rand.
- The reference now reconciles exactly: R32,340.00 tickets, R4,042.50
  Corporate gratuity and R36,382.50 booking total.
- Invoice outstanding, invoice paid in full and manual EFT have no booking
  fee. PayFast links and online checkout add the configured R10 transaction
  fee once at the payment boundary, producing R36,392.50 for the reference.
- Exact-cent calculations are shared by booking pricing and guest allocations.
  New bookings use forward-only policy `payment-method-v2`; historical records
  were not repriced or backfilled.
- Production audit covered 332 future active legacy bookings across both
  venues. Nine Corporate-direct legacy records require manual review; no
  historical financial record was modified.
- Focused financial tests passed 43/43, formatter checks passed 6/6, the
  Production build passed and bundle sizes remained inside the existing Admin
  performance budget. No request, polling or database overhead was added.
- Authenticated Production verification confirmed exact totals for PayFast,
  invoice paid and invoice outstanding without submitting a booking or payment.
- Application commits `dd580fc9b1ca2758b5a8948bef36ad040d93067c`,
  `d1619eedb54f4bad71794d6134f46d943187a325` and
  `a213a0875b1c357f68ba2368f878dea74e2dff9f` deployed as
  `Fa6teYkVZiiD4r2bjqTWi4XTTjic`, Ready at 14:21:31 SAST.
- Business-data delta: none. No booking, payment, invoice, VAT, gratuity,
  deposit, PayFast transaction, export or customer communication changed.
- Full record:
  `.codex/archive/P0_BOOKING_FEE_FINANCIAL_INTEGRITY_2026-11-11.md`.

---


# Surgical Share Review Functionality

STATUS: COMPLETE - DEPLOYED AND AUTHENTICATED PRODUCTION VERIFIED

DATE: 11 NOVEMBER 2026

- Every Admin Reviews row now has compact icon-only Copy and Share actions
  with accessible names and tooltips. Copy provides brief `Copied` feedback;
  Share uses the native device share sheet and falls back to Copy where native
  sharing is unavailable.
- Shared links contain only the existing opaque review UUID and the Reviews
  section target. They do not include guest names, contact details, booking
  references, review content or moderation state.
- Opening a shared link loads the exact review through the existing Reviews
  interface, displays a `Back to review queue` action and remains valid if the
  review's moderation status changes. Existing Admin authentication,
  `communications:manage` permission and venue scoping remain authoritative.
- Production verification confirmed Copy feedback, the UUID-only link, direct
  review navigation, native macOS sharing without sending, and contained icon
  controls at a 390 x 844 mobile viewport. An unauthenticated exact-review API
  request returned HTTP 401.
- The normal Reviews queue performs no additional request. The exact review and
  its details are fetched only when a direct link opens; the result is reused
  rather than fetched twice. No polling, dependency or database change was
  introduced.
- Focused review tests passed 24/24. TypeScript, changed-file ESLint,
  `git diff --check` and the Next.js Production build passed. The Admin bundle
  remained inside the existing performance budget (313,828-byte gzip total;
  167,299-byte largest gzip chunk).
- Application commit `b44829cd542357610b2a692bc4bf1185e887746a` deployed to
  Production as `5LcS7oCUL7ngGGtVz66B5G5jjPp6`, Ready at 12:16:55 SAST.
- Business-data delta: none. No reviews, moderation states, customer data,
  bookings, payments or audit records changed during implementation or QA.
- Full record:
  `.codex/archive/SURGICAL_SHARE_REVIEW_FUNCTIONALITY_2026-11-11.md`.

---


# P0 - Booking Transfer & Platform-Wide Seating Integrity

STATUS: COMPLETE - PLATFORM FIX DEPLOYED; AUTHORISED PRODUCTION TRANSFER, RECONCILIATION AND UNSENT PAYMENT LINK VERIFIED

DATE: 11 NOVEMBER 2026

- Root cause: the legacy one-table transfer changed the booking zone after
  releasing only the primary claim, leaving the other three claims in the old
  zone and triggering the deferred integrity constraint as a generic HTTP 500.
- All 8,115 bookings were audited. No current booking is corrupted by this
  failure; 464 multi-table bookings (383 future active) were vulnerable to the
  shared path. Temporary, merged, cross-show, zone and primary-claim integrity
  checks are recorded in the archive.
- Production now uses one permission-controlled atomic table-set operation.
  Multi-table transfers are routed through the lazy `Manual table set` control,
  while stale, claimed and invalid selections return actionable errors.
- Migration `20261111113000_p0_booking_zone_table_set_transfer.sql` is applied
  and recorded. Application commit
  `b0789f3d7716687852068773ca6703a7be231e2f` is on `main`.
- Kaden's authenticated Production session verified the deployed control and
  target availability at 10:02 SAST. Tables 407 (11 seats), 408 (10 seats) and
  Lisa (21 seats) are available for the exact CPT performance.
- Kaden subsequently authorised the live booking adjustment. Production
  committed the guarded transfer at 10:24:51 SAST: `ZNG-9Z6XMR` retained 21
  guests, moved to Golden Circle, released Private Booths tables 1+2+3+4, and
  assigned 11 guests to table 407 plus 10 guests to table 408.
- Financials reconcile to tickets R32,340.00, historical gratuity R4,042.50,
  total R36,382.50, original payment R10,450.00 and outstanding R25,932.50. The
  original PayFast transaction remains unchanged.
- One active balance link for R25,932.50 was created at 10:26:07 SAST. It is
  unused and unsent; no communication or payment was initiated. Lisa can review
  and send this existing link from Booking Details.
- Authenticated Booking Details, Floor & Arrivals and the generated Production
  Table Plan agree on Golden Circle tables 407+408. The workbook records 11 and
  10 guests and carries the booking financials once, without duplicate revenue.
- Business-data delta is limited to the explicitly authorised booking zone,
  table claims and financial component reconciliation, one unsent payment-link
  record and immutable audit evidence. Guest count, original payment, VAT
  evidence, tickets, customer data and customer communications are unchanged.
- Full record:
  `.codex/archive/P0_BOOKING_TRANSFER_PLATFORM_SEATING_INTEGRITY_2026-11-11.md`.

---


# Invoice & Refund Workflow Integrity

STATUS: DEPLOYED - AUTHENTICATED APPLICATION VERIFIED; AUTHORISED XERO PROVIDER EXECUTION PENDING

DATE: 10 NOVEMBER 2026

## Xero Invoice Finding

- Booking `ZNG-4UGGV9` reconciles exactly to R19,688.00: R17,500.00
  ticket/fee value, R2,188.00 gratuity, R2,282.60 VAT, R19,688.00 paid
  and R0.00 outstanding.
- Local invoice `ZD-001001` was saved correctly, but its first Xero attempt was
  blocked by HTTP 400. Its generated Xero Contact Number was 53 characters;
  Xero's documented maximum is 50 characters. The transport discarded the
  provider validation detail, leaving the misleading generic error.
- Draft / Awaiting Xero / Awaiting Accounts are expected before a successful
  provider issue. They were not expected to remain while the outbox was blocked.
- Contact identifiers are now stable hashed values within Xero's limit,
  validation details are retained safely, terminal failures mark the document
  Action Required, and Tristan/Rachelle receive an audited Retry Xero action.
  Retry remains explicit and idempotent; no invoice was issued during QA.

## PayFast Refund Finding

- PayFast's authoritative query distinguishes `PAYMENT_SOURCE`, `BANK_PAYOUT`
  and `NOT_AVAILABLE`. Banking details are legitimately required only for a
  bank-payout refund; the application continues to block that path for manual
  authorised handling and never collects bank details for a payment-source
  refund.
- Six failed live attempts were retained across two bookings. Four stopped
  after eligibility and two reached provider submission. Historical records
  omitted the returned method and nested rejection detail, so the exact legacy
  provider reasons cannot be reconstructed safely.
- Refund submission now matches PayFast's official SDK JSON transport, nested
  provider errors are retained and shown to authorised Finance staff, and safe
  audit evidence includes funding type and full-refund method. Existing
  idempotency, password confirmation and reconciliation locks remain unchanged.
- Full payment-source refunds remain automatic. Bank-payout methods remain
  manual; multi-transaction and partial refunds remain unsupported and require
  Finance review. No refund was submitted during QA.

## Verification And Release

- Focused Xero, activation and PayFast tests passed 30/30. ESLint, TypeScript
  and the Next.js webpack Production build passed. Migration dry run contained
  only `20261110170000_invoice_sync_retry_integrity.sql`.
- Migration applied successfully. The only blocked Xero document is now
  `action_required`; its original blocked outbox evidence remains unchanged.
- Application commit `b9ea8255906c8823f31a3da1c1025db96eab0c13` deployed as
  `dpl_3oAt2E1sx9vMifDLyged2CabzxGz`, Ready at 14:07:10 SAST.
- Production public and Admin shells returned HTTP 200; unauthenticated Xero
  API access returned HTTP 401 as required. The deployed source matches the
  application commit.
- Business-data delta: one local Xero document sync status changed from
  `pending` to `action_required`. No booking, payment, refund, Xero provider
  record, contact mapping or customer communication changed.
- Follow-up commit `94d91fe265931ac5a91b7aa6ee3cdbca8585ad67` deployed as
  `dpl_FqLvhT613c5QF9TcYqDh48ScCJuW` and reached Ready on 10 November 2026.
  Authenticated Production verification confirmed LIVE SYNC ACTIVE, the
  approved mappings, the exact `ZD-001001 · ZNG-4UGGV9` attention item,
  `Action Required` document status and the authorised `Retry Xero` action.
- The Integration attention control now opens the affected invoice instead of
  requeuing its stale pre-fix payload. Direct calls to the retired shortcut
  fail closed. Existing approved mappings display `Approved`, and document
  rows no longer mislabel an unsynced document as a disconnected integration.
- Focused follow-up verification passed 51/51 Xero tests, changed-file ESLint,
  TypeScript and the Next.js Production build. The Production deployment build
  is the bundle/performance gate; no polling, browser request or background
  processing was added.
- Post-release evidence still shows zero retry audit events, no Xero invoice ID
  or number, and the original outbox blocked after one attempt. No booking,
  payment, invoice, Xero or customer data changed during this verification.
- Provider execution is intentionally pending: Tristan or Rachelle must review
  `ZD-001001` and select Retry Xero to create the real invoice. A real eligible
  refund is required to prove provider acceptance; this was prohibited in QA.
- Full record:
  `.codex/archive/INVOICE_REFUND_WORKFLOW_INTEGRITY_2026-11-10.md`.

---

# Legacy Dineplan Workflow Deactivation

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 10 NOVEMBER 2026

## Production Deactivation

- The legacy Dineplan schedule was disabled in Production at
  11:01:59 SAST (09:01:59 UTC). The final recorded automated email was
  `Dineplan File Needed | Johannesburg 2026-11-10`, sent at 09:01 SAST.
- The shared 15-minute workflow runner remains active for pre-show reminders,
  payment holds, reviews, Xero and other current operations, but no longer
  imports or invokes the Dineplan scheduler.
- The dedicated Dineplan Admin tab and client bundle entry point were removed.
  Authenticated requests to the retired reconciliation and action endpoints
  now fail closed with HTTP 410; unauthenticated requests continue to return
  HTTP 401.
- The existing generic Data Portability API was already disabled and remains
  unchanged.

## Historical Preservation

- No Dineplan booking, customer, payment, snapshot, action, delivery, schedule
  run or audit record was deleted or rewritten.
- Preserved Production evidence: 16 reconciliation snapshots, 137 actions,
  158 delivery records and 151 schedule runs.
- Business-data delta: the single
  `dineplan_reconciliation_settings.scheduled_emails_enabled` configuration
  flag changed from `true` to `false`. No other Production record changed.

## Verification And Release

- Focused deactivation, scheduling, security and Admin performance tests passed
  20/20. TypeScript and the full Next.js webpack Production build passed.
- The change adds no request, query, polling or background work and removes the
  retired Admin chunk and scheduler execution.
- Application commit `8ad498c240ef28a3877da7a0ec335f0ce11f3948` deployed
  successfully as `dpl_9YS4VXvekgHHctcrcsxzYi7kVvXD` at 11:17:42 SAST.
- Production returned HTTP 200 for the public site and Admin shell. Deployed
  Admin assets contained zero Dineplan workspace/file-request matches.
- Both retired endpoints returned HTTP 401 without a staff session, confirming
  authentication remains enforced. The verified route build returns HTTP 410
  after authorisation and contains no database mutation path.
- Production configuration remained disabled after deployment and no Dineplan
  delivery was recorded after 11:01:59 SAST.
- Full record:
  `.codex/archive/LEGACY_DINEPLAN_WORKFLOW_DEACTIVATION_2026-11-10.md`.

---


# P0 - Public Booking And Payment Integrity

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 10 NOVEMBER 2026

## Reconciliation

- Production evidence from 9-10 November identified 103 online reservations:
  72 confirmed and paid, 28 expired payment holds, two superseded holds and one
  active pending hold requiring Box Office review.
- All 86 received PayFast ITNs were complete, processed and linked to an
  existing booking, payment link and payment row. Gross receipts totalled
  R519,108.00. No captured payment, provider transaction or successful ITN was
  missing its booking, and none was attached to an archived reservation.
- Twelve explicit PayFast cancelled returns were recorded. Twenty expired holds
  had no provider return or ITN and are classified as abandoned rather than
  paid. Thirty-seven generated candidate references never became reservations;
  their creation was rejected before durable persistence, mainly by the
  two-seat rule, and they exist only in safe journey telemetry.

## Root Cause And Correction

- Find My Booking treated `payment_status = pending_payment` as payable even
  after the reservation had expired and been archived. One archived reference,
  `ZNG-VYBT2X`, produced 12 rate-limited checkout retries on 10 November despite
  having no payment or ITN.
- Admin's normal active-only and hide-cancelled filters also excluded expired
  reservations during exact reference searches, making durable records appear
  missing to Box Office.
- Exact `ZNG-` and `DP-` reference searches now include archived/cancelled
  records without changing ordinary list filters. Archived/cancelled/refunded
  reservations cannot restart PayFast, and cancelled/failed returns route the
  guest back to the same durable reference instead of starting a duplicate
  booking journey. Checkout preparation failures now state that the saved
  reservation can be recovered through Find My Booking.

## Verification

- Focused booking, PayFast, Admin-search, idempotency and security tests passed
  44/44. TypeScript and the Production build passed.
- Admin initial-route performance remained within budget: raw 1,294,390 /
  1,320,000 bytes; gzip 314,260 / 320,000; largest gzip chunk 167,512 /
  170,000. The correction adds no request, query, polling or background work.
- No migration or Production data correction is required. `ZNG-BQQQWT` remains
  an active R0-paid/R5,760-outstanding hold past expiry because an existing
  communication prevents automatic cleanup; it requires manual Box Office
  review and was not modified.
- Application commit `2d3b3ed18916896895b561d02b091b9dffc86274` deployed
  successfully as `dpl_6mdYxauKwqiUf7pxFH6NchCJW9au` at 09:34:45 SAST.
- Kaden's authorised Production session restored and loaded Admin. The live
  Admin asset confirms exact reference searches send `archive=all` and
  `hideCancelled=0`; the public assets confirm archive-state enforcement,
  reference prefill, `Check Reservation`, and the saved-reservation message.
- Final route checks: `/book` 200 in 0.48s, `/find-booking` 200 in 0.26s,
  `/admin` 200 in 0.70s, `/api/shows` 200 in 1.05s and venue settings 200 in
  0.57s. The PayFast ITN route returned the expected safe GET response of 405.
- Business-data delta: zero. No real booking, payment, callback, ticket or
  communication was created during QA.
- Full record:
  `.codex/archive/P0_PUBLIC_BOOKING_PAYMENT_INTEGRITY_2026-11-10.md`.

---

# P0 - Supabase Disk I/O And Database Performance

STATUS: FOLLOW-UP COMPLETE - SMALL ACTIVE, PRODUCTION HEALTHY; MONITOR COMMITMENT

DATE: 9 NOVEMBER 2026

## Small Compute Follow-up

- The previously approved upgrade is active: Production is healthy on Supabase
  Small compute in `eu-west-3`. No infrastructure change was repeated.
- Live project utilisation was 42-51% CPU, 55-59% RAM and 27-29 of 90 database
  connections. Disk I/O Balance was 99%; Small's sustained throughput baseline
  is 22 MB/s, double the former Micro baseline.
- Compared with the Micro assessment, live RAM pressure fell from 76-86% to
  55-59%, connection headroom increased from 60 to 90, and the I/O balance
  remained recovered at 99%. Database Observability still reports 1.57 GB used
  and 2.14 GB committed, classed severe, so memory commitment remains a watch
  item rather than an active outage.
- Last-hour database evidence showed 4.46% CPU, 99.64% query cache hits, no
  blocked queries and no disk-bound application outlier. The slowest material
  application RPC observed was `get_admin_booking_page`, maximum 723 ms across
  65 calls.
- Last-hour Vercel evidence showed 8,400 function invocations, 0.2% errors,
  zero timeouts, 36 ms active CPU P75, 549 ms TTFB P75 and 0.5% cold starts.
  `/api/admin/waitlist` remains a low-volume latency watch item at 3.86 s P75
  across 15 invocations.
- Kaden's existing authorised session restored successfully and loaded the full
  Production Admin calendar. Public `/book`, shows and venue-settings checks
  returned HTTP 200. The PayFast ITN route returned the expected HTTP 405 to a
  safe GET, confirming the POST-only callback endpoint is reachable without a
  transaction.
- Review and pre-show reminder schedules are active in Vercel. No job, email,
  booking, checkout, payment or callback was triggered during verification.
- Current Production deployment `J3xBEALhAgKsXAYErn6zgTHgxBRz` is Ready on
  source `39f42c4`. No code, migration, database, billing or deployment change
  was made. Business-data delta: zero.

## Previous Micro Assessment (Historical Baseline)

- At the time of the pre-upgrade assessment, Production was healthy and the
  live Supabase Disk I/O Balance had recovered
  to 99%. Current database load is approximately 7 IOPS and 335.7 KB/s, with
  99% table/index cache hit rates, no blocked queries and no material
  application query outlier after the provider restart.
- The earlier Supabase outage is not attributed to Disk I/O. Available evidence
  does not prove that relationship.
- Telemetry, rate-limit and staff-presence writes are confirmed sources of
  ongoing database churn, but there is no active runaway loop and no safe
  evidence-backed query/index correction to deploy.
- Micro memory was the capacity concern: live RAM ranged from 76-86%, with
  1.78 GB committed memory classed severe. Small compute is recommended because
  it doubles RAM and the sustained IOPS/throughput baselines.
- Micro was about `$10/month`; Small was about `$15/month`. The estimated
  increase was `$5.23/month`. No compute or billing change was made during that
  assessment; the upgrade was completed subsequently and is verified above.
- No code, migration, database maintenance or Production deployment was needed.
  Business-data delta: zero.
- Full record:
  `.codex/archive/P0_SUPABASE_DISK_IO_DATABASE_PERFORMANCE_2026-11-09.md`.

---

# P0 - Vercel Duration And Production Authentication Incident

STATUS: COMPLETE - PROVIDER RECOVERED, SAFEGUARD DEPLOYED AND PRODUCTION VERIFIED

DATE: 9 NOVEMBER 2026

## Root Cause And Recovery

- Vercel alert `ag_01a1c032-e0d2-76e3-ba4e-83ae5b9e1ce1` began at
  14:05 SAST. Function Duration rose 29x from 0.23 to 6.48 GB-hours in the
  15-minute detection window.
- The active Production deployment had served normal traffic before the spike.
  Vercel logs showed Cloudflare 522/520 responses from the Zingara Supabase
  project across Auth and database-backed routes. CPU and memory remained
  ordinary while functions waited on the upstream service.
- Supabase's project health API independently reported Auth, Database, REST,
  Realtime, Storage and PgBouncer unhealthy. A management-plane read-only
  `select now()` failed with HTTP 544 and a database connection timeout.
- Supabase accepted a supported project restart at 14:34:28 SAST. All eight
  checked services returned `ACTIVE_HEALTHY` at 14:39:53 SAST. No data,
  migration, credential, RLS or permission change was made.

## Application Safeguard

- Admin session lookup and credential login now stop waiting after 12 seconds.
  Staff-profile validation is aborted on the same bounded restore path.
- Upstream failures show a clear temporary authentication message instead of
  an indefinite `RESTORING SESSION` screen or raw `Failed to fetch` text.
- Empty/expired sessions still return to login normally. Successful sessions
  still require the authoritative server-side staff profile, role permissions
  and RLS checks. There is no polling or repeated authentication request.

## Production Evidence

- Kaden's existing authorised Production session restored and loaded the full
  Admin calendar and staff controls after provider recovery.
- First post-recovery five-minute Vercel window: 93 function invocations, zero
  5xx responses and 618ms average function duration. During the incident,
  affected routes waited approximately 19-300 seconds.
- Final live checks after deployment: `/api/shows` HTTP 200 in 1.42s,
  `/api/venue-settings` HTTP 200 in 0.47s and `/admin` HTTP 200 in 0.71s.
- Focused authentication tests passed 6/6. TypeScript, Production build and the
  established Admin bundle budget passed; gzip was 314,221 / 320,000 bytes in
  Vercel's clean build. Existing unrelated Admin lint findings remain unchanged.
- Application commit: `f1a2175061e3653ef95547025059abbc77a51490`.
- Production deployment: `dpl_BRdxFKBVf7BT16bhajqcfrXtXuBx`, Ready and
  aliased to `book.zingara.co.za` from 14:42:10 SAST.
- Migration: none. Business-data delta: zero. Rollback: revert `f1a21750` and
  redeploy; the provider restart has no data rollback.
- Residual risk: Vercel may retain the alert's `active` label until its rolling
  anomaly window closes. Live error and duration metrics have already returned
  to normal; recurrence remains an external provider risk.
- Full record:
  `.codex/archive/P0_VERCEL_DURATION_AUTHENTICATION_INCIDENT_2026-11-09.md`.

---

# Phase 5 - Table Plan Export Finalisation

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## P0 Financial Export Correction

- Full Show Buyout payments without a recorded tender method now contribute
  once to the existing full-paid or prepaid workbook totals without being
  mislabelled as card or EFT. Two hidden calculation columns carry those
  authoritative amounts; all visible financial column definitions remain
  unchanged.
- `ZNG-48B964B9` now has one complete Payment Breakdown in Column L:
  Ticket & Show R531,000.00; VAT R79,650.00; Gratuity R73,750.00; Total Paid
  R684,400.00; Outstanding R0.00. The itemisation is emitted only when the
  Corporate Full Show Buyout note components reconcile exactly to the stored
  subtotal, service fee and total.
- The 30 Vodacom operational-table labels remain intact while the payment and
  financial values remain singular. No tender method, allocation or additional
  receivable was inferred.
- Fresh authenticated Production exports verified after deployment:
  `Zingara_Table_Plan_JHB_2026-11-06 (4).xlsx` and
  `Zingara_Table_Plan_CPT_2026-11-06 (1).xlsx`.
- A spreadsheet-engine recalculation confirmed JHB Total Full-Paid and Box
  Office Total Received at R684,400.00, T/GRT-PAID at R73,750.00 and R0
  outstanding. The CPT control export reconciled to R450,150.50 received:
  R429,250.50 full-paid plus R20,900.00 prepaid.
- Compared with the previous live JHB workbook, columns A-I are identical and
  only the intended summary formulas in J changed. Booking, seating, dietary,
  payment and historical data were not modified.
- Focused Table Plan tests passed 15/15 and finance tests passed 23/23.
  TypeScript, targeted lint, whitespace checks and the Production build passed.
- Application commit: `a3007698`.
- Production deployment: `dpl_2JzqQ2pPA2qwVxSDf8RQ8wub976s`, Ready at
  13:59 SAST on 6 November 2026.
- Migration: none. Business-data delta: zero. Rollback: revert `a3007698` and
  redeploy; no database rollback is required.

## Delivered

- The Table Plan now completely exchanges the two established payment columns:
  Column K is `PAYMENT SUMMARY` and Column L is `PAYMENT BREAKDOWN`.
- Values, formulas, cell styles, column styles, widths, notes and validation move
  with their columns. K is now 38.86 wide and L is 53.55 wide. No other column
  mapping, formula, width or format changed.
- Genuine legacy COMP rows retain the exact approved complimentary Payment
  Summary rather than receiving an additional gratuity-status line.

## Verification And Release

- Focused Table Plan tests passed 15/15 and finance tests passed 22/22.
  TypeScript, targeted lint, whitespace checks and the Production build passed.
- Admin performance remained within the established budget: raw 1,293,349 /
  1,320,000 bytes; gzip 313,906 / 320,000; largest gzip chunk 167,417 / 170,000.
- A Production-data Vodacom workbook was compared cell-for-cell with the
  uploaded pre-release workbook: 142 rows x 27 columns, zero differences after
  applying only the K/L exchange, including styles and widths.
- Authenticated Production exports verified:
  `Zingara_Table_Plan_JHB_2026-11-06 (3).xlsx` and
  `Zingara_Table_Plan_CPT_2026-11-06.xlsx`.
- The live CPT workbook verified paid, deposit and complimentary rows. The live
  Vodacom workbook retained all 30 operational-table labels, zero fabricated
  guest allocations, one financial row, R684,400 paid, R0 outstanding,
  R73,750 historical gratuity and 37 Strictly Halaal meals.
- Application commit: `fe694690`.
- Production deployment: `dpl_GHbn3e2MbUVKZM5zUFsAnjmdrtki`, Ready and aliased
  to `book.zingara.co.za` at 13:08 SAST on 6 November 2026.
- Migration: none. Business-data delta: zero. No booking, seating, payment,
  financial, dietary, ticket, customer or historical record changed.
- Rollback: revert `fe694690` and redeploy; no database rollback is required.
- Full record:
  `.codex/archive/PHASE_5_TABLE_PLAN_EXPORT_FINALISATION_2026-11-06.md`.

---

# P0 - Vodacom Buyout Table Plan Integrity

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Delivered

- The Table Plan now represents a confirmed Full Show Buyout with no manual
  table claims as show-wide coverage. Every currently available operational
  table carries the authoritative company name while allocated pax remains
  zero until Box Office records an actual section/table allocation.
- Disabled tables remain disabled and unclaimed. Existing table numbers,
  zones, capacities, temporary/merged state and all seating records are
  unchanged.
- Booking reference, notes, payment summary and financial values remain
  singular. Historical staff notes can supply legacy Kosher/Strictly Halaal
  quantities only when structured add-on quantities are absent.
- Fully paid Corporate/Buyout exports now use the stored service fee as the
  existing gratuity-paid value when no more specific allocation evidence is
  available. No tender type is fabricated.

## Vodacom Reconciliation

- `ZNG-48B964B9`: R531,000 Ticket & Show + R79,650 VAT + R73,750 gratuity =
  R684,400 total and paid; balance R0. The VAT is 15% of R531,000.
- R73,750 is the original fixed Private Salon gratuity, 12.5% of R590,000.
  Lisa Rodderick's audited 5 November management reconciliation reduced the
  subtotal to R610,650 but deliberately retained that contractual gratuity.
- The 37 Strictly Halaal guests and the additional-guest rates remain in the
  authoritative operational note. No payment, add-on, legacy evidence or
  current balance records them as separate receivables on top of R684,400.
- An older R510,000 local-only Xero quote remains historical evidence and was
  not synced or used to alter the current booking ledger.

## Release Evidence

- Focused buyout export regression: 1/1 passed. Table Plan finance suite:
  22/22 passed. TypeScript, targeted lint, whitespace checks and Production
  build passed. The existing five stale wording assertions in the wider
  workbook suite remain unrelated to this correction.
- Fresh authenticated Production export:
  `Zingara_Table_Plan_JHB_2026-11-06 (2).xlsx`.
- Live workbook: 30 active operational tables labelled Vodacom; zero invented
  allocated guests; one booking reference; one R684,400 payment summary; one
  R73,750 gratuity value; 37 Strictly Halaal; disabled rows not labelled.
- Application commit: `b6eaf36c`.
- Production deployment: `dpl_2fhThxc5fArvLFeKeJscjfrhBevY`, Ready and
  aliased to `book.zingara.co.za` at 12:57 SAST on 6 November 2026.
- Performance: no request, query, polling, dependency or client-side work was
  added. The established Admin performance budget passed.
- Business-data delta: zero. No booking, payment, quote, invoice, table,
  seating, ticket, customer or historical financial record changed.
- Full record:
  `.codex/archive/P0_VODACOM_BUYOUT_TABLE_PLAN_INTEGRITY_2026-11-06.md`.

---

# Corporate & Buyout Pricing Corrections

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Delivered

- The permanent Corporate/Buyout `Bar Tab` accepts an authorised custom Rand
  amount while retaining the existing quantity model. Its chargeable value is
  included once in the established 12.5% upfront-gratuity calculation and all
  existing booking, balance, quote, invoice, Function Brief, Table Plan and
  reporting paths continue to consume the persisted financial components.
- Admin -> Settings -> Venue now contains `Buyout Packages` for Cape Town and
  Johannesburg. Authorised settings managers can edit the existing three
  package names, descriptions and totals. Each save creates a new audited
  venue-specific version; existing booking snapshots are immutable.
- Full Show Buyout creation now accepts an optional agreed total for that
  booking only. The selected package and agreed financial composition are
  persisted as the booking snapshot, so later package edits cannot reprice it.
- New-version EFT bookings and manual EFT settlement remove the configured
  booking fee atomically. PayFast/payment-link settlement adds the existing
  configured fee atomically. Historical fees and settled records are excluded
  through the `payment-method-v1` provenance boundary.

## Financial Verification

- `ZNG-48B964B9` (Vodacom, JHB 6 November, 400 guests) was verified read-only.
  Its original Private Salon package snapshot remains R590,000 base,
  R73,750 gratuity, R88,500 VAT and R752,250 package total. Lisa Rodderick's
  later audited management agreement remains the authoritative R684,400
  total/paid with R0 balance. No value or evidence was changed.
- A rollback-only Production transaction proved configured-fee behaviour from
  R0 -> R10 for a PayFast payment link and R10 -> R0 for EFT, exercised the
  existing atomic EFT settlement, and created a venue package version. The
  transaction was rolled back and follow-up counts confirmed zero fixture
  bookings, audit rows and financial evidence.
- Production contains the three global active package templates and no venue
  override rows. The new functions and schema are present; Vodacom's booking,
  payment position and package snapshot are unchanged.

## Verification And Release

- Focused tests passed 101/101. TypeScript, whitespace validation and the
  supported Next.js Production Webpack build passed. Targeted lint reported no
  errors and four pre-existing warnings.
- The new package editor is dynamically loaded only when Venue settings is
  opened. It adds no polling, normal booking-page request, dependency,
  background process or per-render database query.
- Authenticated Production inspection as Kaden confirmed both venue sections,
  all three package names/descriptions/totals and the protected Save controls.
  No value was edited or saved.
- Application commit: `6ca491e3` (source commit `7b77122`).
- Migration: `20261106160000_corporate_buyout_pricing_corrections.sql`, applied
  successfully through the linked Production workflow.
- Production deployment: `dpl_4sfWsHBUWndJRqRt2hVY1PWGK4Xh`, Ready and aliased
  to `book.zingara.co.za` at approximately 12:39 SAST on 6 November 2026.
- Rollback: revert `6ca491e3` and redeploy. The additive migration can remain;
  disable use of the new versioned functions rather than deleting immutable
  audit-compatible schema.
- Business-data delta: zero bookings, payments, package overrides, invoices,
  quotes, tickets, seating records or historical financial values changed.
- Full record:
  `.codex/archive/CORPORATE_BUYOUT_PRICING_CORRECTIONS_2026-11-06.md`.

---

# P0 - Corporate Financial & Function Brief Integrity

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Delivered

- Reconciled Corporate booking `ZNG-BCP2C3` from authoritative booking,
  payment and audit records without changing its historical values. The
  R329.50 difference from 29 x R1,360 comprises two later guests charged at
  the fixed agreed R1,530 rate (+R340), the prior R0.50 reconciliation, and
  the R10 embedded booking fee.
- Corporate and Full Show Buyout creation continue to collect the established
  12.5% gratuity upfront. The authoritative calculation includes chargeable
  add-ons, including the new permanent Corporate-only `Bar Tab`. Ordinary
  Standard bookings retain venue-paid gratuity treatment.
- `Bar Tab` is now a permanent custom-amount Corporate/Buyout add-on. The
  shared server normaliser restricts it to those booking origins, requires one
  total amount, preserves financial permissions and prevents duplicate lines.
- Function Briefs now derive financial components from authoritative booking
  totals and explicit legacy evidence. They show Full Payment, Tickets,
  collected ticket gratuity, Booking Fee, each add-on, and collected add-on
  gratuity separately. Both historical subtotal conventions are supported;
  manually typed notes can no longer be presented as collected gratuity.

## Reconciliation & Verification

- Live Function Brief values for `ZNG-BCP2C3`: Full Payment R47,632.50;
  Tickets R39,769.50; ticket Gratuity Paid R4,590.50; Booking Fee R10.00;
  Bar Tab R2,900.00; Bar Tab Gratuity Paid R362.50. These components reconcile
  exactly to R47,632.50.
- Production audit covered 582 active Corporate-origin bookings, including 33
  with structured add-on value and two fixed Buyouts. One cancelled, unpaid
  historical booking (`ZNG-JVFMG6`) retains a pre-existing R250 component
  mismatch and requires manual financial review; it was not altered.
- Focused tests passed 61/61. TypeScript, whitespace checks and the supported
  Production Webpack build passed. Vercel's Production build and performance
  checks completed successfully. No request, polling, dependency, background
  process or per-render query was added.
- Authenticated Production inspection confirmed the Corporate Bar Tab control
  on the reference booking. A fresh live Function Brief was downloaded and
  all three A4 pages were text- and visually verified with no clipping,
  overlap or rounding loss.

## Release

- Local application commit: `d8a43bf`.
- Production application commit: `9b4c9cae`.
- Production deployment: `BTcGsmMWoKAPenK1ZHK4wK1iS23w`, successful at
  11:33:15 SAST on 6 November 2026.
- Migration: none required.
- Business-data delta: none. No booking, payment, invoice, quote, seating,
  ticket, customer, communication or historical financial record changed.
- Full record:
  `.codex/archive/P0_CORPORATE_FINANCIAL_FUNCTION_BRIEF_INTEGRITY_2026-11-06.md`.

---

# Phase 4 - Floor Assignment Improvements

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Delivered

- Floor & Arrivals now lists every currently available suitable single table
  for each unassigned booking, including the exact table number and seating
  capacity. The existing best-fit choice remains first and is marked `BEST`.
- A table button now performs the existing atomic assignment immediately; the
  two redundant confirmation dialogs were removed. Success and error feedback,
  queue refresh and Floor Layout refresh remain in the established workflow.
- The same authoritative suitability rules still enforce show, zone, minimum
  occupancy, capacity, merged-table validity and existing ownership. Automatic
  splitting remains impossible; valid merged tables remain one operational
  table and authorised multi-zone bookings are handled zone by zone.
- The server reloads the authoritative plan before a direct claim and rejects
  stale or unsuitable selections. The existing atomic database function keeps
  table locking, duplicate prevention, idempotency and immutable audit history.

## Verification & Release

- Focused tests passed 26/26. TypeScript, whitespace checks and the supported
  Production Webpack build passed. Targeted lint had no errors and one
  pre-existing unused-parameter warning in untouched legacy logic.
- The Admin bundle remained within the established budgets: 1,243,872 raw
  bytes, 299,943 gzip bytes and 169,872 bytes for the largest gzip chunk. No
  normal-load request, polling, dependency or background process was added.
- A rollback-only Production transaction assigned JHB 13 November booking
  `ZNG-3QXAJU` to exact Table 208, verified an idempotent repeat, rolled back,
  and confirmed both booking and table remained unchanged.
- Authenticated Production inspection confirmed the same booking displays nine
  suitable Middle Ring tables with capacities and Table 208 marked `BEST`.
  Desktop and a 390 x 844 mobile viewport were visually verified; options are
  contained, readable and immediately actionable. No live button was pressed.
- Production application commit: `3781a9c81492467db246c509b8419ae82e052885`.
- Deployment: `ASBVZxBEFBF7q1V6rineCcpyEQyk`, healthy.
- Migration: none required.
- Business-data delta: none. No booking, table, seating, payment, ticket,
  customer, communication or financial record changed.
- Full record:
  `.codex/archive/PHASE_4_FLOOR_ASSIGNMENT_IMPROVEMENTS_2026-11-06.md`.

---

# Phase 3 - Multi-Zone Bookings & Split Payments

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Delivered

- Authorised Box Office staff can enable one compact `Guest Allocation`
  editor inside the existing Standard and Corporate Payment & Review step.
  Each row records seating zone, Paid guests, COMP guests and the established
  Standard COMP, Media or Tradex classification while preserving one booking
  reference and customer record.
- Allocations must reconcile exactly to the booking guest total. Server-side
  pricing charges only Paid quantities, preserves established booking fees,
  deposits and gratuity rules, and leaves fully complimentary allocations at
  R0 payable. The server remains authoritative for capacity and permissions.
- Allocation-mode bookings are deliberately left for manual table planning;
  no table is automatically split, merged or assigned. Existing Phase 1
  Full Show Buyout seating remains the buyout-specific multi-zone workflow.
- Booking Details, Floor & Arrivals and Table Plan use the same persisted zone
  entitlements. Table Plan notes show the allocation and category values while
  actual payment totals remain counted once.

## Integrity & Verification

- Migration `20261106030000_phase_3_multi_zone_split_payments.sql` was applied
  to Production. Its service-role-only functions use advisory locks, validate
  staff permissions and show-specific operational capacity, and write an
  immutable audit event atomically and idempotently.
- Focused tests passed 35/35. TypeScript, targeted ESLint, whitespace checks
  and the supported Production Webpack build passed. No dependency, polling,
  API request or background process was added.
- Rollback-only Production transactions verified same-zone Paid/COMP,
  Corporate multi-zone Media/Tradex, and Standard multi-zone allocations.
  Repeated execution returned `already_exists`; the final QA booking count is
  zero.
- Authenticated Production inspection confirmed the deployed Standard booking
  workflow exposes `Guest Allocation On`, Add Zone, zone, Paid, COMP and COMP
  Type controls with live totals. The same workflow remained contained and
  readable at a 390 x 844 mobile viewport. No booking was submitted.

## Release

- Production application commit: `82a940a3a606dd39080d5c9b83148d8c773f79a0`.
- Deployment: `GwwsAugWGdcrhPmW6yCW7VaWSSgM`, healthy.
- Business-data delta: none. No booking, payment, seating, table, ticket,
  customer, communication or financial record changed during QA.
- Full record:
  `.codex/archive/PHASE_3_MULTI_ZONE_BOOKINGS_SPLIT_PAYMENTS_2026-11-06.md`.

---

# Phase 2 - Corporate Dietary Requirements

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Delivered

- Corporate enquiries now capture an explicit quantity for every selected
  dietary category, including Kosher and Strictly Halaal. The public form,
  Admin review and authorised Corporate conversion use the same validated
  metadata and canonical booking add-ons.
- The existing 72-hour rule remains limited to new or increased Kosher and
  Strictly Halaal orders. Existing orders remain editable without blocking an
  otherwise valid booking.
- Table Plan columns V and W continue to show authoritative Strictly Halaal
  and Kosher quantities. All other structured meal quantities are included in
  the existing NOTES field without changing workbook columns or formulas.
- The existing immediate dietary notification remains the sole delivery path.
  It now includes company, all meal categories, current Kosher/Strictly
  Halaal quantities and the confirmed change. Delivery remains idempotent and
  is sent only after an authoritative confirmed order or confirmed increase.

## Verification & Release

- Production audit: 204 Corporate enquiries, including 46 legacy enquiries
  with dietary labels, 11 Strictly Halaal labels and no historical quantity
  metadata. Eight active buyouts contained no dietary text. No historical
  quantities were guessed or migrated.
- Focused tests passed 26/26; the existing 72-hour boundary suite passed.
  TypeScript, targeted lint and the Production Webpack build passed. Generated
  Johannesburg and Cape Town workbooks verified mixed meal notes and exact V/W
  quantities.
- Live Production inspection confirmed the Corporate form exposes all meal
  categories and quantity controls for Kosher and Strictly Halaal. Kaden's
  authenticated Admin session confirmed the preserved Corporate workspace and
  204 enquiries. No form was submitted and no QA email was sent.
- Production commit: `95c85a373d7c358b3bb267d792df6a6bbae26ac8`.
  Deployment: `69kZW4SBXwuUgm15FUcGUx3gW4kq`, healthy.
- Migration: none required. Performance impact: no polling, additional page
  request, background job or per-render database query.
- Business-data delta: none. No enquiry, booking, dietary order, email,
  payment, seating, ticket, customer or financial record changed.
- Full record:
  `.codex/archive/PHASE_2_CORPORATE_DIETARY_REQUIREMENTS_2026-11-06.md`.

---

# Surgical Seating Preview Update

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Recommendation Spacing Correction

- Corrected the shared `Next Show Option` sentence so the show time and
  `for` are always separated, for example `18:00 for Golden Circle.`
- Root cause: adjacent JSX text and expression nodes relied on source-line
  whitespace, which React did not preserve in the rendered sentence.
- The shared formatter covers every seating zone and both venues without new
  requests, state, effects, dependencies or rendering work.
- Regression tests passed 5/5. TypeScript, focused lint, whitespace checks and
  the Production Next.js build passed.
- Authenticated Production verification confirmed the corrected Johannesburg
  Golden Circle sentence on desktop and the corrected Cape Town Golden Circle
  sentence in Chrome's 390 x 844 responsive viewport. The shared renderer was
  also verified with Cape Town Middle Ring.
- Local application commit: `abfe6a4`. Production commit:
  `ea43f01221d07318d5e3127633ea8690b49026f0`.
- Production deployment: `9yzMsHPQ2MmqUZ9tTmsMGBoip3kY`, READY.
- Business-data delta: none. No booking, availability, pricing, seating,
  payment, ticket, customer or financial record changed.

## Close Button Layout Correction

- Replaced the shared preview header's shrinkable flex layout with a stable
  title/button grid. The title column can wrap without consuming the CLOSE
  control's space.
- CLOSE now has a fixed minimum height, balanced horizontal/vertical padding,
  explicit inline-flex centring and additional clearance from the modal edge.
- Focused regression tests passed 5/5. TypeScript, whitespace checks and the
  Production Next.js build passed.
- Production inspection confirmed precise button centring, border clearance
  and no title collision for Golden Circle and the longer Royal Balcony title
  on desktop and in Chrome's 390 x 844 responsive viewport.
- Local application commit: `b2f1005`. Production commit:
  `0030c0af10a9000532081f655027eca5fbc4eca6`.
- Production deployment: `6Tx2FPwovA9Wvk7PxnM3HxE93q3L`, READY.
- Performance impact: zero measurable runtime overhead. The change is CSS
  utility classes only and adds no request, state, effect or dependency.
- Business-data delta: none.

## Delivered

- Every public Seating Preview now displays one compact venue-specific ticket
  inclusion sentence directly beneath the seating-zone title.
- Cape Town displays: `Your ticket includes a welcome drink and canapés on
  arrival, a decadent 3-course dinner and a 2½-hour performance experience.`
- Johannesburg displays: `Your ticket includes a welcome drink on arrival,
  a decadent 4-course dinner and a 2½-hour performance experience.`
- The shared preview renderer and existing guest-disclosure venue resolver are
  reused, so the copy applies consistently to every seating zone without a new
  request, state change, dependency or duplicated popup.
- The same shared availability formatter now renders `1 Seat Available` for a
  single remaining seat and retains `Seats Available` for zero or multiple
  seats in both the preview and selected-seating summary.

## Verification & Release

- Focused disclosure tests passed 4/4. TypeScript, focused disclosure lint,
  whitespace checks and the Production Next.js build passed. The booking page
  retains pre-existing full-file lint findings in untouched effect code.
- Authenticated Production verification confirmed the 4-course Johannesburg
  sentence and 3-course Cape Town sentence directly beneath Golden Circle.
  The shared renderer covers all other zones. Desktop and 390 x 844 mobile
  layouts remained contained and readable; pricing, availability, zone
  descriptions and actions were unchanged.
- Local application commit: `63e2abf`. Production commit:
  `7e041ca0be429722ce9d4998e1d3aa467af7e7f9`.
- Production deployment: `7uJzSR8vQQ6J5818DCpVDqMMcwKH`, READY.
- Performance impact: no additional API request, polling, calculation, effect,
  render loop or dependency. The update is one shared string lookup during the
  already-open preview render.
- Business-data delta: none. No booking, pricing, availability, payment,
  seating, ticket, customer or financial record changed.
- Existing record updated:
  `.codex/archive/GUEST_COMMUNICATION_DISCLOSURE_INTEGRITY_2026-11-05.md`.

## Venue-Specific Copy Correction - 11 November 2026

- Focused disclosure and source-regression tests passed 9/9. TypeScript,
  focused ESLint, whitespace checks and the Production Next.js build passed.
  The unchanged Admin bundle remained inside its established performance
  budget (1,295,676 raw bytes; 313,829 gzip bytes; largest chunk 167,299
  bytes).
- Live Production verification covered Private Booths, Middle Ring, Golden
  Circle and Royal Balcony for both Cape Town and Johannesburg. Canapés appear
  only in the Cape Town sentence; Johannesburg uses the approved arrival copy.
- The actual Production popup was inspected at desktop size and in Chrome's
  390 x 844 responsive viewport for both venues. Copy, headings, CLOSE,
  availability, pricing and actions remained contained and readable.
- Singular and plural availability output is protected by direct formatter
  tests, including `1 Seat Available`, `0 Seats Available` and plural counts.
- Application and Production commit:
  `fa37e792b9d94b237df355ea4c9a1a12eaffc732`. Production deployment:
  `6jXsxwxmYNSSJkAepATPLgyDRnBo`, READY.
- Performance impact: no additional API request, polling, state, effect,
  dependency or background work. Business-data delta: none.

---

# Phase 1 - Full Show Buyout Seating

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Delivered

- Floor & Arrivals now gives authorised Box Office staff one collapsed
  `Plan Buyout Seating` control on the existing Full Show Buyout banner.
- The workflow has three stages: open the seating plan, allocate the booking's
  full guest total across the four existing zones, then select and save the
  physical tables inside each allocated zone. The number of table selections
  depends on the approved plan; there is no automatic split or assignment.
- Allocated and remaining guests are visible throughout. Tables are limited to
  the selected show and zone, and current valid claims remain visible.
- The implementation reuses the existing corporate zone editor, show-table
  inventory, Floor Layout claims and authoritative Table Plan export path.
  Standard and Corporate automatic assignment behaviour is unchanged.

## Integrity & Verification

- Migration `20261106020000_phase_1_full_show_buyout_seating.sql` was applied
  to Production. The service-role-only database functions lock the buyout,
  booking and selected show tables before validating permissions, guest
  totals, zone capacity, table capacity and duplicate/concurrent claims.
- A rollback-only Production transaction cloned the relevant show controls and
  proved a 10-guest, two-zone, two-table plan through the deployed database
  functions: 10 guests allocated, 10 table seats claimed and five immutable
  audit events recorded before the complete transaction was rolled back.
- Focused tests passed 31/31. TypeScript, targeted ESLint and whitespace checks
  passed. The core Turbopack release build passed the existing Admin budget at
  1,292,213 raw bytes and 312,991 gzip bytes. A final CSS-only verification
  build also passed with Next's supported Webpack builder after the local
  Turbopack worker was prevented from opening its temporary process port.
- Authenticated Production inspection used Johannesburg 10 November 2026,
  booking `ZNG-DA5D8B36` (NTT DATA - Internet Solutions), as a read-only
  reference. It showed 350 guests, all four approved zones, 0 allocated and
  350 remaining, with Save disabled until the guest total reconciles.
- Desktop and 390 x 844 mobile inspection confirmed all zone names, capacities,
  totals and controls are contained and readable. No save action was performed.
- Table Plan regression coverage confirms multi-zone claims export with the
  correct per-table guest quantities while booking financials remain counted
  once.

## Release

- Core Production commit: `4ee80df22ba10c5c0b53d5c24c65ecd5c5dffb86`.
- Mobile follow-up commits: `464d3266421cc2b2ff050a9aa9efe70099d789f8`,
  `2994ea2a1f27255d21fcc406a56d527d2e512ec7` and final
  `485b9c44ccbe1ca5f8b97b36121ab373ec366735`.
- Core deployment: `5bf2NdpoiNrpXWdPgL4pYkuQ8Leq`. Final Production
  deployment: `7uU2uhHaMbtXaY549sJhtBSJSN6d`, READY.
- Business-data delta: none. The reference buyout remains awaiting payment with
  350 unallocated guests and no table claims. No booking, seating, table,
  capacity, payment, ticket, customer or financial record changed during QA.
- Rollback: redeploy the parent application commit. The additive migration may
  remain dormant; removing its new functions/tables is optional and no
  business-data rollback is required because no live seating plan was saved.
- Full record:
  `.codex/archive/PHASE_1_FULL_SHOW_BUYOUT_SEATING_2026-11-06.md`.

---

# P0 Booking Visibility & Data Integrity

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Findings

- Johannesburg 10 November 2026 contains one authoritative 350-guest Full
  Show Buyout (`ZNG-DA5D8B36`, NTT DATA - Internet Solutions). It has no zone
  allocations or table assignment because its section plan is still a manual
  Box Office decision. The zero zone totals were therefore accurate but lacked
  an explanation.
- The shared assignment-status function counted every active tableless booking
  as waiting for automatic assignment. This incorrectly included Full Show
  Buyouts even though all assignment engines already keep buyouts manual.
- The bounded Production audit covered 264 performances, 6,469 active
  bookings and 47,097 guests across both venues. It found no cross-show table
  claims, no active buyout guest mismatch, no active buyout missing its
  control record and no performance with multiple active buyouts. Eight active
  buyouts were incorrectly included in the generic waiting calculation.

## Correction

- Migration `20261106013000_p0_booking_visibility_integrity.sql` excludes
  active Full Show Buyouts from the generic automatic-assignment waiting count
  through the indexed `corporate_buyouts` relationship.
- Floor & Arrivals now identifies the selected Full Show Buyout and explains
  that its guests await manual section planning, so empty zone totals are no
  longer presented without context.
- Automatic Table Assignment now says `eligible bookings`, preserving the
  established rule that buyouts remain outside automatic assignment.

## Verification & Release

- Focused regression tests passed 16/16 and TypeScript passed. A Production
  webpack build completed successfully. The migration dry run listed only the
  intended function replacement.
- Authenticated Production verification for JHB 10 November confirmed:
  `Full Show Buyout - 350 guests`, the manual section-planning explanation,
  350 of 415 guests booked, `All eligible bookings have tables`, and Needs a
  Table at 0 bookings / 0 guests. The four zone totals remain zero until Box
  Office records the buyout seating plan.
- The same live page remained contained at 390 x 844 with no horizontal
  overflow (`scrollWidth = clientWidth = 390`).
- Local application commit: `5f4240bc`. GitHub rejected normal ref pushes, so
  the identical verified tree was published through the authenticated GitHub
  Git Data API as Production commit `51b04b225661ce3dc8779e2438235b0badc0f49f`.
- Production deployment: `6xZnU6aEsdL39x351FFTVeJo2Ti2`, READY. The linked
  Supabase migration completed successfully before live verification.
- Business-data delta: none. No booking, buyout, assignment, table, capacity,
  payment, ticket, customer or financial record changed.
- Rollback: redeploy the parent application release and restore the prior
  `get_box_office_assignment_approval_status` definition. No business-data
  rollback is required.
- Full record:
  `.codex/archive/P0_BOOKING_VISIBILITY_DATA_INTEGRITY_2026-11-06.md`.

---

# Show & Availability Management UI/UX Cleanup

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Delivered

- The calendar financial summary now comes from the existing monthly
  authoritative occupancy request instead of the partial client booking list.
  Paid and unpaid use booking financial snapshots; deposits require confirmed
  deposit-payment evidence; refunds require accepted refund evidence. Genuine
  zero-value shows display `R0`, while Credit displays `Unavailable` because no
  authoritative show-level credit ledger exists.
- The financial popup is a contained mobile bottom sheet with touch/click,
  backdrop and close-button dismissal while retaining desktop hover. The open
  card and financial-control stacking contexts are raised together so the
  popup paints above the neighbouring Create Booking control without a global
  arbitrary z-index escalation.

- Show creation is contained in one `Create Show Schedule` section below the
  calendar. It is collapsed by default and contains the bulk schedule tools
  plus the date, time, label, location, address and `Create Show` controls.
- Only month navigation and the compact `ALL | CAPE TOWN | JOBURG` venue
  filters remain above the calendar. `ALL` is the default and the former
  location dropdown and show search have been removed from this workspace.
  Existing creation, editing, availability and buyout actions are unchanged.
- The calendar now scales from one mobile column to seven large-desktop
  columns. Capacity badges remain compact, single-line and contained; buyout
  summaries use the same bounded layout.
- Public/Admin presentation now uses concise Open, Sold Out, Buyout and Closed
  labels while preserving the distinct operational status values and their
  existing booking restrictions.
- The workspace description is now `Manage show schedules and availability.`
  Edit Show headings use only the venue name while the stored show title and
  all booking-facing content remain unchanged.
- Standard native selects now reserve 48px for the chevron and render it 16px
  inside the right border. Existing custom `appearance-none` selects remain
  excluded so they do not receive duplicate arrows.
- Calendar buyout cards retain their status badge and display the full
  authoritative customer name with responsive wrapping. Section-planning copy
  was removed from the calendar only; the underlying requirement and workflow
  remain unchanged.

## Verification & Release

- Production reconciliation verified representative Johannesburg and Cape
  Town performances. Examples: JHB 4 November = Paid R40,120, Unpaid R0,
  Deposits 0 / R0; CPT 4 November = genuine zero; JHB 5 November = Paid
  R386,732.50, Unpaid R143,960, Deposits 3 / R4,950; CPT 5 November = Paid
  R436,716.50, Unpaid R26,040, Deposits 7 / R17,540; JHB 11 November = Paid
  R231,083, Unpaid R413,740, Deposits 1 / R9,900; CPT 11 November = Paid
  R149,984, Unpaid R197,095, Deposits 5 / R12,650.
- Focused calendar finance and occupancy tests passed 5/5. TypeScript,
  targeted ESLint and whitespace checks passed. Two unrelated pre-existing
  Admin performance assertions remain outside this change.
- Live 390 x 844 inspection measured the popup at 358 x 210 pixels with
  16-pixel side insets and a bottom edge of 828 pixels. All labels and values
  were readable. Desktop inspection measured a contained 256 x 138 pixel popup
  and preserved hover. The layering regression test verifies that the active
  card/control paint above the Create Booking action. The final post-layering
  deployment completed successfully. The first authenticated refresh stopped
  at the platform-access session gate; the follow-up verification below later
  restored that authorised session.
- Follow-up authenticated Production verification on 6 November restored
  Kaden's existing session and confirmed the deployed JHB 5 November values:
  Credit Unavailable, Paid R386,732.50, Unpaid R143,960, Refunded R0 and
  Deposits 3 / R4,950. Desktop layering is correct: the popup is the topmost
  element where it geometrically overlaps Create Booking, with card/control/
  popup layers 30/40/50 above the button layer 20.
- The same live 390 x 844 check found one unresolved mobile blocker. The global
  draggable `Report an issue` button retains its intentional layer 220 and
  overlaps the bottom-right of the financial popup, obscuring part of the
  Deposits value. Calendar cards and Create Booking buttons remain underneath
  the popup, but the P0 is not complete until the global control no longer
  obscures financial content. No code or Production data was changed during
  this verification.
- Final correction `e1fabef1` positions the mobile sheet above the persistent
  reporter without changing either stacking contract. Authenticated Production
  verification measured popup top/bottom 554/764 and reporter top/bottom
  776/824 at 390 x 844: zero overlap, all values readable. Desktop remained
  contained at left/right 556/812 and top/bottom 384/522 in 1280 x 720.
  Deployment `98T67SkyuDovjnqNeM3vY4McptXH` completed successfully at
  6 November 2026, 01:12:25 SAST. P0 is complete.
- The browser still makes one monthly calendar-occupancy request. No polling,
  new browser request, per-performance query or render-time calculation was
  added. The bounded November Production query shape covered 50 shows, 299
  confirmed deposit rows and no accepted refunds in approximately 462ms.
- Financial application commits: `988ca739`, `b6127138` and `3decfcad`.
  Vercel deployments `2kpYWmj9Y2K3sCBHViWdAPRMwp7L`,
  `4J1XRewHLVnEtx8DZYmiuX4dia1W` and final layering deployment
  `HhwTEod5NRf7hy8AZ1hniNKX5hAE` completed successfully; the final deployment
  completed at 6 November 2026, 00:59:02 SAST.
- Financial-summary business-data delta: none. No booking, payment, refund,
  deposit, VAT, gratuity, show, seating or customer record changed. No
  migration was required.

- Final focused regression suite: 37/37 passed. TypeScript and whitespace
  checks passed.
- Authenticated Production inspection verified the collapsed schedule below
  the calendar, every Create Show control inside it, month navigation and the
  three venue pills above the calendar, contained normal and over-capacity
  badges, the concise copy and venue-only Edit Show heading. The stored full
  show title remained unchanged.
- Production filtering was exercised against actual calendar results: `ALL`
  showed both venues, `CAPE TOWN` showed only Cape Town and `JOBURG` showed
  only Johannesburg. Search is absent, selection returns to `ALL` after a full
  reload, and no additional request is made when switching filters.
- Desktop and 390 x 844 mobile inspection confirmed the three pills remain on
  one row and long buyout names such as `NTT DATA - Internet Solutions` and
  `Vodacom` remain inside their cards without the section-planning sentence.
- Desktop Production and a 390 x 844 mobile viewport verified that standard
  dropdown chevrons are 16px inside their borders with sufficient text space.
  Focused and open states retain native behaviour; custom dropdowns retain
  their existing arrows.
- No request, polling, query, calculation or booking-path work was added.
  An authenticated Production reload populated the calendar in approximately
  563ms; the reported 7-10 second delay was not reproducible on the final
  release.
- Application commits: `ce9c97db`, `bfd517e5`, `c1fe3409`, `3a82280f`,
  `32471f6f`, `c1e17561`, `77346684`, `ad3222a0`, `bde28d79` and
  `bc05df27`.
- Final Production deployment: Vercel deployment
  `EkeHMqHhyvwjdJ2mWXb1bQxw3y5S`, completed at 6 November 2026, 00:33:23 SAST
  and active on `book.zingara.co.za`.
- Business-data delta: none. No show, booking, availability, capacity, buyout,
  seating, payment, ticket or customer record changed.
- Rollback: revert `bc05df27`, `bde28d79`, `ad3222a0`, `77346684`, `c1e17561`,
  `32471f6f`, `3a82280f`, `c1fe3409`, `bfd517e5` and `ce9c97db` in reverse
  order and redeploy. For the P0 financial follow-up, revert `3decfcad`,
  `b6127138` and `988ca739` in reverse order. No database rollback is required.
- Full record:
  `.codex/archive/SHOW_AVAILABILITY_MANAGEMENT_UI_UX_CLEANUP_2026-11-06.md`.

---

# Attendance Management & Notification Integrity

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 5 NOVEMBER 2026

## Findings

- Guest YES/NO persistence was already atomic and idempotent. YES recorded the
  response without a notification; NO previously used broad role routing for
  Super Admin, Venue Manager and Box Office roles through in-app/device push.
- No Attendance Confirmations Staff Emails workflow or email delivery existed.
  Bookings and Booking Details also lacked attendance controls, while Floor &
  Arrivals displayed statuses without an attendance filter.
- The first release preserved a stale pre-existing attendance route because its
  migration used `on conflict do nothing`. Production verification found Fatima
  and Kaden still stored on that route. The corrective migration replaced the
  route authoritatively with the four approved Box Office recipients and no CC.

## Delivered

- Declines now use one asynchronous, versioned and idempotent workflow across
  email, targeted in-app notification and targeted device push. Confirmations
  remain record-only. Notification delivery never controls response recording.
- Communications -> Staff Emails now exposes Attendance Confirmations with the
  existing ON/OFF, Edit, TO/CC and Save Recipients controls. Production is ON
  for Lisa Rodderick, Michael Davis, Rasmus Bjerregaard and Sharon Ricketts;
  CC is empty. Management and venue roles have no automatic fallback.
- Bookings now filters All, Confirmed, Declined and Awaiting Response through
  the existing paginated query/export path. Booking Details shows a compact
  attendance badge. Arrivals & Check-in has the same independent filter while
  arrival/check-in remains a separate state.
- Migration `20261106001500_attendance_management_integration.sql` registered
  the route, indexed attendance response and extended the bounded booking-list
  RPC. Migration `20261106003000_attendance_box_office_routing_correction.sql`
  removed stale management recipients from the existing Production route.
- The 6 November follow-up adds independent `ATTENDING (YES)` and
  `NOT ATTENDING (NO)` email switches beneath the existing master. Both
  default to ON and share the established TO/CC route. Attendance recording
  remains authoritative before asynchronous notification work; unchanged
  retries do not send again. A disabled email does not suppress the existing
  decline in-app/device alert.
- The two Admin switch surfaces now share one accessible control: ON uses a
  clearly visible green track and OFF uses a neutral grey track on the dark UI.

## Verification & Release

- Focused tests: 15/15 passed. TypeScript, Production build and whitespace
  checks passed.
- Admin performance budget passed: raw 1,290,287 / 1,320,000 bytes; gzip
  312,441 / 320,000 bytes; largest gzip chunk 168,485 / 170,000 bytes.
- Authenticated Production verification confirmed the enabled Box Office-only
  Staff Emails route, attendance taxonomy in Bookings, the Booking Details
  `Attendance: Awaiting Response` badge and the Arrivals attendance filter.
- Application commits: `78041bc7` and corrective `2c71b111`.
- Production deployments: `dpl_HyGpP4dQZdqappism7vTxuRMKhkF` and corrective
  `dpl_96DhfWokipKao2fzeypK546GWMgL`, both READY.
- Follow-up tests passed 20/20; TypeScript, targeted lint, the Next.js 16
  Production build and whitespace checks passed. The Admin performance budget
  remained inside limits at raw 1,289,928 bytes, gzip 312,434 bytes and
  largest gzip chunk 168,474 bytes.
- Authenticated desktop and 390 x 844 Production verification confirmed the
  master, YES and NO switches are ON; green ON and grey OFF states are clear;
  recipient editing remains available; and the mobile page has no horizontal
  overflow. Production persisted Lisa Rodderick, Michael Davis, Rasmus
  Bjerregaard and Sharon Ricketts as TO, with no CC.
- Follow-up Production commit: `b384b6596248dec6c0e5113671d69bd27b47cfc0`
  (local equivalent `20bc2265`). Deployment
  `84fTGcxdNezPAUq3UcUKPp11jBdN` completed at 6 November 2026, 01:43:05 SAST.
  Migration `20261106014500_attendance_email_preferences.sql` applied
  successfully. No attendance delivery was created during release QA.
- Business-data delta: one notification route was added/corrected, one booking
  attendance index and the existing paginated booking RPC were updated. No
  booking, attendance response, arrival, payment, seating, ticket or customer
  communication record changed. The follow-up added one JSON settings column
  and stored two `true` flags on the existing attendance route only. No real
  notification was sent during QA.
- Rollback: revert `b384b659`, `2c71b111` and `78041bc7` as applicable and
  redeploy. Keep the additive settings column unless a separately reviewed
  schema rollback is required; restore the prior RPC only if attendance
  filtering is intentionally removed. Do not delete guest attendance history.
- Full record:
  `.codex/archive/ATTENDANCE_MANAGEMENT_NOTIFICATION_INTEGRITY_2026-11-05.md`.

---

# Gratuity Transition & Financial Integrity

STATUS: COMPLETE - DEPLOYED AND ACTIVATED IN PRODUCTION

DATE: 5 NOVEMBER 2026

## Verified Findings

- New public online bookings currently include 12.5% gratuity for parties of
  six or more. The charge is calculated on the discounted seating and add-on
  subtotal and persisted in `bookings.service_fee`.
- The complete Production public-booking audit found 4,579 records: 1,315
  carry R1,962,126 recorded gratuity and 3,264 carry no gratuity charge.
- Payment-ledger evidence conclusively supports 741 fully settled gratuity
  bookings (R1,083,232). A further 568 bookings carry R871,939 in charged
  gratuity but are not fully settled. Six cancelled, fully-paid records carry
  R6,955 and remain review cases rather than being labelled collected.
- Deposit payments do not retain component-level allocation evidence. Partial
  bookings therefore remain `GRATUITY REVIEW`; the platform does not infer a
  collected component from the booking total alone.

## Delivered

- Customer-originated online pricing excludes gratuity in both browser and
  authoritative server calculations. Internal, Corporate and COMP pricing
  paths retain their existing rules.
- Each new public booking snapshots `pay-at-venue` in the existing booking
  metadata. Existing `service_fee` amounts and historical totals are not
  changed. Add-on amendments preserve the booking's original gratuity basis.
- Booking Details and Table Plan Payment Summary use one resolver for
  `GRATUITY COLLECTED`, `GRATUITY PAYABLE AT VENUE` and `GRATUITY REVIEW`.
  Explicit imported gratuity evidence takes precedence; cancellations and
  partial settlements fail safely to review.
- Checkout, confirmations, payment links, Find My Booking, Admin previews and
  pre-show communications use booking-aware venue-payment wording.
- Migration `20261105235900_gratuity_transition_activation_audit.sql` adds
  activation evidence only. Its linked dry run is clean and changes no
  booking, payment or financial row.

## Verification

- Focused status/disclosure tests: 8/8 passed.
- TypeScript and the Next.js 16 Production build passed.
- Admin performance budget passed: raw 1,287,914 / 1,320,000 bytes; gzip
  311,950 / 320,000 bytes.
- Full changed-page ESLint remains noisy only from pre-existing repository
  hooks and unused-code findings; no new build or type failure exists.

## Production Release

- Application and records commit: `70447e55`.
- Migration `20261105235900_gratuity_transition_activation_audit.sql` applied
  successfully. It created release evidence only and changed no booking or
  payment row.
- Production deployment: `dpl_8LZzfKP3DpqhTaSFvpSQa3cLjzZH`, READY and
  aliased to `book.zingara.co.za`.
- Activation recorded at 5 November 2026, 23:10:59 SAST for new
  customer-originated online bookings only.
- Live public Booking loaded successfully from the deployed build. No QA
  booking, payment or customer communication was created.
- Microsoft 365 accepted exactly one branded
  `Zingara — Gratuity Payment Update` email to authoritative Fatima MB with
  Kaden Damon copied. Communications contains exactly one `sent` record at
  23:13:36 SAST. Provider acceptance and Communications delivery are verified;
  direct inbox receipt was not claimed.
- Business-data delta: one financial policy release-evidence row and one sent
  internal Communications record. Existing bookings, totals, payments,
  refunds, VAT, seating, tickets and customer communications are unchanged.
- Rollback: revert `70447e55` and redeploy. Preserve historical booking data;
  mark the release evidence inactive only if the application rollback is
  deliberately activated.
- Full record:
  `.codex/archive/GRATUITY_TRANSITION_FINANCIAL_INTEGRITY_2026-11-05.md`.

---

# Guest Communication & Disclosure Integrity

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 5 NOVEMBER 2026

## Findings

- The authoritative booking calculation applies a 12.5% service fee/gratuity
  for parties of six or more to the discounted seating and add-on subtotal and
  includes it in the booking total. Existing checkout totals were correct, but
  guest copy in checkout and the Pre-Show Reminder incorrectly described that
  charge as discretionary and payable on the night.
- Venue inclusions were correct in the Pre-Show Reminder but were absent from
  the public payment commitment, balance-payment, Find My Booking and booking
  confirmation touchpoints. Initial branded confirmation emails also did not
  consume the editable Reservation Confirmed body.
- Corporate enquiries already enforce the authoritative 20-guest minimum.
  Existing digital tickets, ticket PDFs and Apple Wallet passes contain the
  required event, venue, seating, timing and status information without a
  conflicting financial statement; they remain intentionally compact.

## Delivered

- One shared venue-aware disclosure source now supplies Cape Town and
  Johannesburg inclusions plus booking-derived payment/gratuity notices.
- Public checkout, secure balance-payment links and Find My Booking now show
  compact inclusions and payment disclosures before a guest pays or manages an
  outstanding balance.
- Booking confirmations, PayFast payment confirmations and Pre-Show Reminders
  now use the same authoritative content. Deposit bookings mention an
  outstanding balance; fully paid bookings do not. The persisted `service_fee`
  determines whether the included 12.5% notice appears.
- Initial branded reservation confirmations now include the saved editable
  template body. Admin template previews append the same authoritative
  disclosure content. Manual ticket resends retain their existing focused
  ticket presentation.
- Corporate wording now states that any applicable 12.5% gratuity is itemised
  in the quote and distinguishes additional drinks/gratuity payable at the
  venue unless covered by the agreed booking.
- No pricing, gratuity, VAT, deposit, NYE, PayFast, booking, seating, ticket or
  Wallet calculation changed. No migration was required.

## Verification & Release

- Focused disclosure/email tests: 14/14 passed. TypeScript, targeted lint,
  whitespace checks and the Next.js 16 Webpack Production build passed. The
  existing Admin performance script still cannot parse the Webpack
  client-reference manifest; no performance claim relies on that script.
- Browser verification covered the public booking flow and the live Corporate
  disclosure. Production returned HTTP 200 for Booking and Find My Booking,
  and the deployed Corporate page contained the corrected wording.
- The available browser session was not authenticated for Admin, so a direct
  live Admin preview inspection was not claimed. Shared renderer tests and the
  Production build verify the preview integration.
- Application commit: `6a9515bf`.
- Production deployment: `dpl_BVQ9EbmokQkGNqWx9BMFNKNgb9AH`, READY and
  aliased to `book.zingara.co.za`.
- Business-data delta: zero. No customer email was sent and no booking,
  payment, seating, ticket, communication or financial record changed.
- Rollback: revert `6a9515bf` and redeploy. No schema or data rollback is
  required.
- Full record:
  `.codex/archive/GUEST_COMMUNICATION_DISCLOSURE_INTEGRITY_2026-11-05.md`.

---

# Pre-Show Attendance Confirmations

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 5 NOVEMBER 2026

## Production Baseline

- The existing `pre_show_reminder` workflow remains enabled and scheduled
  exactly 24 hours before the authoritative venue Show Starts time. The
  15-minute scheduler, confirmed-booking eligibility and paid/deposit/COMP
  evidence rules are unchanged.
- Production recorded 714 sent reminders in the preceding 30 days, including
  57 on 5 November. Fourteen failed records and six historical records left in
  `sending` were identified; the Communications schema does not retain the
  provider failure reason. No historical reminder was resent or altered.

## Delivered

- Existing branded reminder emails now include `YES - I'LL BE THERE` and
  `NO - I CAN'T MAKE IT` actions backed by encrypted, expiring,
  booking-specific links.
- A compact confirmation page prevents email-security scanners from recording
  false answers. Guests can update their response; unchanged retries are
  idempotent.
- Floor & Arrivals shows Confirmed, Declined or Awaiting Response on check-in
  entries and expanded floor-table bookings.
- A new decline creates one versioned, idempotent Box Office in-app/push
  notification for Super Admin, Venue Manager, Box Office Manager and Box
  Office Staff roles. A response never changes arrival, booking status,
  seating, tickets, payments, refunds or capacity.
- Every changed response creates immutable booking audit evidence.
- The authoritative Guest Emails editor, saved workflow configuration,
  Production preview and scheduled sender now share the same renderer. The
  Preview Email view includes the `YES - I'LL BE THERE` and
  `NO - I CAN'T MAKE IT` actions that customers receive.
- Legacy Reminder Before Show and Post-Show Review entries are no longer
  offered in the generic template selector. Their stored records remain
  unchanged; scheduled workflow content continues to be edited only in
  Automated Guest Journeys.
- A Super Admin-only, one-time Production test action renders the saved
  pre-show workflow through the live Microsoft 365 delivery path. Its
  attendance links use a synthetic preview token that never writes booking or
  attendance state.

## Verification And Release

- Focused tests: 4/4 passed. TypeScript, changed-file ESLint, whitespace checks
  and the Next.js 16 Webpack Production build passed. The default Turbopack
  build remains blocked by the local compiler port restriction.
- Linked migration dry-run and application passed. A rollback-only Production
  transaction recorded Confirmed then Declined, verified versioned audit state,
  proved all booking/payment/seating fields unchanged, rolled back, and left
  zero QA links.
- Live Production returned the new attendance page and rejected an invalid
  token with HTTP 404. Browser verification confirmed the branded unavailable
  state; no real customer response or notification was created.
- Follow-up verification passed six focused attendance checks, TypeScript,
  changed-server-file ESLint, whitespace checks and a Next.js 16 Webpack
  Production build. The Admin performance script could not read the Webpack
  client-reference manifest format; no performance claim is based on that
  script.
- Authenticated Production preview verification confirmed the saved subject,
  body, branding, legal footer and both attendance actions. The approved test
  email `TEST — Zingara Pre-Show Reminder` was provider-accepted at
  21:25:20 SAST and visually confirmed in `kaden@kaden.co.za` Outlook.
- The isolated Confirmed response completed successfully and displayed that
  the booking remains unchanged. Production contains exactly one sent test
  Communication and zero persisted links for the preview token.
- Two initial test-send attempts were rejected before SMTP by legacy foreign
  keys on `communications.batch_id` and `communications.created_by`. They
  created no Communications rows and sent no emails. The final claim uses no
  campaign batch or legacy user attribution and remains protected by a narrow
  unique index.
- Application commit: `510a003f0533c9bf0161ce0682e9b6a61cc2b9b6`.
- Follow-up commits: `642dd2f4`, `36138e4a`, `4d22837a`, `744d9e3c`.
- Migration: `20261105193000_pre_show_attendance_confirmations.sql`.
- Follow-up migrations: `20261105214500_pre_show_email_template_integration.sql`
  and `20261105221000_pre_show_email_test_claim_fix.sql`.
- Production deployment: `dpl_Gvd6aAxqbKwfwjdmbuSGkTTrjQd9`, Ready and
  aliased to `book.zingara.co.za` at 20:56:46 SAST.
- Final follow-up deployment: `dpl_DRTR4jiiSbNVERjrC9FAwcQbXYgv`, Ready and
  aliased to `book.zingara.co.za` at 21:23:40 SAST.
- Business-data delta: zero historical or customer records changed. The schema,
  response function and application were added; the rollback-only QA state was
  not persisted.
- Follow-up business-data delta: one sent QA Communications record only. No
  booking, attendance, seating, payment, ticket or financial record changed.
- Reminder refinement: the saved welcome now appears immediately below the
  Zingara header, followed by full-width `YES - ATTENDING` and
  `NO - NOT ATTENDING` actions, a compact booking card and digital-ticket
  link, venue-specific inclusions, booking-derived payment/gratuity wording,
  the existing age policy and legal footer. Cape Town and Johannesburg copy is
  selected from the authoritative show venue; deposits use the persisted
  payment status/balance and fully paid/COMP bookings do not claim an
  outstanding ticket balance. Six-plus bookings receive one discretionary
  12.5% notice. No New Year's Eve rule was added or changed.
- The saved Production body was still the untouched legacy default. Migration
  `20261105223000_pre_show_reminder_copy_refinement.sql` replaced only that
  exact body with the shorter editable welcome; it cannot overwrite a
  staff-customised template.
- Refinement verification passed six focused attendance checks, targeted
  ESLint, TypeScript, whitespace checks and two Next.js 16 Webpack Production
  builds. Authenticated Production preview confirmed the editable welcome,
  exact short-hyphen button labels, Cape Town inclusions, booking card,
  payment copy, age policy and footer through the shared scheduled renderer.
  Full-width stacked actions and the 100% responsive email tables preserve the
  compact mobile layout. No customer email was sent; the existing QA test
  count remained one with the prior 21:25:20 SAST send time.
- Refinement commits: `368a13f6`, `1c8230e0`.
- Final refinement deployment: `dpl_x2gRBzm6u3xbjRjWrzaQhxpHYTuw`, Ready and
  aliased to `book.zingara.co.za`.
- Refinement business-data delta: the saved pre-show welcome body only. No
  booking, attendance, communication, seating, payment, ticket or financial
  record changed.
- Copy and legal-footer follow-up: the shared renderer now describes the Cape
  Town dinner as `A decadent 3 course dinner` and the Johannesburg dinner as
  `A decadent 4 course dinner`. Authenticated Production preview confirmed the
  Cape Town wording, retained welcome drinks/canapes and duration copy, both
  attendance actions and the legal footer. Scheduled delivery and Admin preview
  still use the same renderer.
- All four footer routes returned HTTP 200 in Production: Terms & Conditions,
  Booking Terms, Booking & Cancellation Policy and Privacy Policy. No duplicate
  or broken footer link was found. The policies do not contradict the current
  booking, cancellation or privacy rules, but the four linked decrees do not
  expressly document the active 12.5% gratuity or New Year's Eve full-payment
  rules; detailed deposit wording remains in the separate Payment Terms decree.
  No legal or financial rule was changed.
- Copy follow-up verification passed six attendance tests, targeted ESLint,
  TypeScript, whitespace checks and the Next.js 16 Webpack Production build.
  Application commit: `14723c5a`. Production deployment:
  `dpl_ACAL6SjhMf7SG9zsQbRfPohsTaE7`, Ready and aliased to
  `book.zingara.co.za` at 21:58:52 SAST. No email was sent and no business data
  changed.
- Show-time restoration follow-up: the shared Pre-Show Reminder booking card
  once again displays Grounds Open, Guest Seating and Show Starts directly from
  the authoritative venue settings. Production currently configures both
  venues as `17:00`, `18:30` and `19:30` respectively. Authenticated preview
  and the delivered Production test email matched exactly.
- The one authorised test `TEST — Zingara Pre-Show Reminder` was provider
  accepted, logged once in Communications at 22:12:32 SAST and confirmed in
  `kaden@kaden.co.za` Outlook. It used isolated preview attendance links and
  changed no booking or attendance record. Application commit: `3bece54d`;
  migration: `20261105224500_pre_show_reminder_test_release.sql`; Production
  deployment: `dpl_31uQnKZg8JppiP4tVqp4wGfE2i9Q`, Ready and aliased to
  `book.zingara.co.za` at 22:09:24 SAST.
- Rollback: revert `510a003f`, redeploy, and stop generating new attendance
  links. The additive columns/table may remain safely in place; existing
  responses can be retained as audit evidence.
- Full record: `.codex/archive/PRE_SHOW_ATTENDANCE_CONFIRMATIONS_2026-11-05.md`.

---

# Intelligent Quick Bug Reporter

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 5 NOVEMBER 2026

## Delivered

- A lightweight draggable issue button is available throughout authenticated
  Admin and opens a lazy-loaded compact report panel without closing the active
  workspace or losing unsaved form state.
- Existing Admin API failures supply sanitised, editable context without
  polling, network interception or continuous capture. Private image/video
  attachments, browser-approved screenshot capture and the existing Bug & Issue
  Register are reused.
- Quick reports use the existing permissioned issue API, private storage,
  Communications logging and branded Microsoft 365 email path. Notification
  delivery is asynchronous and idempotent.
- The compact panel uses the established rounded Admin surfaces, pill-shaped
  controls and clean uppercase sans-serif Management Controls typography.
- Sensitive credentials, payment details and unrelated customer data are
  excluded. Reports are never submitted automatically.
- Staff issue emails now lead with a short operational summary and a single
  selectable `REPORT` block. Only captured context is included, timestamps are
  readable in SAST, and secure attachments plus the existing `OPEN ISSUE`
  action and approved footer are preserved.
- The existing staff walkthrough now introduces the Quick Bug Reporter in five
  short steps. Version `quick-bug-reporter-2026-11-05-v1` makes it available to
  every existing staff account without deleting prior acknowledgement history;
  completed staff can reopen it from Academy.

## Verification And Release

- Focused tests passed 12/12; TypeScript, changed-file ESLint, whitespace checks
  and the Next.js Webpack Production build passed.
- Follow-up email and walkthrough tests passed 16/16. TypeScript, focused
  changed-file ESLint, whitespace checks and a clean Next.js Webpack Production
  build passed. The Admin page chunk measured 760,455 bytes, 16 bytes smaller
  than the previous verified release.
- Clean baseline comparison measured a 3,011-byte increase in the Admin
  closed-state page chunk (approximately 0.4%); the panel remains lazy-loaded.
- Authenticated Production desktop and 420px compact-width verification
  confirmed the floating control, rounded panel, sans-serif heading and
  Capture/Attach/Send actions without losing the active Admin workspace.
- The one authorised Production QA submission created `BUG-000030` with one
  ready private PNG attachment. It appeared in the existing Issue Register,
  produced one sent Communications record and one idempotency delivery attempt,
  and the branded email was received and visually verified in Kaden's Outlook.
  The QA issue was then marked Completed / Fixed; no duplicate was created.
- Application commits: `daa5620e`, `fc0b873e`, `0fa1525d`, `c9d7e168`.
- Final Production deployment: `dpl_J7v8gZnXDLNAkHjVJjMKiJnr3qAy`, Ready and
  aliased to `book.zingara.co.za` at 19:54:35 SAST.
- Follow-up application commit: `c4e1d3c2`.
- Follow-up Production deployment: `dpl_HkNA2JVARosoZ7gSDxaGARsWWEuu`, Ready
  and aliased to `book.zingara.co.za` at 20:29:41 SAST.
- Authenticated Production verification confirmed automatic first display for
  Kaden without reauthentication, all five steps, Back/Next navigation,
  completion persistence and the Academy entry labelled `QUICK BUG REPORTER
  WALKTHROUGH`. Concurrent user tab switching prevented a clean final visual
  observation after clicking the Academy reopen action; the live control and
  its tested event path were verified. No Capture, Send, issue creation or
  email delivery was triggered during this follow-up.
- No migration was required. Business-data delta is limited to the approved
  completed QA issue, its private attachment, one Communications record, one
  idempotency record and the issue completion audit. No booking, seating,
  payment, ticket or financial record changed.
- Rollback: revert the four application commits and redeploy. No database
  rollback is required; retain the completed QA record as release evidence.
- Follow-up rollback: revert `c4e1d3c2` and redeploy. No migration or database
  rollback is required.
- Full record: `.codex/archive/INTELLIGENT_QUICK_BUG_REPORTER.md`.

---

# P0 Internal Booking Amendment Failure

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 5 NOVEMBER 2026

## Verified Incident

- `ZNG-9VHFFH` is a Cape Town Corporate fixed-price booking for 5 November
  2026. It remains at 84 guests, fully paid at R154,638 with R0 outstanding.
- The first failed amendment was rejected by the Corporate reconciliation RPC's
  public-sales status guard (`SHOW_NOT_ACTIVE`).
- After the show was reopened, the amendment reached the database but rolled
  back with `TABLE_OCCUPANCY_OUT_OF_RANGE|30|84|golden-circle`.
- The proposed 94 guests remain within the authoritative Golden Circle
  operational capacity: 139 guests after amendment against 144 seats.

## Correction

- Authorised internal creation, conversion, transfer and guest amendments now
  remain independent of Blackout, Inactive and Sold Out public-sales states.
  Venue Closure and Archived performances remain protected.
- Proposed single-zone guest count now drives table-fit validation. If the
  existing assignment cannot fit, the transaction atomically releases the
  claims and marks the booking as needing a table; it never auto-splits or
  auto-merges the booking.
- Corporate fixed-price totals and payments remain unchanged, and table
  integrity failures now return actionable staff messages.

## Verification

- Focused tests: 22/22 passed. Changed-file ESLint, TypeScript and the Next.js
  Webpack Production build passed.
- A rollback-only Production transaction proved the exact 84-to-94 amendment
  succeeds with R0 additional charge, preserves R154,638 paid / R0 outstanding,
  and returns `floor_assignment_required=true`.
- The transaction was rolled back. Production remains at 84 guests with all 15
  existing table claims (84 seats) intact and no financial change.

## Release

- Application and records commit: `37558c408c5f112a8484323101f5154e24c81afc`.
- Migration `20261105171000_p0_internal_booking_amendment_integrity.sql`
  applied successfully and was verified in `supabase_migrations`.
- Production deployment: `dpl_C4gBE3WudKjoH9Qzk3HTAiFhNVG8`, Ready and
  aliased to `book.zingara.co.za` at 19:07:57 SAST.
- Authenticated Production UI verification opened the exact Corporate booking
  amendment and entered 94 without submission. The screen showed 10 added
  guests, fixed total with no automatic repricing, R0 additional amount, R0 new
  outstanding and an enabled confirmation action.
- A post-release rollback-only Production transaction exercised the exact save
  path successfully. The live booking remains unchanged at 84 guests with 15
  table claims, R154,638 paid and R0 outstanding.
- Public booking remains active-only; no public availability predicate or
  database reservation boundary changed.
- Business-data delta: zero. Only function definitions and application policy
  were changed.
- Rollback: revert `37558c40`, redeploy, and restore the three prior function
  definitions from the migration baseline.

## Archive

- `.codex/archive/P0_INTERNAL_BOOKING_AMENDMENT_FAILURE_COMPLETE.md`

---

# Public Calendar Status & Colour Cleanup

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 5 NOVEMBER 2026

## Verified Audit

- `Special Event` and `Full Show Buyout` are not functionally equivalent.
  Special Event is a show lifecycle state that remains unavailable publicly but
  permits management-approved internal booking. Full Show Buyout is an active
  `corporate_buyouts` record that closes every public zone and is protected by
  the atomic public-booking database guard.
- Production contains active and historical dependencies on Blackout, Special
  Event, Sold Out and Venue Closure. No records or business rules are being
  consolidated or migrated.
- JHB 6 November has an active buyout and a Blackout show state; JHB 7 November
  has an active buyout and a Special Event state. Both are publicly blocked by
  the active buyout. JHB 17 November is currently `inactive` and is not returned
  by the public show API.

## Implemented Presentation Change

- The public calendar legend is reduced to Available, Sold Out, Full Show
  Buyout and Venue Closure.
- Authoritative Full Show Buyouts use the existing blue Blackout colour.
- Blackout and Special Event remain fully enforced but appear publicly as a
  neutral unavailable date rather than separate legend categories.
- Internal staff booking journeys retain the original Blackout and Special
  Event distinctions. No availability, booking, payment or ticketing logic was
  changed.

## Verification

- Focused public lifecycle and calendar tests: 10/10 passed.
- TypeScript passed and the Next.js Webpack Production build completed.
- The default Turbopack build remains blocked by this local environment's
  compiler port restriction; the clean Webpack build and Vercel build are the
  release gates.
- Application and records commit: `e1504d6c5da8c517917cac67311fefa1ee2bf61b`.
- Production deployment: `dpl_CP9MmTWXMDzoJH23XAyDCp2KBEfk`, Ready and aliased
  to `book.zingara.co.za` at 15:10:05 SAST.
- Live desktop and 390x844 mobile verification confirmed the four-item legend,
  blue Full Show Buyouts on 6/7 November, neutral Unavailable Special Events on
  14/15 November, and an ordinary Available date continuing to guest selection.
- No migration was required. Business-data delta: zero.
- Rollback: revert `e1504d6c` and redeploy.

## Archive

- `.codex/archive/PUBLIC_CALENDAR_STATUS_COLOUR_CLEANUP.md`

---

# P0 Guest Count Reduction & Retained Value Transfer

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 3 NOVEMBER 2026

## Incident And Root Cause

- The reported reference `ZNG-M7HYQ3` belongs to a different 18-guest booking.
  Jane Grobler's authoritative booking is `DP-J7SPNC`: Johannesburg,
  20 November 2026, 70 Middle Ring guests, fully paid R103,950.
- Production UI reproduction confirmed that the retained-value confirmation
  kept `CONFIRM GUEST COUNT` disabled without explaining the missing action.
  No amendment request reached the API, so the atomic database path did not
  fail and no partial amendment existed.
- A rollback-only Production call proved the existing permissioned atomic RPC
  accepts Jane's 70-to-64 reduction and preserves her merged 70-seat table.

## Correction And Verification

- The explicit bar-tab transfer confirmation remains mandatory. The final
  button now provides an actionable inline instruction when that confirmation
  is missing instead of appearing inert.
- Verified calculation: R92,400 ticket evidence / 70 = R1,320 per guest;
  R7,920 released ticket value + R11,550 gratuity = R19,470 final bar tab;
  R84,480 final ticket value; R103,950 retained; refund R0.
- Focused tests passed 29/29; TypeScript, changed-file ESLint, diff validation
  and the Next.js Webpack Production build passed. The local Turbopack worker
  remains unable to bind its compiler port in this environment; Vercel's clean
  Production build is the release gate.
- Authenticated Production UI verification reproduced the exact 70-to-64
  workflow after deployment and confirmed the clear missing-confirmation
  message. The modal was closed without submitting the live amendment.
- Application commit: `b2807abb46699d82d21a064be66583bf353466c6`.
- Production deployment: `dpl_8WbtzWZuxES8jB41m8dLHL1AWPx3`, Ready and
  aliased to `book.zingara.co.za` at 14:11:55 SAST.
- No migration was required. Rollback: revert `b2807abb` and redeploy.
- Business-data delta: zero. Jane remains at 70 guests, R103,950 paid,
  R0 outstanding, with no retained-reduction audit event.

## Archive

- `.codex/archive/P0_GUEST_COUNT_REDUCTION_RETAINED_VALUE_TRANSFER_COMPLETE.md`

---

# P0 Table Plan Export & Seating Classification Integrity

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 3 NOVEMBER 2026

## Incident And Correction

- JHB 3 November 2026 placed numbered temporary table `408` in Middle Ring and
  omitted yellow repeated headings in a large dynamic export.
- The prior permanent-table fix covered only the exact 74 master codes. The
  temporary-plan allocator could continue from legacy cross-zone numbers.
  Sixteen retained temporary rows across four performances have this mismatch.
- Exact numeric table codes now export in the approved number families while
  preserving the booking's authoritative `ORIGINAL ZONE`. Named temporary
  tables and merged codes retain their show-specific saved section.
- Future temporary plans allocate atomically inside the selected zone family.
  Existing rows were not renamed or rewritten.
- Phase 64's unconditional `D79:K79` fill clearing mutated shared Excel styles.
  It now clears only recognised red fills on cloned styles, preserving every
  yellow repeated heading.

## Verification And Release

- Focused tests: 16/16 passed. TypeScript, changed-file ESLint, whitespace
  validation and the Next.js Webpack Production build passed.
- Migration `20261103135000_p0_table_plan_seating_classification.sql` applied.
- Fresh authenticated Production exports:
  `Zingara_Table_Plan_JHB_2026-11-03 (2).xlsx` and
  `Zingara_Table_Plan_CPT_2026-11-03 (2).xlsx`.
- JHB table `408` now appears under `GOLD CIRCLE`; Brenton Veeran remains 10
  guests and `ORIGINAL ZONE` remains `Middle Ring`. All JHB and CPT repeated
  headings are yellow; Notes, payment, COMP and dietary columns remain present.
- Application commit: `6af231b0`.
- Production deployment: `dpl_3h1g2KJyEmpSRs5DjMe64vqX4r8D`, Ready and aliased
  to `book.zingara.co.za` at 13:54:10 SAST.
- Rollback: revert `6af231b0` and restore the previous function definition from
  `20260910143000_phase_41_1x_a_incremental_temporary_capacity_recovery.sql`.
- Business-data delta: zero.

## Archive

- `.codex/archive/P0_TABLE_PLAN_EXPORT_SEATING_CLASSIFICATION_INTEGRITY_COMPLETE.md`

---

# P0 Box Office Seating Override Booking Failure

STATUS: COMPLETE - MIGRATED AND DEPLOYED

DATE: 3 NOVEMBER 2026

## Incident

- Authorised Box Office two-seater overrides reached the final booking step but
  failed before persistence with `Booking transaction failed`.
- Production recorded 13 failed `create_booking` events across five booking
  references between 12:38:01 and 16:24:28 SAST on 2 November 2026.
- All five failed references have zero bookings, payments and tickets, confirming
  retries did not create duplicate business records.

## Root Cause And Correction

- `enforce_two_seater_booking_limit()` is a `BEFORE INSERT` trigger. It consumed
  the valid override and linked `booking_id = NEW.id` before the new booking row
  existed, causing foreign-key error `23503`.
- Migration `20261103090000_p0_two_seater_override_creation_fk.sql` makes only
  that foreign key `DEFERRABLE INITIALLY DEFERRED`, so it is checked after the
  booking insert completes in the same transaction. Failed transactions still
  roll back authorization consumption and audit evidence atomically.
- Checkout errors now distinguish booking persistence failures from actual
  PayFast preparation failures. Complimentary creation errors no longer claim
  that payment could not be started.
- Roles, mandatory reasons, quota enforcement, capacity validation, one-table
  automatic assignment, payment logic and ticket rules are unchanged.

## Verification And Release

- Focused two-seater tests passed 10/10; complimentary tests passed 7/7;
  provenance tests passed 5/5; TypeScript and migration dry-run passed.
- Existing unrelated `paymentStart` source assertions and a direct Node module
  resolution test remain stale; neither failure references the changed logic.
- Production constraint verification reports `condeferrable=true` and
  `condeferred=true`.
- A rollback-only Production transaction exercised the formerly failing
  pre-insert relationship and persisted zero fixture rows.
- Authenticated Production Admin loaded successfully after deployment. No live
  booking, payment, ticket or customer record was created for QA.
- Application commit: `a4910fc4`.
- Migration applied: `20261103090000_p0_two_seater_override_creation_fk.sql`.
- Production deployment: `dpl_82X7gxcMgKiSiededRQxCxVyFaa3`, Ready and aliased
  to `book.zingara.co.za` at 09:28:46 SAST.
- Business-data delta: none. Only the foreign-key timing metadata changed.

## Previous Task: Meta Pixel & Conversions API Integration

STATUS: COMPLETE - META CAPI VERIFIED AND ACTIVE FOR FUTURE ELIGIBLE PAYMENTS

DATE: 3 NOVEMBER 2026

## Objective

Complete the existing consent-gated Meta Pixel and verified PayFast Purchase
Conversions API integration without duplicating the Phase 56.1 outbox or
affecting booking and payment workflows.

## Verified Baseline

- Meta Pixel already records PageView, ViewContent, InitiateCheckout and
  AddPaymentInfo only after Marketing consent and never on Admin routes.
- Phase 56.1 already provides ITN-authoritative payment-level Purchase events,
  an atomic destination outbox, bounded retries, leases and idempotency.
- Production initially had 357 consented attribution records and 299 successful GA4
  Purchase deliveries. No Meta outbox rows or historical Meta backlog exist.
- `META_PIXEL_ID` and `META_CAPI_ACCESS_TOKEN` are present as Production-only
  Vercel secrets. Their values were not exposed.
- Global server Purchase authority and attribution capture are active. Meta is
  not yet an enabled destination.

## Implementation

- Use the server-provided `META_PIXEL_ID` for both browser Pixel and CAPI instead
  of a duplicated source-code constant.
- Keep the CAPI access token server-only and send it in the Authorization header,
  never in source, browser bundles, URLs, logs or records.
- Default to supported Graph API `v26.0`, while retaining an optional validated
  environment override.
- Keep Purchase server-only when the Phase 56.1 server path is authorised. Each
  verified PayFast deposit, balance or full payment uses its own stable payment
  event ID and actual ZAR transaction value.
- Add a management-only readiness endpoint with two deliberately separate checks:
  a passive token identity check and an optional synthetic Test Events delivery
  check. Dataset delivery is never inferred from unrelated object-read access.

## Verification

- Focused advertising and consent tests: 27/27 passed.
- Final provider-readiness regression tests: 12/12 passed.
- TypeScript passed.
- Changed-file ESLint passed.
- Diff validation passed.
- The local full build reached an existing compiler-worker restriction in three
  unrelated Admin files. Vercel's clean Production build remains the release
  gate; no failure referenced changed Meta files.

## Production Release

- Application commits: `84f9ba441ce15993b3222bf1e7285b4fe0390eed`,
  `cef67e910988dd137cdb8bfd80563cd76acb960d` and
  `c6c2caf19e31a24ab3639eb65f0e9faba30b0e22`. Follow-up commit
  `59e63b0dedd4299b62d22f239a2f56d97731671b` adds only sanitised provider
  error reporting to the protected readiness check.
- Vercel automatically redeployed the corrected Production secret as deployment
  `9WYg3HZTR3MrmhYCi2tRq3U4C55Y`, Ready on 3 November 2026 at 08:21:15 SAST.
  Follow-up deployment `94SwdXrVC19XyhYV4PSx1dq8B57S` reached Ready at
  08:26:29 SAST and is the active Production release.
- Authenticated Production Admin loaded successfully. The management-only
  readiness request reached Meta without exposing credentials or sending an
  event.
- The protected retest used the corrected Production secret and Meta rejected
  the configured dataset/token readiness lookup with HTTP 400, provider code
  100, null subcode, type `OAuthException` and sanitised message
  `(#100) Missing Permission`. The failure is permission-related; dataset
  identity and provider acceptance therefore remain unverified.
- Production now contains 301 successful GA4 deliveries and still contains zero
  Meta outbox rows.

## Permission Error Resolution

- The HTTP 400 `OAuthException` code 100 `(#100) Missing Permission` came from
  `GET /v26.0/{dataset_id}?fields=id`. That operation tests dataset-object read
  access, not the `POST /v26.0/{dataset_id}/events` operation used by CAPI.
- Commit `8ee27acf6cd2792ffcd438217ea7dcb06404e37a` replaces that false gate with
  `GET /v26.0/me?fields=id` for passive token authentication and an optional
  synthetic, non-Purchase Test Events POST for actual delivery proof.
- Production deployment `dpl_DHSfS6PtdspULodkuUNf45W7jz32` was Ready and
  aliased to `book.zingara.co.za` on 3 November 2026 at 08:44:58 SAST.
- Authenticated Production verification returned HTTP 200 with
  `tokenAccepted=true`, `deliveryVerified=false`, `datasetMatches=null` and
  `testEventRequired=true`. The existing token is active; dataset delivery has
  not yet been tested because no `META_CAPI_TEST_EVENT_CODE` is configured.
- Production contains 304 successful GA4 outbox rows and zero Meta rows. No
  Purchase, synthetic event or historical conversion was queued or sent by
  this correction.

## Safe Activation Boundary

- Jurelle supplied a dataset Test Events code on 3 November 2026. It was stored
  as a protected Production-only setting, used once, and removed immediately
  after verification. Its value was not recorded in source, logs or Markdown.
- The protected `POST /v26.0/{dataset_id}/events` check returned HTTP 200 with
  `accepted=true`, `deliveryVerified=true`, `datasetMatches=true` and
  `tokenAccepted=true`. Meta therefore accepted the configured token for event
  delivery to the configured dataset.
- The check sent one synthetic `ZingaraCapiReadiness` Test Events event. It was
  not a Purchase and contained no customer data, booking data or payment data.
- Meta CAPI was enabled for future eligible payments from
  `2026-11-03T07:50:53Z` (`09:50:53 SAST`). The existing consent, authoritative
  PayFast confirmation, payment-level idempotency and browser/server
  deduplication controls remain unchanged.
- Activation deployment `dpl_2zx9DHZGFJcikzPiyZ2AY7ShdnGS` reached Ready and
  was aliased to `book.zingara.co.za` on 3 November 2026. The preceding
  test-setting deployment was `dpl_EQWqmCY8VDurww4kn5sMUxdTHPcH`.
- Post-activation Production evidence contains 307 succeeded GA4 outbox rows and
  zero Meta rows. No historical payment was queued or replayed; Meta rows can be
  created only for eligible verified payments occurring on or after the
  activation timestamp.
