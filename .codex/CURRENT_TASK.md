# Phase 50.17 - Final Corporate PDF verification and corrections

Zingara is live Production. Finalise the three existing Corporate operational PDF templates against the supplied original Zingara documents, which remain the authoritative visual source of truth.

## Authorised scope

- Corporate Function Checklist based on `Corporate bookings Check List Monique Le Roux.pdf`.
- Corporate Bar Brief based on `Bar BRIEF MCT Telecommunications (Pty) Ltd.pdf`.
- Corporate Function Brief based on `Function BRIEF MCT Telecommunications (Pty) Ltd.pdf`.
- Populate `Booked through` from immutable booking-creation and audit evidence, never from the downloading staff member.
- Correct table borders, cell boundaries, dividers, typography, alignment, margins, highlighted instructions, logo sizing, signature fields and gratuity/staff-allocation tables.
- Generate all three documents from one existing Corporate booking with authoritative operational data where available.
- Leave unavailable information blank and preserve all financial calculations and existing download actions.

## Safety boundary

- Local implementation and verification only.
- Do not commit, push, migrate or deploy before explicit visual approval.
- Preserve Phase 50.16/50.16A quotation, invoice and Booking Details document access.
- Preserve Feature Walkthroughs, Booking Details performance and all business calculations.
- Keep Phase 50.14 Guided Training untouched.
- No Production business-data mutation or customer communication.

## Baseline

- Previous Phase 50.17 draft began at `523a695e5751ad1b50931ef5f859d6603f862552`.
- The draft was safely rebased without commit onto current `origin/main` / Production baseline `4438916750a0ba371a64da209bdc7932326d4a6e` on 23 October 2026.
- Existing generated evidence under `output/` and `tmp/` remains local and excluded from release.
- No Phase 50.16B walkthrough files were modified by this phase.

## Existing draft

- Three distinct selectable-text A4 templates replace the former generic text exports.
- The approved Zingara logo, booking facts, financial facts and Corporate operations records are reused.
- The Function Brief retains its separate gratuity/staff-allocation page and long-content continuations.
- Missing information remains blank rather than being invented.

## Final approval deliverables

- Three regenerated PDFs using the richest suitable authoritative Corporate booking record.
- Page-by-page visual comparison at identical A4 dimensions.
- Verification of creator provenance, populated and blank states, long wrapping, highlighting, borders, page breaks, selectable text and printing.
- Focused Corporate PDF tests, TypeScript, changed-file ESLint, `git diff --check` and Production build.
- No commit, push, migration or deployment until explicit approval.

## Final verification status - 23 October 2026

- Current local base and `origin/main`: `4438916750a0ba371a64da209bdc7932326d4a6e`.
- Verification booking: `ZNG-HYHXVD` / TARSUS / Cape Town / 14 October 2026 / 238 guests.
- `Booked through`: Aswin Lingard, corroborated by the immutable `booking.provenance-recorded` and `booking.create` audit events from 12 September 2026 and the booking's original `created_by_staff_id`.
- The record supplies real wristband handling, a R119,000 operational bar limit, bar restrictions, settlement contact, special requests, running-order notes, dietary/allergy information and a saved R43,610 gratuity allocation.
- Current authoritative seating entitlement renders as Middle Ring 106 / Golden Circle 132. A later saved operational note still says Golden Circle 142 / Middle Ring 96; the renderer preserves that note in the continuation rather than silently rewriting source data.
- Checklist, Bar Brief and Function Brief were rendered at A4 `595.25 x 842` points with selectable text. Long content uses bounded continuation pages rather than clipping.
- Final local outputs:
  - `output/pdf/Corporate-Function-Checklist-ZNG-HYHXVD.pdf`
  - `output/pdf/Corporate-Bar-Brief-ZNG-HYHXVD.pdf`
  - `output/pdf/Corporate-Function-Brief-ZNG-HYHXVD.pdf`
- Focused Corporate operations suite: 41/41 passed.
- TypeScript, changed-file ESLint, `git diff --check` and Production build passed. The build retains one pre-existing Turbopack warning in `ticketPdfServer.ts` unrelated to this phase.
- No Production data was mutated. No commit, push, migration or deployment was performed.

## Production release authorisation - 23 October 2026

- Management approved the three final Corporate operational PDF templates for Production.
- Release baseline and rollback point: `4438916750a0ba371a64da209bdc7932326d4a6e` (`fix: launch staff walkthrough after login`, Phase 50.16B).
- The release is limited to the approved Corporate PDF renderer, immutable booking-creator resolution, focused tests and the shared selectable-text PDF exports required by that renderer.
- Generated comparison PDFs and render evidence remain local and are not committed.
- Phase 50.14 Guided Training, Xero synchronisation settings, invoice reminder settings and all Production business data remain outside this release.
