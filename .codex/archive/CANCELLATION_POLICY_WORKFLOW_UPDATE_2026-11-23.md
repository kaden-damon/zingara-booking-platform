# Cancellation Policy And Financial Workflow Update

Date: 23 November 2026. Existing task continued, no new phase.
Status: released to Production / READY; non-mutating live verification complete.

## Authority And Scope

Read AGENTS.md/CURRENT_TASK.md/README.md and the recent cancellation/gratuity,
retained-allocation and Production release records. Management explicitly
authorised prospective cancellation workflow/disclosure changes and release.
Subsequent clarification confirms that late Corporate cancelled ticket value
AND its prepaid gratuity are forfeited. Remaining guest gratuity stays allocated.
This supersedes the previous late-Corporate contractual uncertainty only; it
does not authorise retrospective changes, Buyout overrides or genuine refunds.

Baseline main/Production: 3bc0d6adf8daba7c151417decb04becbc92bafa6 /
dpl_J9uJuqnW9NkfHnUgvUu52bb5S9bu, READY.
Unrelated dirty Markdown/evidence preserved and excluded from the release.
Frontend 2.0 and its worktree/checkpoints were not touched.

## Prospective Behaviour

- Shared existing cancellation policy evaluator supplies five-day Standard and
  seven-day Corporate boundary calculations. Exact cutoff inclusive; SAST show
  start used. Atomic database checks recompute money and current boundary before
  saving and compare the displayed preview. Opening a form does not freeze time.
- Late Standard reductions forfeit up to R550 per cancelled guest from the ticket
  value. Late Corporate reductions forfeit cancelled tickets plus proportionate
  prepaid gratuity. Remaining gratuity retains its recorded booking-specific
  proportional basis, with exact-cent residuals; no new global gratuity charge.
- Eligible non-forfeited PAID ticket value can be explicitly allocated to the
  existing bar-transfer purpose or held for the existing authorised refund
  process. Cancelled gratuity is never automatically transferred to bar.
- Before the Corporate cutoff, eligible cancelled gratuity is held for refund
  processing, not declared contractually unresolved. Historical Standard prepaid
  gratuity whose treatment remains unconfirmed is held separately for review.
- Confirmed native deposit-only cases require exactly R550 per original guest,
  persisted R550 deposit basis, ordinary native source, no gratuity/add-ons and
  a valid remaining obligation. Unpaid cancelled ticket value is removed from
  the obligation, never converted into cash/bar/refund credit. Paid receipts stay
  unchanged; outstanding is recalculated against the revised retained total.
- Fully paid native and manual-invoice imported component bases are supported.
  Existing allocations, mixed-zone pricing, unverified Corporate quote components,
  native priced add-on combinations and other ambiguous partial-payment histories
  fail closed with actionable Accounts guidance instead of invented allocations.
- Buyouts are detected using their booking identity/commercial model and retain
  their existing fixed-package guest-count workflow. Generic whole-cancellation
  tools do not apply 5/7-day policy to Buyouts or existing allocated histories;
  these require the agreed contractual/Accounts review path.
- Financial totals/receipts for fully paid reductions are retained and explicitly
  partitioned into remaining tickets/gratuity, existing bar/other value, forfeiture
  and any refund/review reserve. A reserve is NOT an executed refund. Settling it
  remains a separately authorised financial operation, not part of this release.

## Server Integrity And Reporting

- New function-only migration adds service-role-only basis and atomic policy
  reduction functions. It delegates existing operational reductions to the
  established atomic functions, preserving their capacity/table/zone/ticket rules.
  Staff permission/venue, active competing edit locks, row/revision checks,
  fresh boundary checks and operation retry identity are validated.
- Superseded all-gratuity transfer RPC now rejects old callers. Obsolete client
  calculator removed. General booking PATCH cannot bypass reduction review or
  rewrite existing allocation metadata. HTTP replay returns the original committed
  result without sending another Wallet update.
- New allocation records preserve immutable legacy receipt evidence. Further
  total-only financial edits/increases, generic whole cancellation/full-provider
  refunds and aggregate accounting prefills are guarded where they would erase
  component obligations, refund forfeitures or misclassify them as ticket sales.
  No signed exception is silently overridden; ambiguous cases remain review-only.
- Admin summaries, Table Plan K/L notes, current allocated gratuity/bar columns
  and Function Brief financials use the allocation. Retained forfeiture/review
  receipts are not double-counted as new ticket sales or additional gratuity.
  Existing Table Plan columns/formulas and secondary-table clearing retained.
- Function Briefs also correctly read historical valueAllocation without changing
  it. Original collection evidence is distinguished from current allocation.
  Historical cash-receipt reports remain historical receipt evidence, not a new
  entitlement calculation. Existing issued accounting documents are untouched.
