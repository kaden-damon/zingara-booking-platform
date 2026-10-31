# Waitlist Compact View & Filtering

STATUS: IMPLEMENTED AND LOCALLY VERIFIED - PRODUCTION RELEASE IN PROGRESS

DATE: 31 OCTOBER 2026

## Objective

Make Floor & Arrivals > Waitlist faster to scan by default while preserving the
existing Waitlist, Secret Guest List and booking-conversion workflows.

## Implementation

- Compact is the default whenever the Waitlist workspace opens.
- Expanded view remains available and compact rows open individually.
- Existing performance calendar selection remains the combined performance,
  date and venue filter.
- Added status, guest-count and enquiry-source filters that combine with search.
- Visible status counters and active-guest totals derive from the filtered rows.
- Promote, Convert To Booking and Remove continue to call the existing actions.
- Secret Guest List enquiries are identified from their existing authoritative
  submission marker; no Waitlist records or schema changed.
- The presentation component is loaded only when Waitlist is opened.

## Local Verification

- Focused Waitlist filter and UI tests: 6/6 passed.
- TypeScript: passed.
- New-file lint: passed; the existing Admin page retains unrelated legacy lint
  findings.
- Next.js 16.3.4 webpack Production build: passed.
- New on-demand Waitlist UI chunk: 8,840 bytes raw / 2,864 bytes gzip.
- Standard Turbopack build remains unavailable in this managed local runtime
  because its worker cannot bind a local port; no application compile error was
  reported by the successful webpack build.
- No database migration is required.

## Release

Application commit, deployment identifier and authenticated Production evidence
will be recorded after the controlled release completes.

## Business-Data Delta

Expected: zero. This change does not mutate Waitlist, booking, seating, payment
or financial records.
