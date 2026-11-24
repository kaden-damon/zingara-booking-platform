# Corporate Gratuity Terms: Read-Only Audit

Date: 23 November 2026. Existing task continued; no new phase or implementation.

## Evidence And Limits

Read AGENTS.md, CURRENT_TASK.md, README.md and the cancellation/bar-credit,
gratuity-transition, retained-value-transfer, financial-integrity and Vodacom
records. Reviewed current pricing, disclosures, reconciliation SQL, Corporate
operations/Function Brief, Table Plan and quote/document source paths.

Three targeted Production SELECT transactions used BEGIN READ ONLY / ROLLBACK:
1. Exemplar current booking/evidence and document schema discovery.
2. Linked accounting/quote documents, Corporate request and attachment schema.
3. Booking-linked gratuity communications and operational gratuity/bar fields.

No mutation RPC, financial adjustment, customer message, code change, migration,
commit or deployment. No real PDF/email was generated from Production. Existing
dirty work, historical evidence and Frontend 2.0 were preserved.

## Terms Actually Located

The live Corporate enquiry page says full payment is required upfront to
confirm, applicable 12.5% gratuity is itemised in the quote, and drinks/drinks
gratuity are payable on the night unless agreed otherwise:
https://book.zingara.co.za/corporate
Source: `src/app/corporate/page.tsx`, Payment & Gratuity section.
It does not define partial guest-reduction gratuity, original-versus-final
billing numbers, or gratuity forfeiture/refund by a seven-day deadline.

The public cancellation page defers to timing, booking type and event-specific
terms; it does not resolve those gratuity questions:
https://book.zingara.co.za/royal-decrees/booking-and-cancellation-policy

### Additional Local Buyout Document

Located and extracted all six pages; visually inspected pages 2 and 3:
`/Users/kadendamon/Documents/Zingara/BUYOUT Process/Zingara - Corporate Buy-Out Terms and Conditions .pdf`.
Identical copy exists in Downloads. Both SHA-256:
`7b926e030369e5bbd1507a9235c905522dbdb64a39facc8448e09a7e094603d2`.

Its text states:
- Clauses 1.1-1.3: applies to exclusive venue buyouts, incorporated into the
  quote; acceptance may occur through written confirmation, payment or proceeding.
- Clauses 3.1-3.3: fixed price for up to 400 guests, not reduced for fewer
  attendees; final numbers due 14 days before the event. Confirmed numbers above
  400 establish the additional-guest minimum, maximum 450.
- Clauses 3.4 and 3.7: 12.5% added to dinner/show fee; full payment due within
  48 hours of invoice to secure booking. This includes the invoiced gratuity,
  rather than replacing it with a final attendance-based calculation.
- Clause 3.6: bar spending and its 12.5% gratuity are separate, payable that night.
- Clause 5.1: whole cancellation refunds 100% of all amounts paid at 90+ calendar
  days, 50% at 30-89 days inclusive, none below 30. There is no separate gratuity
  carve-out in this clause. Clause 5.3 gives no refund or credit for no-shows.
- Clause 10.2 requires written, mutually signed variations.

This is a located terms document, NOT a verified signed/accepted Exemplar
contract or proof of the version effective for that booking. No standalone
signed Exemplar agreement was located by targeted filename search in the
available Zingara Documents and Downloads directories. No linked Xero
document/accepted quote or linked Corporate request was found by booking ID
or reference. No booking-linked communication containing gratuity was found.
This does not exclude external email, off-platform invoices, differently linked
documents or documents stored under unrecognised names. No external mailbox,
accounting system or storage-wide customer-data search was performed.

Therefore the generic seven-day Corporate cutoff must not be substituted for
the located Buyout terms, and those Buyout terms must not be imposed on this
80-person group without evidence that the agreement actually incorporated them.
This audit is not a legal enforceability opinion or confirmation of document
approval/version history.

## Current Charging And Reduction Behaviour

### Standard

New ordinary public/internal Standard creation excludes upfront gratuity.
Existing charged/collected historical agreements remain preserved. The
5 November transition and BUG-035 follow-up are recorded in their archives.
`src/app/api/bookings/route.ts` gates current inclusion on corporate-direct
source; `src/lib/gratuityTransition.ts` distinguishes collected/payable/review.
Standard late whole cancellation uses the recorded deposit policy, not a new
gratuity-specific calculation.

### Corporate

When calculated through the corporate-direct pricing path, `src/lib/pricing.ts`
adds 12.5% of discounted seating/add-on subtotal for parties of six or more.
This is the applicable count and financial basis at pricing time, not a promise
to reprice to final attendees later. Quote-conversion/imported financial paths
also support explicitly agreed totals/evidence and need not store gratuity in
`bookings.service_fee`; that field alone cannot establish collection.

Customer payment disclosures (`src/lib/guestDisclosures.ts`, used by ticket
emails) explain inclusion when a positive service fee exists, otherwise venue
payment. They do not define gratuity rights on partial reductions. Imported
evidence may differ from generic service-fee messaging.

Native fixed-total Corporate guest-count reconciliation retains the agreed
financial total and existing service fee; it does not proportionately reduce
gratuity merely because attendance falls. Ordinary paid reduction similarly
preserves historical financials rather than automatically refunding/repricing.

