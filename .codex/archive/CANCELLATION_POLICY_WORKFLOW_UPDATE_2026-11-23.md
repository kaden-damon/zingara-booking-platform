# Cancellation Policy And Financial Workflow Update

Date: 23 November 2026. Existing task continued, no new phase.
Status: implementation and targeted checks complete; release evidence pending.

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
