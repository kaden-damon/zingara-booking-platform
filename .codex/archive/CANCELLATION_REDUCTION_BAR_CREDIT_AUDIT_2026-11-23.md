# Cancellation, Guest Reduction And Bar Credit Audit

Date: 23 November 2026. Status: read-only audit complete; no remediation applied.
Existing task/workflow continued; no new development phase.

## Scope And Evidence

Read AGENTS.md, CURRENT_TASK.md, README.md and relevant retained-value,
financial-forensic and invoice/refund archive records. Compared current source
with targeted linked Production SELECTs in READ ONLY transactions ending in
ROLLBACK. Inspected installed function definitions and live public policy.
No customer export, mutation RPC, booking edit, refund, communication, schema,
application code, commit, push or deployment. Frontend 2.0 was not touched.
All pre-existing uncommitted work preserved.

## Implemented Rules Versus Approved Terms

- `src/lib/bookingManagementPolicy.ts`: whole-booking Standard cutoff is five
  days; Corporate cutoff is seven days before stored performance start (SAST).
  The exact cutoff is inclusive for full refund eligibility. Late Corporate
  cancellation forfeits remaining paid value; late Standard cancellation
  forfeits the persisted deposit, with excess paid potentially refundable.
  Missing deposit evidence requires manual review. Existing refunds are deducted.
- `src/lib/bookingManagementServer.ts`: classification uses Corporate origin,
  corporate-direct source or Corporate request identity. No distinct Buyout kind.
  Gayle's imported booking qualifies as Corporate through corporate-direct source.
- Admin and Find My Booking manage APIs use the shared cancellation context,
  preview/version protection and atomic cancellation lifecycle. Cancellation does
  not itself automatically refund money or transfer value to a bar tab.
- Provider refund eligibility has separate transaction/manual-evidence safeguards.
  The privileged Admin full-refund endpoint has permission/password/reason and
  provider/idempotency guards, but does not itself invoke the shared cutoff
  policy. Whether this is an intended management exception needs confirmation;
  no unauthorised refund is established by this audit.
- Live venue settings contain the advisory text "Refund review required for
  cancellations within 48 hours of showtime." This is not the policy calculator's
  5/7-day rule and is not an enforced alternative refund window.
- Buyout package/terms snapshots inspected contain commercial/payment/hold terms,
  not an established uniform cancellation deadline. Bespoke signed agreements
  were not available. Do not infer seven days automatically governs every Buyout.
- Historical retained-value transfer approval is documented in
  `P0_GUEST_COUNT_REDUCTION_RETAINED_VALUE_TRANSFER_COMPLETE.md` (DP-J7SPNC).
  It establishes an explicitly confirmed transfer workflow, not permission to
  override late forfeiture. The Norman forensic archive separately preserves
  forfeited funds and requires authority for exceptions.

These are implemented rules and existing recorded decisions, not proof of the
terms accepted by this specific customer. No signed Exemplar agreement was
reviewed. Management's reported seven-day proposal does not override approved
contracts merely by being reported.

## Priority Booking: DP-YB9HPC

Booking ID: 6c9498e3-bdff-4ce0-bfc5-c42ba1f00d98.
Show ID: d396806f-9533-41d2-ba0b-a5ea0013c3f3.
Johannesburg, 12 November 2026; current status confirmed / fully_paid.
Origin data_import; source corporate-direct. Customer matched Gayle Crow;
Exemplar context is retained in operational records.

### Authoritative Financial Evidence

On 26 October at 22:19:30 SAST, Vanessa Robinson recorded a financial
reconciliation to R138,600 paid and total, balance R0, with the reason that the
client had paid in full and was not complimentary. Manual invoice evidence
7f43aa61-97be-4b44-b0f0-820fcc65084a records R123,200 tickets plus R15,400
ticket gratuity; paid bar amount and bar gratuity were both zero.
The evidence document label says PAID IN AUGUST; operational historical notes
refer to June. This audit does not establish the actual bank settlement date.
The old zero-value comp_vip payment row is not a new collection; manual financial
evidence explains the current paid balance. No new payment was created by the
guest reduction.

