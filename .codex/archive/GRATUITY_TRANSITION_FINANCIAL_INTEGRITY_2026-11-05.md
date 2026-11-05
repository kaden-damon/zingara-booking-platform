# Gratuity Transition & Financial Integrity

STATUS: IMPLEMENTED - PRODUCTION RELEASE PENDING

DATE: 5 NOVEMBER 2026

## Scope

Remove automatic online gratuity from new customer-originated bookings while
preserving every historical financial agreement, payment, refund and balance.
Make the retained historical gratuity state visible in Booking Details and the
existing Table Plan Payment Summary.

## Production Audit

The audit covered all 4,579 `customer_public` bookings, including archived and
cancelled records, and reconciled booking totals with confirmed payment rows
and explicit legacy evidence.

| Classification | Bookings | Recorded gratuity | Evidence rule |
| --- | ---: | ---: | --- |
| Conclusively collected | 741 | R1,083,232 | Fully paid, booking paid amount and confirmed receipt rows cover the authoritative total, with no refund row |
| Charged, not fully settled | 568 | R871,939 | Deposit/pending/cancelled state or paid amount below total; component allocation is not inferred |
| Cancellation/refund review | 6 | R6,955 | Cancelled despite a fully-paid ledger state; retained for manual review |
| No recorded gratuity | 3,264 | R0 | `service_fee = 0` |

Production contains no explicit refund payment row with a positive refund
amount for the gratuity-bearing public population. That absence is not treated
as proof that a cancelled record's gratuity remains collectible.

## Root Cause And Transition Design

- `calculatePublicBookingPricing` and the public checkout both added 12.5% for
  parties of six or more. The deposit calculation then used that total.
- Add-on amendments independently added 12.5% whenever party size was six or
  more, which would have reintroduced gratuity into a new venue-paid booking.
- Historical imported gratuity is sometimes held in
  `legacy_booking_payment_evidence.ticket_gratuity_amount`, not
  `bookings.service_fee`.

The correction makes gratuity inclusion an explicit pricing input. New
`customer_public` bookings set it to false and snapshot `pay-at-venue` in the
existing serialized booking metadata. Trusted internal creation retains its
existing pricing behaviour. Add-on amendments add gratuity only when that
booking already carries gratuity, preserving the original agreement.

## Reporting

One shared resolver supplies:

- `GRATUITY COLLECTED: Rxxx`
- `GRATUITY PAYABLE AT VENUE`
- `GRATUITY REVIEW`

Fully settled native bookings use authoritative total and paid evidence.
Explicit legacy gratuity evidence takes precedence. Partial, cancelled and
refunded histories are never presented as fully collected. The Table Plan uses
the existing Payment Summary cell; no column or formula is added. Booking
Details receives legacy evidence through its existing bounded paginated query.

## Customer Communications

New online checkout, confirmation, payment link, Find My Booking, Admin email
preview and pre-show rendering state that applicable gratuity and additional
drinks are payable at the venue. Existing bookings with a persisted gratuity
continue to state that the 12.5% amount is included in their booking total.
No ticket or Wallet content required a change.

## Safety And Verification

- No historical financial row is updated by the application or migration.
- No PayFast, VAT, refund, payment-allocation, ticket, seating or capacity rule
  changes.
- Focused resolver/disclosure tests: 8/8 passed.
- TypeScript and Next.js 16 Production build passed.
- Admin performance budget passed.
- Linked migration dry run includes only
  `20261105235900_gratuity_transition_activation_audit.sql`.

## Release Evidence

Pending Production migration, application commit/deployment, live verification,
activation timestamp and the one authorised Fatima activation email.
