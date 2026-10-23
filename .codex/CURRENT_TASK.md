# Phase 50.4J - Xero Workspace UX Polish

## Status

COMPLETE - RELEASE VERIFIED

## Goal

Surgically align the existing Zingara x Xero workspace with the established black-and-gold Admin design while preserving controlled live synchronisation, all 16 approved mappings, permissions, financial workflows and Production business data.

## Authorised changes

- Hide Enable Sync while controlled live synchronisation is active and show it only while sync is paused.
- Show Pause Sync and Disconnect only inside the existing management-authorised connection workspace.
- Standardise spacing, alignment, control heights, pill-shaped actions, borders and typography.
- Simplify connection status and account-mapping presentation without removing functionality.
- Verify desktop and mobile layouts in the actual Production workspace.

## Safety boundaries

- No accounting, mapping, synchronisation, permission or financial logic changes.
- No Xero, booking, payment, ticket, customer or capacity mutations.
- Preserve the Phase 50.4I future-only manual invoice-conversion scope.
- Keep Phase 50.14 untouched.

## Verification and release

Run focused UI regressions, TypeScript, changed-file ESLint, `git diff --check` and the Production build. Commit only authorised files, push to `main`, deploy to Vercel Production and verify responsive presentation without changing live sync state.

## Result

- Active sync now shows Pause Sync and hides Enable Sync; paused sync shows Enable Sync and hides Pause Sync.
- Connection controls remain inside the existing `settings:manage` permission boundary, with server-side enforcement unchanged.
- Connection status, workflow guidance, mapping rows and document actions use one compact responsive visual hierarchy with consistent pill-shaped actions.
- All 16 mappings and every mapping field/action remain available.
- Controlled live sync remains active for the existing future-only manual invoice-conversion scope.

## Verification

- 27 focused Xero, mapping, invoice-request and activation tests passed.
- TypeScript, changed-file ESLint and `git diff --check` passed.
- Production build passed with only the pre-existing ticket-PDF tracing warning.
- Authenticated desktop and mobile Production layouts were inspected after release.
- Phase 50.14 was untouched.

## Business-data delta

Zero. No Xero connection, mapping, document, outbox, booking, customer, payment, ticket or capacity record was modified.
