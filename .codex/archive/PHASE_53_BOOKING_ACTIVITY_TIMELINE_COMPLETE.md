# Phase 53 - Booking Activity Timeline

Completed: 27 October 2026

## Delivery

- Added a discreet Activity Timeline action to the existing Booking Details
  popup and a responsive read-only timeline modal.
- Added a dedicated booking-scoped endpoint that returns 25 newest events first
  and bounded Load More pages.
- Combined append-only booking and accounting audit records with authoritative
  creation/import provenance, lifecycle, payment, ticket, communication, and
  quote/invoice evidence.
- Displayed exact SAST timestamps, responsible staff or system identity, action,
  before/after values, outcome, reason, and evidence source.
- Disclosed historical evidence limitations and never inferred missing activity
  or staff attribution.

## Security

- Access is restricted to active Super Admin profiles
  `e8598359-54a0-4e1f-a635-1ec8ae02cb78` and
  `3ac09b59-fc3f-4c6d-9bb3-8dd47a077188`.
- The endpoint verifies the authenticated staff profile ID and current Super
  Admin role on every request. All other staff, including other Super Admins,
  receive HTTP 403; unauthenticated requests receive HTTP 401.
- Contact details, credentials, tokens, QR payloads, provider transaction IDs,
  and long private references are removed at the API boundary.
- Existing audit records remain append-only and no passive booking views are
  logged.

## Performance

- Normal Booking Details makes no timeline request.
- The modal is dynamically loaded only when opened as a separate 5.5 KB raw
  JavaScript chunk.
- Queries are bounded to the selected booking and existing indexed identifiers.
- A representative Production audit query used
  `audit_events_entity_type_reference_idx` and completed in 0.205 ms.
- No polling, global hydration, or background activity was added.

## Verification

- Four focused security, performance, pagination, and redaction tests passed.
- TypeScript and new-file ESLint passed.
- `git diff --check` passed.
- The webpack Production build passed and emitted the new dynamic endpoint. The
  local default Turbopack build could not bind its CSS worker port in the managed
  environment; this was an environment restriction, not an application failure.
- Rollback point: `10f7deb5efe802915914456f133b23a5558b4518`.
- Production business-data delta: zero.

## 23 November 2026: Plain-English And Staff Access Update

Continuation of existing feature, no new phase. User explicitly supersedes the
original two-person restriction above: all authenticated active Admin staff
should see a simple read-only timeline within their existing venue/access scope.

### Changes

- Both Booking Details entry points open the same existing modal. Removed the
  second, unattributed inline presentation, not the historical records. Earlier
  metadata-only status events supplement authoritative lifecycle rows using the
  same initial booking lookup, without new requests. Equivalent timestamp/status/
  note records deduplicated; distinct notes/evidence remain available.
- 125 explicit everyday-English titles cover existing literal booking,
  Corporate, buyout, checkout, payment, seating, editing lock and accounting
  action families. Source/migration inventory test ensures literal booking
  action coverage. Unknown future actions get a safe non-technical family title.
- Field names/statuses/money/date values readable; raw nested objects, internal
  UUIDs and machine diagnostics are not dumped into customer/staff descriptions.
  Legitimate staff reasons are sanitised and retained for permitted viewers;
  standard automated expiry/late-payment/recovery actions receive clear wording.
- Protective late-payment stop does not imply payment failed. Pending payment
  attempts are not receipts; zero-value pending reservation placeholders omitted.
  Unchanged fields suppressed, repeated IDs removed, distinct source evidence
  retained. Sorting remains newest first, with actual recorded SAST timestamps.
- Creation row no longer presents today's guest count/payment/status as though
  recorded at creation. Ticket issue-date summaries do not imply current ticket
  state was its historical state, or guess the issuer when none was recorded.
- Identity resolution reuses the existing single staff batch, preferring current
  name from recorded staff/auth IDs (including Charlie); recorded name fallback
  retained. Missing identity is explicitly unknown, not invented. Guest/System
  attribution limited to recorded identity or known automatic source templates.
- All known active Admin roles accepted; inactive, unknown and unauthenticated
  users rejected by existing authentication and role checks. Joined show venue
  in the existing booking lookup enforces staff venue scope before evidence reads.
  DP imported references now supported as well as ZNG references.
- Existing `bookings:manage` or `analytics:read` permits financial detail;
  `bookings:manage` or `crm:read` permits private detail. Other viewers receive
  redacted entries, not raw reasons/values; payment and accounting reads skipped
  entirely when not permitted. No editing/moderation/financial permissions added.
  Contact/credential/QR/bank/address/linkage secrets continue to be suppressed.

