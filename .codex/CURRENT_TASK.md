# P0 - Booking Transfer Blocked

STATUS: IMPLEMENTED - VERIFICATION AND RELEASE IN PROGRESS

DATE: 29 OCTOBER 2026

## Incident

Lisa Rodderick attempted to move `ZNG-XVFB2G`, a 10-guest Golden Circle
Corporate complimentary booking for Kerry, from JHB 4 November to JHB
12 November 2026. The destination is marked SOLD OUT and has an available
10-seat temporary operational table named `Kerry`.

## Root cause

The Admin show picker, API precheck and atomic transfer function all treated
SOLD OUT as wholly ineligible for internal transfers. This conflated public
sales status with authorised internal booking movement and prevented the
authoritative zone-capacity guard from making the actual decision.

## Capacity finding

The destination Golden Circle currently has 126 active guests against an
effective operational capacity of 132, leaving six authorised seats. The
10-seat `Kerry` table is physically suitable but contributes to that same
operational capacity; it does not create capacity beyond 132. Lisa's current
10-guest transfer therefore remains legitimately capacity-blocked.

## Correction

- Internal transfer destinations may be ACTIVE or SOLD OUT.
- CLOSED, inactive, cancelled and archived destinations remain blocked.
- Public availability is unchanged.
- Atomic zone capacity, two-seater, payment-policy, venue-scope, concurrency,
  table-compatibility, audit and financial safeguards remain in force.
- The UI, API and database function use the same eligibility rule.

## Shared scope

There are 29 current/future SOLD OUT performances across both venues. Twenty-
seven have operational room in at least one zone and 24 contain temporary
tables. The false status gate affected every otherwise eligible internal move
to those shows. Only Lisa's failed attempt is directly evidenced because the
old pre-validation rejection did not create an audit event.

## Safety

No booking has been moved. No show status, capacity, table, payment, ticket or
financial record has changed.
