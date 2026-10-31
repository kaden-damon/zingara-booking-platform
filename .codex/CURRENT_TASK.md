# Waitlist Print Function

STATUS: IMPLEMENTED AND LOCALLY VERIFIED - PRODUCTION RELEASE IN PROGRESS

DATE: 31 OCTOBER 2026

## Objective

Add a compact A4 print view for the currently filtered Floor & Arrivals Waitlist
without changing loading, records, actions or the default Compact view.

## Implementation

- Reuse the existing Admin printable-window convention.
- Print all entries matching the selected performance, search and filters.
- Include enquiry and guest totals, performance and SAST print time.
- Use an A4 landscape table with repeating headings and safe page breaks.
- Add no API requests, polling, migration or normal-load processing.

## Verification

- Focused Waitlist tests: 9/9 passed.
- TypeScript: passed.
- Targeted ESLint: passed.
- Next.js 16.3.4 webpack Production build: passed.
- Generated markup verifies A4 landscape sizing, repeated table headings, safe
  row page breaks, complete matching rows, totals and escaped customer content.
- Existing Admin page retains two unrelated legacy effect-lint findings.
- Authenticated Production print inspection remains pending deployment.
- No migration is required.

## Release

Pending verified commit and Production deployment.

## Business-Data Delta

Expected: zero. No Waitlist, booking, seating, payment or financial records are
modified by printing.
