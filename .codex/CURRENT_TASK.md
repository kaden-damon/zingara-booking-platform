PHASE 50.14B - ACADEMY TRAINING UX & FUNCTIONAL FIXES

STATUS: VERIFIED - RELEASE READY

GOAL

Correct the deployed Production-native Guided Training experience across
Standard Booking, Corporate Booking, and Buyout without changing booking,
payment, ticket, capacity, communication, or Xero behaviour.

AUTHORISED SCOPE

- Correct interaction validation, Show Me recovery, payment selection, and
  wrong-action feedback.
- Correct the Corporate rate and payment/review sequence.
- Make Back, Exit, Continue, Restart, inactivity recovery, and retakes preserve
  the expected guided state without page reloads.
- Replace Completed - Review with a completion tick and separate Retake action.
- Add subtle background blur, keep the target sharp and clickable, simplify the
  step heading, and rename Exit Training to Exit.
- Perform focused desktop/mobile verification, then commit, push, and deploy.

SAFETY

- Training remains isolated from Production business writes.
- Existing staff completion evidence is preserved.
- No booking, payment, ticket, capacity, customer, communication, or Xero logic
  may change.
- Preserve unrelated worktree files and Phase 50.14 synthetic isolation.

BASELINE

- main / origin/main: 1e3df00a4ddb18f56c8cde068adccb4f64ac3bd8
- Production rollback: 1e3df00a4ddb18f56c8cde068adccb4f64ac3bd8

ROOT CAUSES

- The guide advanced from control identity alone and did not validate the
  selected value, so invalid guest counts, unchecked terms, and unrelated
  dropdown values could pass.
- Payment selection and Review Booking were represented as one control; the
  Corporate rate choice was absent from the guide sequence.
- Back, Restart, and Exit used full-page navigation, which discarded live
  workflow state and could invoke authentication/bootstrap again.
- Progress stored only a coarse step index. It did not preserve the real
  booking workflow state or the payment substep across refresh and inactivity.
- Completed modules reused the review action and had no isolated retake state.

CORRECTIONS

- Added value-aware validation and existing red/shake feedback for incorrect
  interactions while preserving native select and touch behavior.
- Corporate Step 8 now accepts Standard Rate or Complimentary; Step 9 requires
  a valid payment option before Review Booking.
- Added in-place workflow navigation for Back, Show Me, Restart, and recovery;
  client routing is used only when crossing the Admin and booking routes.
- Exit now updates the long-lived Admin shell to the Guided Training workspace
  before client navigation, preventing a stale Home view.
- Preserved booking form state and the exact payment substep in session storage;
  staff-linked Academy progress remains authoritative across sessions.
- Added a completion tick and separate Retake action. Retakes begin at Step 1
  with full restrictions without removing prior completion evidence.
- Added subtle segmented backdrop blur, simplified STEP X OF Y headings, and
  renamed EXIT TRAINING to EXIT.

VERIFICATION

- Focused Guided Training tests: 5 passed.
- TypeScript: passed.
- git diff --check: passed.
- Production build: passed with the pre-existing ticket PDF tracing warning.
- Changed-file ESLint: new guide files have no errors; the large existing Admin
  page retains its two pre-existing set-state-in-effect findings and existing
  warnings.
- Desktop browser QA: wrong actions blocked, Show Me recovery, Corporate Steps
  8/9, Back, Restart, refresh persistence, and seating progression verified.
- Mobile 390 x 844 QA: target remained sharp/clickable; compact guide, blur,
  scrolling, and non-overlapping placement verified.
- Standard, Corporate, and Buyout module definitions remain available and use
  the existing isolated training execution boundary.

RELEASE

- Functional commit: pending
- Production deployment: pending
- Production verification: pending
- Production business-data delta: none expected; no booking, payment, ticket,
  customer, capacity, communication, or Xero writes are part of this release.
