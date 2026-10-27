# P0 - Table Plan Company & Booker Identification

STATUS: COMPLETE

DATE: 27 OCTOBER 2026

## Objective

Ensure Corporate and other applicable bookings display authoritative Company and
Booker identities as separate fields throughout the existing Table Plan and all
relevant exports and operational documents.

## Scope

- Trace company and booker data across bookings, customers, linked companies,
  Corporate and Buyout records, and historical Dineplan imports.
- Add only the required Company and Booker identification columns to existing
  Table Plan assignment lists and relevant exports.
- Resolve company names from the authoritative linked company first, retain the
  original booker separately, and leave Company blank when no supported evidence
  exists.
- Identify historical records where company evidence exists but is not linked or
  displayed correctly, without creating or merging companies automatically.

## Safety Boundary

- Preserve every booking, customer, company, payment, ticket, capacity, seating,
  financial, and audit record.
- Preserve Table Plan workflows, assignments, calculations, layouts, permissions,
  and performance except for the two authorised identification columns.
- No historical identity mutation or inferred company substitution.

## Verification

- Verify linked-company, booking-stored, legacy Dineplan, missing-company, and
  repeated-company cases across Johannesburg and Cape Town.
- Run essential focused tests, TypeScript, changed-file ESLint, diff checks, and
  Production build.
- Commit, push, deploy, and verify Production only after correctness and data
  preservation are established.

## Outcome

- Table Plan booking data now hydrates the authoritative linked Companies record
  in the existing bounded aggregate request.
- Table Plan assignment cards, the workbook, its Notes sheet, Daily Manifest,
  and Floor Manifest display Company and Booker separately.
- Linked company trading/legal name is authoritative; the booking-level company
  snapshot remains the fallback for unlinked historical evidence. Missing
  company evidence remains blank and the booker is never substituted.
- Production audit: 378 bookings have company evidence; 294 are linked and 84
  retain booking-level evidence only. There are no broken company links. Sixty-
  three data-import bookings have company evidence: 62 linked and one preserved
  booking-level record (`DP-NK9BQC`, Tyrone Pharmacy).
- Eleven linked bookings contain older snapshots that differ from the current
  linked company. Display now correctly prefers the linked company without
  changing either record.
- Focused company authority tests and six Table Plan workbook tests passed.
  TypeScript, diff checks, and the webpack Production build passed. Changed-file
  lint has no new errors; the large Admin file retains two unrelated existing
  effect-rule errors. The default Turbopack build is blocked in this environment
  by its CSS worker port restriction, while the supported webpack build passes.
- No Production business data was modified.
