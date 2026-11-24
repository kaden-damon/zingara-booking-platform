# Vodacom Buyouts - Financial And Workflow Review

STATUS: ALL THREE AUTHORISED BUYOUTS RECONCILED IN PRODUCTION / VERIFIED

DATE: 19 NOVEMBER 2026

## Completed Authorised Component Reconciliation

This continuation supersedes the earlier capability blockers below. The owner
explicitly authorised the three Production amounts, a narrowly scoped correction
and its necessary safe migration. No new development phase was created.

### Released Correction

- Existing native financial reconciliation now accepts a documented fixed-buyout
  component agreement. Reuses the existing permission/revision/lifecycle/paid
  evidence safeguards and payment-link invalidation, with booking/Buyout row
  locks and existing-document/add-on conflict checks. No new pricing engine,
  catalogue edits, schema columns/tables or category was introduced.
- Stores the exact source SHA, original agreed base, discount, VAT, original-base
  12.5% dinner gratuity, inclusive add-on lines and separate meal requirements in
  existing metadata. Updates current commercial fields and preserves original
  package/terms snapshots. New audits retain complete booking/Buyout before-images.
- Financial custom charges do not create canonical restricted-meal add-ons or
  supplier orders. Table Plan and Function Brief disclose requirements as such,
  explicitly not supplier confirmation. Existing 72-hour ordering rules remain.
- Existing invoice preparation distinguishes the pre-VAT package discount from
  ordinary inclusive discounts: R678,500 original gross less R67,850 gross discount
  gives R610,650 package including exactly R79,650 VAT. The agreement retains
  R590,000 original base and R59,000 pre-VAT discount. Ordinary invoices unchanged.
- Current Buyout display names resolve the documented agreement without replacing
  historical package identity. Original Grand Society snapshots remain intact.

### Exact Committed Production Results

| Date / Booking | Authorised = Actual Total | Paid | Outstanding | Halaal Requirement / Charge | Kosher Requirement / Charge |
| --- | ---: | ---: | ---: | --- | --- |
| 19 Nov / ZNG-397ECAAC | R746,029.25 | R0.00 | R746,029.25 | 45 / R13,570.00 | 4 / R2,600.00 |
| 20 Nov / ZNG-109B5111 | R785,487.50 | R0.00 | R785,487.50 | 110 / R32,257.50 | Not listed / R0.00 |
| 21 Nov / ZNG-FF425E4F | R777,437.50 | R0.00 | R777,437.50 | 82 / R24,207.50 | Not listed / R0.00 |

- Combined total and outstanding: R2,308,954.25. All remain 400 guests, with
  original booking/payment lifecycle and seating intact. No received payment
  was inferred from the workbook and no booking was automatically confirmed.
- Each: R590,000 original agreement, R59,000 discount, R531,000 net package,
  R79,650 package VAT, R73,750 dinner gratuity (12.5% of R590,000), R2,530 hotbox/
  delivery. Drinks amounts including supplied 12.5% SF: R42,929.25 / R66,300 /
  R66,300, retained as workbook allowances, not recorded spend or paid bar tabs.
- All three financial changes committed in one transaction at 14:18:36 SAST,
  pinned to the verified original revisions, with exact-sum postconditions.
- 19 November source 45+4 was initially preserved verbatim/unclassified rather
  than guessed. Owner then explicitly confirmed 45 Halaal + 4 Kosher. A separate
  permission/lock/revision-guarded metadata clarification and new audit event
  recorded that requirement without changing any amount or supplier-order field.
  Request ID: vodacom-confirmed-meal-split-20261119. Earlier evidence preserved.
- Financial component audit IDs: 16f43193-784b-4284-874f-edcb01c7e031 (19th),
  428414ac-532f-462d-a0ae-9237d45c8260 (20th),
  b40dfd67-8f62-41e4-99dd-457ee81da2b4 (21st).

### Verification And Release Evidence

- Six new focused tests plus 29 directly relevant reconciliation/dietary/invoice
  regressions pass; TypeScript, changed-file ESLint and whitespace pass. Prior
  Function Brief 117-test evidence retained, not rerun wholesale.
- Rollback-only SQL verified each exact agreement, stale revision/invalid total/
  permission rejection and identity/guest/paid/snapshot preservation. Additional
  forced late constraint failure proves booking and audit writes roll back.
- Applied function-only migration 20261119140000, with dependency drift guard
  and ledger entry in one transaction. Deployed function fingerprint:
  e42e4a7d8181b556ef0aa1b918ed45f3. Anonymous execution false; service role true.
