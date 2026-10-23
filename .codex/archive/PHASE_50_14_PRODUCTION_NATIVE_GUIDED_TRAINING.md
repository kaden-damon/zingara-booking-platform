# Phase 50.14 — Production-Native Guided Training

Status: local private preview complete; awaiting personal review.

Date: 22 October 2026 SAST

## Outcome

The inaccurate simulator architecture was removed. Guided Training now uses
the existing Production Admin calendar, booking-type chooser, staff booking
workflow, and buyout creator. A lightweight overlay highlights and validates
the real controls without recreating booking screens or business logic.

## Modules verified

1. Standard Booking — completed through synthetic confirmation
   `TRAINING-A6N2J7`.
2. Corporate Booking — completed through synthetic confirmation
   `TRAINING-JQ8W5N`.
3. Buyout — completed through the real Buyout review and confirmation flow.

All three modules report `COMPLETED · V2` in the isolated preview.

## Isolation

The private preview is local-only and requires a signed training session. It
uses deterministic synthetic fixtures and a dedicated synthetic execution
endpoint. No booking, customer, payment, ticket, QR, capacity, communication,
payment-link, or Xero write path is used. Authenticated Academy progress keeps
the existing staff-linked and module-versioned design; private-preview progress
is browser-session-only.

## Rendered verification

- Mac Chrome: all three production-native modules completed end to end.
- Chrome responsive 390×844: launcher inspected with no horizontal overflow.
- Native iPhone Safari: all three modules completed end to end on the physical
  connected iPhone through macOS iPhone Mirroring over the local Wi-Fi network.
  Standard, Corporate, and Buyout each reached the isolated synthetic
  completion state.

Evidence is stored in `.codex/artifacts/phase-50-14/`:

- `desktop-buyout-complete.png`
- `desktop-launcher-all-modules-complete.png`
- `mobile-chrome-emulation-390x844.png`
- `production-login-reference.png`
- `native-iphone-standard-step-1.png`
- `native-iphone-standard-booking-type.png`
- `native-iphone-standard-complete.png`
- `native-iphone-corporate-complete.png`
- `native-iphone-buyout-complete.png`

## Native defects corrected

- Training progress advances after the real Production click handler, avoiding
  lost mobile-Safari modal actions.
- The guide is target-aware on mobile: it uses Safari's live visual viewport,
  scrolls the current Production control into view, and chooses an unobstructed
  position above or below the control without padding or reshaping the page.
- Show Me no longer reports its own interaction as incorrect.
- Restart restores the actual Production workflow; Back falls back to that safe
  restart when the previous control is behind a modal or on another route.
- Incorrect taps remain blocked at click time while native touch scrolling and
  nested modal scrolling remain available.
- Admin and Booking read the training query through the current Next.js client
  page `searchParams` contract, eliminating the server/client hydration mismatch
  observed in native Safari.
- Completion on every module confirms that no booking, payment, ticket,
  capacity, communication, or Xero record was created.

## Verification gates

- Focused guided-training tests: 4 passed.
- TypeScript: passed.
- Focused ESLint: the new Guided Training files have no errors. The existing
  booking page still reports its pre-existing React effect lint findings, and
  `CorporateBuyoutCreator.tsx` retains one pre-existing hook dependency warning.
- `git diff --check`: passed.
- LAN preview returned HTTP 200.

## Preview

`http://192.168.1.78:3000/admin/guided-training-preview?key=phase5014-7f89c2d4a6e1b305`

The development server remains bound to `192.168.1.78:3000` for same-Wi-Fi
review.

## Release boundary

No migration was applied. No commit, push, or deployment was performed.
Production was not modified and the Production business-data delta is zero.

## Mobile Guided Training UX correction — 22 October 2026 SAST

- Removed the fixed-top mobile panel and the artificial document/root bottom
  padding. The underlying Production interface no longer moves to accommodate
  training.
- Added live `visualViewport` positioning for Safari address-bar, safe-area,
  keyboard, focus, resize, nested-scroll, and `scrollend` changes.
- The guide now selects the visible responsive copy of a target, scrolls only
  that current target into view, measures the actual compact instruction panel,
  and places it above or below with a clear gap.
- Focused form and select controls force the guide to the opposite side so the
  native iPhone picker and keyboard remain usable. The panel is bounded to the
  visible viewport and internally scrollable only if the viewport becomes very
  short.
- Highlight coordinates are remeasured on animation frames and at scroll end,
  preventing the ring from lagging one field behind after nested modal scrolls.
- SVG seating controls are now recognised as valid Production targets; the
  previous HTML-only event check incorrectly rejected valid Golden Circle and
  Private Booths taps.
- Back, Restart, Show Me, step progression, incorrect-action feedback, and the
  synthetic write boundary remain intact.
- Physical-iPhone verification covered the shared Standard/Corporate booking
  controls and every Buyout step, including native selects, keyboard-open and
  keyboard-dismissed states, modal transitions, review, and synthetic
  confirmation. Standard and Corporate had already completed end to end on the
  same physical device; their shared seating/details/payment positioning paths
  were rechecked after this correction. iPhone Mirroring hardware-keyboard text
  injection occasionally duplicated or dropped characters during the repeat
  Standard data-entry pass; this was confined to the QA input mechanism and did
  not reproduce with ordinary touch controls.
