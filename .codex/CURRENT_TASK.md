# P0 - Booking Invoice Creation Not Working

STATUS: VERIFIED - PRODUCTION RELEASE IN PROGRESS

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

Production deployment and authenticated UI verification are in progress.
