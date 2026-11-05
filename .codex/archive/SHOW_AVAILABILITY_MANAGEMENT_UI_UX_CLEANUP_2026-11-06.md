# Show & Availability Management UI/UX Cleanup

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Scope

This release simplified the existing Show & Availability Management workspace
without changing show, booking, availability, buyout or capacity business
rules. The final steer required every Create Show control to live inside one
collapsed schedule section below the calendar and required capacity badges to
remain readable at every supported breakpoint.

## Findings

- Quick Create Show controls and bulk schedule tools were separate and occupied
  space before the calendar.
- The seven-column large-desktop calendar allowed paired capacity badges to
  become too narrow, creating visual overlap on dense performance cards.
- Public-facing calendar labels and Admin cards used several operational terms
  for states that could be presented more simply. The underlying status values
  remain operationally distinct and could not safely be consolidated.
- The shared native-select arrow sat too close to the right border and did not
  reserve enough space between long option text and the chevron.
- The workspace description and Edit Show title repeated unnecessary show
  branding even though venue context was sufficient for management use.

## Changes

- Moved both quick creation and bulk scheduling into one native collapsible
  `Create Show Schedule` section after the calendar. It has no default-open
  state.
- Kept month navigation, location filtering and search as the only calendar
  controls before the calendar.
- Preserved the quick form's date, time, show label, location, address and
  `Create Show` action, plus all existing schedule controls.
- Added responsive calendar tracks for one, two, three and seven columns.
- Kept capacity badges on one line and changed the seven-column breakpoint to
  a single badge column so labels and values remain inside their borders.
- Made buyout summaries bounded and concise without changing their data or
  actions.
- Standardised display labels and colours while retaining the existing
  operational status dropdown and server-side availability behaviour.
- Presented both manual public booking blocks and confirmed full-show buyouts
  as `Buyout` in user-facing surfaces while preserving their distinct stored
  values, validation and availability restrictions.
- Replaced the workspace description with `Manage show schedules and
  availability.` and shortened Edit Show headings to `Zingara Cape Town` or
  `Zingara Johannesburg`. Stored show titles, emails, tickets and booking
  content are unchanged.
- Updated the shared standard native-select style to position its chevron 16px
  inside the right border and reserve 48px of right padding. Custom
  `appearance-none` selects remain excluded to prevent duplicate arrows.

## Verification

- Final focused suite passed 37/37 across show availability UI, staff
  presentation, internal booking policy, corporate buyouts, UI polish and
  Admin guide coverage.
- `npx tsc --noEmit` passed after the final change.
- `git diff --check` passed.
- Authenticated Production desktop verification at 1440 x 900 confirmed only
  month navigation, location and search above the calendar; compact capacity
  badges were fully contained.
- Authenticated Production mobile verification confirmed the one-column
  calendar, contained badges, collapsed `Create Show Schedule` below the final
  calendar row and every required control inside the expanded section.
- Authenticated Production verification after the final deployment confirmed
  the concise workspace copy, `Buyout` presentation, contained examples such
  as `GC 138/120 · +18` and `MR 126/125 · +1`, and the shortened Cape Town Edit
  Show heading. The Show Title field retained its original full value.
- Desktop Production and a 390 x 844 mobile viewport verified that standard
  dropdown chevrons sit 16px inside their borders with 48px reserved for text
  separation. Focused states remained readable and custom dropdowns did not
  gain duplicate arrows.
- The default local Turbopack build could not run in the restricted local
  environment because its compiler binding attempted a local port; the webpack
  fallback encountered the repository's Node 24 WasmHash limitation. All three
  Vercel Production builds completed successfully, and type/test verification
  passed.

## Performance

- No fetch, polling, query, state-management, API or booking-path operation was
  added.
- Measured source gzip delta before the final markup-only wrapper adjustment:
  Admin +137 bytes, public -41 bytes, net +96 bytes.
- The final adjustment changed only element grouping and CSS ordering. No
  measurable runtime work was introduced.
- An authenticated Production reload populated the calendar in approximately
  563ms. The reported 7-10 second load was not reproduced on the final release,
  so no speculative data-loading change was made.

## Production Release

- `ce9c97db22a1bb33379ef53a747c05e0ebdc94d4` - simplify the workspace.
- `bfd517e5a68bab1a9c4cc7e63f22b2505fc0c9d8` - keep calendar capacities
  readable.
- `c1fe340923dfe124604f825f5f56681764924249` - place all show creation below
  the calendar.
- `3a82280f` - contain capacity badges and introduce the shared dropdown arrow.
- `32471f6f` - align user-facing buyout terminology without changing rules.
- `c1e17561` - simplify workspace copy and Edit Show headings.
- `77346684` - move standard dropdown chevrons 16px inside their borders.
- Final Vercel deployment `B3ncSZMQRDiHnZQ9f339v5fPdsVN` completed at
  6 November 2026, 00:22:19 SAST and is active on
  `https://book.zingara.co.za`.

## Data Integrity & Rollback

- Business-data delta: zero.
- No show, booking, status, blackout, buyout, availability, capacity, seating,
  payment, ticket or customer record was changed.
- No migration was required.
- Rollback by reverting `77346684`, `c1e17561`, `32471f6f`, `3a82280f`,
  `c1fe3409`, `bfd517e5` and `ce9c97db` in reverse order and redeploying. No
  database action is required.
