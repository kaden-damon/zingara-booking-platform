# Show & Availability Management UI/UX Cleanup

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

P0 FINANCIAL FOLLOW-UP STATUS: DEPLOYED - FINAL AUTHENTICATED VISUAL RECHECK
PENDING

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
- The calendar toolbar still used a wide location dropdown and show-search
  field even though venue filtering was the only required calendar filter.
- Buyout cards repeated status text, truncated customer names and included a
  section-planning sentence that was too detailed for the calendar overview.

## Changes

### P0 financial-summary follow-up

- Replaced the partial client-side financial aggregation with one bounded
  monthly server aggregate on the existing calendar-occupancy request.
- Paid and unpaid now use authoritative active booking financial snapshots.
  Deposit totals count confirmed deposit payments, and refund totals count
  accepted refund evidence without changing any financial record.
- Genuine zero-value performances render `R0`. Credit renders `Unavailable`
  because Production has no authoritative show-level credit ledger; the UI no
  longer presents missing evidence as a false zero or `Not recorded` value.
- Reworked the popup as a viewport-contained bottom sheet on mobile while
  preserving the desktop hover panel. The active show card and its financial
  control form the intentional stacking order, keeping the popup above the
  neighbouring Create Booking button and adjacent calendar content.

- Moved both quick creation and bulk scheduling into one native collapsible
  `Create Show Schedule` section after the calendar. It has no default-open
  state.
- Kept only month navigation and a compact horizontal
  `ALL | CAPE TOWN | JOBURG` pill group before the calendar. `ALL` is selected
  by default. The pills reuse the existing in-memory venue filter, and the
  calendar-specific search field was removed.
- Preserved the quick form's date, time, show label, location, address and
  `Create Show` action, plus all existing schedule controls.
- Added responsive calendar tracks for one, two, three and seven columns.
- Kept capacity badges on one line and changed the seven-column breakpoint to
  a single badge column so labels and values remain inside their borders.
- Made buyout summaries bounded and concise without changing their data or
  actions. Cards retain the `BUYOUT` badge, show the full authoritative
  customer name with responsive wrapping, and omit the calendar-only
  section-planning sentence. The operational planning requirement remains
  available in its established workflow.
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

### P0 financial-summary verification

- Production reconciliation examples:
  - JHB 4 November: Paid R40,120; Unpaid R0; Deposits 0 / R0; Refunded R0.
  - CPT 4 November: Paid R0; Unpaid R0; Deposits 0 / R0; Refunded R0, verified
    as a genuine zero-value performance.
  - JHB 5 November: Paid R386,732.50; Unpaid R143,960; Deposits 3 / R4,950.
  - CPT 5 November: Paid R436,716.50; Unpaid R26,040; Deposits 7 / R17,540.
  - JHB 11 November: Paid R231,083; Unpaid R413,740; Deposits 1 / R9,900.
  - CPT 11 November: Paid R149,984; Unpaid R197,095; Deposits 5 / R12,650.
- Focused financial and calendar tests passed 5/5. TypeScript, targeted ESLint
  and `git diff --check` passed. The broader Admin performance file retains two
  unrelated pre-existing assertion failures.
- Live mobile inspection at 390 x 844 measured the popup at 358 x 210 pixels,
  left 16, right 374, top 618 and bottom 828. Labels and values were fully
  visible. Desktop inspection measured 256 x 138 pixels within a 1280 x 720
  viewport and retained hover behaviour. The focused source regression test
  verifies the active card/control stacking layers above Create Booking.
- The final layering deployment completed successfully. When the authenticated
  browser was refreshed afterward, the existing platform-access session gate
  no longer restored the session. The final post-refresh visual layering check
  remains pending, and P0 completion is not claimed.

- Final focused suite passed 37/37 across show availability UI, staff
  presentation, internal booking policy, corporate buyouts, UI polish and
  Admin guide coverage.