- Scoped commits: 88a109dda1ba29f6cb67b04cdc0e2883e40eac84,
  f3786267c81d99a9f1360acb89b7fb342a5e9f08,
  final 3b3c40d5a3e6c06fc89484c681ad2cf5ca74f177, pushed to main.
- Final Vercel Production deployment dpl_4jt3eGTUJcnow6wG2MM6tmrSx6aU is READY:
  https://zingara-booking-platform-9ugil5ybq-kaden-damons-projects.vercel.app,
  serving https://book.zingara.co.za. Exact-SHA GitHub Vercel status success;
  live alias independently inspected and HTTP 200 checked after reconciliation.
- Read-only comparison of EVERY non-financial booking field and original Buyout
  field/snapshot against new audit before-images passed for all three. Payments
  and linked Xero documents remain zero; no invoice/Xero mutation occurred.
- Generated all three existing Table Plans and Function Briefs from ACTUAL
  reconciled Production data through released generators, not claimed as new
  authenticated HTTP downloads. K/L match totals/paid/outstanding; V/W are 45/4,
  110/0 and 82/0. Formulas, styles, number formats and merges match prior exports.
  Each workbook has one financial obligation/reference, not duplicate amounts
  across its coverage rows. Seating/layout source is unchanged.
- All three PDFs have three pages using the existing continuation mechanism,
  exact package/VAT/gratuity/total/payment/balance, discounts, inclusive charges
  and stated requirements. Largest pages rendered without clipping. Final 19th
  actual PDF content streams equal that visually inspected candidate exactly.
- Single/bulk invoice preparation shares the tested resolver; read-only actual
  Production record verification gives exact totals/package VAT for every date.
  No draft was saved, invoice issued, Xero sync or customer communication sent.
- Final evidence: local-evidence/vodacom-reconciled-production-2026-11-19/,
  especially verified-financial-components.json, three date-named XLSX files
  and three reference-named Function Brief PDFs. Earlier unclassified 19th
  exports, original before/candidate evidence and rollback checkpoints retained.
- No outstanding financial mismatch. Supplier fulfilment remains an operational
  fact to confirm separately, not invented by this reconciliation. No other
  bookings, live pricing rules, Frontend 2.0 or unrelated uncommitted work changed.

## Historical Investigation (Superseded)

## Pricing And Function Brief Follow-Up

### Confirmed Cause / Scope

- Re-read continuity instructions, current source, Buyout/custom-price/dietary/
  Function Brief records and actual Production snapshots. The three bookings
  still hold Grand Society v1 base R742,500, VAT R111,375 and gratuity R92,812.50.
  R742,500 x 12.5% = R92,812.50 exactly. Tracy's R590,000 x 12.5% = R73,750
  also exactly. The difference is stored package/base, not percentage accuracy.
- Existing JS `calculateCorporateBuyoutCommercials` and SQL
  `create_corporate_buyout_custom_price_atomic` intentionally proportionally
  rescale base, VAT and gratuity for a custom total. Neither has a base-only
  discount / fixed-original-gratuity agreement input. Existing native
  reconciliation accepts total/paid, not the separate component split.
- There is no confirmed arithmetic defect justifying changing all packages or
  ordinary Corporate/Standard gratuity. No global pricing policy, original
  package snapshot or booking financial field was changed. Creating a special
  pricing engine/interface or disguising charges as imported invoice evidence
  would violate this task's boundaries. These specific adjustments remain
  stopped, not falsely completed. The user already authorised all three totals.
- Dietary cutoffs and inclusive additional-charge representation remain the
  separately documented blockers below. No orders or supplier confirmations
  were inferred. No workaround/partial financial save was performed.

### Confirmed Reporting Defects Corrected

- Existing Function Brief loader omitted the related Buyout package/commercial
  values and structured dietary summary. Its PDF summary printed only tickets
  and collected value, omitting total obligation, outstanding and charged
  gratuity. `Full Payment` also labelled the paid amount ambiguously.
- Extended the existing booking SELECT with its indexed one-to-one Buyout
  relation: no additional API/database query, polling or background task.
  Package identity comes from the preserved package snapshot, not live settings.
- Read-only composition validation displays base/VAT only when persisted
  package components and booking service/total reconcile exactly to cents,
  without unallocated additional-guest or add-on composition ambiguity. Changed
  historical agreements cannot inherit stale package VAT. Otherwise the PDF
  explicitly states VAT is not separately recorded for the current agreement.
  This is reporting evidence validation, not a new pricing calculation/engine.
