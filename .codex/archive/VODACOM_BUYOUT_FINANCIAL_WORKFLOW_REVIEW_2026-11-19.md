# Vodacom Buyouts - Financial And Workflow Review

STATUS: REVIEW COMPLETE - SAFE INVOICE DRAFT CORRECTION VERIFIED / RELEASE IN PROGRESS

DATE: 19 NOVEMBER 2026

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
- Pending commit/push, Vercel Ready deployment and read-only Production
  verification. Final release evidence to be recorded after deployment.

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
