# Phase 50.14A - Academy Module Visibility Fix

## 23 October 2026 SAST

- Baseline: `af09627ce1926f12d27ce4376e7fdcddf218246f`.
- Root cause: two obsolete pre-release guards hid the Guided Training Academy
  tab and redirected its deep link to ordinary Academy learning in Production.
  Both guards required a development runtime and super-admin role.
- Correction: Guided Training is visible to authenticated active staff, and the
  Academy deep link restores the Guided Training workspace in Production.
- Module cards expose staff-linked Start, Continue, and Completed - Review
  states. Exit and completion return to the module list for direct resume.
- Existing module implementations, Academy courses, staff permissions,
  progress persistence, synthetic isolation, and lazy loading are unchanged.
- Release verification passed: 4 focused tests, TypeScript, focused training
  ESLint, `git diff --check`, and the Production build. The large Admin file
  retains its two pre-existing React effect lint findings; this change adds no
  new lint finding. Production deployment is authorised.