- New evidence:
  `.codex/artifacts/phase-50-14/native-iphone-buyout-position-step-1.png`,
  `.codex/artifacts/phase-50-14/native-iphone-buyout-keyboard-position.png`, and
  `.codex/artifacts/phase-50-14/native-iphone-standard-keyboard-position.png`.
- Verification: 4 focused tests passed; TypeScript passed; focused ESLint
  passed; `git diff --check` passed; the LAN preview returned HTTP 200.
- Release boundary remains unchanged: no migration, commit, push, or deployment
  was performed. Production business-data delta remains zero.

## Production baseline reconciliation — 23 October 2026 SAST

- Fast-forwarded the working baseline to current `origin/main` commit
  `1d88621b47e8c1496021359e6d499234a5b1f55b`, then reapplied the preserved
  Phase 50.14 work. Subsequent Production releases remain intact.
- Standard and Corporate were advanced to V4 to match the current staff
  booking workflow. The guide now includes the current seating preview
  confirmation and Continue-to-Details actions, and the private preview
  receives a development-only synthetic Box Office role so current Corporate
  invoice/EFT validation behaves exactly like an authenticated staff journey.
- The signed preview API can bootstrap its local Admin shell without a real
  Production session, while all preview and synthetic-execute boundaries still
  fail closed in Production. LAN redirects retain the requesting browser host.
- Guide progression accepts touch/mouse and keyboard activation. The full guest
  control group is positioned and highlighted as one scope while progression
  remains bound to the real Continue control.
- Current desktop rendered runs completed Standard (`TRAINING-D78V2E`),
  Corporate (`TRAINING-79YFYT`) and Buyout through isolated synthetic
  confirmation. Physical iPhone Safari reverified the V4 Standard path through
  the form and keyboard viewport; earlier physical end-to-end Corporate and
  Buyout completion evidence remains applicable, with both current V4/V2 flows
  rerun end to end on desktop.
- Verification gates: 4 focused tests passed, TypeScript passed, focused new
  Guided Training ESLint passed, `git diff --check` passed, and the Production
  build passed. Existing repository-wide Admin/Booking effect lint findings and
  the existing ticket PDF tracing warning were not changed.
- No migration, commit, push, or deployment occurred. No Production business
  data changed. The local Mac/LAN preview server remains active on port 3000.

## Academy UX steering cleanup — 23 October 2026 SAST

- Removed visible preview, synthetic/demo, simulation, safeguard, and version
  terminology from all three Academy modules while retaining the private
  execution boundary and versioned progress model internally.
- Replaced the completion copy with the approved `BOOKING COMPLETE` message and
  simplified all guided instructions.
- Normal-shaped `ZNG-` references and ordinary company/contact details are now
  shown inside the workflow.
- Suppressed unrelated live Admin hydration, lock polling, secret-password
  retrieval, venue-setting retrieval, and presence telemetry during a guided
  session only. Normal sessions are unchanged.
- Fixed the Admin-to-booking hydration mismatch by deriving the immutable
  calendar context and booking type from Next.js request search parameters on
  both server and client.
- Guided progress remains tied to the authenticated active staff profile and is
  available to staff regardless of role once the release flag is approved.
- No migration, commit, push, or deployment was performed. Production business
  data remained unchanged.

## Final release-readiness check — 23 October 2026 SAST

- Confirmed the Production isolation boundary still fails closed and exposes no
  booking, customer, payment, ticket, capacity, communication, or Xero writes.
- Confirmed staff completion is authenticated and uniquely persisted by staff,
  module, and module version; local preview progress remains session-only.
- Confirmed the Academy remains dynamically loaded and adds no polling or guide
  observers to normal Admin sessions.
- Reused the completed desktop and physical-iPhone evidence for all three
  modules. The focused four-test suite and `git diff --check` passed.
- Release ordering is mandatory: apply the guided-progress migration before
  enabling `ACADEMY_GUIDED_TRAINING_ENABLED=true`; the synthetic execution
  endpoint must remain unavailable in Production.
- Ready for Production release. No migration, commit, push, or deployment was
  performed, and the Production business-data delta remains zero.

## Academy finalisation and release — 23 October 2026 SAST

- Added an accessible `EXIT TRAINING` action to the shared overlay for all
  three modules. Exit saves an incomplete module's current step, returns to
  Academy, and remains separate from Restart.
- Training now loads authoritative staff-linked progress before interactions
  begin. Session storage is limited to the local private preview, and existing
  completed records are preserved when a repeat attempt exits early.
- Applied and verified migration
  `20261022193000_phase_50_14_guided_training_progress.sql` in Production. The
  new progress table was accessible with zero rows before Academy release.
- Verification passed: 4 focused tests, TypeScript, focused ESLint,
  `git diff --check`, targeted rendered Exit/step progression, and Production
  build. The synthetic execution endpoint remains unavailable in Production.
- Application rollback point: `1d88621b47e8c1496021359e6d499234a5b1f55b`.
  The additive progress table does not require rollback if the application is
  reverted.
