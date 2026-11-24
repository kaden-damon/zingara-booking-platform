# Platform-Wide Cancellation And Bar Credit Audit

Date: 23 November 2026. Read-only continuation; no new development phase.
Status: audit complete; Accounts review required, not financial remediation.

## Scope And Evidence Boundary

Examined 9,179 bookings: Cape Town 3,825; Johannesburg 5,354. Initial primary-key
inventory examined 9,177 in ten bounded pages; two new live public bookings were
subsequently screened individually, with no relevant allocation/reduction signal.
Scope snapshot: 23 November 2026, 16:57:58 SAST. This is a live multi-query audit,
not a transactionally frozen copy of the whole platform.

No 90-day restriction. Archived bookings included. Initial inventory produced
166 financial-note/addon/allocation candidates. Screened all ten successful
`booking.paid-guest-reduction` events, nine distinct bookings, 28 September through
20 November, plus 12,976 relevant other successful audit entries. Focused review
covered 212 timeline events across 23 references and seven additional events for
a cleared historical note. Also screened all 139 Corporate operations rows; the
21 additional bar signals were limits/open tabs/ordinary prepayments, not explicit
cancellation-funded transfers. A spending limit alone is not prepaid credit.

All database sessions were explicitly read-only, statement-timeout bounded, with
primary-key paging or existing audit/reference indexes. Projected financial fields
only; no customer export, external POS access, mutation RPC or supplier/customer
communications. No source edits, migration, release or Frontend 2.0 changes.

Policy comparison: Standard five days, late R550 deposit forfeiture per cancelled
guest; Corporate seven days, late cancelled tickets and associated prepaid gratuity
forfeited, remaining gratuity retained; Buyouts separately agreed. All times below
are SAST and all dates 2026. Saving time is used unless an earlier documented request
is relevant. Historical authorisations are not automatically revoked by new code.

## Totals: Review Exposure, Not Proven Loss

| Category | Bookings | Future | Past | Total |
| --- | ---: | ---: | ---: | ---: |
| Recorded late transfers | 2 | R0 | R45,760 | R45,760 |
| Whole-gratuity transfers lacking located authorisation | 5 | R12,870 | R34,650 | R47,520 |
| Recorded allocations requiring review | 7 | R12,870 | R80,410 | R93,280 |
| Additional late note-only claims, funding unverified | 2 | R0 | R2,800 | R2,800 |
| Combined review envelope, not funded-loss total | 9 | R12,870 | R83,210 | R96,080 |

All nine policy-review cases are Johannesburg. No confirmed late funded transfer
was found for Cape Town in accessible evidence. This is not proof against an
unrecorded off-platform promise. Eleven other future timely note claims total
R33,500 and are excluded from the policy-risk totals.

No consumption/redemption ledger was found. Reviewed primary allocations and
note-only claims had no linked settled Xero bar invoice or accepted quote proving
consumption. Total booking receipts establish payment, not use of a bar credit.
External POS, signed agreements and paper receipts were not available. Proven
loss cannot be quantified; do not interpret this as proof of zero consumption.

## Recorded Allocations: Full Timing And Components

All nine below are Corporate, Johannesburg; shows/cutoffs at 17:00. Ticket and
gratuity columns show the components currently recorded in the bar snapshot.
Do not add repeated event after-values: ten events produced nine current records.

