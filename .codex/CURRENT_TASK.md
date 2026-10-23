PHASE 51.5 - LEGACY HARDWARE PERFORMANCE CERTIFICATION

STATUS: VERIFIED - RELEASE PENDING

DATE: 23 OCTOBER 2026

GOAL

Certify the complete Zingara operational platform against the Phase 51
performance targets using current Production data volumes, 6x CPU throttling,
constrained-memory evidence, and authenticated workflow checks.

BASELINE

- main / origin/main: 4a445339c80298e1b822ab4188a37246dfe35d32
- Production application commit: 2caec8aa9014c70f85c6948ea42a02e7cc7a1e07
- Production deployment: dpl_4o3FQtmm2oUbqMDeC8h7K25NAaCV (READY)
- Production alias: https://book.zingara.co.za
- Rollback commit: 4a445339c80298e1b822ab4188a37246dfe35d32
- Phase 51.4 authenticated warm module navigation: 72-97 ms.
- Phase 51.4 Admin route: 1,256,039 raw / 301,667 gzip bytes.

CERTIFICATION SCOPE

- Actual authenticated Production data: 103 shows, 4,815 matching bookings,
  10,175 customers, 186,391 telemetry events, and the current Reports data.
- Read-only checks covered Dashboard/calendar, Standard and Corporate booking
  lists, Booking Details and amendment controls, Companies and Customer CRM,
  Floor, seating, arrivals and check-in, payments/refunds, Reports, Xero
  Integrations, Academy, Guided Training, and Training Register.
- No physical legacy Box Office computer was available. Certification is
  therefore provisional and uses Chrome 6x CPU throttling plus an isolated
  constrained JavaScript heap. No physical-device claim is made.

AUTHENTICATED WORKFLOW RESULTS

- Core module switches: Bookings 158 ms on first opening; Floor 75 ms;
  Customers 75 ms; Reports 72 ms.
- Sales & Performance 101 ms; Payment Analytics 61 ms.
- More menu 85 ms; Settings 48 ms; Integrations/Xero 99 ms.
- Companies 107 ms; repeat Bookings 78 ms; Corporate bookings 97 ms.
- Booking Details opened in 39 ms once its bounded booking page was ready.
- Floor & Arrivals 73 ms; Arrivals & Check-In 93 ms; Floor/seating 72 ms.
- Academy 53 ms; Guided Training 94 ms; Training Register 74 ms.
- All measured module and workspace interactions met the sub-200 ms target.
  No UI, workflow, permission, or authoritative confirmation was changed.

6X CPU AND CONSTRAINED-MEMORY RESULTS

- Isolated production-build profile used 6x CPU throttling and a 256 MB V8 old
  space limit. It validates the route/runtime envelope, not authenticated data
  workflows or a physical legacy computer.
- Cold login route: FCP 316 ms, load 554 ms, 464,744 script-transfer bytes,
  three long tasks totalling 281 ms, 731.8 ms task time, and 194.9 ms script.
- Five warm reloads: FCP 92-120 ms, load 99-177 ms, no long tasks, 195.2-282.2
  ms task time, and 51.3-62.0 ms script time.
- Garbage-collected used JavaScript heap remained 6.83 MB across the five warm
  runs (6,828,162 to 6,835,046 bytes), with no progressive growth.

CONFIRMED BOTTLENECK AND CORRECTION

- The 31-day Website & Booking Conversion report failed in Production because
  its venue-attribution lookup searched prior events by session without a
  session/time index and aggregated irrelevant telemetry event types.
- Before: v2/v3 RPC calls timed out after 8.3-8.9 seconds with PostgreSQL 57014;
  the live panel displayed that analytics could not be loaded.
- Added a partial `(session_id, created_at desc)` index for non-null sessions.
- Restricted the existing base report to the seven event types it actually
  aggregates and skipped venue-history lookup when direct event/booking venue
  evidence already resolves the location.
- After: five authoritative 31-day v3 calls returned HTTP 200 in 2.86-3.35
  seconds with the same 12,077-byte result shape; the live Production panel
  rendered successfully. Report calculations, filters, and displayed fields
  were not changed.

INFRASTRUCTURE FINDINGS

- Supabase project is ACTIVE_HEALTHY; database size 446 MB, table data 143 MB,
  indexes 171 MB, and both table/index cache-hit rates are 1.00.
- No blocking or long-running database queries were present after correction.
- The new session/time index is used and avoids sequential scans.
- The inspected Vercel Production deployment is READY. The 24-hour window had
  no recorded runtime errors and no HTTP 5xx request records.
- Available evidence does not justify a Supabase or Vercel upgrade. Continue
  measuring before purchasing additional infrastructure; the remaining cold
  JavaScript work is a client/device concern rather than server saturation.

PERMANENT PERFORMANCE STANDARDS

- Every Production build now enforces Admin initial-route limits of 1,320,000
  raw bytes, 320,000 gzip bytes, and 170,000 gzip bytes for the largest chunk.
- Current build remains 1,256,039 raw / 301,667 gzip bytes; largest gzip chunk
  is 160,070 bytes.
- Budget failure stops the build and therefore stops deployment.
- Existing bounded loading, lazy workspaces, visible-only polling, lock
  heartbeats, authoritative writes, and server-side pagination remain required.

SAFETY

- Strict UX/UI freeze preserved.
- No booking, payment, ticket, capacity, customer, Xero, or operational data
  changed.
- Database delta is schema/read-query only: one additive index and two guarded
  optimisations to the existing read-only conversion report function.
