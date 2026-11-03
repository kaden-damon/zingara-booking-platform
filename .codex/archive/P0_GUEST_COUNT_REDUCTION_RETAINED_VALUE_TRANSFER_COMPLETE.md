# P0 Guest Count Reduction & Retained Value Transfer

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 3 NOVEMBER 2026

## Authoritative Booking

- The incident reference supplied as `ZNG-M7HYQ3` is not Jane Grobler's
  booking. It belongs to an unrelated 18-guest Corporate booking.
- Jane Grobler's booking is `DP-J7SPNC`, Johannesburg, 20 November 2026,
  70 Middle Ring guests, fully paid R103,950 with R0 outstanding.
- The booking retains one valid 70-seat merged operational table,
  `305+306+307+308+309+310+311+312+313`.

## Root Cause

- The retained-value amendment modal required a separate explicit transfer
  confirmation before saving.
- Until selected, the final `CONFIRM GUEST COUNT` button was silently disabled.
  Staff received no validation message and no request reached
  `/api/admin/bookings/reconciliation`, making the workflow appear to hang.
- Production audit and request evidence contained no partial or duplicate Jane
  amendment. The existing server permission, transaction, stale-revision,
  idempotency, financial and table-preservation safeguards were operational.

## Financial Reconciliation

- Source ticket evidence: R92,400 / 70 = R1,320 per guest.
- Six released tickets: R7,920.
- Final ticket value for 64 guests: R84,480.
- Existing gratuity transferred: R11,550.
- Final bar tab: R7,920 + R11,550 = R19,470.
- Total retained: R84,480 + R19,470 = R103,950.
- Refund: R0. Original payment evidence and VAT history remain unchanged.

## Correction

- Preserve the mandatory retained-value confirmation and all server-side
  safeguards.
- Permit the final button to explain the missing confirmation locally instead
  of silently disabling it.
- Display the actionable instruction: `Confirm the retained value transfer to
  Bar Tab before saving.` No API request occurs until the explicit transfer
  confirmation is selected.
- Add a regression test for Jane's exact 70-to-64 financial allocation and the
  non-silent confirmation behavior.

## Impact And Verification

- Seventy-two active imported fully paid bookings have the same retained-value
  evidence path; 33 are current or future as at 3 November 2026. The correction
  is shared and does not alter ordinary paid, deposit, Corporate or COMP paths.
- A forced-rollback Production RPC call completed Jane's exact reduction with
  the expected retained allocation and preserved table assignment. The
  transaction was rolled back and changed no business data.
- Focused tests: 29/29 passed.
- TypeScript, changed-file ESLint and diff validation passed.
- Next.js Webpack Production build passed. The local Turbopack worker failed
  only because it could not bind its compiler port in this environment. The
  standalone performance-budget script does not parse the Webpack manifest;
  the correction adds no requests, polling, dependency or background work.
- Authenticated Production UI verification after deployment confirmed the
  exact preview, an enabled final button and the actionable missing-confirmation
  message. The modal was closed without submitting Jane's amendment.
- Final read-only Production verification: 70 guests, total/paid R103,950,
  balance R0, fully paid, unchanged revision and zero retained-reduction events.

## Release

- Application commit: `b2807abb46699d82d21a064be66583bf353466c6`.
- Vercel Production deployment: `dpl_8WbtzWZuxES8jB41m8dLHL1AWPx3`.
- Deployment state: Ready, Production target, aliased to
  `book.zingara.co.za` at 14:11:55 SAST on 3 November 2026.
- Migration: none.
- Rollback: revert `b2807abb` and redeploy the prior application build.
- Business-data delta: zero.

## Operational Retry

Vanessa may safely retry `DP-J7SPNC`: enter 64 guests and the mandatory reason,
review the displayed values, select `TRANSFER RELEASED VALUE + GRATUITY TO BAR
TAB` until it reads `TRANSFER CONFIRMED`, then select `CONFIRM GUEST COUNT`.
This is the authorised action that will execute the existing atomic amendment.