- Public Booking & Cancellation Policy and relevant general Terms now explain
  deadlines, reductions, Corporate gratuity, no bar credit for forfeiture and
  separate Buyout/agreed terms. Existing unaffected language retained. Reused
  compact notice component appears before ordinary, Corporate and payment-link
  checkout actions. No new dependency or customer communication added.

## Verification

- 117 targeted tests pass across new policy, existing cancellation boundaries,
  reconciliation, Corporate guest changes, Table Plan financials and Function
  Brief/PDF helpers. Includes exact cutoffs, Standard deposits, native/imported
  allocation parity, no credit from unpaid values, gratuity preservation/
  forfeiture, accounting guards and public payment placement.
- 17 isolated SQL fixture cases passed. These use pg_temp tables and functions
  in a transaction ending ROLLBACK, not real bookings. Checked matching previews,
  unchanged receipts, recalculated deposit balances, permission/revision failures,
  active competing and expired locks, altered previews, failed-save rollback and
  successful same-operation retry. Existing underlying operational functions were
  stubbed only in these temp fixtures; their guards have existing regression tests.
- Test evidence: local-evidence/verify-cancellation-policy-db.mjs and
  local-evidence/cancellation-test-loader.mjs (local only).
- TypeScript passed. New/changed focused modules lint clean. Larger legacy lint
  baselines unchanged: Admin 2 errors/59 warnings; Book 10/15; Corporate Payment
  1/0. Existing unrelated warnings were not refactored.
- Local optimised build blocked by the previously recorded Turbopack CSS worker
  port-binding restriction, even with elevated execution. No false local-build
  success claimed. Git-triggered Vercel build and Admin budget must pass before
  reporting completion.
- No real booking/cancellation/refund/payment, ticket scan or customer message
  used for QA. No physical-iPhone verification claimed.

## Migration And Rollback Safety

Migration: 20261123150000_guest_reduction_cancellation_policy.sql. No tables,
columns, backfill or historical financial changes. Original function definition
and protected DP-YB9HPC / DP-FNZGQC booking hashes saved in generated
local-evidence/cancellation-release-before.json.

Migration dry run reports an unrelated existing remote-history mismatch for
20261112100000_p0_booking_payment_link_integrity.sql. Do NOT replay/include-all
or repair that unrelated item. Apply only this reviewed migration transactionally
and record only its version through the established migration repair mechanism.
Code rollback is the preceding release; database rollback restores the saved
original function and removes the two newly introduced functions if required,
without rewriting any booking. Restoring the old transfer policy would require
management consideration; do not silently resurrect the unsafe behaviour.

## Remaining Boundaries

Standard historical prepaid-gratuity exceptions and ambiguous existing contracts/
payments require authorised review. Existing eligible refunds still require
authorised settlement through the appropriate accounting/payment process. The
release does not introduce an automatic partial PayFast refund or a new pricing
engine, and does not reclassify settled financial history. DP-YB9HPC and DP-FNZGQC
must remain unchanged. Production verification must be non-mutating.

## Completed Production Release

- Commit **a347b1f9775613c20d893f15b634651014c313af** pushed to main through the
  existing Git-triggered release. Only 32 scoped source/test/migration/new-task
  record files committed; pre-existing Markdown changes and evidence excluded.
- Reviewed function-only migration applied in one transaction, without a data
  backfill or real booking mutation. Only migration version **20261123150000**
  was marked applied. The unrelated older history discrepancy was not changed.
- Vercel Production **dpl_DgGs3t4zMnooYU2LzRuEpvHjw1xd** is **READY** and aliased
  to **book.zingara.co.za**. Deployment URL:
  https://zingara-booking-platform-hv6w41bl0-kaden-damons-projects.vercel.app
- Cloud build compiled in 5.7s and completed in 52s, including TypeScript and
  the existing Admin performance budget. Raw **1,306,308 / 1,320,000** bytes;
  gzip **316,981 / 320,000**; largest gzip chunk **168,649 / 170,000**.
- Live cancellation policy, general Terms and Admin return HTTP 200. Verified
  five/seven-day wording, late Corporate prepaid-gratuity forfeiture, no refund/
  bar conversion of forfeiture and separate Buyout terms in the served policy.
  Anonymous reconciliation/refund POSTs return 401 before business actions.
- Installed basis/atomic/legacy-rejection functions deny anonymous execution.
  Definition hashes: basis `9cf7f5c641f61aac37511d4607c3d90c`; atomic reduction
  `694183f1e8a35b3201fddcf11e395aa0`; superseded RPC
  `af5b01ce3dc2a13a524c3c7d894d3271`.
