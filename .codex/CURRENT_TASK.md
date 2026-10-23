PHASE 50.14 — ACADEMY INTERACTIVE GUIDED TRAINING

Follow AGENTS.md and the existing .codex Markdown workflow.
Update CURRENT_TASK.md and archive the completed phase.

GOAL

Build a fully interactive Guided Training experience
within the existing Zingara Academy.

Staff must learn by performing every step of a real
workflow, guided by interactive highlights and instructions.

This is NOT a video, slideshow or simulated imitation
of the platform.

1. TRAINING EXPERIENCE

Add Academy → Guided Training.

Build three complete modules:

01 — Create Standard Booking
02 — Create Corporate Booking
03 — Create Buyout

Each module must guide staff through the ENTIRE
existing Production workflow, from start to finish.

Use the actual Production UI components, controls,
fields, validation, calculations and navigation.

The training experience must be visually and
functionally identical to the live platform.

Only the underlying data and side effects are simulated.

2. INTERACTIVE GUIDANCE

Implement a lightweight guided-tour experience:

- Highlight the exact required control with a
  subtle pulsating gold ring.
- Dim or gently blur unrelated elements.
- Display one short instruction at a time.
- Automatically advance after the correct action.
- Give gentle red visual feedback for incorrect actions.
- Explain exactly what the staff member should do.
- Include Back, Restart and Show Me.
- Display simple step progress.

Staff must physically complete each action.

Do not allow them to skip required steps.

No passive click-through demonstrations.

3. COMPLETE SYNTHETIC TRAINING

Training must be entirely isolated from real
Production business operations.

Use synthetic shows, customers, bookings,
companies, seating, prices and payment outcomes.

Staff must complete the full workflow, including
simulated booking confirmation.

No real:

- Bookings
- Payments
- Capacity reservations
- Tickets or QR codes
- Customer records
- Emails
- Payment links
- Xero transactions

Only authorised Academy progress and completion
records may persist.

Enforce isolation server-side, not merely through
a browser flag.

Reuse existing booking components and shared logic.
Do not create a second booking engine or duplicate UI.

4. PRODUCTION PARITY

This is a critical requirement.

Every training step must match the current live
Production workflow exactly.

Use stable training identifiers on real controls.

Do not use screenshots, imitation forms or
hard-coded outdated booking procedures.

If a workflow changes and a training step becomes
invalid, fail safely and flag the module for updating.

Preserve module versions and historical completions.

5. ACADEMY INTEGRATION

Reuse existing Academy staff identities and progress.

Each module must show:

NOT STARTED
IN PROGRESS
COMPLETED

Record staff-linked completion, date and module version.

Allow staff to repeat completed modules.

Preserve existing Academy and Training Register.

Guided completion must not automatically grant
trainer-verified proficiency.

6. PERFORMANCE

Guided Training must not slow the live platform.

Load the training engine ONLY when a module starts.

No background training processes during normal Admin use.

No unnecessary polling, global data hydration,
heavy animation libraries or additional booking requests.

Preserve Phase 50.12 performance improvements.

Verify that one staff member training does not
affect another staff member creating real bookings.

7. UX/UI

Use Zingara's existing black/gold design language.

Rounded containers, pill-shaped buttons,
consistent typography and minimal clutter.

Keep instructions exceptionally short and clear.

Make the experience intuitive enough for staff
with limited technical experience.

Ensure highlighted controls remain accessible
and visible on smaller screens.

8. VERIFICATION

Test all three modules end-to-end.

Verify:

- Every step matches the real Production workflow.
- Every required interaction works.
- Incorrect actions receive helpful feedback.
- Synthetic data never reaches live business APIs.
- No real business records are created.
- Completion is linked to the correct staff account.
- Progress survives appropriate navigation.
- Existing Academy functionality remains unchanged.
- Normal Box Office performance is unaffected.
- No booking, payment or capacity safeguards change.

Perform authenticated desktop and mobile QA.

Use the existing project testing and verification rules.

9. APPROVAL BOUNDARY

Build and test the complete experience.

Keep Guided Training hidden from ordinary staff.

Prepare a private management-only preview within
the existing Academy.

DO NOT activate it for staff.

DO NOT deploy to Production or modify Production
business data without my explicit approval.

Keep the local development server running so I can
personally complete all three modules.

