# Phase 50.16C - Mandatory Feature Walkthrough

Zingara is live Production. Issue a new version of the existing Quote & Invoice Management Feature Walkthrough to every active staff member while preserving prior acknowledgement evidence.

## Authorised scope

- New walkthrough version for all 22 active staff, including staff who completed or dismissed an earlier version.
- Launch once when the Admin session loads, refreshes or navigates, without requiring logout/login.
- Defer while booking, payment or other operational dialogs are active.
- Prevent duplicate popups within the same session.
- Record completion or dismissal against the authenticated staff identity.
- Preserve Next, Back, Skip, Got It and Academy reopening.
- Preserve prior acknowledgement evidence when the new version is recorded.

## Safety and performance

- No staff impersonation and no manufactured acknowledgements.
- No polling; use the existing authenticated session and event-driven dialog observer.
- No role filtering: every active authenticated staff profile is eligible.
- Keep Phase 50.14 Guided Training untouched.
- Preserve all booking, payment, ticket, capacity, Xero and reminder behaviour.
- Preserve unrelated work and Production business data.

## Baseline

- Production and `origin/main`: `7d38217bd3c1e37f13496a26960ec5e7bd09c4aa`.
- Rollback point: `7d38217bd3c1e37f13496a26960ec5e7bd09c4aa`.
- Read-only Production reconciliation on 23 October 2026 confirmed 22 active `staff_profiles` records.

## Verification and release

- Test previously acknowledged and unacknowledged users against the new version.
- Test load, refresh, navigation, dialog deferral, session deduplication, Academy reopening and identity-bound acknowledgement.
- Run focused tests, TypeScript, changed-file ESLint, `git diff --check` and Production build.
- Commit, push, deploy and verify the new Production version without creating acknowledgement records during QA.

## Pre-release verification - 23 October 2026

- New version: `quote-invoice-management-2026-10-23-v2`.
- Production contains 22 active staff profiles linked to 22 active authentication identities.
- 10 active staff identities acknowledged the previous walkthrough version; 12 did not. No identity has acknowledged the new version before release.
- Both prior states are eligible for the new version; only a valid completion or dismissal for the exact new version suppresses automatic launch.
- Previous acknowledgement details are appended to `zingara_staff_tour_history` before the current metadata advances to the new version.
- Admin tab navigation rechecks cached eligibility without another authentication request, while a session-level handled guard prevents duplicate popups.
- Existing operational dialogs defer launch through the event-driven `MutationObserver`; no polling was added.
- Focused walkthrough tests, TypeScript, `git diff --check` and Production build pass.
- Focused changed-file ESLint passes for the walkthrough/auth modules. The single-line Admin mount change remains covered by two pre-existing `react-hooks/set-state-in-effect` findings elsewhere in the 46,000-line Admin page; those unrelated historical findings were not changed.