- Exact protected booking hashes match before/after: DP-YB9HPC
  `f5ec8f28aff9dafaa21d868387a1ab4c`; DP-FNZGQC
  `5fe54aee06695ed679a813ffea73f2c8`. Neither record was amended.
- Generated private evidence remains local under `local-evidence/`:
  cancellation-release-before.json, cancellation-release-db-verification.json,
  cancellation-production-deployment.json, cancellation-production-build.log,
  cancellation-production-http-verification.json. Existing checkpoints preserved.
- No authenticated real Production reduction/refund or physical iPhone test was
  performed. Financial mutation correctness was verified with isolated temporary
  fixtures and regression tests, not by changing live customer bookings.
- Completion evidence appended locally; no second deployment was triggered merely
  to publish Markdown status. CURRENT_TASK and unrelated local records preserved.
# BUG-000037 — 24 November 2026

Release: b0d6576ed77e8d5ec31ff3a7ede8d9e1a4afa6fd pushed to main. Vercel
dpl_F39UNymuj13ZRgrhpNJGPWubkh8W READY, exact SHA and Production alias verified
24 November 12:38 SAST. Live /admin 200; unauthenticated reconciliation GET
401. No signed-in amendment attempted. TypeScript, focused ESLint and diff
checks pass. Release proof: local-evidence/bug37-production-release.json.
Only guestReductionServer.ts and its new test committed; all unrelated work
preserved. Documentation remains local alongside existing uncommitted records.
Post-release read-only booking hash remains fe2499744ab61c60208a607cf50ba88f:
12 guests, R19,440 total/paid, R0 outstanding; no booking changes.

- Read-only Production diagnosis: ZNG-XSUC8A is Corporate/corporate-direct,
  12 guests on 2 December 17:00 JHB, subtotal/total/paid R19,440, service fee R0.
  Stored booking hash: fe2499744ab61c60208a607cf50ba88f.
- No legacy invoice evidence; no Corporate request linked by database field or
  found by metadata request ID. Operational notes say tickets R14,960, prepaid
  bar R2,440, gratuity R2,040. These sum to total but are not verified component
  evidence. Do not turn notes into accounting authority or infer a split.
- The guard introduced in a347b1f9 is correctly protecting an ambiguous bundled
  invoice. A simple deletion would allow R19,430 ticket allocation plus an
  assumed R10 fee, contrary to recorded notes. No safe unlock established.
- Presentation-only correction in guestReductionServer translates the old
  quote/component error into an Accounts instruction naming ticket, gratuity
  and prepaid bar amounts. Preview and save share this existing loader. All
  other bases, RPC errors, request counts and monetary values preserved.
- Sixteen tests pass: three new loader tests and thirteen existing cancellation
  regressions including exact seven-day cutoff, late Corporate forfeiture,
  retained gratuity, eligible bar transfers, totals, reporting and server guards.
- Booking unchanged. No migration or financial mutation. Frontend 2.0 untouched.
- Resolution note: cause identified; clearer recovery guidance released pending
  release evidence below. BUG-000037 is NOT financially resolved: Accounts must
  verify the invoice components before a safe allocation can be authorised.

## BUG-000037 Actual Workflow Correction — Authorised Follow-Up

The message-only release above did not meet acceptance. User explicitly
authorised Sales to confirm the breakdown inline; no Accounts/developer handoff
is now required to perform an eligible guest reduction and ticket-value transfer.

- Existing Edit Guest Count now conditionally shows four blank money inputs
  (tickets, prepaid ticket gratuity, prepaid bar, other/fees), invoice reference
  and explicit reviewed confirmation. Edits reset confirmation. No default R10
  fee or gratuity reverse-calculation is used for this confirmed basis.
- Client/API/database require finite, nonnegative exact-cent components,
  positive ticket value and exact reconciliation to the stored booking total.
  Database retains priced add-ons and resolves ONLY the missing Corporate split
  guard. Existing permission, venue, paid-state, lifecycle, refund, Buyout,
  mixed-price, lock, revision and idempotency guards remain unchanged.
- Uses existing preview/request/RPC; no extra database query, API request,
  dependency or schema column. Function-only migration 20261124130000 patches
  the existing atomic function at checked markers, failing closed if unexpected.
- Server recomputes seven-day eligibility and all allocation figures. Late
  Corporate ticket/gratuity forfeiture remains; remaining gratuity is preserved.
  Before cutoff only eligible ticket value may become bar credit; eligible
  cancelled gratuity follows the existing refund process, never bar credit.
- Reviewed component/reference evidence is saved with actor/time in the existing
  allocation and audit only when the actual amendment succeeds. Original totals,
  receipts, payment rows and historical invoice evidence remain untouched.
- Twenty focused tests pass; 24 session-temporary SQL cases pass, including Sales
  permission fixture, early transfer, late forfeiture, invalid/mismatched money,
  stale saves, locks, existing refunds, atomic rollback and idempotent retry.
  Existing delegate is stubbed only in temporary fixtures: no real booking saved.