- Existing summary box now displays package, base/VAT, VAT-inclusive tickets,
  charged versus collected gratuity, total obligation, payments received and
  outstanding balance. Recorded discounts, fees and all existing add-on
  quantities/charges remain available through existing continuation pages.
- Structured meal requirements reach the existing dietary section. Existing
  bar arrangements, running order, special requests, seating, gratuity
  allocation page, typography and geometry are retained. No operational record
  or supplier notification is created by viewing/generating a brief.
- No table, schema, category, new interface or workflow. Changes are limited
  to seven existing reporting/type/test files; no Table Plan or pricing writes.

### Focused Verification

- 117 tests pass across Corporate operations/PDFs, package and custom-total
  pricing, historical reporting, Standard/Corporate/COMP allocations, dietary
  restrictions, Table Plan finances and Xero invoice preparation. New cases
  cover both 12.5% bases, intentional custom-total scaling, correct current VAT,
  rejection of stale/inconsistent VAT, unpaid charged-versus-collected values
  and preservation of long add-on detail through continuation pages.
- TypeScript, changed-file ESLint and whitespace checks pass.
- Generated ALL THREE PDFs through the corrected existing generator using
  read-only Production records. All remain two A4 pages for these bookings,
  with actual current Grand Society/base R742,500/VAT R111,375/service
  R92,812.50/total and balance R946,687.50/paid R0. These are NOT Tracy's new
  totals because those actual booking changes remain blocked. Rendered output
  fits the original financial box without overlap or clipping.
- Regenerated all three unchanged Table Plans. Every cell value, style id,
  number format, formula and merged range matches the preserved before output.
  K/L/V/W and one financial row per booking remain unchanged. No duplicated
  financial values were introduced. This verifies current export integrity,
  NOT acceptance against the unsaved authoritative targets.
- Separate evidence folder: `local-evidence/vodacom-pricing-function-brief-2026-11-19/`.
  Previous before files/checkpoints remain untouched. The local verifier rejects
  non-GET network requests. Documents are actual generated local outputs from
  existing source/read-only Production data, not claimed as HTTP downloads.
- Reporting-only commit 5eb49d48a1b6aa7f18a75ee4dd1449c0a8733793 pushed to main.
  Vercel Production deployment dpl_EfEUrf3yvLnKjKi4JkkZRiY9osAw is READY,
  URL https://zingara-booking-platform-901hhi7qt-kaden-damons-projects.vercel.app,
  aliased to https://book.zingara.co.za. GitHub Vercel status for exact SHA
  succeeded. Recovery check confirmed remote main matches and no pending
  source changes; no duplicate commit or deployment was necessary.
- Actual Production Function Brief downloaded for ZNG-397ECAAC through the
  existing Download PDF action, before interruption. Two pages verified with
  Grand Society, base R742,500, VAT R111,375, charged gratuity R92,812.50,
  total/outstanding R946,687.50 and paid R0. Exact downloaded evidence:
  /Users/kadendamon/Downloads/ZNG-397ECAAC_function_brief.pdf.
  Other two PDFs remain generator/read-only-data verification, not live HTTP
  downloads. No booking save or communication was triggered.
- Recovery on 19 November: normal Close booking details had already released
  this session's lock at 13:14:35 SAST (release_reason closed). Read-only lock
  query found no active locks on any of the three bookings. No forced release
  or booking data change needed. Live alias HEAD returned HTTP 200. Retained
  previous 117 tests and all three unchanged Table Plan comparisons without
  rerunning tests or browser QA. All checkpoints and unrelated work preserved.
  No financial reconciliation, migration or Frontend 2.0 change in this release.

## Superseding Authorised Reconciliation

The user now authorises the three named Cape Town bookings to match Tracy's
updated workbook. Approval of these figures is NOT outstanding. The earlier
workbook and verbal figures below are historical evidence only, superseded by:

- `/Users/kadendamon/Downloads/Tracy/Vodacom_Buyouts_Breakdown- JHB.xlsx`.
  The request calls it JHB(1); the actual attached path uses the above basename.
- SHA256 `5bad2b09b367ab2e60f820c23912d9405c5ec54050a1c1afc288032b6309e54c`.
- Sheet `Vodacom Buyouts`, A12:O18. Actual new formulas M14:M16 are SUM(F:L),
  now include all populated charges, and agree with cached values to the cent.
  Decimal independent sum agrees with M18 = R2,308,954.25. No source edits.