Provide the exact local preview URL.

10. FINAL REPORT

Keep concise.

Provide:

- Three completed training modules.
- Production UI parity verification.
- Synthetic-data isolation verification.
- Staff completion tracking.
- Performance impact.
- Tests and responsive QA.
- Preview URL.
- Known limitations.
- Files changed.
- Approval status.

FINAL:

PHASE 50.14 —
ACADEMY GUIDED TRAINING BUILT.
AWAITING PERSONAL REVIEW AND APPROVAL.

---

## Guided Training Preview Loading Fix

The local Guided Training preview was reported as permanently stuck on
`Loading Guided Training...` in Mac Chrome and iPhone Safari. Diagnose the
authentication boundary, dynamic loading, client initialisation, and browser
runtime; apply the smallest verified correction; exercise all three synthetic
modules in the rendered interface; and leave the Wi-Fi preview server running.

Do not commit, push, migrate, or deploy. Preserve Production parity, synthetic
data isolation, existing functionality, and performance safeguards.

### Verification record — 22 October 2026 SAST

- Root cause: the private preview rendered only a loading shell until a
  client-side bootstrap request completed. LAN development resources were also
  rejected because the server was initialised for a different host.
- Correction: the already-authorised synthetic preview bootstrap is supplied
  by the server page, while the authenticated Academy path retains its existing
  API bootstrap. The development server is bound to the Mac's Wi-Fi address.
- Mac Chrome: all three module cards render; Standard, Corporate, and Buyout
  workflows complete through their review and completion states.
- Mobile evidence for that superseded simulator preview was limited to a
  390px browser viewport. Physical iPhone Safari verification was not
  completed and must not be inferred from the LAN server response.
- Data isolation: only preview-session progress and the preview progress API
  were exercised. No booking, customer, payment, ticket, capacity,
  communication, Xero, or Production record was created.
- Checks: 4 focused tests passed; TypeScript passed; focused ESLint passed;
  `git diff --check` passed.
- Release boundary: no migration, commit, push, deployment, or Production
  mutation was performed.

---

## Production-Native Guided Training Correction

The simulator-style preview is not approved. Replace it with a
Production-native guided training architecture.

The live platform is the single source of truth for every training screen,
control, layout, validation rule, calculation, and navigation path. Standard
and Corporate training must use the actual staff `/book` workflow launched
from the actual Admin dashboard/calendar. Buyout training must use the actual
Production buyout component.

The guided layer may only highlight the real control, dim unrelated controls,
show the next instruction, validate the required interaction, and advance the
real workflow. It must not recreate booking screens or duplicate booking
business logic.

Add a secure synthetic execution layer at the authoritative read/write seams.
The real components must operate normally against deterministic synthetic
fixtures, while every booking, customer, payment, ticket, capacity,
communication, payment-link, and Xero mutation is blocked server-side. Only
authorised Academy progress may persist.

Build and verify all three modules:

1. Standard Booking
2. Corporate Booking
3. Buyout

Preserve staff-linked progress and module versioning. Load the training engine
only during an active module. Capture matching Production and Training evidence
at desktop and mobile viewports; do not claim pixel parity without rendered
evidence.

Keep the implementation in private local preview. Do not commit, push, migrate,
or deploy. Keep the Mac/iPhone LAN preview running and report genuine blockers
instead of weakening Production parity or synthetic-data isolation.

### Production-native verification record — 22 October 2026 SAST

- Architecture: the simulator screens were removed. Guided Training now
  launches the real Admin calendar, the real staff `/book` workflow for
  Standard and Corporate bookings, and the real `CorporateBuyoutCreator` for
  Buyouts. The guided layer is limited to highlighting, dimming, instruction,
  interaction validation, progress, restart, and completion feedback.
- Isolation: a local-only, HMAC-signed training session gates deterministic
  synthetic show, company, customer, seating, pricing, and confirmation data.
  Final actions call the dedicated synthetic execute endpoint; they do not call
  booking, customer, payment, ticket, capacity, communication, payment-link,
  or Xero write paths.
- Standard Booking: completed end to end through the actual calendar, booking
  type chooser, customer details, seating, payment, terms, review, and
  synthetic confirmation. Verified reference: `TRAINING-A6N2J7`.
