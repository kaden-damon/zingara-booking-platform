# Waitlist Compact View & Filtering

STATUS: IMPLEMENTED AND LOCALLY VERIFIED - PRODUCTION RELEASE IN PROGRESS

DATE: 31 OCTOBER 2026

## Scope

The existing Floor & Arrivals Waitlist workspace now uses a compact-first,
filterable presentation without changing its data, permissions or actions.

## Changes

- Compact view is the default each time Waitlist is opened.
- Expanded view and individual row expansion retain full enquiry detail.
- Rows show guest, reference, performance, guest count, contact details, status,
  enquiry source and current seating availability.
- Status, guest-count and enquiry-source filters combine with the existing
  performance/date/venue selector and debounced search.
- Counters and guest totals reconcile to the currently visible results.
- Promote, Convert To Booking and Remove preserve their existing handlers,
  permissions and capacity safeguards.
- The Waitlist list is dynamically loaded and performs no work while its
  workspace is closed.

## Verification

- Focused tests: 6/6 passed.
- TypeScript: passed.
- New-file ESLint: passed.
- Next.js webpack Production build: passed.
- New on-demand Waitlist UI chunk: 8,840 bytes raw / 2,864 bytes gzip.
- No migration required.

## Release Evidence

Pending Production commit, deployment and authenticated UI verification.

## Business-Data Delta

Zero expected. No Waitlist, booking, seating, payment or financial record is
changed by this interface-only release.
