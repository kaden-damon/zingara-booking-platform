# Waitlist Compact View & Filtering

STATUS: COMPLETE - RELEASED AND VERIFIED IN PRODUCTION

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

- Application commit: `9955a532e9cf368163d09be0f8d2dcc0b9a473a6`.
- Production deployment: GitHub deployment `7454449140`; Vercel deployment
  `JB4vQx6wLSgPMGohRdaKMbUKcwwq`.
- Completed: 31 October 2026 at 07:04:20 SAST.
- Production alias: `https://book.zingara.co.za/admin` (HTTP 200).
- Authenticated desktop verification confirmed Compact as the default, entry
  expansion, Expanded view, all existing operational actions, search and source
  filtering, and accurate filtered counters and guest totals.
- Responsive verification at 390 x 841 confirmed controls and entries stack
  cleanly without overlap.
- No Waitlist action was executed during verification.
- Rollback point: `e0de8da4635ee1567c54ae7bb6c68e68135ad1b0`.

## Business-Data Delta

Zero. No Waitlist, booking, seating, payment or financial record changed. No
migration was applied.