- Actual modal isolated Chromium checks 390/1280px pass, including capture of
  submitted preview, validation, reset confirmation and no horizontal overflow.
  No physical iPhone or signed-in Production mutation claimed. TypeScript,
  focused ESLint and optimised Webpack build pass.
- Function migration applied and only version 20261124130000 recorded. Prior
  function hash 694183f1e8a35b3201fddcf11e395aa0; installed hash
  1468184d88e435b54b9de7d1b9cee4e0. Protected booking hash remains
  fe2499744ab61c60208a607cf50ba88f. No booking or financial changes.
- Rollback definition: local-evidence/bug37-component-function-rollback.json.
  Temporary SQL/results and UI screenshots retained under local-evidence/bug37*.
- Commit b1cead69e6d0052b4e2dd6ddb13f4e455b7aecb0 pushed to main, seven scoped
  code/migration/test files only; unrelated Markdown and evidence not committed.
  Frontend 2.0 and all prior checkpoints remain untouched.
- Production dpl_9T3xxd8Nic2syNYx8kJDb1Maci57 READY, exact commit and live alias
  verified at 12:52 SAST. /admin 200; new controls found in live lazy-loaded
  /_next/static/immutable/chunks/3at4zlgeoc2ro.js. Unauthenticated reconciliation
  GET remains 401. Initial immediate asset scan missed the newly promoted lazy
  asset; final focused check confirms the released controls, not just READY.
- Read-only permission check confirms Michael's existing role is Super Admin
  with bookings:reconcile. Existing authorisation unchanged, no staff edits.
  Live mutation was intentionally not performed. Real delegated seating/ticket
  behaviour relies on unchanged established atomic workflow; isolated SQL tests
  verify its guarded invocation and allocation, not a real customer amendment.
- Release evidence: local-evidence/bug37-components-production-release.json and
  local-evidence/bug37-component-production-db-verification.json.
- Final resolution note: BUG-000037's operational block is removed through a
  validated self-service invoice confirmation in Edit Guest Count. Authorised
  staff can reduce guests and transfer eligible ticket value to bar without
  Accounts/developer intervention. Seven-day forfeiture and remaining gratuity
  rules remain. Michael's booking was not amended; no retrospective adjustments.

## BUG-000037 Reuse And Duplication Review — 24 November 2026

Compared a347b1f9^ (before cancellation update) to b1cead69, using actual Git
source, not only historical notes. No parallel financial workflow requiring
consolidation was found; no application changes or new deployment necessary.

| Existing path | Before policy update | b1cead69 / review conclusion |
| --- | --- | --- |
| Corporate Edit Guest Count | Fixed-total atomic guest-count change; no financial split entry | Same form/endpoint and atomic delegate, now wrapped by cancellation allocation safeguards |
| Retained Value Allocation | Read manual_invoice evidence, transfer released tickets AND all original gratuity | Existing policy preview permits eligible ticket credit only; preserving the old calculation would violate policy |
| Imported Invoice Evidence inputs | Financial correction for imported COMP with no evidence; ticket + gratuity must equal total | Not applicable to native paid Corporate bundles or separate prepaid bar; not an interchangeable component workflow |
| Imported Corporate enquiry reconciliation | Reconciles imported enquiry evidence before conversion | Not an amendment workflow for an existing native paid booking |
| Confirm invoice breakdown | Absent in original guest-count form | Conditional missing-basis extension within same form; no extra API/query, no invented amounts, source/actor audited |

The new field panel is not shown when the existing component basis is known.
Financial input concepts overlap, but there is no second applicable operational
control for Michael's booking to consolidate. Client/API/SQL validation serves
different trust boundaries; the authoritative financial policy remains unchanged.
The preceding task explicitly authorised staff-confirmed breakdown entry.

Verification reused, not rerun: 20 targeted tests, 24 temporary SQL cases,
390/1280px actual modal checks, installed function hash, live new asset and
Michael-role reconciliation permission. Eligible 12-to-11 fixture preserved
R19,440 paid, moved R1,246.67 eligible tickets to bar, retained R1,870 gratuity
and separately held R170 eligible gratuity for the existing refund process.
Those inputs were test evidence, not automatically approved live invoice values.
Michael can proceed through Edit Guest Count after checking the source invoice;
the seven-day deadline is 25 November 2026 at 17:00 SAST for this performance.
No actual live amendment made or authenticated end-to-end save claimed.

Permanent mandatory doctrine recorded in AGENTS.md and .codex/README.md; current
task updated. Documentation-only changes remain local alongside existing records.
No code/database changes, new release, repeated audit or Frontend 2.0 access.
