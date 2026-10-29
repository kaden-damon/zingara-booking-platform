# P0 - Norman R4,400 Deposit Transfer

STATUS: READY - AWAITING AUTHENTICATED MANAGEMENT APPROVAL

DATE: 29 OCTOBER 2026

## Goal

Prepare a secure, atomic and audited management-approved transfer of PayFast
transaction `335149581` from cancelled booking `ZNG-XD6ABJ` to replacement
booking `ZNG-759ZR8`.

## Approval boundary

- Application corrections may be implemented and released autonomously.
- The financial reallocation must not execute until Fatima Meeran provides
  explicit authenticated confirmation in Production.
- Preserve the original PayFast transaction, cancellation and forfeiture audit.
- No refund, new payment, customer communication or Xero write.

## Prepared control

- Fatima and the immutably bound Platform Owner can access the Production
  confirmation on replacement booking `ZNG-759ZR8`.
- Exact fixed approval reason and explicit confirmation checkbox.
- Atomic locks, idempotency, refund/reversal and Xero guards.
- Original PayFast transaction identity and merchant reference preserved.
- Both booking aggregates and financial metadata recalculated in one transaction.
- Immutable reallocation ledger and booking/payment audit evidence.

No financial reallocation has executed. Fatima or Kaden must explicitly approve
it while signed in; loading or viewing the control never submits the transfer.

## Platform Owner access audit

- Kaden's immutable Platform Owner binding is included in the Admin session.
- The Norman transfer, invoice conversion, bulk invoicing and credit-note
  identity gates include Kaden without changing access for other staff.
- Refunds, banking-document management and Booking Activity Timeline already
  included Kaden and required no correction.
