# BUG-000034 Booking Status Save

Date: 19 November 2026
Status: Approved for release; Production verification pending.

## Evidence

Fatima attempted Awaiting Payment to Confirmed for ZNG-964D2N. Her retained
exclusive edit lock covered the failed save. The booking revision remained
13 November; the reported PATCH returned BOOKING_CHANGED / 409 on
18 November at 11:21:22 SAST.

Read-only snapshot reproduction used the existing hydration and merge code,
without an HTTP save or message. Two embedded lifecycle events hydrated as
four due to timestamp spelling differences. The status action changed status,
lifecycleHistory and communicationHistory; only lifecycleHistory conflicted.

## Correction

- Lifecycle comparison normalises equivalent timestamp spellings, IDs and
  property order, preserving sub-millisecond precision and substantive
  note/status/time differences.
- Client hydration deduplicates equivalent metadata/relational projections.
  Server merging retains authoritative historical event objects and one
  new event, including for a pre-fix browser snapshot.
- Existing locks, permission checks, version compare-and-set and payment
  ownership remain unchanged. Rejection-only diagnostics record safe stages,
  lock classification, version equality and allowlisted fields, never values.
- No migration, backfill, automatic confirmation or payment event.

Manual financial reconciliation separately records payment state; it does
not set booking status. The booking remains pending_payment / fully_paid,
R36,000 paid and R0 outstanding until an authorised staff amendment.
The bounded finding of at least 100 paid/pending bookings is not authority
to change them, nor a count of proven failed saves.

## Verification And Release

Twenty-three focused regressions cover status transitions, paid/partial
amount preservation, duplicate projection, real conflicts, diagnostics,
lock recovery, ITN and managed booking safeguards. TypeScript and whitespace
checks are required. Production verification must be read-only; a successful
real save and notification dispatch must not be claimed without performing
an independently authorised operation.

Commit, deployment and final checks will be recorded here after release.
Rollback: revert the approved code commit and redeploy; no data rollback
or schema reversal is required. Preserve all unrelated work.
