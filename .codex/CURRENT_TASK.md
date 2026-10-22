# P0 - Booking amendment and ticket integrity repair

Zingara is live Production. Diagnose first, then implement and deploy only the smallest verified correction.

## Goal

Permanently resolve recurring ticket-identity states that prevent legitimate guest-count increases while preserving every valid booking, payment, ticket, QR identity, capacity entitlement and financial record.

Production canary: `ZNG-562EB5`, Callie Addison, Johannesburg, 22 October 2026, currently 4 guests and requested 5 guests. The expected additional obligation is R550. Do not execute the real guest-count amendment without separate explicit authorisation.

## Investigation

- Trace the exact amendment guard and the lifecycle of canonical, voided, regenerated and replacement ticket identities.
- Identify the originating process that creates the blocked state, including migrations, regeneration, transfer, cancellation, reinstatement and reconciliation paths.
- Perform a bounded read-only audit of active bookings and classify valid replacements, duplicates, orphaned records, genuine conflicts and bookings likely to fail amendments.
- Determine why the previous Phase 50.3 safeguard did not prevent recurrence.

## Authorised correction

- Recognise unambiguous valid replacements and reconcile obsolete records without weakening fail-closed identity protection.
- Ensure future regeneration persists authoritative replacement relationships and cannot create duplicate active identities.
- Preserve all valid customer tickets and QR codes.
- Do not physically delete ticket records, revoke valid tickets, perform destructive cleanup or automatically alter ambiguous records.
- Historical reconciliation must be classified, audited, non-destructive and applied only where the relationship is authoritative and unambiguous.

## Verification

Prove original issuance, regeneration/replacement, guest increases and decreases, transfers, cancellations, reinstatements, refunds, partial payments, QR validation, concurrency and duplicate prevention. Confirm `ZNG-562EB5` is amendment-ready while preserving its existing identities, financial evidence, zone, capacity, customer and booking reference.

Use bounded queries and preserve Phase 47.1 performance. Run focused tests, TypeScript, changed-file ESLint, `git diff --check` and Production build.

## Release boundary

Commit and deploy only the verified application correction. No customer communications and no real amendment to `ZNG-562EB5`. Preserve unrelated user-owned changes.

Final status: P0 complete - ticket identity integrity repaired.
