# P0 - NYE Full Payment Enforcement

STATUS: IN PROGRESS

DATE: 26 OCTOBER 2026

## Objective

Add an audited, performance-specific Payment Policy beside Custom Pricing and
configure both Cape Town and Johannesburg performances on 31 December 2026 as
Full Payment Only.

The policy must be enforced server-side for new Standard, Corporate and Buyout
agreements across public and internal booking creation, payment links,
amendments and transfers. Existing booking and payment agreements are
grandfathered and must not be charged, cancelled, amended or contacted.

## Safeguards

- Existing pricing, VAT, gratuity, capacity, ticketing, payment and Xero rules
  remain authoritative.
- No booking may be represented as paid until authoritative full settlement is
  verified.
- All performances other than those explicitly configured retain their current
  payment behaviour.
- Production verification must not create financial transactions.

## Verification

Pending implementation, focused financial regression tests, Production build,
read-only NYE booking audit, migration validation and Production verification.
