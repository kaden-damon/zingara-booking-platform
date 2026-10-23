PHASE 50.14A - ACADEMY MODULE VISIBILITY FIX

STATUS: COMPLETE - LIVE AND VERIFIED

GOAL

Restore the three deployed Production-native Guided Training modules to the
existing Academy without rebuilding them:

- Create Standard Booking
- Create Corporate Booking
- Create Buyout

ROOT CAUSE

The Academy navigation and Academy deep-link restoration still contained the
pre-release local-preview restriction. Both required a non-Production runtime
and a super-admin role, so the deployed module launcher could not be reached by
Production staff. Once exposed during authenticated release verification, the
launcher also proved to use plain fetch requests without the active staff bearer
token, so its protected progress endpoint returned Unauthorized. The guided
progress API and modules themselves were present and correctly protected.

CORRECTION

- Removed only the obsolete Production/super-admin visibility conditions.
- Retained active-staff authentication, feature flagging, module versions,
  server-side isolation, and staff-linked progress persistence.
- Made the launcher states explicit: Start, Continue, and Completed - Review.
- Return Exit, completion, and load-error navigation to the Guided Training
  module list so staff can immediately resume or review.
- Added focused regression assertions preventing the Production visibility gate
  from returning.
- Routed launcher, resume, Exit, and completion progress requests through the
  existing authenticated Admin API helper.
- Exit now performs a clean Admin navigation after saving progress, ensuring the
  long-lived Admin shell restores the Guided Training workspace before resume.

SAFETY

- No booking, payment, ticket, capacity, customer, communication, or Xero logic
  changed.
- Normal Admin loading remains unchanged; the Guided Training component is
  still dynamically loaded and requests progress only when its Academy tab is
  opened.
- Phase 50.14 synthetic execution remains disabled in Production.
- Existing Academy courses and Training Register remain unchanged.

RELEASE

- Baseline: af09627ce1926f12d27ce4376e7fdcddf218246f
- Rollback: af09627ce1926f12d27ce4376e7fdcddf218246f
- Focused Guided Training tests: 4 passed
- TypeScript: passed
- Focused Guided Training ESLint: passed
- Admin changed-file ESLint: only the two existing effect findings at lines
  8406 and 8419, plus existing warnings; no new finding from this change
- git diff --check: passed
- Production build: passed with the existing ticket-PDF tracing warning
- Functional Production commit: 21c3b2a
- Deployment: dpl_8ev524pBSFLovNQmo6XKButEhdtv (READY)
- Production alias: https://book.zingara.co.za
- Authenticated Production verification: all three module cards visible; Standard,
  Corporate, and Buyout launched at their first real guided step; Exit returned
  to Guided Training; Buyout displayed its saved Continue state.
- Production business-data delta: zero. Authenticated QA created one intended
  Academy progress row for Kaden's Buyout module at step 0, status in-progress.