### Accepted Amounts / Before And After

Each date: package R590,000.00, discount R59,000.00, net package R531,000.00,
VAT R79,650.00, VAT-inclusive package R610,650.00, dinner-show gratuity
R73,750.00 (12.5% of original R590,000), hotbox/delivery R2,530.00.

| Date / Reference | Drinks H | Halaal I | Kosher J | Quantity N (verbatim) | Authorised M | Actual Before = Actual After |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| 19 / ZNG-397ECAAC | R42,929.25 | R13,570.00 | R2,600.00 | 45+4 | R746,029.25 | R946,687.50 |
| 20 / ZNG-109B5111 | R66,300.00 | R32,257.50 | blank | 110 | R785,487.50 | R946,687.50 |
| 21 / ZNG-FF425E4F | R66,300.00 | R24,207.50 | blank | 82 | R777,437.50 | R946,687.50 |

- Difference from current to authorised: reductions R200,658.25 / R161,200.00 /
  R169,250.00, total R531,108.25. These reductions were NOT saved.
- Quantities have changed from the first workbook. N14 literally says 45+4;
  separate Halaal/Kosher interpretation is not a confirmed supplier order.
  J15/J16 and extra-guest L cells remain blank, not verified order quantities.
- The workbook's H heading says drinks package +12.5% SF. It provides a single
  lump sum per date, no separate net-bar/service split and no comment or field
  identifying an amount as provisional versus actual spend. No bar expenditure,
  payment or order confirmation was inferred. M includes H as supplied.
- Workbook has no received-payment schedule. Fresh Production evidence still
  has R0 paid, no payments/legacy evidence/documents, 400 guests, no table
  claims and no operations row for each booking. Actual outstanding remains
  R946,687.50 each. No payment, deposit, identity, seating or status was changed.

### Existing Field Mapping And Stop Conditions

- `CorporateBuyoutCreator` agreed total applies only during creation and
  proportionally scales package base/VAT/gratuity. Package version settings
  affect future bookings; these existing Grand Society snapshots stay intact.
- Existing `Edit Agreed Price` exposes total and amount paid, not independently
  editable package VAT or dinner gratuity. Its ordinary financial RPC adjusts
  subtotal by the total delta and RETAINS the current R92,812.50 service fee.
  Therefore setting just M would not record the authorised R73,750.00 dinner
  service or the separate dietary/bar/delivery composition correctly.
- The invoice-evidence gratuity inputs in the reconciliation modal apply only
  to imported COMP recovery, not these native Corporate buyouts. Do not misuse
  a recovery evidence record, raw SQL or notes as a financial component editor.
- Existing canonical Halaal/Kosher quantity controls and custom-priced service
  lines exist. Their existing 12.5% priced-add-on delta would add service on top
  of the workbook's inclusive charges. The Bar Tab control also applies 12.5%.
  No fabricated net price or hidden counter-adjustment was entered to force M.
- Meal cutoffs were 16/17/18 November at 18:00 SAST. Existing structured orders
  are absent. New/increased orders are blocked by the ordinary 72-hour path.
  Existing Function Brief `dietaryNotes`, `functionNotes`, `specialRequests`
  and bar instructions are an operational notes process, NOT an order-placement
  or priced quantity exception. They must not be used to bypass ordering or
  imply supplier confirmation. No supplier/staff notification was triggered.
- Thus stopped all three interdependent commercial adjustments before saving,
  exactly as instructed when existing controls cannot represent components.
  This is a capability blocker, NOT a request to reapprove the workbook totals.
  No new code, methods, schema, categories, workaround or interface was added.
- No Production recovery action is necessary because nothing was saved.
  Current metadata and immutable package snapshots remain the recovery anchor;
  any later permitted adjustment must capture fresh revisions and use an
  audited compensating correction rather than deleting or rewriting history.

### Actual Generated Table Plans / Function Briefs

Generated six files using the CURRENT UNCHANGED application generators against
fresh read-only Production data, with the same configuration/evidence inputs
used by the export route. The temporary local runner rejects every non-GET
request. These are local generations of the existing formats, NOT claimed as
authenticated HTTP downloads or reconciled/approved customer documents.

Evidence folder:
`local-evidence/vodacom-authorised-reconciliation-2026-11-19/`.

