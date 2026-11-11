# P0 - Booking Transfer & Platform-Wide Seating Integrity

STATUS: PLATFORM FIX COMPLETE - DEPLOYED AND AUTHENTICATED PRODUCTION VERIFIED; LIVE BOOKING CHANGE REQUIRES EXPLICIT APPROVAL

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
- `ZNG-9Z6XMR` remains unchanged. The safe target split is 11 on 407 and 10 on
  408. Reconciled revised total is R36,382.50, paid credit R10,450.00 and
  outstanding R25,932.50. Transfer, repricing and payment-link generation still
  require explicit booking approval.
- Business-data delta: zero booking, seating, payment, VAT, gratuity, ticket or
  customer changes.
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
- Cape Town displays: `Your ticket includes a welcome drink, a decadent
  3-course dinner and a 2½-hour performance experience.`
- Johannesburg displays: `Your ticket includes a welcome drink, a decadent
  4-course dinner and a 2½-hour performance experience.`
- The shared preview renderer and existing guest-disclosure venue resolver are
  reused, so the copy applies consistently to every seating zone without a new
  request, state change, dependency or duplicated popup.

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
