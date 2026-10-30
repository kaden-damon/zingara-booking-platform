# Remove Booking Details Unsaved Changes Confirmation

STATUS: VERIFIED - READY FOR PRODUCTION RELEASE

DATE: 30 OCTOBER 2026

## Scope

Remove the Booking Details unsaved-draft confirmation and its close/booking-switch guards without changing explicit save behaviour or unrelated confirmations.

## Baseline

- Starting commit: `5337bb1af61b3837cc186e646062caa4224b14ed`.
- No database migration is expected.

## Diagnosis

- The draft editor already keeps edits local until `Save Changes` is selected.
- Dedicated parent state intercepts close and booking switching to render `Unsaved Changes`, `Discard Changes` and `Keep Editing`.
- That state does not perform or protect server persistence and can be removed independently.

## Implementation

- Removed only the popup state, close/switch interception, discard handler and modal.
- Preserved explicit save, local drafts, failed-save handling, booking locks and unrelated confirmations.
- Closing or switching never persists an unsaved draft.

## Verification

- 32 focused tests and 44 additional booking regression tests passed.
- TypeScript and `git diff --check` passed.
- Changed tests lint cleanly; known Admin-page lint debt remains outside the edited lines.
- Next.js webpack Production compilation passed. The existing performance-budget parser remains incompatible with the generated client-reference manifest.
- No migration is required.

## Release

Pending commit, push, deployment and authenticated Production verification.