### Verification And Release

- 19 targeted tests pass: 12 timeline tests plus seven existing paid-recovery /
  ticket-authority regressions. Actual GET handler exercised locally with bounded
  query fixtures across every Admin role, unauthenticated/inactive denial,
  cross-venue denial, payment/accounting query suppression and Charlie identity.
  Catalogue covers all literal booking-family actions found in current source
  and migration history; canonical dates and earlier history tested explicitly.
- TypeScript, focused ESLint and whitespace pass. No new dependencies, schema,
  endpoints, migrations, polling or passive timeline requests. Dynamic modal and
  existing bounded pagination retained. Restricted roles make fewer queries.
- Actual modal rendered with isolated synthetic data in local Chromium at 320,
  390 and 1280px: no horizontal overflow or page errors; Close works. Screenshot
  visually inspected at 320px. No physical iPhone/Safari claim.
  Screenshots: local-evidence/booking-timeline-{320,390,1280}-2026-11-23.png;
  results: local-evidence/booking-timeline-layout-results-2026-11-23.json.
- Only five related files committed (helper, helper tests, existing route, modal,
  two existing page entry points). Commit
  **09b8b23ddc86e8cdb73d0adddb36977faeb00ba1**, pushed to main. Git-triggered
  Production **dpl_BMTUnuD7dzwLs1YkftDNUQZgsyAe** currently building; live
  verification will be recorded below rather than assumed.
- All existing unrelated dirty Markdown/evidence and Frontend 2.0 preserved.
  No Production booking/payment/audit/role/permission/customer mutations.

Final redaction hardening is commit
**746246cb961b29e1dcd2e3a39aa6f48fb8fe45eb**, same two helper/test files only:
ticket identity codes, private URLs/links and linkage hashes are excluded from
timeline values; free-text URLs are redacted. This prevents expanded read access
from exposing admission/access identities. Targeted tests, TypeScript and focused
lint remain passing. First deployment is READY; final deployment
**dpl_F5eaweFgZjSog9qgLNt2LV9d4mYP** is building. No signed-in Production staff
session was available; actual role matrix is verified with the route's local
fixtures, not falsely described as a live login or impersonation test.

### Final Production Evidence

- Final commit **746246cb961b29e1dcd2e3a39aa6f48fb8fe45eb** deployed as
  **dpl_F5eaweFgZjSog9qgLNt2LV9d4mYP**, **READY**, correct SHA and alias
  `book.zingara.co.za`. Exact deployment:
  `zingara-booking-platform-dlhtp3cxl-kaden-damons-projects.vercel.app`.
- Live `/admin` returns 200. Unauthenticated native ZNG-X94SUT and imported
  DP-YB9HPC timeline requests both return 401, without events or booking data.
  No real payment/booking mutation or timeline write was used for QA.
- Deployment and HTTP evidence:
  `local-evidence/booking-timeline-production-deployment-2026-11-23.json`,
  `local-evidence/booking-timeline-production-build-2026-11-23.json`,
  `local-evidence/booking-timeline-production-http-2026-11-23.json`.
- Genuine limitation: no authenticated Production staff QA session was available.
  Role/venue/privacy behaviour is verified through actual handler tests locally;
  signed-in live staff/UI verification remains unperformed. No login credentials,
  staff records or permissions were changed to manufacture a test session.
- Final TypeScript/lint/whitespace checks pass. No source edits after final push;
  documentation/evidence remain local with unrelated work preserved. No migration
  or Production business-data change. Frontend 2.0 completely untouched.

## 23 November: Text-Only Label Shortening

User requested Booking Timeline -> Timeline for staff-facing headings/buttons.
Changed exactly three strings across `src/app/admin/page.tsx` and
`src/app/admin/BookingActivityTimelineModal.tsx`: top button and heading Timeline,
lower existing button View Timeline. No other UI, functionality, permissions,
classes, handlers, records, API, schema or Frontend 2.0 change.

Verification: complete before/after file comparison proves only the three literal
substitutions; twelve focused timeline tests and whitespace checks pass. Initial
comparison exceeded Node's default stdout buffer on the existing large Admin file;
rerun with sufficient buffer passed, with no file/code changes to work around it.

Only these two source files committed:
**b4a77eb44fef12ceee8f6bb53b264bc8afabf9e5**, pushed to main.
Git-triggered Production **dpl_Cxm19VV2zi36EjuJMpZvvNJeGwES** building.
Unrelated uncommitted Markdown and evidence preserved, not included in release.

