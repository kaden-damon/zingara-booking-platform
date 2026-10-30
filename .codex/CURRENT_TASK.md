# P0 - Public Booking Failure

STATUS: COMPLETE - RELEASE READY

DATE: 30 OCTOBER 2026

## Objective

Verify the complete public booking journey for one to six guests across both
venues, identify why a four-person customer believed six guests were required,
and release the smallest verified correction without changing booking rules.

## Root Cause

- Production keeps a selected four-person party unchanged through show,
  seating and customer-detail steps.
- Standard public booking permits one to nineteen guests; Private Booths have
  the existing legitimate minimum of four guests.
- The available booth option was described as a "Private 6-seater booth". On a
  performance where Booths were the only available zone, this could reasonably
  be read as a six-ticket minimum even though the system accepted four guests.
- Phase 61 telemetry contains no four-person rejection. Current captured
  failures are two-person quota rejections.

## Correction

- Private Booth guidance now states that seating is available from four guests
  and that the booking remains for the selected guest count.
- No selector, availability, capacity, pricing or validation logic changed.

## Verification

- Production UI before release: Cape Town and Johannesburg both retained four
  guests through seating and Guest Details at a 390 x 844 mobile viewport.
- Johannesburg UI retained every selected count from one through six exactly.
- Representative open shows in both venues had live public capacity for every
  tested count; ordinary zones accept one through six and Booths accept four
  through six under the existing minimum-four rule.
- Phase 61 Production telemetry: five rejection events across three journeys,
  all for two guests and all classified as the existing two-seater limit; no
  four-person rejection was recorded.
- Focused tests: 41 relevant checks passed. One additional direct Node test file
  could not resolve the project's `@/` alias in that runner; TypeScript passed.
- TypeScript and changed-file ESLint passed. ESLint reported one pre-existing
  unused-variable warning and no errors.
- Next.js 16 Webpack Production build passed. The default Turbopack build could
  not start a local loader worker in the restricted test environment.
- `git diff --check` passed.

## Safety

- No real booking, payment or customer record will be created during QA.
- Pricing, capacity, seating, ticketing and payment rules remain unchanged.
- No public journey redesign is included in this P0.
- Production business-data delta: none.
