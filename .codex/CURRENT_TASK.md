PHASE 51.1 - CRITICAL QUERY & REPORTS OPTIMISATION

STATUS: VERIFIED - RELEASE IN PROGRESS

GOAL

Eliminate the confirmed Reports and refund-readiness bottlenecks without any
visible UX, workflow, permission, financial, export, or business-data change.

AUTHORISED SCOPE

- Replace the Management Analytics full historical browser hydration with
  bounded server-side retrieval and aggregation while preserving every report,
  filter, calculation, export, and displayed result.
- Replace the oversized refund-readiness database filter that produces HTTP 500
  responses with a bounded authoritative query while preserving eligibility,
  approvals, reconciliation, audit, and financial safeguards.
- Measure before and after, run focused regressions, commit, push, deploy, and
  verify Production.

STRICT SAFETY

- No screen, layout, navigation, control, style, wording, workflow, or
  permission changes.
- No booking, payment, ticket, capacity, customer, Xero, Table Plan, Academy, or
  other business-data mutations.
- No stale financial cache, extra polling, global hydration, or unrelated
  refactoring.

BASELINE

- main / origin/main: 7bcb0da93046a3f546bc77b2013ea2f6609a4133
- Production deployment: dpl_9BZVPZAzbkRWzbKuHU6Zk2NcPgz5 (READY)
- Production alias: https://book.zingara.co.za
- Rollback commit: 7bcb0da93046a3f546bc77b2013ea2f6609a4133
- Reports baseline: 21,655 historical rows, approximately 6.72 MB raw /
  1.42 MB gzip, approximately 5.3 seconds to first usable report.
- Refund baseline: 983 booking identifiers encoded into one oversized filter,
  producing HTTP 500 responses.

RELEASE BOUNDARY

Deploy only after focused functional parity, financial safety, TypeScript,
changed-file ESLint, diff check, migration validation where applicable, and
Production build all pass.

VERIFIED CORRECTIONS

- Reports now retrieve bookings in bounded concurrent pages with their linked
  customer and payment evidence, calculate the unchanged analytics model on the
  server, and send only the compact result to the browser.
- Sales Performance continues to use the same authoritative demand rows without
  hydrating booking, customer, or payment history in the browser.
- Refund readiness now retrieves all qualifying PayFast payments in bounded
  pages with authoritative booking and refund relationships. It no longer uses
  an oversized booking-ID filter and no longer truncates at 1,000 payments.

MEASUREMENTS

- Reports retrieval: approximately 1.63-2.23 seconds after optimisation versus
  approximately 5.3 seconds to usable content before.
- Reports browser payload: approximately 274 KB raw / 40 KB gzip versus
  approximately 6.72 MB raw / 1.42 MB gzip before.
- Browser-side historical rows: zero versus 21,655 before.
- Refund readiness: approximately 1.13-1.58 seconds across 2,971 qualifying
  payment rows / 2,863 bookings; the former request returned HTTP 500 and saw
  only the first 1,000 payment rows.

VERIFICATION

- Exact analytics parity: passed for default, venue, activity/source, and
  performance/status filters against the previous loader.
- Focused report/refund tests: 49 passed.
- TypeScript: passed.
- Changed-file ESLint: passed with no warnings.
- git diff --check: passed.
- Production build: passed with the pre-existing ticket PDF tracing warning.
- Production business-data delta before release: zero.