| Reference | Show | Reduction saved | Guests at transfer; now | Seven-day cutoff | Ticket to bar | Gratuity to bar | Whole bar snapshot | Classification |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| DP-W2M2MC | 27 Nov, future | 12 Nov 14:37 | 50 -> 42; 41 | 20 Nov 17:00 | R10,560 | R8,250 | R18,810 | Timely tickets; gratuity authorisation review |
| DP-387ZNC | 28 Nov, future | 20 Nov 11:28 | 28 -> 24; 24 | 21 Nov 17:00 | R5,280 | R4,620 | R9,900 | Timely tickets; gratuity authorisation review |
| DP-J7SPNC | 20 Nov, past | 3 Nov 15:07 | 70 -> 64; 65 | 13 Nov 17:00 | R7,920 | R11,550 | R19,470 | Documented historical authorisation |
| DP-LFM3PC | 20 Nov, past | 9 Nov 15:12 | 45 -> 38; 37 | 13 Nov 17:00 | R10,780 | R8,662.50 | R19,442.50 | Timely tickets; gratuity authorisation review |
| DP-BZ23PC | 18 Nov, past | 11 Nov 14:47 | 65 -> 52; 52 | 11 Nov 17:00 | R20,020 | R12,512.50 | R32,532.50 | Before cutoff; gratuity authorisation review |
| DP-8BRCQC | 13 Nov, past | 3 Nov 15:09 | 70 -> 64; 63 | 6 Nov 17:00 | R9,240 | R13,475 | R22,715 | Timely tickets; gratuity authorisation review |
| DP-FNZGQC | 12 Nov, past | 12 Nov 09:20 | 60 -> 55; 60 | 5 Nov 17:00 | R6,600 | R9,900 | R16,500 | Late; later guest restoration left bar snapshot |
| DP-YB9HPC | 12 Nov, past | 12 Nov 09:35 | 80 -> 71; 71 | 5 Nov 17:00 | R13,860 | R15,400 | R29,260 | Late; whole gratuity displaced |
| DP-76BGPC | 17 Oct, past | 10 Oct 13:40, latest | 32 -> 29; 27 | 10 Oct 17:00 | R5,486.25 | R7,315 | R12,801.25 | Earlier approval; repeated-calculation anomaly |

All nine current bar snapshots sum to R181,431.25, NOT all policy-questionable.
Show schedule changes for the flagged structured cases preceded reductions;
no later show transfer explains a different deadline.

## Recommended Action Per Recorded Booking

- **DP-W2M2MC:** Accounts urgently establish authority for the R8,250 gratuity
  conversion before 27 November; ticket R10,560 was timely. Later 42 -> 41 save
  on 16 November 09:44 was also timely, but snapshot still uses 42. R11,880
  operational bar limit is a separate settle-on-night arrangement, not extra paid
  cancellation credit. Verify approved spending entitlement with venue staff.
- **DP-387ZNC:** Accounts urgently establish authority for R4,620 gratuity before
  28 November. Ticket R5,280 was timely. Open bar/credit-card settlement on the
  night does not establish another prepaid amount. Do not automatically revoke
  either future booking's credit from this audit.
- **DP-YB9HPC / Exemplar:** review R29,260 against receipts, agreement and POS.
  R13,860 cancelled tickets plus R1,732.50 cancelled-guest gratuity form the
  incident-time forfeiture basis R15,592.50; R13,667.50 belonged to remaining
  71 guests' gratuity. These are classifications, not approved retrospective
  adjustments. Total/paid R138,600, balance R0; service fee/current ticket gratuity
  zero. Separate R70,000 operational bar limit explicitly NOT prepaid, excluded.
  Request dated 11 November was also late; no located exception overrides cutoff.
- **DP-FNZGQC:** review R16,500 with restored ticket entitlement before any action.
  Original late save moved R6,600 tickets + all R9,900 gratuity. At that moment,
  R825 gratuity related to cancelled five; R9,075 related to remaining 55.
  But guests were restored 55 -> 60 on 12 November 11:51:08; total briefly rose
  R89,100 -> R95,900, then at 11:51:38 reconciliation reason "no changes to price"
  restored R89,100 total/paid, R0 balance. Bar R16,500 remained. Cannot simply
  apply the earlier 55-guest forfeiture calculation to today's restored booking.
- **DP-8BRCQC:** review R13,475 full-gratuity conversion and consumption. Notes
  explicitly request six-ticket R9,240 bar value, not all gratuity. Later 64 -> 63
  save 12 November 16:23 (request 9 November) was late; notes say forfeited one
  ticket and no new bar credit. No extra transfer added to audit exposure.
- **DP-LFM3PC:** review R8,662.50 full gratuity and stale 38/37 snapshot. Later
  38 -> 37 on 16 November 16:51 was late, no additional structured credit.
  Operational limit R12,320 differs from R10,780 ticket credit by R1,540; a limit
  is not evidence of a funded extra transfer, so do not add R1,540 to exposure.
- **DP-BZ23PC:** review R12,512.50 gratuity conversion. Reduction was 2h13m before
  cutoff, not late. Operational note says 52 -> 49 day-of with three tickets
  forfeited, but database remains 52 with no further financial allocation.
  Reconcile operational headcount without inventing additional bar credit.