- `Zingara_Table_Plan_CPT_2026-11-19.xlsx`
- `Zingara_Table_Plan_CPT_2026-11-20.xlsx`
- `Zingara_Table_Plan_CPT_2026-11-21.xlsx`
- `ZNG-397ECAAC_function_brief.pdf`
- `ZNG-109B5111_function_brief.pdf`
- `ZNG-FF425E4F_function_brief.pdf`

All THREE Table Plans verified by reopening the actual XLSX files:

- Existing Table Plan + Notes sheets, 142 rows / 29 columns, nine merged ranges,
  56 formulas; identical cell styles/number formats, formula addresses/text,
  merge ranges and shape across all three. No exporter/template was changed.
- K3 = PAYMENT SUMMARY; L3 = PAYMENT BREAKDOWN; V3 = Halaal heading;
  W3 = KOSHER MEALS. All repeated headings retain these positions.
- One booking reference and one R946,687.50 obligation value per workbook;
  74 buyout coverage rows repeat company identity, not financial values.
  Coverage allocates zero guests and creates no actual seating entitlement.
- K4 = Unpaid plus R92,812.50 charged / not fully settled gratuity warning;
  L4 = Paid R0 / Outstanding R946,687.50. V4/W4 = zero because no structured
  or confirmed historical meal quantities exist. No fabricated dietary export.
- Existing COMP/Corporate financial classification tests pass. These exports
  are consistent with CURRENT Production but DO NOT match Tracy's authorised
  amounts/meal quantities, so reconciliation acceptance is NOT passed.

All THREE actual Function Brief PDFs reopened, text-checked and rendered:

- Two A4 pages per date; correct date/reference, Vodacom, Lisa as creator,
  400 guests, Full Show Buyout, no invented table numbers or arrangements.
- Current printed lines: Full Payment R0.00, Tickets R853,875.00, Gratuity Paid
  R0.00. Dietary, running-order, special-request and allocation sections blank.
- Important existing limitation: this Function Brief template does NOT print
  package name, charged gratuity, total obligation or outstanding balance.
  It therefore cannot satisfy the requested full commercial disclosure using
  current controls/layout. No new lines or layout changes were introduced.
- Rendered first pages for each date and representative second page inspected:
  no clipping or overlap. Poppler emitted local font-cache warnings, but the
  saved images and all text rendered successfully. No Production impact.

### Other Vodacom / Invoices / Verification

- Other existing Vodacom bookings found: Johannesburg 6 November
  ZNG-48B964B9, R684,400 total/paid, R0 balance; Johannesburg 7 November
  ZNG-14AA6BDC, R752,250 total/outstanding, R0 paid. Neither changed.
- Workbook also lists JHB 14/15 November; the matching shows are manual
  blackout statuses. No corresponding Vodacom booking/buyout identity was
  found in the company/booking search. Do not infer or create missing bookings.
- Target quote/invoice records remain absent. Existing invoice preparation
  follows current stored booking values, NOT the authorised unsaved workbook.
  No invoice save, Xero call, accounting change or customer communication.
- 51 essential existing tests pass: Table Plan financials, Standard/Corporate/
  COMP allocations, Function Brief financials, dietary cutoff and invoice
  preparation. No new test/application code or dependency was added.
- Complete target booking MD5 still `becff8123004417ac6baaac303c18b14`, matching
  the previous review and current read-only capture. No live booking change.
- No commit, push, deployment or migration manufactured for this blocked data
  task. Prior release details below are history, not a new reconciliation.

### Remaining Blocker

The accepted numerical authority is sufficient; existing component-level
controls are not. Under the explicit no-new-functionality constraint these
bookings cannot be marked reconciled. A separately scoped decision on an
existing appropriate component-correction route is required; do not resubmit
the same totals as if more approval would fix the technical limitation.
Supplier/order evidence is also needed before recording confirmed late meals.

## Prior Review - Historical Source Superseded

## Scope And Authoritative Sources

- Read AGENTS, CURRENT_TASK, README and the existing Corporate/Buyout pricing,
  dietary, Function Brief, seating, Vodacom Table Plan and Xero activation
  archives. Existing code, read-only Production rows and the supplied workbook
  are the evidence; archive conclusions were rechecked against current source.
- Workbook: `/Users/kadendamon/Downloads/Vodacom_Buyouts_Breakdown- JHB.xlsx`.
  SHA256: `651e92d89c5913cf3a0ef084ff41a9128ddf07b93be44c2374b2ab4695ea2f39`.
  Sheet: `Vodacom Buyouts`; relevant cells A12:O18. Read formulas and cached
  values independently with openpyxl, then reconciled using Decimal arithmetic.
  The original workbook was not edited or recalculated/overwritten.
