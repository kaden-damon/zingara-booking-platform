# Development Baseline Reconciliation

## 24 November 2026 Superseding Baseline

STATUS: DOCUMENTATION RECONCILED; PRODUCTION UNCHANGED; OPEN EVIDENCE RETAINED

This section supersedes the 30 October snapshot below, not its historical
evidence. No new development phase, application change or operational remediation
is authorised by this record. AGENTS.md contains the mandatory doctrine;
../README.md contains the recovery/release procedure; ../CURRENT_TASK.md is the
current handoff. This is the existing baseline record, not a second knowledge base.

### Evidence Scope And Limits

- Inventoried all113 existing archive records (12,053 lines before final newline
  counting), reviewed their status/section/supersession and outstanding-evidence
  signals, and compared relevant decision sections with current source, SQL,
  configuration and Git history across areas A-L below. Catalogue follows.
- This is repository/context reconciliation, not a fresh exhaustive transaction,
  signed-contract, infrastructure, penetration or full authenticated browser
  audit. Source presence is not proof every live branch was exercised. No mass
  customer query, booking submission, payment, seating change or email was used.
- Live alias/public settings freshly checked24 November2026,18:08 SAST. Migration
  ledger and two function definitions checked read-only. Historical audits and
  test/browser evidence are dated and reused, not represented as newly repeated.
- No secret values, private customer exports, complete business rows or private
  evidence payloads belong in committed governance records. Local-evidence paths
  are local provenance, not evidence accessible to every future checkout.

### Current Release And Working Baseline

| Item | Verified baseline |
| --- | --- |
| Checkout | authorised-booking-transfer-records/zingara-booking-platform; branch codex/authorised-booking-transfer |
| Remote Main and initial local HEAD | 706ed8cb07112d481a106af53c41265399fdc3b3 |
| Actual live alias | book.zingara.co.za -> dpl_ArQDU5uikxJ2VURTVyF7AoSx77Uk, READY, same706ed8c SHA |
| Application correction within that release | 29e9114ae2c8af271863d1e15eb8c80ff99fbbff;706ed8c changes Markdown only |
| Prior failed release | e369c48 /dpl_yFBFaFbznKjSTKCX89qJ7Jki5ALQ, never promoted; superseded by editor removal |
| Working tree at start | No modified/staged tracked files; private untracked local-evidence/ preserved |
| Performance evidence | Clean Vercel npm run build passed: raw1,309,326/1,320,000; gzip318,165/320,000; largest gzip169,055/170,000 bytes |
| Recent targeted evidence |16 seating-stabilisation tests, TypeScript/lint/Webpack passed; prior40 checkout/allocator tests and53 compatible assigned bookings on two shows reused |
| Current documentation work | Local scoped commit only; do not push Main because Markdown-only pushes also trigger Production |

No new suite/build was run for documentation-only changes. Do not claim a green
repository-wide suite: recorded baseline debt includes large Admin/Booking React
effect lint findings (counts vary by snapshot), one old Corporate transaction
call-spelling assertion and a reporting-label assertion. Local Turbopack PostCSS
worker port binding is environment-blocked; Webpack builds work, but the current
budget parser targets the Turbopack manifest. A Webpack build is NOT independent
proof that the Production bundle budget passed. The clean Vercel build above is.

### Schema And Configuration Reconciliation

- Schema authority is the ordered migration chain plus actual installed function,
  RLS/index/configuration evidence, not the first schema migration alone. Core
  entities: customers/companies, shows, bookings, payments/attempts/ITN receipts,
  booking entitlements/table claims, tickets/validations, communications,
  lifecycle/audit, waitlist, corporate requests/buyouts, venue settings, staff/roles,
  accounting documents/outbox, workflow configuration and immutable layout data.
- Ledger latest recorded version20261124153000. The ledger reports local-only
  20261112100000_p0_booking_payment_link_integrity.sql, despite the November12
  archive describing application. Both wrapper functions DO exist remotely:
  reconcile_unpaid_native_guest_reduction_atomic hash190fadc7a40336d50adbeb9f8ba76434;
  reconcile_booking_financials_and_links_atomic hashb970420bdc8d8f0c1d7368927884ffac.
  Presence is not full definition parity. Do NOT blindly db push, rerun migration,
  drop functions or repair the ledger. Next authorised migration task must compare
  installed definitions/dependencies and establish the recording discrepancy first.
- One repeated CLI ledger read failed temporary login authentication; a subsequent
  explicit READ ONLY schema_migrations query succeeded. No authentication settings
  changed. Do not infer a Production application outage from that CLI failure.
- Public live settings: both venues PB6-8; GC/MR/RB1-19 Standard ranges; public
  GC120/MR125/PB138/RB32. No setting, migration or business row changed here.
- Private runtime feature gates, current Xero tenant health/queue, staff roster,
  notification-route activation and supplier state were NOT comprehensively
  re-read. Their latest dated archive evidence is identified below; it is not an
  indefinitely current live-configuration guarantee.

### A. Public Booking

- Existing path: src/app/book/page.tsx -> src/app/api/bookings/route.ts; helpers
  bookingCreateValidation.ts, bookingSeatingAvailability.ts, publicShowSales.ts,
  zoneSalesAvailability.ts, bookingDeadlines.ts and showSpecificPricing.ts in
  src/lib. Public sales require eligible active shows, venue/date/cutoff/zone
  state and absence of protected active Buyout. Internal eligibility is separate.
- Standard booking range is1-19;20+ uses Corporate enquiry. Approved staff/imported
  Corporate exceptions can have fewer guests: do not reclassify by count alone.
  PB new Standard range6-8. Customer eligibility is not single-table availability.
- Prices, promos, deposit/full payment and performance-specific full-only policies
  resolve server-side from authorised configuration and persisted provenance.
  Existing Standard deposit basis is R550 per guest, capped by obligation; do not
  substitute a percentage/default for a historical persisted arrangement.
  One R10 PayFast checkout fee is distinct from booking-applied money and legacy
  embedded fee interpretation; see bookingFees.ts and payfast/transactionFee.ts.
- New Standard gratuity is payable at venue; Corporate direct pricing retains its
  own basis. Shared pricing helper defaults must not be mistaken for call-site
  policy. Age policy: no under13s;13-18 parental guidance, versioned acknowledgement.
- Restricted Kosher/Strictly Halaal additions/increases require72 hours before the
  show. Existing quantities are preserved after cutoff; notes/Buyout requirements
  are not fabricated supplier orders. Meal inclusion differs by venue and agreement.
- Existing optional attendingGuestName keeps purchaser CRM/payment/contact identity
  separate. No recipient customer creation or automatic historical name inference.
- Source records: CUSTOMER_PROFILE_INTEGRITY_GUEST_BOOKING_2026-11-24.md;
  P0_NYE_FULL_PAYMENT_ENFORCEMENT_COMPLETE.md; PHASE_64_DIETARY_ADDONS_TABLE_PLAN_CORRECTIONS.md;
  PUBLIC_CALENDAR_STATUS_COLOUR_CLEANUP.md; GUEST_COMMUNICATION_DISCLOSURE_INTEGRITY_2026-11-05.md.
- Secret Guest List/Waitlist reuse existing feature controls and enquiry routes,
  not a booking/payment promise. Current activation must be checked when relevant;
  a dated FEATURE OFF heading and later enabled acknowledgement are different gates.

### B. Admin And Box Office

- src/app/admin/page.tsx owns existing workspace state. Reuse Booking Details,
  reconciliation/guest-count/metadata modals, bookingLocks.ts, show locks and
  existing src/app/api/admin/bookings routes before adding controls.
- Exclusive editing does not replace revision/snapshot/atomic SQL checks. BUG34
  fixed equivalent lifecycle timestamp hydration duplicates, not concurrency
  protection. Diagnostics remain rejection-only. Never auto-retry an amendment.
- Existing guest increases/reductions, transfer, cancellation and reinstatement
  preserve entitlement, payment, capacity and audit boundaries. Sold Out/Inactive/
  Blackout public closure is not automatically an internal booking prohibition;
  active Buyout/Special Event approval and Venue Closure/Archived restrictions
  remain. See internalShowBookingPolicy.ts and later internal-amendment releases.