- **DP-J7SPNC:** preserve explicitly approved 3 November R19,470 transfer,
  documented in retained-value-transfer archive. Current extra guest added
  20 November 08:33 at R1,360 gives total R105,310, paid R103,950, balance R1,360;
  snapshot still reflects 64. Reconcile this receivable separately. Operational
  R32,000 bar / R4,000 bar gratuity notes do not prove cancellation transfer.
- **DP-76BGPC:** preserve documented management authority for initial 38 -> 32
  transfer on 28 September 18:22: R9,240 tickets + R7,315 gratuity = R16,555.
  Repeated 32 -> 29 save used unchanged original R58,520 ticket base / 32,
  inflating unit basis to R1,828.75 versus original R1,540; bar fell R3,753.75 to
  R12,801.25 despite fewer guests. Later 29 -> 27 on 13 October 09:22 was late
  with no new snapshot. Accounts reconstruct intended authorised allocation;
  no defensible extra debt/loss amount assigned from this anomalous calculation.

## Late Note-Only Claims: Not Proven Funded Transfers

| Reference | Venue/show | Reduction | Cutoff | Claimed bar | Finding/action |
| --- | --- | --- | --- | ---: | --- |
| ZNG-7EDC4C | JHB 22 Nov, past | 30 -> 29; 17 Nov 12:52 | Corporate 15 Nov 17:00 | R1,360 | Late cancelled ticket claim; Accounts verify whether honoured. R5,100 gratuity separately retained, not added to bar exposure. |
| ZNG-RLKP77 | JHB 19 Nov, past | 17 -> 16; 16 Nov 10:20 | Standard 14 Nov 17:00 | R1,440 | R550 late deposit cannot become bar; other R890 claimed lacks funding evidence. Reconcile against earlier BUG-000036 evidence, not artificial repricing. |

ZNG-RLKP77 is Standard (`admin_staff` / `admin`), not Corporate merely because
17 guests. Original 16-guest total R26,483; old defect added the 17th at only R550,
producing R27,033 paid/current total. Removing that guest left total unchanged.
Do not treat all R1,440 as prepaid, or R890 as an established refundable balance.
The two claims total R2,800: at least R1,910 would violate late policy if honoured,
with another R890 unsupported funding. No proof either claim was redeemed.

## Future Timely Note Claims: Excluded From Breach Totals

All funding/approval remains to be checked before operational use. Gratuity is
separately retained in these notes, not evidenced as moved into bar. These are
potentially legitimate timely ticket transfers, not confirmed policy defects.

| Reference | Venue/show | Relevant reduction saved SAST | Applicable cutoff SAST | Current note claim |
| --- | --- | --- | --- | ---: |
| ZNG-DGR95P | CPT 18 Dec | 32 -> 30, 16 Nov 13:33; 30 -> 29, 17 Nov 19:41 | Corporate 11 Dec 18:00 | R4,620 |
| ZNG-NS3EEP | JHB 12 Dec | 27 -> 24, 17 Nov 11:09 | Corporate 5 Dec 17:00 | R4,320 |
| ZNG-TZH85V | CPT 12 Dec | 20 -> 17, 19 Nov 13:12 | Corporate 5 Dec 18:00 | R1,250 |
| ZNG-WG7X4M | JHB 11 Dec | 13 -> 11, 18 Nov 09:34 | Standard 6 Dec 17:00 | R3,080 |
| ZNG-TERY6Y | JHB 9 Dec | 26 -> 25, 11 Nov 15:26 | Corporate 2 Dec 17:00 | R1,360 |
| ZNG-7KDQKJ | JHB 5 Dec | 20 -> 17, 17 Nov 20:11 | Corporate 28 Nov 17:00 | R3,750 |
| DP-9W33PC | JHB 4 Dec | 31 -> 29, 17 Nov 10:51; 29 -> 28, 17 Nov 20:33 | Corporate 27 Nov 17:00 | R4,620 |
| ZNG-8MCAAX | JHB 3 Dec | 26 -> 24, 9 Nov 13:36 | Corporate 26 Nov 17:00 | R2,880 |
| ZNG-8QK442 | JHB 2 Dec | 10 -> 9, 6 Nov 11:37; 9 -> 8, 16 Nov 10:52 | Standard 27 Nov 17:00 | R2,500 |
| ZNG-S7GXQX | CPT 29 Nov | 6 -> 4, 12 Nov 16:26 | Standard 24 Nov 18:00 | R2,400 |
| ZNG-FMR8WJ | JHB 27 Nov | 29 -> 27, 12 Nov 08:57 | Corporate 20 Nov 17:00 | R2,720 |

