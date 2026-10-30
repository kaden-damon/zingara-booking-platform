# Phase 64 - Dietary Add-ons & Table Plan Corrections

STATUS: VERIFIED - READY FOR PRODUCTION RELEASE

DATE: 30 OCTOBER 2026

## Baseline

- Authoritative checkout: `/Users/kadendamon/.codex/worktrees/phase-50-12-admin-performance/zingara-booking-platform`
- Verified starting commit: `16d1cb03832a179a2d16188c9416385b8f94c3ec` (`HEAD` and `origin/main`).
- Existing user-owned Markdown records and report artifacts remain preserved and excluded from Phase 64.

## Objective

Enforce the approved 72-hour ordering window only for new or increased Kosher and Strictly Halal meal add-ons, notify Fatima once confirmed orders exist, and correct the authoritative Table Plan dietary quantity columns and D79:K79 formatting without changing booking, financial or seating rules.

## Verified Diagnosis

- Kosher and Strictly Halal currently exist as Johannesburg catalogue add-ons but have no performance-time ordering restriction.
- Public booking currently rejects all add-ons, while internal Standard, Corporate and Box Office creation share the same authoritative booking API and metadata model.
- Booking edits already preserve existing add-ons when unrelated metadata changes are saved; Phase 64 must add delta-aware timing validation so existing quantities can remain or be reduced inside the cutoff.
- The Table Plan export currently writes legacy monetary evidence into columns V and W. It does not derive meal quantities from authoritative booking add-on metadata.
- Staff email delivery already has an idempotent delivery ledger suitable for confirmation-only dietary notifications.

## Safety Boundaries

- The restriction must never become booking-level validation or silently change guest counts, prices or payments.
- Existing dietary orders and historical bookings remain unchanged.
- Existing complimentary financial safeguards remain unchanged; Phase 64 does not introduce paid add-ons into complimentary bookings.
- No Production customer communication or business-data mutation will be used for verification.

## Progress

- Added one shared, timezone-explicit 72-hour ordering rule. Exactly 72 hours remains available; inside the window, new or increased Kosher/Strictly Halaal quantities are removed server-side while existing quantities may remain or reduce.
- Public Johannesburg booking now exposes only the two authoritative dietary meal add-ons. Internal Standard, Box Office and Corporate creation retain the full authorised catalogue. Complimentary financial safeguards remain unchanged.
- The booking UI disables unavailable meals and explains the ordering window. Stale restricted meals are cleared when the selected show or complimentary mode makes them unavailable.
- Confirmed dietary orders queue one branded email to Fatima's active staff profile (`3ac09b59-fc3f-4c6d-9bb3-8dd47a077188`) through the existing idempotent staff-delivery ledger. Pending bookings and retries do not send duplicates.
- Table Plan columns V and W now contain whole Strictly Halaal and Kosher quantities from authoritative booking add-on metadata. Legacy payment evidence remains confined to existing financial reconciliation calculations.
- The generated workbook clears the incorrect fill only from D79:K79 and preserves the remaining cell styles and formulas.

## Verification

- 112 focused and regression tests passed across cutoff boundaries, booking continuation, amendments, Public/Admin/Corporate/COMP safeguards, PayFast, manual EFT, notifications, exports and financial formulas.
- TypeScript passed.
- Changed-file ESLint passed with zero errors; five pre-existing warnings remain in long-standing booking and PayFast routes. The public booking page retains ten pre-existing React effect lint errors, while no Phase 64 line reports a lint error.
- `git diff --check` passed.
- Next.js 16.3.4 Webpack Production build passed.
- Rendered local UI verification confirmed a four-guest Johannesburg booking proceeds to Payment, meals are disabled with clear wording inside 72 hours, and are selectable for a later performance. No booking or payment was submitted.
- Fatima's authoritative active staff record and configured Zingara email were verified read-only in Production. No email was sent during QA.
- Existing Production metadata contains the configured dietary add-ons only in Johannesburg; Phase 64 preserves that venue scope rather than inventing Cape Town pricing.
- No database migration is required; the existing delivery ledger and RPC support the new idempotent notification key.

## Release Pending

- Commit, push, Vercel Production deployment and read-only Production verification remain to be recorded.
