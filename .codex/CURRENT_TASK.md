# P0 - Booking Invoice Creation Not Working

STATUS: COMPLETE

DATE: 29 OCTOBER 2026

## Goal

Restore a safe, visible invoice workflow for eligible existing bookings while
preserving authoritative booking values, payment status, Xero identities,
numbering and duplicate prevention.

## Production Case

- Booking: `ZNG-HT3FEZ`
- Customer/company: PMG GROUP
- Johannesburg, 22 October 2026
- 13 guests; reported paid total R18,125

## Safety Boundary

- Read-only investigation of the Production booking and financial documents.
- Do not create an invoice, quotation, payment, contact or communication for
  PMG GROUP during QA.
- Preserve existing bookings, payments, tickets, Xero records and numbering.
- Use rollback-only fixtures for mutation-path verification.
- Preserve unrelated working-tree changes.

## Verified Correction

- Booking Details exposes a permissioned `Create Invoice Draft` action only for
  Tristan Chetty and Rachelle Smuts on confirmed, fully paid bookings with no
  existing invoice.
- The existing Xero workspace preloads an invoice from authoritative booking
  values, including ticket sales, the included booking fee, add-ons, discounts
  and separate gratuity treatment.
- Xero creation fails closed unless the invoice total, booking total, verified
  payments and zero outstanding balance reconcile exactly.
- Duplicate direct invoices are prevented by application checks and an atomic
  database uniqueness constraint.
- Existing quote-to-invoice conversion remains unchanged.

## Verification

- 67 focused Xero tests passed.
- TypeScript passed.
- Changed-file ESLint passed.
- `git diff --check` passed.
- Supabase migration applied successfully; no business rows changed.
- Next.js 16 optimized Production build passed with the supported webpack
  compiler. The local default compiler cannot bind its internal sandbox port.

## Production Verification

- Application release: `65377e0`.
- Vercel deployment completed successfully on 29 October 2026.
- Authenticated Production Booking Details confirmed PMG GROUP, 13 guests,
  R18,125 paid and R0 outstanding, with no existing financial document.
- The non-mutating Production invoice preview reconciled to R18,125:
  R16,240 ticket sales, R10 booking fee and R1,875 gratuity.
- Xero is connected to `Zingara Productions (Pty) Ltd`, controlled live sync is
  active, all 16 mappings are approved and the outbound attention queue is empty.
- Tristan Chetty and Rachelle Smuts are active Super Admin staff with
  `bookings:reconcile`; their immutable staff IDs are the only booking-invoice
  converter identities accepted by the server.
- No invoice draft, Xero record, contact, payment or communication was created.

Rollback: `6259d46515303b56ad021d170f2a3c5f304aa083` plus reversal of the additive
direct-invoice uniqueness index if the feature is intentionally removed.

P0 COMPLETE - BOOKING INVOICE WORKFLOW VERIFIED.