- Assignment Queue is existing manual resolution, not a new recovery workflow.
  Paid archived-checkout recovery is narrowly authorised/audited, with valid
  tickets and unassigned guests visible even at capacity; not general overselling.
- Timeline is staff-accessible with server venue/redaction controls and bounded
  pages25. Current names resolve recorded identity; unknown actors are not guessed.
  Africa/Johannesburg display uses date/minute, no seconds/SAST label; underlying
  timestamps/evidence remain unchanged. See bookingActivityTimeline.ts and its API.
- Payment shortcuts reuse paymentControls.ts and the existing target panel;
  cancelled/archived/terminal/paid/COMP states cannot expose misleading payment
  actions. Navigation carries authoritative show ID/date/venue, not stale filters.
- Shows & Availability reuses showBulkAvailability.ts and existing individual
  status logic: Manage toggles bounded visible selection, confirmation, eligible
  actions and partial-failure reporting. No silent cross-filter selection.
- Sources: BUG_000034_BOOKING_STATUS_SAVE_2026-11-19.md; PHASE_53_BOOKING_ACTIVITY_TIMELINE_COMPLETE.md;
  PHASE_65_BALANCE_PAYMENT_RECONCILIATION_TABLE_PLAN_INTEGRITY.md; BULK_SHOW_AVAILABILITY_CONTROL_2026-11-23.md;
  PHASE_4_FLOOR_ASSIGNMENT_IMPROVEMENTS_2026-11-06.md; YOLANDI_RESTORATION_THERESA_STATUS_2026-11-23.md.

### C. Seating And Capacity

| Zone | Approved permanent tables | Permanent public seats | Table catalogue bounds |
| --- | ---: | ---: | --- |
| Golden Circle |23|120|Minimum2; per-table maxima2,4,6,8,10; exact code map in physicalTables.ts |
| Middle Ring |24|125|Minimum2; maxima2,3,4,5,6,7,8,10; table400 is Middle Ring |
| Private Booths |23|138|Codes1-12,14-24; historic baseline6/min4, distinct approved new booking/fit6-8 |
| Royal Balcony |4|32|800/801/900/901, min2/max8 |
| Both venues, each show |74|415|Not a uniform table size and not a415-seat physical override |

- Exact authority: src/lib/physicalTables.ts, seatingBookingLimits.ts, floorAllocator.ts,
  capacityModel.ts, floorInventory.ts, operationalZoneCapacity.ts; approved layout
  migrations20261028120000 and current booth migration20261124153000. Do not copy
  old src/zingara-logic.md prices, Elevated Stage inventory or booth/balcony limits.
- getTableBookingMaximum returns8 only for an approved ordinary configured
  six-baseline physical booth. Custom/temporary/merged/unconfigured/override rows
  retain their explicit limits. This does NOT change23x6=138 public baseline.
- Public booking-size range1-19 is NOT table capacity. Physical seat inventory,
  zone entitlements, public remaining, operational temporary capacity, merged
  parents/children and unassigned confirmed guests must be reported separately.
- Automatic allocation/recommendation/planning must never split a booking across
  separate tables or create an automatic merge. A pre-existing valid merged parent
  is one operational unit. No suitable single table -> existing Assignment Queue;
  authorised manual arrangements and historical splits remain protected.
- Later Phase68 follow-up supersedes its initial proximity/multi-table fallback.
  Existing70%/approval/hybrid assignment mechanisms are not new cancellation or
  sales-capacity rules; recover their current configuration before changing them.
- Temporary tables may add approved operational seating, not permanent public
  capacity. Existing legacy adjustment records are preserved evidence, not new
  capacity to invent or reuse. Do not displace or silently reseat existing guests.
- Zone-wide Seating Limits UI and API editor are REMOVED by29e9114. Read settings,
  protected general saves and service-only migration definitions remain. Original
  individual Table seats/Set table seats/Save table seats stay available under
  existing Floor controls, exact active Kaden/Fatima identity, permission, venue,
  revision and assigned-guest validation. Do not reintroduce the removed editor.
- Current read-only stability sample covered two upcoming shows/all8 zones,
  53 compatible assigned bookings, zero orphaned claims. Ten unconfigured rows
  were unclaimed and last updated August25; not newly created seating regressions.
  This is not proof every historical row or staff write was freshly tested.
- Sources: PHASE_54_1_AUTHORITATIVE_SEATING_CONFIGURATION_COMPLETE.md; Phase54.2-54.13,
  Phase55 handovers; PHASE_68_FLOOR_CAPACITY_SEATING_INTEGRITY.md and the latest
  PHASE_4_FLOOR_ASSIGNMENT_IMPROVEMENTS_2026-11-06.md stabilisation follow-up.

### D. Financial Integrity And Cancellation

- Use pricing.ts, currencyMath.ts, corporateFinancialReconciliation.ts,
  corporateBuyoutAgreement.ts, bookingProvenance.ts, guestReductionPolicy.ts,
  guestReductionServer.ts and authoritative atomic reconciliation functions.
  Persisted quote/agreement/source components govern historical pricing; today's
  price, imported total, paid aggregate and payment-row sum are not interchangeable.
- Standard is pay-at-venue gratuity now; older online-collected arrangements remain
  historical evidence. Corporate12.5% uses the booking-specific approved basis,
  discount and applicable add-on treatment. Fixed Buyouts can have separately
  agreed components/bases: never calculate gratuity from a fabricated net total.
- VAT15% where applicable uses authorised inclusive/exclusive line mappings;
  preserve exact-cent amounts, discounts, deposits, paid/COMP allocations,
  add-ons/services, booking fees and immutable receipts. Deposit instalments are
  payments against full obligations, not the price of an added guest (BUG36).
- Standard cutoff5 days; Corporate7 days, from scheduled show start in SAST;
  at/before cutoff is eligible period. Eligible refunds remain subject to actual
  receipts, prior refunds, provider readiness and authorisation, not automatic cash.
- Late Standard guest reduction forfeits applicable R550 deposit per cancelled
  guest; persisted deposit basis governs whole-booking/historical refund decisions.
  Late Corporate cancels ticket value AND associated prepaid cancelled-guest
  gratuity. Remaining gratuity stays allocated; no double charge. No forfeited
  amount can become refund/bar credit. Buyouts use separate contracts/fixed price.
- Before cutoff, existing authorised eligible ticket-value bar transfer remains;
  prepaid gratuity never automatically transfers to bar. Earlier Corporate manual
  gratuity-resolution instruction is superseded for late reductions; unresolved
  historical Standard gratuity still requires authorised review, not invention.
- BUG37: existing Edit Guest Count conditionally collects a verified invoice split
  only when the Corporate basis is missing. No parallel module. Blank components,
  source reference and reviewed confirmation must reconcile exactly; API/SQL
  enforce permissions, locks, versions, cutoffs and unchanged payment evidence.
  Michael's booking was not amended for QA. Message-only release was not a fix.
- Operational bar spending limit is not prepaid credit, receipt or proof of POS
  consumption. Refund, forfeiture, eligible credit and remaining gratuity must
  reconcile across Booking Details, Table Plans, Function Briefs and accounting.
- Sources: CANCELLATION_POLICY_WORKFLOW_UPDATE_2026-11-23.md (last BUG37 sections),
  CORPORATE_GRATUITY_TERMS_AUDIT_2026-11-23.md; GRATUITY_TRANSITION_FINANCIAL_INTEGRITY_2026-11-05.md;
  BUG_000035_000036_AND_REVIEW_VISIBILITY_2026-11-19.md; VODACOM_BUYOUT_FINANCIAL_WORKFLOW_REVIEW_2026-11-19.md.
- Vodacom completed-authorised section supersedes early JHB scope/old workbook/
  blocked totals: the three CPT buyouts reconciled to746029.25,785487.50,777437.50
  (combined2308954.25), at that snapshot R0 paid. Requirements/provisional bar
  are not supplier confirmations/consumed spend. Do not replay those mutations.

### E. PayFast And Reliability

