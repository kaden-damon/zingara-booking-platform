# Phase 50.16B - Feature Walkthrough login fix

Zingara is live Production. Repair the existing Quote & Invoice Management Feature Walkthrough so it launches safely after Admin login for every genuinely unacknowledged staff member.

## Authorised scope

- Preserve the existing six-step walkthrough, design, acknowledgement metadata and Academy reopen action.
- Launch after successful login and restored authenticated sessions.
- Suppress only when the current walkthrough version has a valid completed/skipped acknowledgement and timestamp.
- Persist acknowledgement against the currently authenticated staff identity.
- Defer safely while an operational dialog is active, then launch when that workflow closes.
- Prevent duplicate popups, repeated authentication checks and background polling.
- Keep Phase 50.14 Guided Training untouched.

## Baseline and safety

- Starting commit: `523a695e5751ad1b50931ef5f859d6603f862552`.
- Starting checkout matched `origin/main` with a clean tracked tree.
- Phase 50.17 remains isolated and uncommitted in its separate worktree.
- No booking, payment, ticket, customer, financial or training-record mutation is authorised.
- QA must not complete or dismiss the walkthrough.
- Rollback point: `523a695e5751ad1b50931ef5f859d6603f862552`.

## Verification and release gates

- Focused walkthrough and authentication tests.
- TypeScript, changed-file ESLint, `git diff --check` and Production build.
- Authenticated unacknowledged-session verification covering login, refresh, safe deferral and Academy reopen.
- Commit only authorised files, push to `main`, deploy to Vercel Production and verify the live Admin experience.

## Diagnosed root cause

- The walkthrough performed one delayed launch check 600 ms after mounting.
- If another login-time dialog was present at that instant, the walkthrough returned without retrying after that dialog closed.
- The acknowledgement check also accepted a current version marker without requiring a completed/skipped decision and timestamp.

## Implemented correction

- Defer launch behind active dialogs and open as soon as the blocking workflow closes, using one short-lived DOM observer rather than polling.
- Guard against duplicate walkthrough instances.
- Require current version, completed/skipped decision and a valid acknowledgement timestamp before suppressing the walkthrough.
- Bind acknowledgement persistence to the currently authenticated staff ID.
- Keep Academy reopening, the six walkthrough steps and the existing design unchanged.

## Local verification

- Focused walkthrough/authentication tests: passed (3 tests).
- TypeScript: passed.
- Changed walkthrough/authentication-file ESLint: passed. The unchanged Admin page retains two pre-existing `react-hooks/set-state-in-effect` findings outside this change; no unrelated effect refactor was made.
- `git diff --check`: passed.
- Production build: passed.
- No Phase 50.14 files, booking/payment workflows or business data changed.
