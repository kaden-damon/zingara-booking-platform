# P0 - COMP Selection Blocking Bookings

DATE: 30 OCTOBER 2026

STATUS: RELEASE READY

## Result

The paid booking and complimentary booking states are now explicitly separated.
The shared eligibility guard requires Standard, Media or Tradex only while
Complimentary is active. Paid Standard and other paid paths do not inherit the
COMP requirement, and stale COMP category state is cleared when returning to
paid pricing.

The calendar action and COMP choices now use unambiguous labels so staff cannot
mistake Standard Booking for Standard COMP. All Phase 59.1 financial rules are
unchanged: every COMP category remains R0 payable with an internal R550 per
guest cash-up value.

## Evidence

- Authenticated Production paid Standard and Standard COMP journeys were checked
  through the enabled final action without submitting a booking.
- 19 focused tests passed.
- TypeScript, diff validation and the Production build passed.
- No Production booking, customer, payment or financial record changed.

Rollback application commit: `fe2defee485aaeae969d1a74ee3dd9f1cb5bf476`.
