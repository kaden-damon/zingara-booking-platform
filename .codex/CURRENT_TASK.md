# Phase 67 Follow-up - Customer Acknowledgement

STATUS: DEPLOYED - CUSTOMER ACTIVATION AWAITING KADEN APPROVAL

DATE: 30 OCTOBER 2026

## Objective

Add an immediate branded customer acknowledgement to successful Secret Guest
List enquiries while keeping automatic customer delivery disabled until Kaden
approves a Production-template test email.

## Release Boundary

- Reuse the existing customer HTML shell, Microsoft 365 sender, Communications
  records and Waitlist acceptance path.
- Run acknowledgement work only after the public response and never create a
  booking, reserve seats or change availability.
- Use an atomic Communications claim so retries and duplicate enquiries cannot
  generate duplicate customer emails.
- Preserve the existing Box Office notification routing and preferences.
- Deploy with the workflow configuration disabled, then send one isolated test
  email to Kaden without creating a customer enquiry or notifying staff.

## Baseline

- Starting commit: `aad49826ab9232e627eb5b00d892650577d60124`.
- Phase 67 is live and its public submission returns before deferred staff email
  work begins.
- Customer operational emails already use the branded shell, legal links,
  Microsoft 365 sender, suppression controls and Communications records.
- No automatic Secret Guest List customer acknowledgement exists yet.

## Implemented

- Added the approved branded acknowledgement with the exact subject, headline,
  subheading, request summary, next-step wording, legal notice, transactional
  notice and existing Legal Centre footer.
- Customer delivery runs only after a newly created Secret Guest List enquiry
  has been accepted. It remains outside the public response path.
- Added an atomic Communications claim keyed to customer, performance, channel
  and subject. Concurrent retries, repeated callbacks and duplicate submissions
  cannot send a second acknowledgement.
- Customer acknowledgement uses the existing operational email suppression,
  branded HTML shell and Microsoft 365 sender. Existing Box Office notification
  delivery is unchanged and runs independently.
- Added UTF-8 and mobile viewport metadata to the shared customer email shell so
  approved punctuation and mobile widths render consistently.
- Added the existing workflow configuration
  `secret_guest_list_customer_acknowledgement`, seeded disabled with no
  activation timestamp.

## Verification

- 37 focused customer-email, Secret Guest List, staff-routing and security tests
  passed.
- TypeScript, changed-file ESLint, `git diff --check`, migration dry-run and the
  Next.js webpack Production build passed.
- The generated Production-template email passed a 390 x 844 rendered check
  with no horizontal overflow. Branding, dynamic performance details, legal
  notice and footer links were visible and correctly aligned.
- Migration `20261030223000_phase_67_customer_acknowledgement.sql` applied and
  the linked Production schema is up to date.

## Production Release

- Application commit: `d542509cc32c032d263d44f06fc7dc9c834a5be0`.
- Vercel deployment: `dpl_CtsGJsXW2qzVYGQ7uJescC3SU7JB`.
- Production URL:
  `https://zingara-booking-platform-qeu5u6p8v-kaden-damons-projects.vercel.app`
  with aliases including `https://book.zingara.co.za`.
- One isolated preview was sent to `kaden@kaden.co.za`. Microsoft 365 accepted
  the send and Communications record `5ad56ae4-050d-4430-9e96-ddde2cccc252`
  records status `sent` at 19:28:37 SAST.
- The preview used Johannesburg, 4 November 2026 at 17:00 for four guests. It
  created no customer enquiry and triggered no Box Office notification.
- Automatic customer acknowledgements remain disabled and `activated_at` is
  null.

## Approval Gate

After Kaden approves the preview, the only pending activation is to set the
existing `secret_guest_list_customer_acknowledgement` workflow configuration to
`enabled = true` and record `activated_at = now()`. No application redeployment,
new migration or booking-data change is required.

---

## Prior Phase 67 Release Evidence

## Objective

Add a concise customer enquiry for sold-out performances and parties that no
available seating zone can accommodate, using the existing Waitlist,
Communications, Staff Emails and branded Microsoft 365 email infrastructure.

## Verified Baseline

- Authoritative checkout: `/Users/kadendamon/.codex/worktrees/phase-50-12-admin-performance/zingara-booking-platform`
- Starting commit: `83cbae6f2428d02c6fd787d27a5ed7943afa4f7c` (`HEAD` and `origin/main`).
- The public booking page already submits into `waitlist_entries`, but only for
  otherwise bookable shows with no compatible seating zone.
- Manually SOLD OUT performances cannot currently open the waitlist form.
- The existing form is an inline, expanded section with additional seating and
  notes fields rather than the approved compact enquiry.
- Public waitlist submissions are rate-limited, but duplicate creation is not
  atomically prevented. Historical active duplicates exist and must remain
  untouched.
- Staff Emails already provides personal subscriptions and protected routing;
  Communications already records internal email delivery evidence.
- Verified active recipient profiles exist for Sharon Ricketts, Rasmus
  Bjerregaard, Fatima MB, Michael Davis, Lisa Rodderick, Kaden Damon, Tracy
  Maltman and Nicky-Anne De Beer.

## Implementation Boundary

- Reuse the existing waitlist record and Admin workflow.
- Keep sold-out performances non-bookable and preserve all availability,
  seating, checkout and payment safeguards.
- Prevent new duplicate enquiries atomically without rewriting historical rows.
- Route branded staff email through authoritative profile IDs and individual
  Staff Emails preferences, preserving TO and CC placement.
- Record the notification in Communications with durable delivery idempotency.
- Preserve unrelated user-owned Markdown records and report artifacts.

## Verified Implementation

- Added the approved mobile-first invitation and compact panel for SOLD OUT
  performances and insufficient party availability.
- SOLD OUT performances remain non-bookable and cannot enter checkout.
- Added atomic, contact-and-performance duplicate prevention without changing
  historical Waitlist records.
- Added individual Staff Emails preferences, verified TO/CC profile routing,
  branded asynchronous email delivery, direct Admin links and Communications
  evidence.
- 20 focused tests, TypeScript, targeted ESLint, `git diff --check` and the
  Next.js webpack Production build passed.
- Rendered UI verification passed at 390 x 844 and 1440 x 900 with no browser
  runtime errors.
- The single Phase 67 migration applied successfully. A rollback-only Production
  call verified create/retry idempotency and left no QA rows.

## Release

- Application commit `7e5f1e908eaf120deb97213b5388e122cd83bed8` was pushed
  to `origin/main`.
- Production served the new immutable application assets with a fresh Vercel
  response (`x-vercel-id: cpt1::iad1::8lzfd-1793378707263-3e83b23836e9`).
- Live Production verification used Johannesburg, 4 November 2026. The SOLD OUT
  date was selectable for enquiry, the performance action remained disabled,
  and the approved invitation opened the pre-populated panel.
- The live panel passed a 390 x 844 mobile viewport check with no horizontal
  overflow; all required fields and the CTA were visible and reachable.
- Johannesburg, 5 November 2026 remained available and progressed into the
  unchanged guest-count step, confirming the normal booking path still works.
- The public Waitlist endpoint rejected unauthenticated record retrieval with
  HTTP 401. The Production notification route contains the exact five TO and
  three CC staff profile IDs and remains enabled.
- No public enquiry was submitted and no staff email was sent during Production
  QA. The idempotent creation, notification preference and Communications paths
  were verified through focused tests and rollback-only database checks.
- Production business-data delta: the Phase 67 function and notification route
  were added. No customer, Waitlist, booking, payment or communication record
  was created or changed by release verification.
