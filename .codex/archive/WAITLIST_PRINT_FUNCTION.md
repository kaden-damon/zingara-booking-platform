# Waitlist Print Function

STATUS: IMPLEMENTED AND LOCALLY VERIFIED - PRODUCTION RELEASE IN PROGRESS

DATE: 31 OCTOBER 2026

## Scope

Add a filtered, compact A4 Waitlist print view to Floor & Arrivals while
preserving the existing Compact/Expanded interface and operational actions.

## Implementation

- Uses the existing Admin printable-window convention.
- Uses the complete in-memory filtered Waitlist result set, not visible rows.
- Includes performance, print time, matching enquiry and guest totals.
- Includes guest, reference, performance, guests, contact, status, seating
  availability and enquiry source.
- Adds no normal-load requests, migration or record mutation.

## Verification

- Focused Waitlist tests: 9/9 passed.
- TypeScript and targeted ESLint: passed.
- Next.js 16.3.4 webpack Production build: passed.
- A4 sizing, repeating headings, safe page breaks, matching-row completeness,
  totals and HTML escaping are covered by focused tests.
- Existing Admin page retains two unrelated legacy effect-lint findings.
- Authenticated Production print inspection remains pending deployment.
- No migration is required.

## Release Evidence

Pending verified commit and Production deployment.

## Business-Data Delta

Expected: zero.
