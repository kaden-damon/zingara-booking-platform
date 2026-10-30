# Phase 67 - The Secret Guest List

STATUS: RELEASE IN PROGRESS

DATE: 30 OCTOBER 2026

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

Pending application commit, Vercel Production deployment and authenticated live
verification.