- Despite the filename and initial Johannesburg request, A12 labels this
  section `Private Salon CPT`. Production matches Cape Town. The user explicitly
  confirmed the matching Cape Town bookings are the intended review scope.
- Baseline main: `1d7b3382d95b3bd8c5384796b9580827a8c43dbb`; Production
  `dpl_FdxSVG9JuMozwmnJjPGE4E8Y5X3E`, READY. Unrelated dirty Markdown records
  and Frontend 2.0 worktree/checkpoints remain untouched.

## Identified Existing Records

All are Cape Town at 18:00 SAST, created by Lisa Rodderick on 23 October.
Same company: Vodacom. Same existing customer: Yvonne (Vodacom).
They are direct buyouts, not converted enquiry duplicates.

| Date | Booking | Guests | Booking / Buyout State | Total / Outstanding | Paid |
| --- | --- | ---: | --- | ---: | ---: |
| 19 Nov | ZNG-397ECAAC | 400 | pending_payment / awaiting_payment | R946,687.50 | R0.00 |
| 20 Nov | ZNG-109B5111 | 400 | pending_payment / awaiting_payment | R946,687.50 | R0.00 |
| 21 Nov | ZNG-FF425E4F | 400 | pending_payment / awaiting_payment | R946,687.50 | R0.00 |

- Each retained snapshot is Grand Society v1: base R742,500.00; VAT
  R111,375.00; gratuity R92,812.50; total R946,687.50. Booking subtotal
  R853,875.00 includes base plus VAT. Discounts and add-ons are R0.00.
- No payment rows, legacy payment evidence or quote/invoice records are linked
  to these three bookings. Company-wide document search found only ZQ-001004,
  a local-only R510,000 quote for 6 November, not these dates. No claim is made
  that no external supplier invoice, bank payment or independently issued Xero
  invoice exists; no external accounting write or credential refresh was run.
- No matching Corporate enquiries, saved corporate_booking_operations records,
  structured dietary add-ons, dietary text or dietary notifications were found.
  A Function Brief can be generated on demand; absence of an operations row
  does not prove a PDF was never downloaded outside the platform.
- Each has 400 unallocated guests, zero zone entitlements, zero claimed tables
  and zero issued ticket entitlements. Do not infer a seating assignment.

## Spreadsheet Reconciliation

Same package breakdown in rows 14-16:

- Package R590,000.00; 10% discount R59,000.00; discounted base R531,000.00.
- VAT E14:E16 = 15% of discounted base = R79,650.00.
- VAT-inclusive package F14:F16 = R610,650.00.
- Dinner-show service G14:G16 = R73,750.00, which is 12.5% of the ORIGINAL
  R590,000.00 base, not the discounted R531,000.00 base. Treat this as the
  source's commercial basis, not an invitation to apply another percentage.
- Core F+G = R684,400.00. Hotbox/delivery K14:K16 = R2,530.00 per date.
- Drinks H14:H16 and extra guests L14:L16 are blank. Those inputs are not
  confirmed zero. J15:J16 are blank, not an independently verified meal count.

| Date / Row | Halaal I | Kosher J | Hotbox K | Displayed M | Sum Of Populated F:L | Omitted By M | Platform Less F:L |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 19 / 14 | R13,225.00 | R2,600.00 | R2,530.00 | R686,930.00 | R702,755.00 | R15,825.00 | R243,932.50 |
| 20 / 15 | R24,437.50 | blank | R2,530.00 | R686,930.00 | R711,367.50 | R24,437.50 | R235,320.00 |
| 21 / 16 | R32,487.50 | blank | R2,530.00 | R686,930.00 | R719,417.50 | R32,487.50 | R227,270.00 |

- M14:M16 formulas are `=F14+G14+H14+K14` and corresponding rows: they omit
  I/J entirely (also L, currently blank). Equal displayed totals therefore do
  NOT establish identical agreed totals. M18 displays R2,060,790.00; populated
  charge lines sum R2,133,540.00, a difference of R72,750.00. Current platform
  total is R2,840,062.50, R706,522.50 above populated lines, or R779,272.50
  above the source's displayed totals. Neither comparison is an approved debt.
- Quantities N14:N16 read exactly `43+4`, `82`, `110`. Likely 43 Halaal plus
  4 Kosher on the 19th, but confirm that interpretation before entry.