Total R33,500, including Cape Town R8,270. Do not automatically derive entitlement
from headcount alone: TZH85V priced quote basis differs from operational count;
S7GXQX claim changed R2,720 -> R2,400. FMR8WJ was unpaid at reduction, now paid
R44,370; establish source of credit rather than infer paid status at that time.
TERY6Y moved shows on 14 October, before relevant reductions, not after cutoff.

Additional exclusions: DP-JHB-F63DAB335744 has approved COMP R2,100 bar/R262.50
gratuity, zero paid/total; explicitly not paid evidence, not cancellation-funded
cash. DP-VDB5PC timely 11 -> 10 on 3 November 14:11 (show 13 November, Standard
cutoff 8 November 17:00): R1,540 note added 14:15, removed 16:10 same day; now
11 guests, total/paid R19,057.50, no active credit snapshot. No consumption proven.

## Recurrence Verification And Residual Risks

Reused release a347b1f9775613c20d893f15b634651014c313af evidence: 117 targeted
tests, 17 rollback-only database fixture cases, successful cloud build/budget,
Production dpl_DgGs3t4zMnooYU2LzRuEpvHjw1xd READY. No repeated browser/mutation QA.
Installed function MD5s still match release evidence:

- Reduction basis: `9cf7f5c641f61aac37511d4607c3d90c`.
- Atomic reconciliation: `694183f1e8a35b3201fddcf11e395aa0`.
- Old RPC rejection: `af5b01ce3dc2a13a524c3c7d894d3271`.
- Anonymous function execution denied.

New reduction route rejects old whole-gratuity transfers, enforces deadlines,
retains remaining gratuity, permits only eligible paid ticket value for bar, and
blocks automatic repeat reductions on existing allocations. Lock, version,
permission, idempotency and rollback protections remain. No historical backfill.

Remaining risks, not additional proven incidents:

1. Existing legacy allocations and informal operational promises are not cleared
   by a code release. Venue/Accounts should verify authority and actual prepaid
   entitlement before use; this audit does not revoke any entitlement.
2. Six allocation records have later headcount drift: W2M2MC, 8BRCQC, LFM3PC,
   J7SPNC, FNZGQC and 76BGPC. Existing approved snapshots need case-level review.
3. Source review of `src/app/api/admin/bookings/route.ts` found general PATCH
   allocation/policy guards around 3082, but separate `persistBookingAddonUpdate`
   path around 3398-3582 preserves old allocation metadata while updating addons,
   totals/service fee, without equivalent policyApplied/valueAllocation
   revalidation. Existing permissions, venue and revision checks remain. This
   can leave snapshot drift after a priced addon edit; no exploit/mutation test
   was performed and no extra forfeiture transfer is asserted. Recommend a
   narrowly scoped follow-up guard review, not a claim of platform-wide immunity.
4. Original signed exceptions/external consumption evidence remain unavailable.
   Obtain agreements, payment allocation and POS reconciliation before any
   separately authorised correction; never create artificial balances or rewrite
   historical receipts. Buyout contractual terms remain excluded from generic
   Standard/Corporate deadlines; no confirmed Buyout transfer breach located.

Priority: future two gratuity authorisations first; then Exemplar and restored
FNZGQC, historical three unverified gratuity conversions and two late note claims;
then authorised-but-stale/anomalous allocations and preventive addon-path review.

## Private Local Evidence

`local-evidence/platform-bar-credit-*-2026-11-23.json`:
inventory, transfer-history, other-paths, candidate-context, relevant-timelines,
crosscheck, final-scope-check, operations-crosscheck. Financial excerpts are private
local evidence, not public attachments. Reused cancellation-production-deployment,
production-build, release-db-verification and release-before evidence. Existing
archives retained unchanged. No commitments, transfers, financial corrections or
Production actions authorised by this read-only report.