The separate imported, fully paid retained-value path explicitly moves ALL
source ticket gratuity plus released tickets to bar allocation. It has no event
date, seven-day policy or proportionate gratuity check. Sources:
`src/lib/bookingReconciliation.ts`, `BookingReconciliationModal.tsx`,
`src/app/api/admin/bookings/reconciliation/route.ts`, and migration
`20260928200000_phase_41_2y_p0_j_guest_reduction_legacy_allocation.sql`.

For WHOLE cancellation the policy calculator makes remaining paid value
refundable on/before the seven-day Corporate cutoff and forfeits it afterwards,
without a separately carved-out gratuity amount. Provider/manual refund
eligibility is separate; cancellation does not itself pay a refund. These are
implemented aggregate calculations, not verified contractual rules for partial
guest cancellations. Do not infer a partial refund entitlement from them.

### Buyout

Package gratuity is a commercial package component, not final guest-count
pricing below the included capacity. Ordinary custom-total controls scale
stored package components proportionately. The specific authorised Vodacom
component agreement preserves 12.5% on its original agreed base despite its
discount; that is not authority to apply the same discount basis universally.
Package snapshots and bespoke accepted agreements must be distinguished from
ordinary Corporate per-person pricing and generic cancellation classification.

## Exemplar DP-YB9HPC: Confirmed Production Position

Booking: 6c9498e3-bdff-4ce0-bfc5-c42ba1f00d98; Johannesburg, 12 November 2026.
The prior immutable amendment evidence was reused rather than re-queried.
Vanessa saved 80 -> 71 on 12 November 09:35 SAST; reason records 11 November
customer request. Both are within the implemented seven-day window.

| Component | Amount / interpretation |
| --- | --- |
| Original tickets | R123,200 = 80 x R1,540 |
| Original recorded paid gratuity | R15,400 = 12.5% x R123,200 |
| Nine guests' proportional gratuity | R1,732.50 = 9 x R1,540 x 12.5% |
| Remaining 71 proportional gratuity | R13,667.50 = 71 x R1,540 x 12.5% |
| Actually transferred gratuity | Entire R15,400 |
| Released ticket value | R13,860 |
| Current bar allocation | R29,260 = R13,860 + R15,400 |
| Current ticket allocation | R109,340 |
| Current ticket gratuity allocation | R0 |
| Current service_fee | R0 |
| Total / paid / outstanding | R138,600 / R138,600 / R0 |

R1,732.50 and R13,667.50 are arithmetic comparisons only. Neither is a newly
authorised refund, forfeiture, additional charge or recorded receivable.

Current valueAllocation confirms gratuityTransferred=15400 and
ticketGratuityAmount=0. Original manual invoice evidence is unchanged at
R15,400 ticket gratuity; it remains historical collection evidence, not proof
that current allocation still reserves it for service. Operational
gratuity_allocation also still says R15 400. The R70,000 operational bar limit
is separately described as not prepaid; it is not a second payment.

### Remaining 71 Guests: Obligation Versus Ledger

The platform records NO separate remaining ticket gratuity charge or outstanding
balance. It does not automatically charge R13,667.50 after this transfer.
That is not proof that the customer's contractual obligation was discharged,
nor permission to charge it again. The accepted quote/invoice and any authorised
variation are needed to establish what remains payable or should have stayed
allocated. Do not collect twice or equate zero service_fee with no original
gratuity collected.

### Reporting Inconsistency Confirmed Locally

Table Plan financials (`src/lib/exports/tablePlanFinance.ts`) prioritise current
valueAllocation for ticket gratuity and bar allocation: R0 / R29,260.

Function Brief financials (`src/lib/corporateFunctionBriefFinancials.ts` and its
server caller) instead use original evidence and do not consume valueAllocation.
A pure local call with Exemplar's current scalar values and allocation reproduced:
ticketValue R123,200; ticketGratuityPaid R15,400; barTabAmount R0; fullPayment
R138,600. No Production PDF was generated. The retained R15,400 display is not a
new charge and cannot prove the remaining guests are separately funded.

This corrects the earlier cancellation audit's statement that the Function
Brief resolver consumes valueAllocation; an explicit clarification is appended
there without deleting historical findings. No reporting fix was applied.

## Supported Treatment And Outstanding Decision

- Evidence supports the original paid R15,400 and the full subsequent transfer.
  It does NOT establish contractual authority for that transfer or a new gratuity
  obligation for the remaining guests.
- Where the located Buyout terms are demonstrably incorporated, reduced attendance
  below the fixed included count does not reduce package billing/gratuity; whole
  cancellation follows its own 90/30-day schedule, not a generic seven-day rule.
  No term located authorises converting all dinner gratuity to bar credit.
- For ordinary Corporate partial reductions, obtain the accepted agreement and
  management-confirmed rule for original versus revised billing numbers,
  outside/inside-seven-day gratuity, forfeiture, bar transfer and exceptions.
  The accessible public wording and financial calculations do not answer this.
- Preserve historical receipts. Any future allocation/reporting correction must
  distinguish original collection from current allocation and contractually
  outstanding amounts. Historical adjustments need separate authorisation.

Verification was documentary/source review, three read-only queries and one
pure local financial-resolver/arithmetic reproduction. Existing cancellation
audit's 27 tests were reused as prior evidence, not rerun or represented as new
tests. No signed agreement, external bank settlement, final drinks invoice or
actual bar consumption was independently verified. No claim that a defect is
fixed or a contractual policy is approved.
