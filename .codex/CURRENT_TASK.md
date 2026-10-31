# Waitlist Compact View & Filtering

STATUS: COMPLETE - RELEASED AND VERIFIED IN PRODUCTION

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

- Application commit: `9955a532e9cf368163d09be0f8d2dcc0b9a473a6`.
- Production deployment: GitHub deployment `7454449140`; Vercel deployment
  `JB4vQx6wLSgPMGohRdaKMbUKcwwq`.
- Deployment completed at 07:04:20 SAST on 31 October 2026.
- Production alias `https://book.zingara.co.za/admin` returned HTTP 200.
- Authenticated Production verification with Kaden Damon's account confirmed:
  Compact opens by default; search and enquiry-source filters combine correctly;
  visible counters and guest totals recalculate correctly; Expanded and individual
  entry detail expose the existing Promote, Convert To Booking and Remove actions.
- Responsive verification at 390 x 841 confirmed clean stacked controls and
  compact entries without overlap.
- No mutation action was executed during verification.
- Rollback point: `e0de8da4635ee1567c54ae7bb6c68e68135ad1b0`.

## Business-Data Delta

Zero. This change did not mutate Waitlist, booking, seating, payment or financial
records. No migration was applied.
