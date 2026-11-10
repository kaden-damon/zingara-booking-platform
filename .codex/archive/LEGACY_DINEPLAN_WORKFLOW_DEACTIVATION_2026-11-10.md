# Legacy Dineplan Workflow Deactivation

**Status:** Complete - deployed and verified in Production  
**Date:** 10 November 2026  
**Application commit:** `8ad498c240ef28a3877da7a0ec335f0ce11f3948`  
**Deployment:** `dpl_9YS4VXvekgHHctcrcsxzYi7kVvXD`

## Scope

The unused Dineplan file-request, reminder, reconciliation and import workflow
was permanently retired for Cape Town and Johannesburg. Current booking,
availability, seating, payment, communications and unrelated import workflows
were preserved.

## Evidence Before Deactivation

- Production configuration had `scheduled_emails_enabled = true`.
- Configured SAST checkpoints were 09:00, 12:00 and 15:30.
- The reference email
  `Dineplan File Needed | Johannesburg 2026-11-10` was provider-accepted at
  09:01 SAST on 10 November 2026.
- Historical Production footprint before release:
  - 16 reconciliation snapshots.
  - 137 reconciliation actions.
  - 158 digest/file-request delivery records.
  - 151 schedule-run records.
- No separate database cron entry exists; delivery was invoked by the shared
  Vercel workflow runner.

## Correction

1. Disabled `dineplan_reconciliation_settings.scheduled_emails_enabled` in
   Production at 11:01:59 SAST.
2. Removed `runDineplanScheduledEmails` from the shared workflow runner while
   retaining every unrelated workflow and the existing cron schedule.
3. Removed the dedicated Dineplan Admin tab, dynamic client import and legacy
   deep-link handling.
4. Replaced the Dineplan reconciliation and action endpoints with
   permission-protected retired responses:
   - unauthenticated requests: HTTP 401;
   - authenticated authorised requests: HTTP 410;
   - no database reads, writes, email delivery or reconciliation execution.
5. Left the already-disabled generic Data Portability API unchanged.
6. Retained legacy libraries and database tables as historical evidence; they
   have no live scheduler, Admin or API execution path.

## Verification

- 20/20 focused tests passed across deactivation, scheduling history, endpoint
  security, delivery idempotency and Admin bundle behaviour.
- TypeScript passed.
- Next.js 16.3.4 webpack Production build passed. The normal local Turbopack
  worker could not open its internal port in the restricted local environment;
  this was an environment limitation, not a compilation failure.
- Vercel reported the application deployment successful at 11:17:42 SAST.
- Production deployment marker:
  `dpl_9YS4VXvekgHHctcrcsxzYi7kVvXD`.
- Public site and Admin shell returned HTTP 200.
- Production Admin assets contained zero matches for the retired workspace,
  action centre or file-request subject.
- Both retired routes returned HTTP 401 anonymously, preserving authentication.
  The built and tested route returns HTTP 410 after staff authorisation.
- The Production schedule flag remained `false` after deployment.
- No Dineplan delivery was recorded after the 11:01:59 SAST deactivation.

## Data And Performance

- Historical records changed: none.
- Historical records deleted: none.
- Bookings, customers, payments and audits changed: none.
- Configuration delta: one boolean changed from enabled to disabled.
- Migration: none.
- Performance impact: positive/neutral. One scheduled database/email workflow
  and one Admin lazy chunk were removed; no request, query, polling or
  background task was added.

## Rollback

Application rollback is the normal Vercel deployment rollback to the prior
deployment. The retired workflow must not be reactivated during rollback:
keep `dineplan_reconciliation_settings.scheduled_emails_enabled = false`.

