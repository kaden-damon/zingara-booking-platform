# ZNG-6MGLG2 Ticket Restoration

STATUS: CORRECTION RELEASED; BOTH ORIGINAL TICKETS RESTORED AND LIVE LOOKUPS VERIFIED

DATE: 23 NOVEMBER 2026

## Evidence And Root Cause

- Continued the existing project/worktree; read AGENTS.md, CURRENT_TASK.md,
  README.md, the current PayFast investigation and relevant release/ticket
  integrity records. Preserved unrelated uncommitted work and Frontend 2.0.
- 30 October: booking created for two Middle Ring guests, initially 20 December
  Cape Town, table 302. R1,100 PayFast deposit / provider 337544887 recorded.
- 2 November 13:59:41 SAST: staff intentionally cancelled it, reason "Booked in
  error". The table was released and tickets cancelled. This history is retained.
- 17 November 10:06:05 SAST: Hannah legitimately reinstated it using the existing
  permission/payment/capacity-checked function. Audit explicitly reports two
  existing tickets reactivated, with the floor assignment still required.
- 17 November 10:06:43 SAST: authorised transfer to Cape Town, 19 December 18:00,
  Middle Ring. Existing two-seater override records joining another table.
- 18 November 10:23:48 SAST: R1,620 balance / provider 341807867 received. Total
  R2,720, paid R2,720, balance R0, confirmed / fully_paid, two guests.
- The reinstatement function changes authoritative booking/ticket rows but does
  not refresh the embedded booking snapshot in notes. The public ticket loader
  spread that stale snapshot into `persistGuestTickets` without overriding status.
  Its status persistence cancelled rows when the embedded booking said cancelled,
  even after the database booking was confirmed. Later reads preserve terminal
  rows and expose them as void in guest metadata, explaining why payment alone
  did not repair the two cancelled identities.
- Confirmed deterministic code defect: the existing loader can reapply stale
  cancellation after successful reinstatement. Regression exercises the actual
  route function with conflicting row/metadata state. There is no durable
  per-ticket write-origin record proving the exact HTTP request that re-cancelled
  these rows; do not invent an actor or request timestamp for that write.

## Smallest Correction And Release

- Four production lines in `src/app/api/tickets/[reference]/route.ts`: after
  spreading metadata, use the authoritative row's booking status, guest quantity
  and show ID before ticket persistence. Existing row loading/query count reused.
- Terminal cancelled/refunded/void/expired ticket protection remains unchanged;
  ordinary ticket lookup does NOT automatically reactivate cancelled tickets.
- Added `src/lib/ticketReinstatementLifecycle.test.ts`: actual loader regression,
  legitimate cancellation/refund, persisted lifecycle spellings/current show and
  quantity, and terminal ticket security preservation. No new dependency.
- 25 targeted tests pass (four new plus 21 existing identity/population checks).
  TypeScript, changed-file ESLint and whitespace checks pass.
- Commit **d12249b46aed893bb0bc2d4c950add3ce7139713** pushed to main. Only the
  route and regression test were committed; unrelated local work stayed unstaged.
- Vercel Production **dpl_DNR1bxa9j13rcBLfGahfvB9SvaLs**, **READY**;
  exact-SHA deployment `zingara-booking-platform-a8pf5g06q-kaden-damons-projects.vercel.app`
  verified serving `book.zingara.co.za` before recovery.
- No schema/function migration or new ticket lifecycle workflow introduced.

## Authorised Recovery

- Booking is already confirmed, so invoking booking reinstatement again or
  temporarily cancelling it would be incorrect. Reused its existing ticket
  restoration UPDATE semantics and live security triggers in a hard-bound,
  row/advisory-locked, audited one-booking transaction instead.
- Verification script defaults to rollback:
  `local-evidence/ticket-restoration-ZNG-6MGLG2-2026-11-23.sql`.
- Rollback-only trial passed first. The identical guarded recovery was then
  committed under the user's explicit ticket-restoration authority.
- Restored existing IDs `6095a1ff-f174-43ca-bb16-0d84f4c00235` and
  `25aa47b2-ff0e-48ac-8554-a3318b53c911` from cancelled to valid. Synchronized
  only their current guest-ticket metadata status, retaining original QR values,
  issue dates and identity links. No ticket or booking inserted/deleted.
- Eligibility guards: exact booking/show/guest/financial state, payment evidence,
  no refunds/reversals, prior audited reinstatement, no later cancellation,
  no live edit lock, exactly two matching unreplaced identities, no scans or
  Wallet registrations, and capacity within the approved operational limit.
- Integrity fingerprints checked all non-metadata booking state, all payment
  records, communications and ticket identity fields. No guard/trigger bypass.
- Recovery audit **3546c258-f3b2-46a2-854a-3a157392133c**, action
  `booking.guest-tickets-restored`, **23 November 11:12:00.788 SAST**. Original
  cancellation/reinstatement/transfer/payment history remains intact. Recovery
  request key `ticket-recovery-ZNG-6MGLG2-20261123` prevents duplicate recovery.

## Production Verification And Remaining Notes

- Each original QR identity separately resolves through the live ticket API:
  HTTP 200, ticket valid, both guest statuses valid, confirmed booking, two guests,
  current show ID `428d3261-f9d8-4551-9c5e-7756e67a1e9d`, date 19 December.
- Post-lookup read-only database check confirms exactly two valid tickets, zero
  scan/check-in records, original identity/QR fingerprint unchanged, and payment
  fingerprint unchanged. Total/paid remain R2,720 and balance R0.
- Current Middle Ring entitlement 132 against approved operational capacity 133,
  identical to pre-recovery. Restoration adds no guests, table or capacity claim.
- Zero new communications since recovery; zero Wallet registrations. No payment,
  invoice, refund, ticket email, resend, push dispatch or customer message invoked.
- Booking Details uses the same restored authoritative ticket rows/current guest
  metadata. No authenticated Admin browser session or physical admission scan was
  performed; scan eligibility was verified through ticket status, original QR
  resolution, current performance association and unchanged scanner guards.
- Existing floor/table assignment remains outstanding; operational note requests
  joining ZNG-KQHU9X. No table was promised or allocated by this recovery.
- ZNG-X94SUT was not modified. Frontend 2.0/checkpoints were untouched.