- `npx tsc --noEmit` passed after the final change.
- `git diff --check` passed.
- Authenticated Production desktop verification confirmed only month
  navigation and the three venue pills above the calendar; compact capacity
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
- Authenticated Production filtering against actual calendar entries verified
  that `ALL` shows Cape Town and Johannesburg, `CAPE TOWN` shows only Cape
  Town, and `JOBURG` shows only Johannesburg. A full reload returns to the
  default `ALL` state. The former Search Shows field is absent.
- Desktop and 390 x 844 mobile inspection verified the pills remain horizontal
  without clipping and full buyout names such as `NTT DATA - Internet
  Solutions` and `Vodacom` remain inside their cards. The removed
  section-planning sentence is absent from the calendar.
- The default local Turbopack build could not run in the restricted local
  environment because its compiler binding attempted a local port; the webpack
  fallback encountered the repository's Node 24 WasmHash limitation. All three
  Vercel Production builds completed successfully, and type/test verification
  passed.

## Performance

- The P0 financial fix reuses the existing monthly occupancy request. It adds
  no browser request, polling, background task, per-performance query or
  render-time calculation. Deposit and refund evidence is loaded in bounded,
  indexed pages and the three month-scoped queries execute in parallel.
- The representative November Production query shape covered 50 shows, 299
  confirmed deposit rows and no accepted refunds in approximately 462ms.

- No fetch, polling, query, state-management, API or booking-path operation was
  added.
- Measured source gzip delta before the final markup-only wrapper adjustment:
  Admin +137 bytes, public -41 bytes, net +96 bytes.
- The final adjustments removed search state and result rendering, reused the
  existing local venue-filter state and changed only calendar markup and CSS.
  No request, polling, query or background work was introduced.
- An authenticated Production reload populated the calendar in approximately
  563ms. The reported 7-10 second load was not reproduced on the final release,
  so no speculative data-loading change was made.

## Production Release

### P0 financial-summary release

- `988ca73929c17a7d6b41a8d615cf9b11c7eab739` - reconcile calendar financial
  summaries with authoritative month-scoped evidence.
- `b6127138d2cbc11ec1dd0bde8192e605bc60bd4a` - preserve click/touch opening and
  explicit dismissal.
- `3decfcadf8a206ee8cd1d6b11ad7645b2d5d93d4` - keep the popup above calendar
  controls through the active card/control stacking context.
- Vercel deployments: `2kpYWmj9Y2K3sCBHViWdAPRMwp7L`,
  `4J1XRewHLVnEtx8DZYmiuX4dia1W` and final
  `HhwTEod5NRf7hy8AZ1hniNKX5hAE`. The final deployment completed successfully
  at 6 November 2026, 00:59:02 SAST.

- `ce9c97db22a1bb33379ef53a747c05e0ebdc94d4` - simplify the workspace.
- `bfd517e5a68bab1a9c4cc7e63f22b2505fc0c9d8` - keep calendar capacities
  readable.
- `c1fe340923dfe124604f825f5f56681764924249` - place all show creation below
  the calendar.
- `3a82280f` - contain capacity badges and introduce the shared dropdown arrow.
- `32471f6f` - align user-facing buyout terminology without changing rules.
- `c1e17561` - simplify workspace copy and Edit Show headings.
- `77346684` - move standard dropdown chevrons 16px inside their borders.
- `ad3222a0` - simplify calendar buyout cards.
- `bde28d79` - preserve full buyout customer names at all breakpoints.
- `bc05df27` - replace calendar search/location controls with venue pills.
- Final Vercel deployment `EkeHMqHhyvwjdJ2mWXb1bQxw3y5S` completed at
  6 November 2026, 00:33:23 SAST and is active on
  `https://book.zingara.co.za`.

## Data Integrity & Rollback

- Business-data delta: zero.
- No show, booking, status, blackout, buyout, availability, capacity, seating,
  payment, ticket or customer record was changed.
- No migration was required.
- Rollback by reverting `bc05df27`, `bde28d79`, `ad3222a0`, `77346684`,
  `c1e17561`, `32471f6f`, `3a82280f`, `c1fe3409`, `bfd517e5` and `ce9c97db`
  in reverse order and redeploying. For the P0 financial follow-up, revert
  `3decfcad`, `b6127138` and `988ca739` in reverse order. No database action is
  required.