- Corporate Booking: completed end to end through the actual Private Booths
  seating map, company/contact, invoiced-outstanding payment state, review,
  terms, and synthetic confirmation. Verified reference: `TRAINING-JQ8W5N`.
- Buyout: completed end to end through the actual company/contact, package,
  400-guest allocation, review, and confirmation controls.
- Progress: all three modules display `COMPLETED · V2` in the private preview.
  Authenticated Academy sessions retain the existing staff-linked persistence;
  the local private preview stores progress only in its isolated browser
  session and does not write Production training records.
- Browser fixes found during rendered QA: local HTTP no longer depends on
  `crypto.randomUUID()`, and preview progress is restored after hydration so
  server and client output remain consistent.
- Desktop QA: all three modules were exercised in rendered Mac Chrome.
- Mobile QA: the production-native launcher was rendered at 390×844 in Chrome
  responsive mode with no horizontal overflow. Native iPhone Safari execution
  was not completed because iPhone Mirroring was blocked while the iPhone
  microphone was in use. This remains a personal-review item; it is not being
  represented as completed native-device QA.
- Evidence:
  `.codex/artifacts/phase-50-14/desktop-buyout-complete.png`,
  `.codex/artifacts/phase-50-14/desktop-launcher-all-modules-complete.png`,
  `.codex/artifacts/phase-50-14/mobile-chrome-emulation-390x844.png`, and
  `.codex/artifacts/phase-50-14/production-login-reference.png`.
- Verification: 4 focused tests passed; TypeScript passed; focused ESLint
  passed with one pre-existing `react-hooks/exhaustive-deps` warning in
  `CorporateBuyoutCreator.tsx`; `git diff --check` passed.
- Preview:
  `http://192.168.1.78:3000/admin/guided-training-preview?key=phase5014-7f89c2d4a6e1b305`
- Release boundary: no migration was applied; no commit, push, or deployment
  was performed; Production business-data delta is zero.

---

## Native iPhone QA record — 22 October 2026 SAST

- Device: the physical connected iPhone was controlled through macOS iPhone
  Mirroring and the preview was exercised in iPhone Safari over the local
  Wi-Fi network. This was not viewport emulation.
- Standard Booking: completed through the real Admin calendar and staff
  booking workflow with 4 guests, Golden Circle, synthetic contact details,
  payment review, terms, and synthetic confirmation.
- Corporate Booking: completed through the real Admin calendar and staff
  booking workflow with 20 guests, Private Booths, synthetic company/contact,
  invoiced-outstanding payment treatment, terms, and synthetic confirmation.
- Buyout: completed through the real `CorporateBuyoutCreator` with the
  synthetic company/contact, Full Venue Buyout package, 400 guests, R405,000
  commercial summary, review, and synthetic confirmation.
- Native defects corrected: Production handlers now run before guide progress
  advances; the mobile guide sits above the workflow instead of covering final
  actions; Restart safely restores the real workflow; Back cannot leave the
  guide and Production UI out of sync; Show Me no longer presents false error
  feedback; the incorrect-action guard no longer blocks Safari scrolling; and
  Admin/Booking now consume Next.js page `searchParams` consistently, removing
  the Safari hydration mismatch caused by reading `window.location` during the
  first client render.
- Interaction coverage: correct and incorrect taps, Show Me, Back, Restart,
  form input, native select controls, keyboard dismissal, nested modal
  scrolling, touch targets, review modals, and all three completion states.
- Isolation: every completion screen confirmed that no booking, payment,
  ticket, capacity, communication, or Xero record was created. Production
  business-data delta remains zero.
- Native evidence is stored in `.codex/artifacts/phase-50-14/` as
  `native-iphone-standard-step-1.png`,
  `native-iphone-standard-booking-type.png`,
  `native-iphone-standard-complete.png`,
  `native-iphone-corporate-complete.png`, and
  `native-iphone-buyout-complete.png`.
- Release boundary remains unchanged: no migration, commit, push, or deployment
  was performed. The private LAN server remains active for personal review.
- Final verification: 4 focused tests passed, TypeScript passed, focused
  Guided Training ESLint passed, `git diff --check` passed, and the LAN preview
  returned HTTP 200. Existing unrelated booking-page lint findings remain
  outside this local preview correction.

---

## Mobile Guided Training UX fix — 22 October 2026 SAST

