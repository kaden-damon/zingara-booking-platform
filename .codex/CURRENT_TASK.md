PHASE 51.6 - BOX OFFICE PERFORMANCE VERIFICATION

STATUS: COMPLETE - NO APPLICATION RELEASE REQUIRED

DATE: 23 OCTOBER 2026

GOAL

Verify that the deployed Phase 51 performance work remains effective during
everyday Production Box Office operation and correct only confirmed measurable
regressions without changing the interface or business rules.

PRODUCTION BASELINE

- origin/main: f2de327dfeb80017be6be7c5ff05c22aeb978d9b
- Phase 51.5 application commit: 2ae1dc3f49dfeedaf5909dba6a1ab287623b9626
- Current Production deployment: dpl_4xnfBFXeucMK9buT91ugAByZu3Lf (READY)
- Production alias: https://book.zingara.co.za
- Application rollback baseline: 4a445339c80298e1b822ab4188a37246dfe35d32

ACTUAL OPERATIONAL PERFORMANCE

Authenticated Production checks used the current bounded booking population
(4,815 matching bookings in the live Bookings workspace) and exercised only
non-mutating navigation and preview actions.

- Core navigation: Bookings 98-134 ms, Customers 101 ms, Floor & Arrivals
  82 ms, Dashboard 96 ms.
- Booking Details opened in 43 ms after the bounded list was ready.
- Guest-count amendment controls responded in 103 ms; no amendment was saved.
- Calendar month navigation responded in 97-101 ms.
- Booking workflow chooser opened in 104 ms and was cancelled before selection
  or persistence.
- Table Plan/Floor responded in 96 ms; Arrivals & Check-In in 72 ms.
- Financial Reports responded in 80 ms; Corporate Bookings in 99 ms.
- Customer and Company search inputs responded in 104-108 ms. Their bounded,
  debounced result refresh remained responsive with no browser stall.

PRODUCTION TELEMETRY

- Seven-day authoritative operations: public reservation p50 2.236 s / p95
  3.145 s; PayFast checkout preparation p50 577 ms / p95 833 ms; authoritative
  PayFast confirmation p50 2.011 s / p95 2.449 s.
- These remain at or better than the established Phase 49/51 baselines. There
  were no telemetry error events in the bounded seven-day duration sample.
- The latest 10,000 Production requests covered a busy 70-minute period.
  Normalised Admin background activity was approximately 4.8 requests per
  visible staff session per minute, within the Phase 51.2 six-request ceiling
  for non-booking workspaces. Concurrent staff/public traffic makes the raw
  percentage unsuitable for comparison with the Phase 51.0 audit denominator.
- The current deployment has zero runtime errors and zero HTTP 5xx request
  records. The one conversion-report 500 in the broader sample was the known
  pre-correction diagnostic request from Phase 51.5, not a current regression.

PERFORMANCE BUDGETS

- Admin initial route: 1,256,039 raw bytes / 301,667 gzip bytes.
- Largest initial gzip chunk: 160,070 bytes.
- Enforced limits remain 1,320,000 raw, 320,000 gzip, and 170,000 largest gzip.
- All measured interface feedback met the applicable sub-150/sub-200 ms Phase
  51 targets. Authoritative searches and financial/server writes remain subject
  to network and database confirmation and are never represented as complete
  prematurely.

LEGACY HARDWARE STATUS

- Physical older Box Office hardware was not available in this environment.
- Certification therefore remains provisional and carries forward Phase 51.5's
  6x CPU/256 MB constrained evidence: five warm runs had 92-120 ms FCP,
  99-177 ms load, no long tasks, and a stable 6.83 MB collected JS heap.

VERIFICATION

- 15 focused performance and financial-safety tests passed.
- The enforced Admin performance budget passed.
- Production `/admin` and `/book` remained healthy throughout verification.
- No layout, control, navigation, permission, workflow, booking, payment,
  ticket, capacity, Xero, Table Plan, or Academy behavior changed.

RELEASE DECISION

- No confirmed in-scope regression or bottleneck requires correction.
- No application code, migration, push, or Production deployment was performed.
- Production remains on dpl_4xnfBFXeucMK9buT91ugAByZu3Lf.
- Production business-data delta: none.

FINAL

PHASE 51.6 - BOX OFFICE PERFORMANCE VERIFIED.
