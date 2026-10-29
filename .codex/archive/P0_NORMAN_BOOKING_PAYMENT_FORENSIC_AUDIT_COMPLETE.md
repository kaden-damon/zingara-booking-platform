# P0 - Norman Booking & Payment Forensic Audit

STATUS: COMPLETE

DATE: 29 OCTOBER 2026

## Authoritative findings

- Original booking `ZNG-XD6ABJ` was created by Sharon Ricketts on 16 October
  2026 at 10:56:15 SAST for Tarnia Norman, Cape Town, 28 October 2026 at 18:00.
- Sharon edited the linked customer from Tarnia Norman to Tamara Norman on
  27 October 2026 at 14:46:35 SAST. The same customer ID remained linked; no
  merge occurred.
- The original booking was increased from eight to nine guests and cancelled
  by Sharon on 28 October 2026 at 06:30:51 SAST because the guest could not
  attend.
- PayFast transaction `335149581` authoritatively completed on 19 October 2026
  at 08:34:48 SAST. The booking payment amount is R4,400; PayFast gross was
  R4,410 including the customer-facing fee.
- The transaction remains allocated to cancelled booking `ZNG-XD6ABJ`.
  There is no refund or manual reversal.
- Cancellation evidence records the R4,400 as forfeited, `no-refund`, with
  R0 refundable. It is therefore not approved for transfer.
- Replacement booking `ZNG-759ZR8` was created for Tamara Norman on 28 October
  2026 at 06:37:38 SAST. It has no verified payment and does not contain the
  R4,400.

## Visibility defect

CRM and Booking searches used only the current customer identity. The audited
former Tarnia identity was preserved but not searchable. A bounded CRM search
correction now matches former names, emails and mobile numbers from immutable
`customer.identity_edit` before-values and returns the one current customer.

## Safety

No booking, customer, payment, refund, ticket or financial record was changed.
Any transfer requires separate management approval to override the recorded
forfeiture and a purpose-built, atomic financial reallocation with immutable
audit evidence. Manual editing is not safe.

P0 COMPLETE - NORMAN BOOKING & PAYMENT TRACED.
