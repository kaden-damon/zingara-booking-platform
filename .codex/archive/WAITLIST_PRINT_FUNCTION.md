# Waitlist Print Function

STATUS: COMPLETE - RELEASED AND VERIFIED IN PRODUCTION

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
- Authenticated Production print inspection passed.
- No migration is required.

## Release Evidence

- Application commit: `fddb24a2a428df0ea44316f21b727821769f6c3f`.
- Vercel Production deployment: `CYRwVDjUFGyz9CqBjqZSvYVXFBtz` (success).
- Verified at approximately 07:14 SAST on 31 October 2026.
- Compact filtered preview printed 1 matching enquiry and 2 guests on 1 sheet.
- Expanded unfiltered preview printed all 16 matching enquiries and 48 guests
  on 2 sheets with repeating table headings.
- Printed performance, time, rows, contact details, status, availability,
  source and totals matched the live filtered Waitlist.
- Responsive 390 x 841 verification confirmed the Print control is clear and
  accessible while Compact remains the default.
- No operational action was executed.
- Rollback point: `ad4bde17f4c57691558ebbcfa2231381ad2181c3`.

## Business-Data Delta

Zero. No record changed and no migration was applied.