- Numeric inference only: I amounts reconcile to `(Halaal qty x R250 + R750)
  x 1.15` if N14 means 43 Halaal. K is numerically R2,200 x 1.15. J14 is
  numerically 4 x R650. The workbook does not separately document those
  unit/delivery terms or establish whether any service is duplicated/included.
  Confirm supplier evidence, tax inclusions and dinner-only gratuity eligibility.
- No payments received or balance schedule appears in this workbook. It cannot
  establish that any amount has been paid. Platform records R0.00 paid.

## Existing Controls And Genuine Limits

| Area | Already Available | Limit / Required Decision |
| --- | --- | --- |
| Buyout identity and booking | One exclusive show, company/contact, immutable package snapshot, idempotent creation | Reuse these three bookings; do not recreate them |
| Package configuration | Venue-specific versioned package names, descriptions, totals | Changes are for future bookings only; cannot rewrite these Grand Society snapshots |
| Agreed package total | Authorised custom total on creation | Proportionally scales base/VAT/gratuity; cannot express discount-only-on-base while retaining R73,750 gratuity |
| Historical reconciliation | Permissioned, revision-checked financial and retained invoice evidence controls | Generic total reconciliation retains existing service_fee; not an exact component editor; consequential changes require explicit authority |
| Dietaries and services | Structured Halaal/Kosher quantities, custom unit prices with bookings:reconcile, custom named delivery/hotbox lines, Corporate Bar Tab | Catalogue defaults R250/R500 are not the workbook's final inclusive amounts; do not substitute them blindly |
| Add-on financials | Shared exact-cent delta, balances and payment-link invalidation | On a 400-guest booking with positive service_fee, priced add-on deltas also add 12.5% gratuity; no per-line dinner-only exemption/inclusive-charge switch |
| Dietary cutoff | Existing restricted orders can be preserved/reduced; new increases require 72 hours | All three 18:00 SAST cutoffs have passed (16/17/18 Nov). No existing structured quantities. Supplier confirmation and an explicitly authorised correction route are needed; do not bypass the guard |
| Function Briefs | Existing operational fields, running order, catering notes, bar limits and on-demand PDFs; paid gratuity distinguished from charged gratuity | These bookings have no saved arrangements/meal quantities; adding notes alone is not authoritative priced order capture |
| Table Plans | Existing buyout coverage and manual zone/table planner; finance appears once and structured dietary export | 400 unallocated per date; no automatic assignment or guarantee; needs approved operational plan |
| Quotes / invoices | Manual line editor, tax-aware cents, line categories, document versions, permissioned single invoices, duplicate protections | Detailed source line/tax agreement and correct booking obligation must be approved before creating real documents; generated prefill is aggregate, not the workbook's full itemisation |
| Xero | Approved venue/category/tax mappings and controlled authorised invoice sync | No auto financial reconciliation or historical posting. Bulk posting remains disabled; do not enable it for these bookings |

Examples reproduced locally from current functions:
- Setting a Private Salon agreed total to R684,400.00 produces base
  R536,784.31, gratuity R67,098.04, VAT R80,517.65: same total but NOT Lisa's
  R531,000 / R73,750 / R79,650 composition.
- Adding a R2,530 hotbox to a R684,400 / R73,750-service booking produces
  R687,246.25, adding R316.25 service. The workbook's F+G+K is R686,930.00.
  Do not enter a fabricated net price simply to force the grand total to match.
- Thus current controls do NOT safely express every requested component with
  the correct tax/gratuity breakdown. An approved component-aware adjustment
  and per-charge inclusion policy are needed before any live reconciliation.

## Confirmed Safe Code Correction

- Reproduced invoice draft defect using the actual financial shape/metadata:
  fixed-buyout records have source corporate-direct and origin corporate.
  Direct invoice classification only inspected those strings, returning
  `corporate`, and the fee resolver defaulted to R10 without fee provenance.
  Function Briefs already correctly exempt fixed packages from this fallback.
- Single and bulk invoice preparation now pass existing booking notes to the
  revenue resolver. Only explicit `commercialModel: fixed-buyout-package`
  metadata selects `buyouts`. Ordinary/legacy provenance fallbacks remain.
- Fee resolution honours explicit persisted fee provenance FIRST (including
  genuine PayFast fees); absent that evidence, fixed packages receive no
  invented R10 line. No payable total, VAT or gratuity is recalculated.
