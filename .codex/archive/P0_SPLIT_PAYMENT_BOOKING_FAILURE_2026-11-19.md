# P0 - Admin Split Payment Booking Failure

STATUS: RELEASED - PRODUCTION FUNCTION VERIFIED WITH ROLLBACK-ONLY TRANSACTIONS

DATE: 19 NOVEMBER 2026

## Continuity And Safety

- Read AGENTS, CURRENT_TASK, README and the Phase 3 allocation, COMP creation,
  public payment-integrity and previous release records. Baseline main:
  `d3a0c373428f0723c052c022f0a2224a2c377182`; Production deployment:
  `dpl_AyE2rPo9zNGUbDEaXZyYwwNWA8za`, READY.
- Preserved unrelated CURRENT_TASK/BUG-000034/outage records. Frontend 2.0
  and its checkpoints were not touched. No customer HTTP booking submission,
  PayFast request, email, historical correction or real booking was made.
- User separately approved the necessary function-only migration after its
  scope was explained. Verification uses synthetic SQL fixtures with explicit
  ROLLBACK, short statement/lock timeouts and no communication/API dispatch.

## Confirmed Cause

- Production logs show seven `/api/bookings` failures on 17-18 November,
  all PostgreSQL `P0001 / BOOKING_PROVENANCE_IMMUTABLE`.
- The authoritative `reserve_staff_guest_allocations` calls the existing
  entitlement reservation, which inserts booking/payment records. The booking
  insert trigger derives staff provenance from metadata and stamps `now()`.
- Allocation finalisation then replaced that protected timestamp with the
  application payload timestamp (or `clock_timestamp()`). The immutable
  provenance trigger correctly rejects this different value. The enclosing
  RPC transaction rolls back. Capacity, sold-out eligibility and PayFast are
  not the cause of these seven errors.
- Original Production function fingerprint:
  `3385b36c2ad07d1e170a8614593f0ad0` (MD5 of pg_get_functiondef).
- Reproduced the exact error using the original deployed function in five
  synthetic rollback-only cases: Pay Now, Send Payment Link, multi-zone,
  direct Corporate allocation and all-COMP allocation.

## Incident And Persistence Evidence

- Fatima: `ZNG-R8A7S4`, 18 November 10:41:29 and 10:42:48 SAST;
  `ZNG-L5RC6F`, 18 November 16:58:35 SAST. Audit actor is Fatima MB;
  all three creation audits are failed. Runtime request IDs:
  `phw6m-1794991287214-eb3738a2b733`,
  `zttck-1794991364359-a93576154ed4`,
  `vbf9g-1795013913505-bd9b1cd118d1`.
- Both Fatima references: zero persisted bookings, payments, payment links,
  tickets, booking-linked communications or linked ITNs. Failed audit and
  platform telemetry records are intentional evidence, not partial bookings.
- Hannah: three failures for `ZNG-UJNBJT`, one for `ZNG-XG2LNX` on
  17 November. The latter was subsequently created successfully at
  12:18:23 UTC without guest allocations; its payment link followed at
  12:18:24 UTC. Those later records are not residue of the failed transaction.
- Since the 6 November allocation rollout, failed-creation audit search finds
  exactly these seven generic transaction failures across four references.
  Log correlation confirms the provenance error for all seven. This is the
  retained recorded scope, not proof that every unreported attempt is known.
- Independent customer upsert occurs before the booking RPC. One customer
  profile was created in each of Fatima's three narrow failure windows.
  Temporal correlation alone does not establish ownership by her request;
  existing-customer updates also cannot be reconstructed without its payload.
  No customer cleanup or claim of zero customer-side effects is made.

## Smallest Correction

- New migration `20261119090000_p0_split_allocation_provenance.sql` replaces
  only `reserve_staff_guest_allocations`. Its function body differs from
  Phase 3 by one expression: existing `v_booking.provenance_recorded_at`
  takes precedence in the existing COALESCE.
- No table/column/trigger/constraint, existing row, calculation or permission
  change. Immutable provenance remains enforced. Existing actor, allocation,
  idempotency, capacity/advisory locking and atomic persistence paths remain.
- Ordinary non-allocation Standard/COMP and Corporate-request conversion use
  different persistence paths and are not changed. Direct staff Corporate
  allocations using this RPC are fixed with Standard and all-COMP splits.

## Verification

- 32 focused Node tests pass: allocations/financials, internal show policy,
  capacity guard, payment links and three new scope/rollback regression checks.
- TypeScript passes. No application dependency, bundle, request, polling,
  background work or query is added; no performance regression expected from
  the in-memory COALESCE operand. No load benchmark or real payment performed.
- Candidate rollback-only SQL: five creation cases pass exact persisted totals,
  Paid/COMP entitlements, original provenance, duplicate retry, immutable
  timestamp protection and conflicting-retry rejection. Additional checks:
  operational capacity, staff permission, public sold-out rejection, deferred
  integrity constraints and a late second-zone failure rolling back the
  already-inserted booking, payment and provenance audit. Ten result groups.
- Verified zero retained synthetic bookings, customers and shows after QA.
- Pay Now/Send Link exercise their shared creation gate with separate payment
  notes, not external checkout or real link delivery. Existing targeted link
  tests cover those downstream controls. No actual customer action was run.

## Release And Remaining Work

- Approved commit pushed to main:
  `1d7b3382d95b3bd8c5384796b9580827a8c43dbb`.
- Vercel Production: `dpl_FdxSVG9JuMozwmnJjPGE4E8Y5X3E`, READY,
  `https://zingara-booking-platform-f5fq20nml-kaden-damons-projects.vercel.app`.
  `https://book.zingara.co.za` resolves to this deployment. GitHub's combined
  status for this exact SHA reports Vercel success and links this deployment.
- Applied only migration `20261119090000` and its schema_migrations ledger
  entry in one explicit transaction, guarded against original-function drift.
  Deployed function MD5: `df249e05715800c5310095ab621e61a0`.
- Ran `node scripts/verify-split-allocation-provenance.mjs --deployed` against
  the installed function without injecting candidate DDL: all ten result groups
  passed. Follow-up read-only checks found zero retained QA bookings, customers
  or shows; Fatima's two failed references still have no bookings. Function
  execution: anon false, authenticated false, service_role true.
- Live GET checks: `/admin` 200; `/book` 200; `/api/admin/bookings` 401 without
  authentication; POST-only `/api/bookings` 405 for GET. No real HTTP creation,
  PayFast checkout, delivery or staff retry was performed or claimed.
- TypeScript, targeted ESLint, 32 Node tests and whitespace checks pass. Vercel
  build reached READY. Runtime application source and bundles are unchanged;
  this release consists of SQL, verification files and this incident record.
- Five approved files were committed. CURRENT_TASK, the prior BUG-000034
  evidence and the unrelated outage archive were excluded. Final deployment
  evidence in this record and CURRENT_TASK is updated locally after release.
- Retain all historical rows. Box Office can retry the intended allocation
  after release; verify the intended customer rather than making duplicate
  profiles. Review any candidate customer profiles separately before cleanup.
- Application rollback alone cannot undo a SQL function change. If rollback
  is necessary, restore the previous function definition (keeping the immutable
  trigger), which also restores the known split-allocation failure. No business
  data rollback is required because the migration changes no business rows.
