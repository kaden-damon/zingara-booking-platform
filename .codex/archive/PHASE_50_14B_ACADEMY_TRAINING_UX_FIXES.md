PHASE 50.14B - ACADEMY TRAINING UX & FUNCTIONAL FIXES

STATUS: VERIFIED - RELEASE READY

BASELINE AND ROLLBACK

- main / origin/main: 1e3df00a4ddb18f56c8cde068adccb4f64ac3bd8
- Production rollback: 1e3df00a4ddb18f56c8cde068adccb4f64ac3bd8

DELIVERED

- Value-aware step validation with red/shake incorrect-action feedback.
- Reliable Show Me recovery and native dropdown/touch behavior.
- Corporate Step 8 rate selection and Step 9 payment then Review sequence.
- In-place Back, Restart, Exit, Continue, refresh, and inactivity recovery.
- Completion tick plus isolated, unlimited Retake behavior that preserves
  historical completion records.
- Compact STEP X OF Y guide, EXIT label, segmented background blur, and a sharp,
  clickable highlighted Production control.

SAFETY

- The existing isolated Academy execution boundary remains unchanged.
- No booking, payment, ticket, customer, capacity, communication, or Xero logic
  or business records are modified by this release.
- Staff-linked Academy progress remains authoritative; retake state is local to
  the active guided run and cannot erase earned completion evidence.

VERIFICATION

- Focused Guided Training tests: 5 passed.
- TypeScript: passed.
- git diff --check: passed.
- Production build: passed with the pre-existing ticket PDF tracing warning.
- New guide files: no ESLint errors. Existing Admin page lint debt unchanged.
- Desktop: incorrect action, Show Me, Corporate payment sequence, Back, Restart,
  and refresh persistence verified.
- Mobile 390 x 844: compact non-overlapping guide, blur, scroll recovery, and
  clickable highlighted controls verified.

RELEASE

- Functional commit: pending
- Production deployment: pending
- Production verification: pending
- Production business-data delta: none expected