- Both Cape Town buyouts and Corporate mappings currently share account
  205-01; the category defect did not imply a current difference in that
  account number. The invented fee would misallocate R10 to booking-fee
  account 206-02. No document for these dates exists, so no existing invoice
  was corrected, reclassified or synchronised.
- No migration, settings change, booking mutation, email, real invoice draft
  or Xero API operation is part of the code correction.

## Verification And Release

- 47 focused tests pass: invoice/direct/bulk guards, fee provenance, fixed
  package pricing, Function Brief financials, Corporate dietary and cutoff.
  A plain Node test invocation initially hit an existing extensionless-import
  limitation in the dietary suite. Reran with Node's temporary in-process
  relative-TypeScript resolution hook; no dependency/source change was needed.
- New financial fixture verifies R946,687.50 total, R111,375.00 VAT,
  R92,812.50 gratuity and no invented fee, using the actual buyout shape.
- TypeScript, targeted ESLint and whitespace checks pass. No request, database
  query, polling, background work or runtime dependency is added. No load
  benchmark performed; normal customer/frontend bundles are unchanged.
- Commit `6fcd8f4e47efec6e16abe8f849862593d3c13ace` pushed to main.
  Vercel Production `dpl_DuYVVRzMXwdwqb432mBbUrXXBf9x`, READY,
  `https://zingara-booking-platform-ba2nx6b5w-kaden-damons-projects.vercel.app`,
  aliased to `https://book.zingara.co.za`. Exact-SHA GitHub Vercel status is
  success, linking that deployment. Vercel build completed in 25 seconds.
- Authenticated live Admin session confirmed the three Cape Town calendar
  buyouts as Grand Society / 400 guests / Awaiting Payment. Then opened the
  read-only invoice-preparation deep link separately for ALL THREE references
  after release. Each editor showed the correct reference/date, Buyout line
  R853,875.00 at 15% VAT, Gratuity line R92,812.50 without VAT, no booking-fee
  line, document net subtotal R835,312.50, VAT R111,375.00, total/outstanding
  R946,687.50. Save Draft, submit, send and sync were NEVER activated. Preparing
  unsaved browser state is not a persisted invoice or a correction to Lisa's
  commercial agreement.
- Post-verification read-only fingerprints match complete pre-release booking
  and buyout rows: booking MD5 `becff8123004417ac6baaac303c18b14`, buyout MD5
  `4866d1be6a12af706642e58bed777c7b`. Zero target invoice/quote documents,
  payments and operations rows remain. Existing data was preserved exactly.
- Production Admin GET returned 200. Unauthenticated single-invoice prefill and
  bulk-invoice endpoints both returned 401; existing authentication remains.
- Current source rechecked in corporateBuyouts, bookingAddons,
  dietaryAddonOrdering, CorporateBuyoutCreator/PackageSettings, reconciliation
  API/SQL, corporateBookingOperationsServer/FunctionBriefFinancials,
  exports/tablePlan, Xero single/bulk routes, bookingInvoice/documentMath and
  mappings. The gap assessment distinguishes calculation/configuration limits
  from records that staff have not yet populated.
- Six approved files committed; accumulated CURRENT_TASK, prior BUG/split
  release evidence and the unrelated outage archive were excluded. Final
  release evidence in this record and CURRENT_TASK is updated locally. No
  migration, Frontend 2.0 change or business-data correction occurred.

## Decisions / Production Actions Requiring Approval

1. Lisa/Accounts must confirm whether I/J are additional or included, correct
   the source total basis, and confirm blank drinks/extra guests, quantities,
   supplier tax/delivery inclusions and any duplicated delivery.
2. Confirm the intended Private Salon agreement versus the stored Grand
   Society snapshot, the original-base service amount, and each final payable
   total. Do not automatically edit the immutable snapshot or booking headers.
3. Verify any actual receipts with Accounts. The workbook is not proof of
   payment; do not mark paid/confirmed or fabricate payment evidence.
4. Confirm existing supplier meal orders and approve the precise late-recording
   route, with operational arrangements and seating plan. No new restricted
   meal orders or cutoff bypass are authorised by this review.
5. Once those commercial inputs are authoritative, scope a shared explicit
   component/charge-inclusion adjustment if needed; do not alter global VAT or
   gratuity rules based on inconsistent spreadsheet formulas.
6. Obtain explicit authority for exact booking/dietary/operational updates and
   any real quote/invoice/Xero submission. Preserve original evidence and use
   existing identities, version checks, permissions and audit records.