- Paths: src/lib/payfast/*, payment-links/*, workflows/publicPaymentHolds.ts;
  src/app/api/payfast/itn/route.ts, payment-link checkout and atomic prepare/confirm
  functions. Validate signatures/source/server confirmation/merchant/amount;
  durable receipts, exact checkout attempts/provider IDs and uniqueness/idempotency
  prevent incorrect pending-row reuse and duplicate allocation (Phase65).
- Public payment hold is30 minutes. Corporate follow-up deadlines are separate.
  Cleanup can run from availability GET; never assume a GET is audit-safe.
  Preserve rate limits, transaction rollback, receipt logs and late-paid recovery.
- Provider completion, first provider send, ingress receipt, durable receipt,
  processing, allocation, booking lifecycle, ticket issue and email handoff are
  distinct timestamps/states. Browser approval/return is not successful payment.
- Latest full-history audit:5360 rows;5284 successful provider IDs matched exactly;
  16 measured delays >5min among3315 durable COMPLETE receipts;1969 older latency
  unknown. Thirteen timely-paid expiries were later confirmed; delayed cases had
  usable individual OR group entitlements. These are23Nov snapshots, not live totals.
- Yolandi payment was on time; recognition gap preceded durable receipt. First
  notification dispatch/retry/ingress evidence remains absent. Do not blame PayFast,
  bank or MobiCred without transaction-specific evidence; no speculative hold change.
- Reversals/refund attempts are not interchangeable;22 provider reversals lack
  structured reconciliation in the dated audit, gross119125/booking118905.
  Escalation/Accounts review remains; do not retry refunds or duplicate recovery.
- Source: PAYFAST_PAYMENT_FAILURE_INVESTIGATION_2026-11-23.md (full-history follow-up),
  PHASE_65_BALANCE_PAYMENT_RECONCILIATION_TABLE_PLAN_INTEGRITY.md and
  YOLANDI_RESTORATION_THERESA_STATUS_2026-11-23.md (superseding provider evidence).

### F. CRM And Exports

- src/lib/bookingCustomerIdentity.ts, bookingGuestName.ts, supabase/customers.ts
  and Admin customers API: exact email first; mobile matching requires unique
  compatible identity/no conflicting email; no name-only merge. Matched booking
  creation must not overwrite canonical profile/contact/preferences. Explicit CRM
  corrections/merges remain permissioned/audited; shared phone does not prove dupes.
- Purchaser vs attendee uses existing booking JSON; lead ticket/Wallet/arrivals/
  Table Plan use attendee when applicable, communication/payment retain purchaser.
  Preserve per-guest names, QR identity, history, company associations and notes.
- Dated audit:388 booking-name differences across291 profiles and10 shared-phone
  groups are REVIEW CANDIDATES, not all corruption. Zero duplicate normalised-email
  groups at that snapshot. No automatic backfill/merge/delete authorised.
- Customers Export is the existing Customers panel/POST action, not a new export
  endpoint/module. customerExport.ts + supabase/customerExportServer.ts + existing
  CSV/ExcelJS exports: selectable fields/venues/show-date/type/search/archive,
  All Matching vs selected IDs,500-row batches,20000-customer ceiling, fail-closed
  incomplete batches, one row per unmerged customer. Load only on requested export.
- Export actual payment entries, accepted refunds/net, recorded paid, unitemised
  paid, non-cancelled value and outstanding separately. These are not synonyms.
  Role+venue+field restrictions apply; extra CRM/communications permission for
  sensitive fields/marketing. Marketing normalised-email dedup excludes any group
  lacking verified consent; current CRM source has no authoritative consent ledger,
  so marketing exports fail closed rather than infer consent from a preference.
- Booking/cookie consent and transactional email are not email-marketing consent.
  External campaigns/unsubscribe systems are outside this platform. No automatic
  enrolment/export/integration or legal exception is established by this review.
- Sources: CUSTOMER_PROFILE_INTEGRITY_GUEST_BOOKING_2026-11-24.md and
  GUEST_EMAIL_MARKETING_CONSENT_AUDIT_2026-11-23.md (latest export follow-ups).

### G. Tickets And Arrivals

- Existing src/app/api/tickets, api/admin/tickets, ticket validation, attendance,
  src/lib/guestTicketDisplay.ts, ticketPdfServer.ts, appleWalletPass.ts and
  appleWalletSync.ts own issue, QR/Wallet/PDF, entitlement and arrivals behaviour.
  Reuse lifecycle operations; never create another active ticket set to fix display.
- Individual/group tickets require entitlement-aware counting, not one-row-per-
  guest assumptions. Cancellation/transfer/reinstatement preserve identities,
  token/security validation, audit and no duplicate active admission entitlement.
- Paid recovery may be confirmed with valid tickets but await table assignment;
  table absence does not imply nonpayment. Scanner permissions, cancelled-ticket
  checks, duplicate-scan policy and show/venue validation remain authoritative.
- Sources: ZNG_6MGLG2_TICKET_RESTORATION_2026-11-23.md;
  YOLANDI_RESTORATION_THERESA_STATUS_2026-11-23.md; booking-transfer archives;
  ATTENDANCE_MANAGEMENT_NOTIFICATION_INTEGRITY_2026-11-05.md.

### H. Communications

- Reuse src/lib/email/*, supabase/communications.ts, communicationTemplates.ts,
  workflow configuration, staff preferences and existing resend/log controls.
  Scheduled pre-show/attendance and review invitations have separate renderers,
  token/persistence and idempotency; cron entry is not proof of activation/delivery.
- vercel.json schedules pre-show every15min and review workflow at7/22/37/52min.
  Signed scheduled calls/configuration/activation boundaries and staff/venue
  TO/CC routing remain enforced. Missing subscription defaults are existing policy,
  not a new consent assumption. Staff preference != customer marketing consent.
- Confirmation/payment emails key to successful authoritative events; provider
  SMTP handoff is not inbox delivery. Failed/sending records require per-message
  outcome reconciliation before authorised resend, especially after provider outage.
- Secret Guest List acknowledgement and staff operational routes differ from
  feature exposure and regular waitlist communications. No replay of old enquiries
  on activation. Guest attendance decline is not automatic booking cancellation.
- Sources: PHASE_52*; PRE_SHOW_ATTENDANCE_CONFIRMATIONS_2026-11-05.md;
  PHASE_67_SECRET_GUEST_LIST.md; STAFF_EMAILS_RECIPIENT_CORRECTION_UX_CLEANUP.md;
  P0_MICROSOFT_365_OUTAGE_IMPACT_AUDIT_2026-11-13.md.

### I. Reporting, Reviews And Accounting

- Source of export truth: src/lib/exports/tablePlan.ts + tablePlanFinance.ts and
  src/templates/Zingara_Table_Plan_Master_Template.xlsx, not old column letters.
  Final generator swaps11/12: K PAYMENT SUMMARY, L PAYMENT BREAKDOWN. E company,
  F booker, G contact, H reference, I original zone, J notes, M original price;
  N:AA financial headers, V Halaal/W Kosher meal fields. AB/AC unclassified evidence
  columns hidden. Do not confuse meal charge vs quantity; use current mapper.
- Preserve formulas, per-zone totals, styles, merged ranges, original evidence,
  disabled/import classifications, no double-counting across table rows, notes and
  dietary requirements vs actual orders. Existing generated-workbook tests are
  evidence; no real customer export generated for this documentation task.
- Function Brief uses corporateBookingOperations*, corporateFunctionBriefFinancials.ts
  and agreement evidence. Full obligation/deposit/paid/balance/gratuity/bar/add-ons
  remain separate; Buyout requirement lines cannot imply supplier fulfilment.
- Reviews have explicit selection/non-interactive unselected details, safe action
  identity, pagination First/Previous/Next/Last/direct Enter and filter reset.
  needs_review != not_published. The historical zero queue was supported by actual
  moderation; specific allegedly missing review still needs identifying evidence.
  Current staff display-name resolution is not a rewrite of historical replies.
- Xero source: src/lib/xero/*, docs/xero-foundation.md and Phase50.4I/J,58.0/58.1.
  Zingara owns operational entitlement/payment evidence; Xero owns issued numbers,
  tax/ledger/accounting allocations. Local drafts != issued invoices. Controlled
  future invoicing was activated; old disconnected-foundation status is superseded.
  Tristan/Rachelle restrictions, approved mappings, immutable quote acceptance,
  activation date, verified receipts and exact-cent guards remain. Bulk posting
  and credit-note posting await their separate activation/Accounts decisions;
  don't infer they're active from ordinary invoice sync. Live health not retested.

### J. Security And Permissions

- src/lib/supabase/serverAdmin.ts verifies bearer auth, active staff identity,
  roles and venue; protected APIs use server service clients. Staff-profile UUID
  differs from auth-user UUID. staffProfileId is explicit; do not compare them.
- Floor capacity editing: active Kaden/Fatima only, existing tables:manage and
  venue scope. Refunds: existing finance permission plus approved identity list
  (Jacques, Kaden, Rachelle, Tristan, Wagheeda) in refundAuthorization.ts. Xero
  creation/live/bulk/credit actions have their own progressively narrower gates.
  A visible UI, role label or platform-owner binding alone cannot replace them.
- Preserve RLS/grants/service-only functions, lock/version/owner binding, audit
  attribution, session cutoff, sensitive-field redaction and private no-store
  responses. Never expose keys, tokens, contacts or complete logs in governance.
- Current auth privileges/identity must be checked for the affected workflow,
  not assumed from an old staff list. Staff2FA is deferred, not implemented here.

### K. Design And Existing Staff Guidance

- Reuse AdminCollapsibleSection, ZingaraDatePicker, AdminSearchInput, PhoneInput,
  existing modal/dialog/notice/loading conventions and GuidedTraining/quick-start
  walkthrough registration before adding visual controls. Guidance versions and
  acknowledgements are operational state; don't silently reset them.
- Gold/black, pill buttons/search/dropdowns, circular gold customer/export
  checks, short staff copy, responsive spacing and hover/pressed/loading/focus
  feedback are mandatory. Native semantics and accessible touch targets remain.
- Production layout currently loads Geist/Geist Mono plus local EB Garamond;
  isolated Frontend2.0's approved Roboto/white-theme decisions are NOT authority
  to globally replace current Production fonts/theme. No Frontend2.0 inspection,
  code import, deployment or live connection is authorised by this exercise.
- Academy is existing isolated training, not the unfinished Frontend2.0. Its
  early local-only heading is superseded by50.14A/B released staff progress and
  UX records. Training completion never creates real booking/payment evidence.

### L. Architecture And Performance

- Next16.3.4 App Router, React19.2.4/React Compiler, TypeScript, Tailwind4;
  authenticated API/server Supabase service boundary; atomic Postgres functions
  for consequential mutations. src/lib/zingaraDemo.ts remains shared domain/types/
  serialisation/defaults: its name is NOT authority to replace real server data.
- Existing Admin shell owns sessions/drafts; next/dynamic loads existing heavy
  workspaces. Backend paging/batching, report locks, settings cache and shared
  visibility-aware polling control cost. Active lock heartbeats must keep working
  while non-critical hidden-tab polling pauses. Do not add duplicate refresh loops.
- Protect indexed exact IDs/relationships, query bounds and function call paths.
  Migration ledger alignment != definition/index parity. Review relevant current
  SQL and later replacements before changing an old function or applying db push.
- Performance gate lives in scripts/check-admin-performance-budget.mjs; retain
  raw1320000/gzip320000/largest170000. Headroom is small; global Admin imports can
  break an unrelated release even when tests pass. Never relax budgets to ship.
- Main/Git-triggered Vercel is current release path. Actual alias+SHA+READY and
  safe functional evidence are required; failed builds leave prior live code.
  Documentation-only commits must stay local absent an authorised non-deploying
  destination, then join the next approved application release. Do not change CI
  or deploy configuration merely to publish this reconciliation.
- Sources: PHASE_51_1* through PHASE_51_6*; P0_SUPABASE_DISK_IO_DATABASE_PERFORMANCE_2026-11-09.md;
  P0_VERCEL_DURATION_AUTHENTICATION_INCIDENT_2026-11-09.md; current package/config/budget.

### Supersession And Contradiction Register

| Earlier claim/source | Current interpretation / evidence |
| --- | --- |
| October30 baseline says no Phase62, auto-assignment dormant, conversion delivery disabled | Historical only; later62-68 and54 follow-ups/Meta activation supersede; do not reset flags |
| src/zingara-logic.md static Elevated Stage/prices/six-only booths/balcony16 | Outdated concept notes, not current approved74-table415 layout/settings |
| SUPABASE_MIGRATION_PROGRESS.md/MIGRATION_ORDER.md temporary anon writes/local-first seeding | Staged June migration history; later server/RLS boundaries prevail; do not re-enable browser writes |
| Root README generic Next scaffold/app path/font/deploy hints | Onboarding boilerplate, not Zingara operational/release authority; use this map/AGENTS |
| Initial Phase68 automatic multi-table proximity | Strict single-table follow-up81a9b1e supersedes; historical splits retained |
| Phase60 blocks Blackout | Later internal-amendment policy permits protected staff handling; closure/archive remain blocked |
| Old reduction transfers all original gratuity to bar | Current policy separates remaining/cancelled gratuity and forbids forfeited credit; historical authorised exceptions preserved |
| Corporate cancelled prepaid gratuity manual resolution | Superseded for late Corporate by confirmed forfeiture; not blanket authority over old Standard/Buyout records |
| BUG37 clearer wording closes incident | False; actual conditional split validation in existing formb1cead69 meets fixture-based workflow criterion |
| Booking-size UI pending/editor still active | Superseded by29e9114 removal; individual table controls and PB6-8 retained |
| Xero foundation says disconnected/paused |50.4I/J controlled invoice activation supersedes; bulk/credit remain separately gated |
| Phase56.1 initial disabled / failed dataset-read check | Later successful token/event delivery+activation supersedes; no perpetual activation guarantee from archive |
| Yolandi paid after expiry | Provider evidence establishes payment before expiry; delayed recognition, first-send/ingress cause unresolved |
| 0 Needs Review means missing/deleted reviews | Historical moderation/audit supported0; specific missing review needs identity, do not recreate or republish |
| Migration20261112100000 documented applied | Ledger missing; both wrappers exist; compare before any application/ledger correction |

### Outstanding Actions And Evidence Gaps

| Priority / owner | Outstanding item; authority boundary |
| --- | --- |
| Accounts, urgent dated future exposure | Cancellation audit:7 recorded review allocations R93280 (R12870 future/R80410 past) +2 unverified note-only claims R2800; R96080 envelope is NOT proven loss. Check authority/POS/consumption; preserve legitimate exceptions |
| Accounts | Full PayFast audit22 structured reversal gaps (R119125 gross),14 future intentional cancellations without located settlement evidence, failed-refund exceptions. No automatic refunds/repricing/reinstatement |
| Payments/provider liaison |16 delayed notification IDs; obtain PayFast dispatch/retry/HTTP and ingress evidence. Ownership unknown. Historical receipt gaps cannot prove missing money |
| Box Office | Paid recovery/legacy split assignments, unassigned queues,10 unclaimed unconfigured rows and dated layout exceptions; current size/outcome not freshly re-audited. Do not repeat recovery or silently seat |
| CRM authorised staff | Marisa attendee spelling/structured-field follow-up;291-profile/388-snapshot candidates and10 shared-phone groups need individual evidence, not auto-merge |
| Engineering, next migration task | Resolve November12 ledger/function discrepancy through definition comparison; no migration or ledger repair authorised here |
| Accounts / Xero owners | Bulk/credit-note posting decisions/activation; current tenant/queue/gate health not freshly tested. No accounting writes or document issues during QA |
| Operations/communications | Prior Microsoft/SMTP failures/stuck entries need per-message final evidence before resend; provider handoff != inbox delivery |
| Reviews owner | Specific missing historical review still needs guest/reference; old verified0 pending not today's universal assertion |
| Deferred | Staff2FA, marketing consent ledger/authorised external handoff, unfinished isolated Frontend2.0 and private screenshot handoff; no implementation authority |

The named archives retain exact booking references, dates, components, approvals
and private evidence locations. Do not repeat entire audits or turn this list into
automatic remediation. No fresh customer/contract/POS/Xero statement review was
performed here. No newly discovered application defect was corrected.

### Archive Catalogue

Catalogue of all113 pre-existing records reviewed for context/status. Recorded
headings/statuses are historical labels, NOT current activation or resolution
claims. Use the source map and each record's later dated follow-ups. Numbered
phases50.14/51-56/58-68, the November1-5 workstream and P0 incident fixes are
different historical sequences, not permission to invent a new phase.

- [ATTENDANCE_MANAGEMENT_NOTIFICATION_INTEGRITY_2026-11-05.md](ATTENDANCE_MANAGEMENT_NOTIFICATION_INTEGRITY_2026-11-05.md): COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION
- [BUG_000034_BOOKING_STATUS_SAVE_2026-11-19.md](BUG_000034_BOOKING_STATUS_SAVE_2026-11-19.md): Released; Production read-only verification passed.
- [BUG_000035_000036_AND_REVIEW_VISIBILITY_2026-11-19.md](BUG_000035_000036_AND_REVIEW_VISIBILITY_2026-11-19.md): CONFIRMED CORRECTIONS RELEASED / PRODUCTION VERIFIED; FINANCIAL AND SPECIFIC-REVIEW FOLLOW-UP SEPARATE
- [BULK_SHOW_AVAILABILITY_CONTROL_2026-11-23.md](BULK_SHOW_AVAILABILITY_CONTROL_2026-11-23.md): RELEASED TO PRODUCTION / READY; TARGETED BEHAVIOUR AND SAFE LIVE CHECKS VERIFIED
- [CANCELLATION_POLICY_WORKFLOW_UPDATE_2026-11-23.md](CANCELLATION_POLICY_WORKFLOW_UPDATE_2026-11-23.md): released to Production / READY; non-mutating live verification complete.
- [CANCELLATION_REDUCTION_BAR_CREDIT_AUDIT_2026-11-23.md](CANCELLATION_REDUCTION_BAR_CREDIT_AUDIT_2026-11-23.md): See dated release sections
- [CORPORATE_BUYOUT_PRICING_CORRECTIONS_2026-11-06.md](CORPORATE_BUYOUT_PRICING_CORRECTIONS_2026-11-06.md): COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION
- [CORPORATE_GRATUITY_TERMS_AUDIT_2026-11-23.md](CORPORATE_GRATUITY_TERMS_AUDIT_2026-11-23.md): See dated release sections
- [CUSTOMER_PROFILE_INTEGRITY_GUEST_BOOKING_2026-11-24.md](CUSTOMER_PROFILE_INTEGRITY_GUEST_BOOKING_2026-11-24.md): released / READY; 120 targeted tests and Webpack build pass.
- [DEVELOPMENT_BASELINE_RECONCILIATION_2026-10-30.md](DEVELOPMENT_BASELINE_RECONCILIATION_2026-10-30.md): RECONCILED - NO ACTIVE DEVELOPMENT PHASE
- [GRATUITY_TRANSITION_FINANCIAL_INTEGRITY_2026-11-05.md](GRATUITY_TRANSITION_FINANCIAL_INTEGRITY_2026-11-05.md): COMPLETE - DEPLOYED AND ACTIVATED IN PRODUCTION
- [GUEST_COMMUNICATION_DISCLOSURE_INTEGRITY_2026-11-05.md](GUEST_COMMUNICATION_DISCLOSURE_INTEGRITY_2026-11-05.md): COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION
- [GUEST_EMAIL_MARKETING_CONSENT_AUDIT_2026-11-23.md](GUEST_EMAIL_MARKETING_CONSENT_AUDIT_2026-11-23.md): READ-ONLY AUDIT COMPLETE; NO MARKETING ENROLMENT OR IMPLEMENTATION AUTHORISED
- [INTELLIGENT_QUICK_BUG_REPORTER.md](INTELLIGENT_QUICK_BUG_REPORTER.md): COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION
- [INVOICE_REFUND_WORKFLOW_INTEGRITY_2026-11-10.md](INVOICE_REFUND_WORKFLOW_INTEGRITY_2026-11-10.md): See dated release sections
- [LEGACY_DINEPLAN_WORKFLOW_DEACTIVATION_2026-11-10.md](LEGACY_DINEPLAN_WORKFLOW_DEACTIVATION_2026-11-10.md): See dated release sections
- [P0_ADMIN_LOGIN_RELOAD_LOOP_COMPLETE_2026-10-26.md](P0_ADMIN_LOGIN_RELOAD_LOOP_COMPLETE_2026-10-26.md): COMPLETE - PRODUCTION VERIFIED
- [P0_BOOKING_FEE_FINANCIAL_INTEGRITY_2026-11-11.md](P0_BOOKING_FEE_FINANCIAL_INTEGRITY_2026-11-11.md): COMPLETE - DEPLOYED AND AUTHENTICATED PRODUCTION VERIFIED
- [P0_BOOKING_INVOICE_WORKFLOW_VERIFIED_2026-10-29.md](P0_BOOKING_INVOICE_WORKFLOW_VERIFIED_2026-10-29.md): See dated release sections
- [P0_BOOKING_PAYMENT_LINK_INTEGRITY_2026-11-12.md](P0_BOOKING_PAYMENT_LINK_INTEGRITY_2026-11-12.md): COMPLETE - SHARED FIX DEPLOYED; CUSTOMER REMEDIATION PENDING APPROVAL
- [P0_BOOKING_TRANSFER_BLOCKED_COMPLETE.md](P0_BOOKING_TRANSFER_BLOCKED_COMPLETE.md): See dated release sections
- [P0_BOOKING_TRANSFER_PLATFORM_SEATING_INTEGRITY_2026-11-11.md](P0_BOOKING_TRANSFER_PLATFORM_SEATING_INTEGRITY_2026-11-11.md): COMPLETE - PLATFORM FIX DEPLOYED; AUTHORISED PRODUCTION TRANSFER, RECONCILIATION AND UNSENT PAYMENT LINK VERIFIED
- [P0_BOOKING_VISIBILITY_DATA_INTEGRITY_2026-11-06.md](P0_BOOKING_VISIBILITY_DATA_INTEGRITY_2026-11-06.md): COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION
- [P0_BOX_OFFICE_SEATING_OVERRIDE_BOOKING_FAILURE_COMPLETE.md](P0_BOX_OFFICE_SEATING_OVERRIDE_BOOKING_FAILURE_COMPLETE.md): COMPLETE - PRODUCTION READY
- [P0_COMP_SELECTION_BOOKING_CREATION_RESTORED.md](P0_COMP_SELECTION_BOOKING_CREATION_RESTORED.md): RELEASE READY
- [P0_CORPORATE_BOOKING_SEARCH_CRASH_COMPLETE_2026-10-26.md](P0_CORPORATE_BOOKING_SEARCH_CRASH_COMPLETE_2026-10-26.md): COMPLETE - LIVE AND VERIFIED
- [P0_CORPORATE_FINANCIAL_FUNCTION_BRIEF_INTEGRITY_2026-11-06.md](P0_CORPORATE_FINANCIAL_FUNCTION_BRIEF_INTEGRITY_2026-11-06.md): COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION
- [P0_EMERGENCY_PRODUCTION_OUTAGE_BOOKING_SEARCH_2026-10-26.md](P0_EMERGENCY_PRODUCTION_OUTAGE_BOOKING_SEARCH_2026-10-26.md): COMPLETE - SURGICAL RECOVERY RELEASED
- [P0_GUEST_COUNT_REDUCTION_RETAINED_VALUE_TRANSFER_COMPLETE.md](P0_GUEST_COUNT_REDUCTION_RETAINED_VALUE_TRANSFER_COMPLETE.md): COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION
- [P0_GUEST_COUNT_VALIDATION_DEFECT_COMPLETE.md](P0_GUEST_COUNT_VALIDATION_DEFECT_COMPLETE.md): COMPLETE - DEPLOYED AND VERIFIED
- [P0_INTERNAL_BOOKING_AMENDMENT_FAILURE_COMPLETE.md](P0_INTERNAL_BOOKING_AMENDMENT_FAILURE_COMPLETE.md): COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION
- [P0_INTERNAL_CALENDAR_BOOKING_VALIDATION_COMPLETE.md](P0_INTERNAL_CALENDAR_BOOKING_VALIDATION_COMPLETE.md): COMPLETE
- [P0_INVOICE_DRAFT_SAVE_FAILURE_COMPLETE.md](P0_INVOICE_DRAFT_SAVE_FAILURE_COMPLETE.md): See dated release sections
- [P0_MICROSOFT_365_OUTAGE_IMPACT_AUDIT_2026-11-13.md](P0_MICROSOFT_365_OUTAGE_IMPACT_AUDIT_2026-11-13.md): READ-ONLY AUDIT COMPLETE - PROVIDER INCIDENT ACTIVE; RECOVERY RECONCILIATION REQUIRED
- [P0_NORMAN_BOOKING_PAYMENT_FORENSIC_AUDIT_COMPLETE.md](P0_NORMAN_BOOKING_PAYMENT_FORENSIC_AUDIT_COMPLETE.md): COMPLETE
- [P0_NYE_FULL_PAYMENT_ENFORCEMENT_COMPLETE.md](P0_NYE_FULL_PAYMENT_ENFORCEMENT_COMPLETE.md): See dated release sections
- [P0_PUBLIC_BOOKING_FAILURE_COMPLETE.md](P0_PUBLIC_BOOKING_FAILURE_COMPLETE.md): COMPLETE - PRODUCTION VERIFIED
- [P0_PUBLIC_BOOKING_PAYMENT_INTEGRITY_2026-11-10.md](P0_PUBLIC_BOOKING_PAYMENT_INTEGRITY_2026-11-10.md): COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION
- [P0_SPLIT_PAYMENT_BOOKING_FAILURE_2026-11-19.md](P0_SPLIT_PAYMENT_BOOKING_FAILURE_2026-11-19.md): RELEASED - PRODUCTION FUNCTION VERIFIED WITH ROLLBACK-ONLY TRANSACTIONS
- [P0_SUPABASE_DISK_IO_DATABASE_PERFORMANCE_2026-11-09.md](P0_SUPABASE_DISK_IO_DATABASE_PERFORMANCE_2026-11-09.md): FOLLOW-UP COMPLETE - SMALL ACTIVE, PRODUCTION HEALTHY; MONITOR COMMITMENT
- [P0_TABLE_PLAN_COMPANY_BOOKER_IDENTIFICATION_COMPLETE.md](P0_TABLE_PLAN_COMPANY_BOOKER_IDENTIFICATION_COMPLETE.md): See dated release sections
- [P0_TABLE_PLAN_EXPORT_SEATING_CLASSIFICATION_INTEGRITY_COMPLETE.md](P0_TABLE_PLAN_EXPORT_SEATING_CLASSIFICATION_INTEGRITY_COMPLETE.md): COMPLETE - RELEASED AND VERIFIED IN PRODUCTION
- [P0_TABLE_PLAN_EXPORT_SECTION_REGRESSION_COMPLETE.md](P0_TABLE_PLAN_EXPORT_SECTION_REGRESSION_COMPLETE.md): COMPLETE - RELEASED AND VERIFIED IN PRODUCTION
- [P0_TABLE_PLAN_TEMPORARY_TABLE_EXPORT_2026-10-26.md](P0_TABLE_PLAN_TEMPORARY_TABLE_EXPORT_2026-10-26.md): COMPLETE - VERIFIED FOR PRODUCTION RELEASE
- [P0_TEMPORARY_TABLE_CAPACITY_OVERRIDE_COMPLETE.md](P0_TEMPORARY_TABLE_CAPACITY_OVERRIDE_COMPLETE.md): See dated release sections
- [P0_TWO_SEATER_ALTERNATIVE_DATE_BOOKING_FAILURE_COMPLETE.md](P0_TWO_SEATER_ALTERNATIVE_DATE_BOOKING_FAILURE_COMPLETE.md): See dated release sections
- [P0_TWO_SEATER_BOX_OFFICE_OVERRIDE_COMPLETE.md](P0_TWO_SEATER_BOX_OFFICE_OVERRIDE_COMPLETE.md): See dated release sections
- [P0_VERCEL_DURATION_AUTHENTICATION_INCIDENT_2026-11-09.md](P0_VERCEL_DURATION_AUTHENTICATION_INCIDENT_2026-11-09.md): COMPLETE - PROVIDER RECOVERED, SAFEGUARD DEPLOYED AND PRODUCTION VERIFIED
- [P0_VODACOM_BUYOUT_TABLE_PLAN_INTEGRITY_2026-11-06.md](P0_VODACOM_BUYOUT_TABLE_PLAN_INTEGRITY_2026-11-06.md): See dated release sections
- [PAYFAST_PAYMENT_FAILURE_INVESTIGATION_2026-11-23.md](PAYFAST_PAYMENT_FAILURE_INVESTIGATION_2026-11-23.md): READ-ONLY PLATFORM AUDIT COMPLETE; PROVIDER TRACE AND OPERATIONAL FOLLOW-UP REQUIRED
- [PHASE_1_FULL_SHOW_BUYOUT_SEATING_2026-11-06.md](PHASE_1_FULL_SHOW_BUYOUT_SEATING_2026-11-06.md): COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION
- [PHASE_2_CORPORATE_DIETARY_REQUIREMENTS_2026-11-06.md](PHASE_2_CORPORATE_DIETARY_REQUIREMENTS_2026-11-06.md): See dated release sections
- [PHASE_3_MULTI_ZONE_BOOKINGS_SPLIT_PAYMENTS_2026-11-06.md](PHASE_3_MULTI_ZONE_BOOKINGS_SPLIT_PAYMENTS_2026-11-06.md): COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION
- [PHASE_4_FLOOR_ASSIGNMENT_IMPROVEMENTS_2026-11-06.md](PHASE_4_FLOOR_ASSIGNMENT_IMPROVEMENTS_2026-11-06.md): COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION
- [PHASE_50_14A_ACADEMY_MODULE_VISIBILITY_FIX.md](PHASE_50_14A_ACADEMY_MODULE_VISIBILITY_FIX.md): See dated release sections
- [PHASE_50_14B_ACADEMY_TRAINING_UX_FIXES.md](PHASE_50_14B_ACADEMY_TRAINING_UX_FIXES.md): COMPLETE - LIVE AND VERIFIED
- [PHASE_50_14_PREVIEW_LOADING_FIX.md](PHASE_50_14_PREVIEW_LOADING_FIX.md): See dated release sections
- [PHASE_50_14_PRODUCTION_NATIVE_GUIDED_TRAINING.md](PHASE_50_14_PRODUCTION_NATIVE_GUIDED_TRAINING.md): local private preview complete; awaiting personal review.
- [PHASE_50_4I_XERO_CONTROLLED_LIVE_ACTIVATION_2026-10-23.md](PHASE_50_4I_XERO_CONTROLLED_LIVE_ACTIVATION_2026-10-23.md): See dated release sections
- [PHASE_50_4J_XERO_WORKSPACE_UX_POLISH_2026-10-23.md](PHASE_50_4J_XERO_WORKSPACE_UX_POLISH_2026-10-23.md): See dated release sections
- [PHASE_51_1_CRITICAL_QUERY_REPORTS_OPTIMISATION.md](PHASE_51_1_CRITICAL_QUERY_REPORTS_OPTIMISATION.md): COMPLETE - DEPLOYED AND VERIFIED
- [PHASE_51_2_BACKGROUND_ACTIVITY_OPTIMISATION.md](PHASE_51_2_BACKGROUND_ACTIVITY_OPTIMISATION.md): COMPLETE - DEPLOYED AND VERIFIED
- [PHASE_51_3_LIGHTWEIGHT_ADMIN_ARCHITECTURE.md](PHASE_51_3_LIGHTWEIGHT_ADMIN_ARCHITECTURE.md): COMPLETE
- [PHASE_51_4_INSTANT_INTERACTION_ENGINEERING.md](PHASE_51_4_INSTANT_INTERACTION_ENGINEERING.md): COMPLETE
- [PHASE_51_5_LEGACY_HARDWARE_PERFORMANCE_CERTIFICATION.md](PHASE_51_5_LEGACY_HARDWARE_PERFORMANCE_CERTIFICATION.md): COMPLETE
- [PHASE_51_6_BOX_OFFICE_PERFORMANCE_VERIFICATION.md](PHASE_51_6_BOX_OFFICE_PERFORMANCE_VERIFICATION.md): COMPLETE - NO APPLICATION RELEASE REQUIRED
- [PHASE_52_1_24_HOUR_PRE_SHOW_REMINDERS_2026-10-26.md](PHASE_52_1_24_HOUR_PRE_SHOW_REMINDERS_2026-10-26.md): COMPLETE - RELEASE VERIFIED
- [PHASE_52_2_REVIEW_EMAIL_SUBJECT_LINE_COMPLETE.md](PHASE_52_2_REVIEW_EMAIL_SUBJECT_LINE_COMPLETE.md): See dated release sections
- [PHASE_52_GUEST_CONFIRMATION_REMINDER_AUDIT_2026-10-26.md](PHASE_52_GUEST_CONFIRMATION_REMINDER_AUDIT_2026-10-26.md): COMPLETE
- [PHASE_53_BOOKING_ACTIVITY_TIMELINE_COMPLETE.md](PHASE_53_BOOKING_ACTIVITY_TIMELINE_COMPLETE.md): See dated release sections
- [PHASE_54_10_FINAL_SEATING_CONFLICT_RESOLUTION_COMPLETE.md](PHASE_54_10_FINAL_SEATING_CONFLICT_RESOLUTION_COMPLETE.md): COMPLETE
- [PHASE_54_11_HYBRID_AUTOMATIC_TABLE_ASSIGNMENT_COMPLETE.md](PHASE_54_11_HYBRID_AUTOMATIC_TABLE_ASSIGNMENT_COMPLETE.md): COMPLETE
- [PHASE_54_12_BOX_OFFICE_ASSIGNMENT_APPROVAL_COMPLETE.md](PHASE_54_12_BOX_OFFICE_ASSIGNMENT_APPROVAL_COMPLETE.md): COMPLETE
- [PHASE_54_13_TABLE_CAPACITY_CORRECTION_UX_SIMPLIFICATION_COMPLETE.md](PHASE_54_13_TABLE_CAPACITY_CORRECTION_UX_SIMPLIFICATION_COMPLETE.md): COMPLETE
- [PHASE_54_1_AUTHORITATIVE_SEATING_CONFIGURATION_COMPLETE.md](PHASE_54_1_AUTHORITATIVE_SEATING_CONFIGURATION_COMPLETE.md): COMPLETE
- [PHASE_54_2_AUTOMATIC_TABLE_ASSIGNMENT_COMPLETE.md](PHASE_54_2_AUTOMATIC_TABLE_ASSIGNMENT_COMPLETE.md): COMPLETE - DEPLOYED DISABLED PENDING PERFORMANCE RECONCILIATION
- [PHASE_54_3_TABLE_RECONCILIATION_AUTO_ASSIGNMENT_ACTIVATION_COMPLETE.md](PHASE_54_3_TABLE_RECONCILIATION_AUTO_ASSIGNMENT_ACTIVATION_COMPLETE.md): COMPLETE - PROGRESSIVE PRODUCTION ACTIVATION VERIFIED
- [PHASE_54_4_TABLE_RECONCILIATION_AUTO_ASSIGNMENT_COMPLETE.md](PHASE_54_4_TABLE_RECONCILIATION_AUTO_ASSIGNMENT_COMPLETE.md): COMPLETE - PRODUCTION RECONCILIATION VERIFIED
- [PHASE_54_5_SEATING_RECONCILIATION_COMPLETE.md](PHASE_54_5_SEATING_RECONCILIATION_COMPLETE.md): COMPLETE - PRODUCTION RECONCILIATION VERIFIED
- [PHASE_54_8_AUTOMATIC_ASSIGNMENT_RESTRICTION_RESOLUTION_COMPLETE.md](PHASE_54_8_AUTOMATIC_ASSIGNMENT_RESTRICTION_RESOLUTION_COMPLETE.md): See dated release sections
- [PHASE_54_9_70_PERCENT_ASSIGNMENT_QUEUE_RESOLUTION_COMPLETE.md](PHASE_54_9_70_PERCENT_ASSIGNMENT_QUEUE_RESOLUTION_COMPLETE.md): COMPLETE - AUTHORISED RESUME RECONCILIATION DEPLOYED
- [PHASE_55_1_BOX_OFFICE_VERIFICATION_HANDOVER_COMPLETE.md](PHASE_55_1_BOX_OFFICE_VERIFICATION_HANDOVER_COMPLETE.md): COMPLETE
- [PHASE_55_3_TABLE_PLAN_EXPORT_CORRECTIONS_COMPLETE.md](PHASE_55_3_TABLE_PLAN_EXPORT_CORRECTIONS_COMPLETE.md): COMPLETE - RELEASE VERIFIED
- [PHASE_55_COMPLETE_SEATING_ALIGNMENT_AUTOMATIC_ASSIGNMENT_COMPLETE.md](PHASE_55_COMPLETE_SEATING_ALIGNMENT_AUTOMATIC_ASSIGNMENT_COMPLETE.md): COMPLETE
- [PHASE_56_1_PURCHASE_CONVERSION_TRACKING_ATTRIBUTION_COMPLETE.md](PHASE_56_1_PURCHASE_CONVERSION_TRACKING_ATTRIBUTION_COMPLETE.md): COMPLETE - DEPLOYED DISABLED
- [PHASE_56_META_PURCHASE_TRACKING_FORENSIC_AUDIT_COMPLETE.md](PHASE_56_META_PURCHASE_TRACKING_FORENSIC_AUDIT_COMPLETE.md): COMPLETE - READ-ONLY
- [PHASE_58_0_BULK_INVOICING_XERO_INTEGRATION_COMPLETE.md](PHASE_58_0_BULK_INVOICING_XERO_INTEGRATION_COMPLETE.md): See dated release sections
- [PHASE_58_1_CREDIT_NOTES_REFUND_RECONCILIATION_COMPLETE.md](PHASE_58_1_CREDIT_NOTES_REFUND_RECONCILIATION_COMPLETE.md): COMPLETE
- [PHASE_59_1_SURGICAL_COMP_CORRECTION_COMPLETE.md](PHASE_59_1_SURGICAL_COMP_CORRECTION_COMPLETE.md): COMPLETE
- [PHASE_59_COMP_BOOKING_CATEGORIES_TABLE_PLAN_COMPLETE.md](PHASE_59_COMP_BOOKING_CATEGORIES_TABLE_PLAN_COMPLETE.md): COMPLETE
- [PHASE_5_TABLE_PLAN_EXPORT_FINALISATION_2026-11-06.md](PHASE_5_TABLE_PLAN_EXPORT_FINALISATION_2026-11-06.md): COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION
- [PHASE_60_INTERNAL_BOOKINGS_INDEPENDENT_OF_PUBLIC_AVAILABILITY_COMPLETE.md](PHASE_60_INTERNAL_BOOKINGS_INDEPENDENT_OF_PUBLIC_AVAILABILITY_COMPLETE.md): COMPLETE
- [PHASE_61_BOOKING_FAILURE_TRACKING_COMPLETE.md](PHASE_61_BOOKING_FAILURE_TRACKING_COMPLETE.md): See dated release sections
- [PHASE_62_TABLE_MERGE_SEATING_INTEGRITY.md](PHASE_62_TABLE_MERGE_SEATING_INTEGRITY.md): COMPLETE - RELEASED AND VERIFIED IN PRODUCTION
- [PHASE_63_PAYMENT_SUMMARY_EXPORT_CORRECTION.md](PHASE_63_PAYMENT_SUMMARY_EXPORT_CORRECTION.md): COMPLETE - RELEASED AND VERIFIED IN PRODUCTION
- [PHASE_64_DIETARY_ADDONS_TABLE_PLAN_CORRECTIONS.md](PHASE_64_DIETARY_ADDONS_TABLE_PLAN_CORRECTIONS.md): COMPLETE - RELEASED AND VERIFIED IN PRODUCTION
- [PHASE_65_BALANCE_PAYMENT_RECONCILIATION_TABLE_PLAN_INTEGRITY.md](PHASE_65_BALANCE_PAYMENT_RECONCILIATION_TABLE_PLAN_INTEGRITY.md): COMPLETE - RELEASED AND VERIFIED IN PRODUCTION
- [PHASE_66_DINEPLAN_CLASSIFICATION_TABLE_PLAN_INTEGRITY.md](PHASE_66_DINEPLAN_CLASSIFICATION_TABLE_PLAN_INTEGRITY.md): COMPLETE - RELEASED AND VERIFIED IN PRODUCTION
- [PHASE_67_SECRET_GUEST_LIST.md](PHASE_67_SECRET_GUEST_LIST.md): COMPLETE - PRODUCTION LIVE
- [PHASE_68_FLOOR_CAPACITY_SEATING_INTEGRITY.md](PHASE_68_FLOOR_CAPACITY_SEATING_INTEGRITY.md): COMPLETE - RELEASED TO PRODUCTION
- [PLATFORM_WIDE_CANCELLATION_BAR_CREDIT_AUDIT_2026-11-23.md](PLATFORM_WIDE_CANCELLATION_BAR_CREDIT_AUDIT_2026-11-23.md): audit complete; Accounts review required, not financial remediation.
- [PRE_SHOW_ATTENDANCE_CONFIRMATIONS_2026-11-05.md](PRE_SHOW_ATTENDANCE_CONFIRMATIONS_2026-11-05.md): COMPLETE - PRODUCTION VERIFIED
- [PUBLIC_CALENDAR_STATUS_COLOUR_CLEANUP.md](PUBLIC_CALENDAR_STATUS_COLOUR_CLEANUP.md): COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION
- [REMOVE_BOOKING_DETAILS_UNSAVED_CHANGES_CONFIRMATION.md](REMOVE_BOOKING_DETAILS_UNSAVED_CHANGES_CONFIRMATION.md): COMPLETE - RELEASED AND VERIFIED IN PRODUCTION
- [SECRET_GUEST_LIST_FEATURE_CONTROL_2026-10-31.md](SECRET_GUEST_LIST_FEATURE_CONTROL_2026-10-31.md): COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION - FEATURE OFF
- [SHOW_AVAILABILITY_MANAGEMENT_UI_UX_CLEANUP_2026-11-06.md](SHOW_AVAILABILITY_MANAGEMENT_UI_UX_CLEANUP_2026-11-06.md): COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION
- [STAFF_EMAILS_RECIPIENT_CORRECTION_UX_CLEANUP.md](STAFF_EMAILS_RECIPIENT_CORRECTION_UX_CLEANUP.md): COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION
- [SURGICAL_SHARE_REVIEW_FUNCTIONALITY_2026-11-11.md](SURGICAL_SHARE_REVIEW_FUNCTIONALITY_2026-11-11.md): COMPLETE - DEPLOYED AND AUTHENTICATED PRODUCTION VERIFIED
- [VODACOM_BUYOUT_FINANCIAL_WORKFLOW_REVIEW_2026-11-19.md](VODACOM_BUYOUT_FINANCIAL_WORKFLOW_REVIEW_2026-11-19.md): ALL THREE AUTHORISED BUYOUTS RECONCILED IN PRODUCTION / VERIFIED
- [WAITLIST_COMPACT_VIEW_FILTERING.md](WAITLIST_COMPACT_VIEW_FILTERING.md): COMPLETE - RELEASED AND VERIFIED IN PRODUCTION
- [WAITLIST_PRINT_FUNCTION.md](WAITLIST_PRINT_FUNCTION.md): COMPLETE - RELEASED AND VERIFIED IN PRODUCTION
- [YOLANDI_RESTORATION_THERESA_STATUS_2026-11-23.md](YOLANDI_RESTORATION_THERESA_STATUS_2026-11-23.md): subsequent expressly authorised queue recovery completed in Production.
- [ZNG_6MGLG2_TICKET_RESTORATION_2026-11-23.md](ZNG_6MGLG2_TICKET_RESTORATION_2026-11-23.md): CORRECTION RELEASED; BOTH ORIGINAL TICKETS RESTORED AND LIVE LOOKUPS VERIFIED

### Documentation Handling

Only AGENTS.md, .codex/README.md, .codex/CURRENT_TASK.md and this existing baseline
record are changed for governance. Private evidence/checkpoints retained; no
application code, schema, migration, financial or Production config changes.
Scoped local documentation commit must be incorporated in the next authorised
release; no Main/preview push or application deployment for this exercise.

## Historical Snapshot: 30 October 2026 (Superseded)

STATUS: RECONCILED - NO ACTIVE DEVELOPMENT PHASE

DATE: 30 OCTOBER 2026

## Authoritative Application Baseline

- Development checkout:
  `/Users/kadendamon/.codex/worktrees/phase-50-12-admin-performance/zingara-booking-platform`
- Current branch: `codex/phase-51-6-box-office-performance` (historical branch
  name only).
- Application commit: `edd7dadb853d12e42fcaf7c1af8d598a7f8a46ba`.
- `HEAD`, `origin/main` and `origin/HEAD` resolve to the same commit.
- GitHub's Vercel status for that commit is `success`: deployment completed at
  09:29:43 SAST on 30 October 2026.
- Latest completed numbered phase supported by tracked records: Phase 61,
  Booking Failure Tracking & Lost Sales Monitoring, application commit
  `538f1a4af68ee8f32de3c1d65009747f79fd963c`.
- Latest completed work overall: the paid Standard booking COMP-validation P0
  correction in `edd7dad`.
- Phase 53 Activity Timeline is preserved in commit `9bda28f`; 65 later commits
  exist between that release and the current baseline.

## Preserved Local Evidence

- The primary checkout at
  `/Users/kadendamon/Documents/zingara-booking-platform` remains untouched at
  commit `8dd00861d8804b539634342bba872363b2445372`, 144 commits behind
  `origin/main`, with 23 modified tracked files and seven untracked entries.
- Its core booking-lock recovery implementation was subsequently committed as
  `f1066ad` and then evolved in later Production releases. Five modified files
  are byte-for-byte identical to current `origin/main`; other application files
  are older snapshots or predecessors of later released implementations.
- Unique local test adjustments, historical `.codex` records, Phase 49 reports,
  build artifacts, old worktrees and temporary evidence remain preserved in the
  primary checkout. They have not been merged, removed or declared deployable.
- This authoritative checkout has no modified or staged application files. Its
  31 untracked archive/report entries remain preserved as historical evidence;
  they are not treated as committed release records.

## Recorded Operational Follow-ups

- The latest tracked seating handover records 303 bookings / 4,370 guests
  requiring manual seating resolution as of 28 October 2026. No later committed
  record proves that queue was cleared.
- Bulk Xero posting remains disabled pending Accounts approval and explicit
  activation configuration.
- Xero credit-note posting remains disabled pending accounting decisions and
  explicit activation approval.
- Tracked Phase 56.1 records purchase-conversion delivery as disabled. An
  untracked Phase 56.2 record reports GA4 active and direct Google Ads disabled;
  that operational claim has not been promoted to committed workflow evidence.
- No repository record establishes Phase 62 as active or complete.

## Verification Limitations

- The latest P0 passed focused tests, TypeScript, diff validation and the
  supported Production build.
- Full changed-file lint remains affected by pre-existing findings in the large
  Admin and booking components.
- The legacy Admin performance-budget checker does not understand the current
  Next.js 16 Webpack client-reference manifest.
- Deployment of `edd7dad` is verified. The release record documents
  authenticated no-write workflow QA, but does not claim a real booking
  submission or customer financial transaction.

## Development Boundary

This baseline was superseded when Phase 62 Table Merge & Seating Integrity was
explicitly authorised on 30 October 2026.
