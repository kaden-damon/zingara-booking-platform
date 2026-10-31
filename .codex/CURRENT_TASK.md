# Secret Guest List ON/OFF Control

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION - FEATURE OFF

DATE: 31 OCTOBER 2026

## Toggle Clarity Follow-up

- Production database and public settings both confirm the feature is OFF.
- The original control used a muted inherited colour for its moving label/thumb,
  making the OFF state visually weak and the two states difficult to compare.
- The corrected control uses a green ON track, grey OFF track, white positional
  thumb and an explicit label that always agrees with the saved state.
- Admin reads bypass browser and route caches. Failed saves visibly report the
  error and reload the authoritative server value before re-enabling the switch.
- Application commit `9769445c60a561329b4dd504fcd55d30c25d376e`
  deployed successfully as Vercel deployment `ArPzLjeZgoPnp9FxsfMNih4LAfko` at
  12:10:43 SAST.
- Kaden's fresh authenticated Production Admin page reported the switch as
  `The Secret Guest List is OFF`. Desktop and 390 x 841 responsive inspection
  confirmed the grey OFF track, left-positioned white thumb and explicit OFF
  label remain clear without overlap.
- Production remains OFF after release. The public settings response reports
  `secretGuestList: false`, and direct Secret Guest List submissions return
  HTTP 409 before persistence.

## Objective

Provide one management-only ON/OFF control for The Secret Guest List while
preserving the standard Waitlist, existing enquiries and every booking path.

## Verified Implementation

- Admin location: Settings > Venue > Public Booking > The Secret Guest List.
- Staff require the existing `settings:manage` permission in both the interface
  and the server API.
- Public booking settings carry the feature state in the existing venue-settings
  request, with no extra page-load request.
- OFF removes both sold-out and insufficient-availability invitations and the
  enquiry panel.
- The public API and the atomic database function both reject direct Secret Guest
  List submissions while OFF.
- Standard Waitlist submissions, staff routing, customer acknowledgements and
  historical enquiries are unchanged.
- ON restores the established feature without a code release.

## Verification

- Focused Secret Guest List and Waitlist tests: 9/9 passed.
- TypeScript passed.
- Targeted ESLint passed with no errors; four pre-existing unused-code warnings
  remain in shared venue-settings modules.
- Next.js 16.3.4 webpack Production build passed, including all 27 static pages.
- Migration dry run found exactly one pending migration.
- Production migration `20261031120000_secret_guest_list_feature_control.sql`
  applied successfully at 11:46:23 SAST.
- Production feature state is OFF; both customer acknowledgement workflows remain
  ON and unchanged.
- Historical record counts are unchanged: 404 total Waitlist entries, including
  39 identified Secret Guest List enquiries.

## Release

- Application commit: `f5226995b33489fdf97ff374f7490bde7e9c762c`.
- Vercel deployment: `4TFJEGnf1LysAzRd7G633vwtU9nH`, completed at
  11:49:23 SAST on 31 October 2026.
- Kaden's authenticated Production session confirmed the switch is visible at
  Settings > Venue > Public Booking and displays OFF.
- The live public booking calendar contains no Secret Guest List invitation or
  CTA for restricted performances.
- The live public settings response reports `secretGuestList: false`; a direct
  submission returns HTTP 409, and the management endpoint rejects an
  unauthenticated request with HTTP 401.
- Rollback-only Production verification confirmed standard Waitlist submission,
  OFF rejection and ON restoration without retaining test records.
- Public booking and ticket routes return HTTP 200. No booking, payment, ticket,
  seating, customer, communication or financial record changed.
- Follow-up release verification reused the rollback-only Production check:
  standard Waitlist submission remained accepted, OFF rejected Secret Guest
  List submission, and ON restored the feature inside a rolled-back transaction.
  The final authoritative state remained OFF with 404 Waitlist records and 39
  identified Secret Guest List enquiries unchanged.