- Replaced the fixed mobile instruction panel and page-padding workaround with
  target-aware positioning driven by Safari's live visual viewport.
- The current visible Production control is scrolled into view and the compact
  panel is placed above or below it with a measured gap. Positioning updates
  after step changes, scrolling, nested modal movement, focus changes, keyboard
  opening/closing, viewport resizing, and Safari `scrollend`.
- Responsive duplicate markers are filtered to the visible element. Focused
  inputs and native selects keep the panel on the opposite side so controls,
  picker options, and keyboard actions remain available.
- SVG seating targets are recognised as valid controls, fixing incorrect-action
  feedback on Golden Circle and Private Booths.
- Physical iPhone Safari verification covered the shared Standard/Corporate
  journey controls and all eight Buyout steps through synthetic completion.
  Standard and Corporate had already completed end to end on the same device;
  shared post-fix seating, details, keyboard, and modal placement was rechecked.
  iPhone Mirroring hardware-keyboard injection occasionally duplicated/dropped
  characters during the repeat Standard data-entry pass; ordinary touch/select
  interactions and the guide positioning remained correct.
- Evidence:
  `.codex/artifacts/phase-50-14/native-iphone-buyout-position-step-1.png`,
  `.codex/artifacts/phase-50-14/native-iphone-buyout-keyboard-position.png`, and
  `.codex/artifacts/phase-50-14/native-iphone-standard-keyboard-position.png`.
- Verification: 4 focused tests passed; TypeScript passed; focused ESLint
  passed; `git diff --check` passed; LAN preview HTTP 200.
- No migration, commit, push, or deployment was performed. Production business
  data was not modified. The LAN preview server remains running.

---

## Latest Production reconciliation — 23 October 2026 SAST

- Reconciled the private Phase 50.14 implementation onto current
  `origin/main` / Production baseline `1d88621b47e8c1496021359e6d499234a5b1f55b`
  without reverting or overwriting subsequent releases. A recoverable local
  stash remains at `phase-50-14-production-native-guided-training-backup-2026-10-23`.
- Standard Booking and Corporate Booking are now module version 4. Both use
  the current Admin calendar, current staff booking-type chooser, current
  booking page, current seating preview/confirmation modal, current details,
  payment/review, Royal Decrees acknowledgement, and current confirmation UI.
  Buyout remains version 2 and uses the current `CorporateBuyoutCreator`.
- Corrected verified reconciliation defects only: browser-host-preserving LAN
  redirects; signed local preview bootstrap; synthetic staff role on the real
  booking page; current seating confirmation and Continue-to-Details steps;
  mouse/touch/Enter/Space guide progression; target-scope positioning for the
  complete guest controls; and development-only allowed LAN origins.
- Desktop rendered QA completed all three modules end to end. Standard created
  synthetic reference `TRAINING-D78V2E`; Corporate created synthetic reference
  `TRAINING-79YFYT`; Buyout reached the synthetic completion state. Every
  completion reported `persisted: false`; no Production booking, customer,
  payment, ticket, QR, capacity, communication, payment-link, or Xero path was
  used.
- Physical iPhone Safari V4 QA rechecked the current Admin calendar, Standard
  selector, guest-count controls, Golden Circle map, seating preview modal,
  Continue-to-Details transition, form positioning, scrolling, safe-area and
  keyboard-driven visual viewport behaviour. The panel remained beside the
  highlighted target and controls remained tappable. Prior physical-iPhone
  evidence remains the end-to-end run for Corporate and Buyout; those two V4
  desktop flows were rerun end to end after reconciliation.
- Staff-linked progress remains keyed by staff ID, module ID and module
  version. Local private-preview progress remains session-only. The migration
  remains unapplied and no Production training record was created.
- Performance: training remains dynamically loaded only for an active module;
  normal Admin sessions do not mount the guide or its observers. Preview mode
  suppresses normal Admin polling and Production data hydration. No actual
  legacy-PC hardware benchmark was performed in this private local phase.
- Verification: 4 focused tests passed; TypeScript passed; focused new-file
  ESLint passed with the existing `CorporateBuyoutCreator` hook warning only;
  full changed-page lint still reports pre-existing large Admin/Booking effect
  findings; `git diff --check` passed; Next.js 16.3.4 Production build passed
  with the existing `ticketPdfServer` tracing warning.