Final verification: **READY**, exact SHA b4a77eb44fef12ceee8f6bb53b264bc8afabf9e5,
serving `book.zingara.co.za`; deployment
`zingara-booking-platform-3rgxyxdhm-kaden-damons-projects.vercel.app`.
Live `/admin` 200 and its served JavaScript
`/_next/static/immutable/chunks/2myzvx240nsgz.js` 200 includes View Timeline and
no Booking Timeline. Verified static assets without signing in, executing payment
flows or touching any booking. Text-only source equality covers the modal heading
and both buttons; no functional changes to retest in Production.
Evidence: local-evidence/timeline-label-production-deployment-2026-11-23.json
and timeline-label-production-http-2026-11-23.json. Records updated locally.

## 23 November: Further Simplification And Performance

All current event families reviewed against the existing catalogue and route.
Retained already-readable wording; simplified creation, guest changes, ticket
issue/replacement, expiry and confirmation/payment email descriptions. Payment
recorded after expiry no longer implies the guest authorised payment late.
Failed and pending messages are not presented as successfully sent.

Timestamp display is now `23 Nov 2026, 18:19`, Johannesburg timezone, minutes only.
Raw timestamps, sorting precision and HTML dateTime unchanged. One module-level
Intl formatter reused. Unknown actor/source boilerplate is omitted from cards;
known staff/Guest/System identity remains evidence-based. No inferred identities.

Successful source-recorded/no-op entries hidden only in a memoised, linear client
display pass; original returned events and server pagination retained. A booking
creation fallback is hidden only when a distinct creation event at exactly the
same recorded instant is already loaded. No broad time-window deduplication.
Meaningful same-status notes remain Booking note recorded; failed/blocked events
retained. Generic Other booking details fields omitted from presentation only.

Verification: 16 targeted tests pass, covering all catalogued source/migration
event codes, attribution, historical evidence, timestamp day rollover, role and
venue permissions, sensitive-data redaction, messages and large histories.
10,000 synthetic display entries filter in 0.22 ms locally (diagnostic measurement,
not a Production latency SLA). TypeScript, focused ESLint and diff whitespace pass.
All route query chains compared to prior HEAD and identical: no additional DB
queries/API requests, changed limits or pagination. No dependencies introduced.

Actual modal synthetic-data Chromium checks at 320/390/1280px pass, no horizontal
overflow/page errors, exact minute timestamps, no unknown/source boilerplate,
correct Charlie attribution and functional Close. 320px screenshot inspected.
Evidence: local-evidence/timeline-simple-{320,390,1280}-2026-11-23.png and
timeline-simple-layout-results-2026-11-23.json; fixture script retained locally.
No real booking operations, customer communications or physical Safari QA.

Release scope is four existing files: src/lib/bookingActivityTimeline.ts,
src/lib/bookingActivityTimeline.test.ts, src/app/admin/BookingActivityTimelineModal.tsx,
src/app/api/admin/bookings/[reference]/activity-timeline/route.ts. Unrelated dirty
Markdown/evidence preserved and excluded. No financial/audit/customer data changes,
migrations, permission changes or Frontend 2.0 modifications.

Final release: **647d520e6e6c9672210e2d32c2368c12454589b8**, pushed to main;
Git-triggered Production **dpl_iyfB9tv1vzE6hC2cPYkNmXcbPxhw**, **READY**, exact
SHA and `book.zingara.co.za` alias verified. Production build passed. Deployment
`zingara-booking-platform-kr102xlnr-kaden-damons-projects.vercel.app`.

Live verification 23 November 18:37:51 SAST: `/admin` HTTP 200; actual served
`/_next/static/immutable/chunks/1htzsh8d56dm9.js` contains simplified Timeline
labels, omitted unknown/source boilerplate and cached short-time Johannesburg
formatter. Unauthenticated GETs for native ZNG-X94SUT and imported DP-YB9HPC
timeline routes return 401 with no events disclosed. No authenticated staff
Production session available; live signed-in interaction is not claimed. Role,
venue and redaction behaviour verified using the actual handler's local fixtures.

Evidence: `local-evidence/timeline-simple-production-deployment-2026-11-23.json`
and `timeline-simple-production-http-2026-11-23.json`. Only four approved files
in commit; all task/archive Markdown updates remain local alongside existing
unrelated work. No new Production query or mutation was needed to verify release.