### Actual Amendment, Not Just A UI Offer

Successful audit action `booking.paid-guest-reduction`, Vanessa Robinson,
12 November 2026 at 09:35:14 SAST (07:35:14 UTC).
Reason: "11 Nov number of guests dropped by Gayle". Exact customer request time
is unavailable; request date and actual save date must not be conflated.

| Component | Before | After |
| --- | ---: | ---: |
| Guests | 80 | 71 |
| Ticket value | R123,200 | R109,340 |
| Ticket gratuity allocation | R15,400 | R0 |
| Bar allocation | R0 | R29,260 |
| Total | R138,600 | R138,600 |
| Paid | R138,600 | R138,600 |
| Outstanding | R0 | R0 |

Nine tickets at R1,540 release R13,860. The entire original gratuity, R15,400,
was also transferred, not merely gratuity attributable to nine guests.
R13,860 + R15,400 = R29,260. Current `valueAllocation` metadata and the immutable
successful audit snapshot agree. Existing table assignment was preserved.
No payment_refunds record was found. Neither forfeiture nor a cash refund was
recorded on this amendment path.

The separate operational bar limit remains R70,000 and explicitly says NOT
PREPAID, with settlement by invoice afterwards. It is not R70,000 previously
paid bar credit and must not be added to R29,260 as proven paid or spent value.
Operations retain the original gratuity note and management concern that a
day-before reduction should have forfeited tickets. That concern is evidence
of an operational disagreement, not independently verified signed terms.
Actual bar consumption, invoice settlement and accounting loss are not proven.
No Function Brief/export was regenerated; its financial resolver consumes
`valueAllocation`, while operational notes/limit remain separate source data.

## Confirmed Implementation Gap

`src/lib/bookingReconciliation.ts` calculates retained-value transfers without
date, booking-policy or forfeiture inputs. `BookingReconciliationModal.tsx`
requires explicit confirmation of "Transfer Released Value + Gratuity to Bar
Tab" for this eligible workflow; it offers no policy-based forfeiture outcome.
The reconciliation API routes the eligible imported paid reduction through
`reconcile_paid_booking_guest_reduction_atomic`.

Installed Production definition hash:
`7dcd55fd738fd7081a449535a4fff5b7`.
Migration source:
`supabase/migrations/20260928200000_phase_41_2y_p0_j_guest_reduction_legacy_allocation.sql`.

The function preserves staff permissions/venue access, reason, row/version locks,
operation idempotency, paid-total invariants, original manual invoice evidence,
seating and surplus ticket lifecycle. However, it has NO cancellation deadline
or forfeiture check. It allocates original paid bar amount + released tickets +
the entire source gratuity to the bar, retaining the booking's financial total.
Consequently a late reduction can create bar credit even though whole-booking
cancellation follows forfeiture rules. This is confirmed policy-path divergence,
not a mathematical total mismatch or proof of unauthorised staff access.

Native fixed-total Corporate guest-count reconciliation is a distinct path;
do not generalise imported transfer behaviour to every Standard/Corporate/Buyout
booking. Its installed function also has no cutoff check, but that alone does
not prove it creates this same bar allocation.

## Other Affected Records: Bounded Evidence

Targeted last-90-day successful `booking.paid-guest-reduction` audit search:
10 successful events across nine bookings. Compared event timestamps to current
show date/time and existing 5/7-day classification; excluded candidates with a
later recorded show transfer to avoid misclassifying moved performances.

Two events fall inside their applicable implemented cancellation windows:

| Booking | Show | Recorded amendment (SAST) | Guests | Tickets released | Gratuity moved | New bar allocation |
| --- | --- | --- | --- | ---: | ---: | ---: |
| DP-YB9HPC | 12 Nov 2026 | 12 Nov 09:35:14 | 80 -> 71 | R13,860 | R15,400 | R29,260 |
| DP-FNZGQC | 12 Nov 2026 | 12 Nov 09:20:48 | 60 -> 55 | R6,600 | R9,900 | R16,500 |

Combined: R20,460 released tickets + R25,300 gratuity = R45,760 allocated to bar.
This is a financial-review population, not confirmed consumption, loss, improper
refunds or a comprehensive all-time audit. Individual agreements may matter.

## Public Disclosures And Visibility

Live policy reviewed:
https://book.zingara.co.za/royal-decrees/booking-and-cancellation-policy
Source: `src/lib/royalDecrees.ts`.

The page describes case-by-case review by timing/type/payment/arrangements but
does not state the numeric 5/7-day windows, partial guest reduction treatment,
forfeiture amounts or bar-credit policy. Public checkout (`src/app/book/page.tsx`)
requires acceptance and links the policy; no prominent corresponding numeric
summary was found before payment. Customer email legal footers link the policy
(`src/lib/email/customerEmail.ts`); inspected cancellation/refund template bodies
do not explain these numeric deadlines. Links alone do not resolve the gap.
This audit does not certify legal compliance or contract enforceability.

## Smallest Safe Recommendations / Required Decisions

1. Management must establish the approved policy matrix for whole cancellation
   versus partial reduction, Standard/Corporate/Buyout agreements, gratuity,
   discretionary exceptions and existing paid bar credit. Confirm Exemplar's
   accepted terms and the accounting treatment before any historical correction.
2. After approval, reuse the existing policy evaluator in reduction preview AND
   server transaction validation, with applicable agreement classification.
   Offer the approved forfeiture outcome instead of forcing a late bar transfer.
   Preserve locks, concurrency, totals/evidence and separately authorised audited
   exceptions; do not introduce automatic refunds or retrospective repricing.
3. Resolve the whole-gratuity transfer decision explicitly. The current function
   moves all gratuity regardless of the number removed; do not silently assume
   proportional gratuity or change this rule during an audit.
4. Align approved policy across venue configuration, public terms, checkout's
   prominent pre-payment summary and relevant confirmations. Review whether the
   privileged refund endpoint intentionally supports policy exceptions.
5. Review DP-YB9HPC and DP-FNZGQC with original agreements, bar consumption and
   issued accounting documents. Any financial reallocation, recovery, invoice
   change or customer communication requires separate explicit authorisation.

## Verification And Preservation

Existing targeted tests, no test changes:

```sh
node --experimental-strip-types --test src/lib/bookingManagementPolicy.test.ts src/lib/bookingReconciliation.test.ts src/lib/paidGuestReductionReconciliation.test.ts
```

27 passed, including cutoff boundaries, manual/multiple payment review,
retained allocation, permission/version/idempotency and financial/ticket guards.
Passing tests confirm existing behaviour, not that the policy gap is corrected.
No browser mutation or Production transaction simulation was performed.
Only this audit Markdown and the existing CURRENT_TASK record were updated.
No implementation, build, migration, release or change to existing records.

## Follow-Up Clarification: Corporate Gratuity Audit, 23 November

The focused follow-up located a local Corporate Buy-Out Terms PDF with explicit
90/30-day cancellation provisions, fixed-package billing and 12.5% dinner/show
gratuity. This supplements the earlier repository/Production snapshot search;
no evidence establishes its incorporation into Exemplar's agreement.

Correction to the earlier Function Brief description: direct source review and
a pure local reproduction confirm that its financial resolver does NOT consume
`valueAllocation`. For Exemplar's current inputs it returns the original
R123,200 ticket value, R15,400 gratuity and zero bar. The Table Plan financial
resolver does respect the current allocation. No live document was generated,
and neither historical evidence nor reporting code was modified. See
`CORPORATE_GRATUITY_TERMS_AUDIT_2026-11-23.md` for contractual limits and evidence.