- Preview links:
  `http://127.0.0.1:3000/admin/guided-training-preview?key=phase5014-7f89c2d4a6e1b305`
  and
  `http://192.168.1.78:3000/admin/guided-training-preview?key=phase5014-7f89c2d4a6e1b305`.
  Both return HTTP 200 and the LAN server remains running.
- Release boundary: no migration, commit, push, or deployment was performed.
  Production business-data delta is zero.

### Academy UX steering cleanup — 23 October 2026 SAST

- Removed staff-facing preview, synthetic-data, simulation, technical-boundary,
  and module-version language from the Academy launcher, guided panel, booking
  errors, and completion state. Internal isolation and versioned progress keys
  remain unchanged.
- Simplified every Standard, Corporate, and Buyout instruction to a short,
  natural action. Training references now use the normal `ZNG-` shape and the
  supplied company/contact reads like an ordinary booking workflow.
- The completion state now reads exactly: `BOOKING COMPLETE`, `You've
  successfully completed this training module.`, and `RETURN TO ACADEMY`.
- Guided sessions no longer start booking/show lock polling, selected-show
  floor hydration, secret-password retrieval, venue-setting retrieval, or
  staff/public presence telemetry. Normal Admin and public-booking behaviour is
  unchanged.
- Calendar context and booking type now come from the same request values on
  server and client, removing the verified Admin-to-booking hydration mismatch.
- Progress access is linked to the authenticated active staff identity rather
  than a management-only role. Local private-preview progress remains session
  scoped, and no Production progress was written.
- Release boundary remains unchanged: no migration, commit, push, or deployment
  was performed. Production business-data delta is zero.

### Final release-readiness check — 23 October 2026 SAST

- Production isolation remains fail-closed: the training execution route is
  unavailable in Production and guided workflows use only the non-persisting
  local execution boundary. No booking, customer, payment, ticket, capacity,
  communication, or Xero write path is reachable from training.
- Staff completion remains authenticated and keyed by staff profile, module,
  and module version, with one authoritative upsert and service-role-only table
  access. Private-preview progress remains session-only.
- Normal Admin loading remains unaffected: the Academy and guide overlay are
  dynamically imported, mount only for an active module, and add no new normal
  Admin polling. Guided sessions suppress unrelated Admin background work.
- Standard Booking, Corporate Booking, and Buyout remain defined and functional
  against the current Production-native workflows. Existing desktop and
  physical-iPhone evidence was reused; the focused four-test suite and
  `git diff --check` passed in this final check.
- Release prerequisite: apply
  `20261022193000_phase_50_14_guided_training_progress.sql` before enabling
  `ACADEMY_GUIDED_TRAINING_ENABLED=true`. Keep the synthetic execution endpoint
  disabled in Production. With that ordering, Phase 50.14 is ready for release.
- No migration, commit, push, or deployment was performed. Production
  business-data delta remains zero and the local preview server remains active.

### Academy finalisation and release — 23 October 2026 SAST

- Added `EXIT TRAINING` to the shared guide used by Standard Booking,
  Corporate Booking, and Buyout. It remains accessible in the compact guide on
  desktop and mobile, saves the current incomplete step, returns to Academy,
  and does not invoke the separate Restart action.
- Corrected Production resume initialisation to load the authenticated staff
  member's authoritative Academy progress. Browser session storage is now used
  only by the private local preview, preventing progress from crossing staff
  sessions on shared devices.
- Previously completed modules are not downgraded when staff repeat and exit
  early. Incomplete modules remain `in-progress`; only the final guided action
  records `completed`.
- Applied migration `20261022193000_phase_50_14_guided_training_progress.sql`
  to the linked Zingara Production Supabase project. The table and service-role
  access were verified, with zero progress rows before release.
- Release verification passed: 4 focused tests, TypeScript, focused ESLint,
  `git diff --check`, rendered Exit/step progression, and the Production build.
  The existing unrelated `ticketPdfServer` tracing warning remains unchanged.
- Release scope: enable `ACADEMY_GUIDED_TRAINING_ENABLED=true` for Production,
  deploy the current application, and keep the local-only execution route
  unavailable in Production. Rollback application baseline is
  `1d88621b47e8c1496021359e6d499234a5b1f55b`; the additive progress table may
  remain safely in place if application rollback is required.
