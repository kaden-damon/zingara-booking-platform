# Guest Email And Marketing Consent Audit

DATE: 23 NOVEMBER 2026

STATUS: READ-ONLY AUDIT COMPLETE; NO MARKETING ENROLMENT OR IMPLEMENTATION AUTHORISED

## Scope And Evidence

- Read AGENTS.md, CURRENT_TASK.md, README.md, existing workflow records and
  Phase 56.1 advertising attribution archive. Current repository implementation
  is the functionality authority; historical activation notes are not assumed
  to describe current external settings.
- Inspected capture forms, persistence, CRM, import/export controls, operational
  preferences and advertising consent code. One Production query inspected only
  information_schema and customer trigger definitions inside BEGIN READ ONLY /
  ROLLBACK. No customer rows, email addresses or contact lists were queried.
- No export/transfer, external marketing account access, unsubscribe-system
  audit, enrolment, message, code change, migration, commit or deployment.
  Unrelated work and Frontend 2.0 preserved. Only local Markdown records changed.

## Existing Email Capture

| Route | Existing storage / meaning |
| --- | --- |
| Public booking / checkout | Booker email collected in booking details; customer creation/matching normalises it into customers.email and booking metadata. Checkout/payment communications use that operational contact. |
| Corporate enquiry / conversion | Corporate coordinator/contact email captured in the request and preserved/validated on booking conversion and customer association. It is not consent on behalf of every attendee. |
| Admin-created booking | Existing customer lookup/creation and booking-customer linkage reuse customer email and booking metadata. No marketing-enrolment instruction found. |
| Customer profiles / CRM | customers.email plus current customer identity/contact editing. Details expose preferences under existing staff authorisation. |
| Historical imports | Legacy customer/import paths map source email and optional marketing_preference into customers.preferences.marketingPreference. Import date is not the guest's consent date. Current general Data Portability is disabled. |
| Individual guest tickets | Optional per-ticket email/name/mobile can be stored in bookings.notes guestTickets. These are not automatically separate CRM subscribers; a party booking does not capture every attendee's email. |

Sources: src/app/book/page.tsx; src/app/api/bookings/route.ts (getCustomerPayload,
customer matching); src/app/corporate/page.tsx; src/app/api/corporate-requests/route.ts;
src/app/api/admin/corporate-requests/convert/route.ts; src/app/api/admin/customers/route.ts;
src/app/api/tickets/[reference]/route.ts; historical import migrations.

## Consent Currently Represented

- No dedicated optional newsletter/email-marketing opt-in was found in the
  current public booking/checkout, Corporate enquiry or customer creation flow.
  No separate marketing-consent registration journey was identified. This does
  not establish that nobody has consented externally or in historic source files.
- Required booking checkbox accepts Terms & Conditions, Booking Terms and the
  booking/cancellation policy. Royal Decrees explicitly describes booking-related
  electronic communications. Do not treat that checkbox as email-marketing opt-in.
- Existing marketing preference is a free-text value in
  **customers.preferences.marketingPreference**. CRM shows it or Unknown.
  normalizeMarketingConsentEvidence recognises subscribed / not-subscribed /
  unknown; missing evidence or an email address does not infer subscription.
- Production customers schema has preferences JSONB, ordinary created_at /
  updated_at and CRM revision, but no dedicated marketing consent timestamp,
  source, channel, notice version or consent-history columns. No public table
  with consent/marketing in its name was returned by the narrow schema check;
  advertising consent exists separately under advertising-attribution storage.
- No structured email-consent evidence ledger was identified in source. Generic
  customer audits can record preferences before/after, and import records can
  retain filenames/times/results. These are supporting provenance, not a
  guaranteed record of when/how the guest agreed or the wording shown.
- Dineplan preview recognises separate Email Opt In / SMS Opt In source columns
  and displays matched_email_consent / matched_sms_consent. A preview value or
  imported generic marketingPreference is not independently verified consent.
- Cookie consent has marketing/analytics flags, recordedAt and version in browser
  storage; advertising attribution also has consent flags. The approved Cookie
  Policy expressly separates these from email/SMS subscriptions and transactional
  messages. Never reuse cookie Marketing consent for newsletter enrolment.

Sources: src/lib/customerCommunicationPreferences.ts; src/lib/cookieConsent.ts;
src/lib/royalDecrees.ts; src/app/admin/CustomerManagementWorkspace.tsx;
src/app/admin/page.tsx (Dineplan matching); src/lib/advertisingAttribution.ts;
supabase/migrations/20260813184500_phase_27_6s_dineplan_import_financial_and_overflow_hardening.sql.

## Operational Communications Are Separate

- customer_communication_suppressions provides temporary independent email/push
  pauses, with actor/reason/expiry/audit. It does not change marketing consent.
- CRM disclosure explicitly says operational pauses do not alter marketing
  preference. Necessary payment/refund/ticket messages have their own eligibility
  rules. Push permission and review-publication consent are separate purposes.
- Email operational delivery uses Microsoft SMTP. Advertising integrations
  measure consented conversions; neither is an external newsletter audience sync.

## Staff Access, Exports And Transfer Readiness

- Current CRM/customer APIs allow authorised staff to read customer details and
  the stored preference. Customer-management reads require existing CRM or
  booking permissions; operational pause management has separate permissions.
  Do not issue broad service-role credentials to an external marketing system.
- Active bookings workbook export is staff-authorised and venue-scoped, includes
  customer email, but **does not include marketing consent evidence or eligibility
  filtering**. It is not a consented-marketing export.
- A legacy CSV/XLSX customer exporter exists in source and includes Email and
  Marketing preference, but **canViewDataPortability=false** and
  **canExecuteDataPortability=false**. The related imports API denies access.
  Therefore it is not a currently available staff consent-export workflow.
- No current dedicated eligible-contact export/filter, external marketing-list
  connector, newsletter subscription webhook or consent-aware transfer job was
  found. The sole installed customers trigger preserves company links on merge;
  there is no customer-insert marketing-transfer trigger in that table.
- Existing authenticated customer APIs, stable customer IDs, audited changes and
  export infrastructure are reusable building blocks, not a ready-made lawful
  automated handoff. No destination platform or transfer contract was supplied.

Sources: src/app/api/admin/customer-management/route.ts;
src/app/api/admin/customers/route.ts; src/app/api/admin/bookings/export/route.ts;
src/lib/exports/bookingsWorkbook.ts; src/lib/supabase/bookingsExportServer.ts;
src/app/admin/page.tsx (buildCustomersPortabilityRows and disabled flags);
src/app/api/admin/data-portability/imports/route.ts.

## POPIA Basis - Explicit Consent Versus Customer Exception

- Explicit consent must be voluntary, specific and informed, with evidence of
  the person's agreement to the relevant purpose/channel. A generic subscribed
  label, booking acceptance, cookie choice or merely supplying an email does not
  establish that evidence. Do not relabel unknown contacts as consented.
- Section 69(3) has a separate existing-customer exception: contact details
  obtained in a sale context, marketing of Zingara's own similar products/services,
  and a free/simple opportunity to object both at collection and on each marketing
  communication, with no initial refusal. An existing booking alone is insufficient.
- The audited flow does not establish collection-time marketing objection
  opportunity or a structured exception-basis record. Historic customers must
  not be automatically assumed eligible under that exception or backfilled as
  explicit opt-ins. Corporate contacts do not authorise all attendees by default.
- Zingara's Information Officer/legal adviser should approve the applicable
  basis, notices and destination/operator arrangements, including cross-border
  safeguards if relevant. This is a technical gap assessment, not certification
  that any particular customer or external database is legally eligible.

Official source: Information Regulator, Direct Marketing Guidance Note, especially
sections 3.3, 7 and 9:
https://inforegulator.org.za/wp-content/uploads/2020/07/GUIDANCE-NOTE-ON-DIRECT-MARKETING-IN-TERMS-OF-THE-PROTECTION-OF-PERSONAL-INFORMATION-ACT-4-OF-2013-POPIA.pdf

## Minimum Safe Future Work - Recommendation Only

1. Identify the external database/provider and approved handoff fields. Establish
   whether any existing contacts have independently provable consent; do not
   create or export an eligible population from preference labels alone.
2. For new contacts, add an optional, unchecked email-marketing choice separate
   from booking terms/cookies. Record customer/contact identity, channel, explicit
   choice, timestamp, source and notice version with change/withdrawal evidence.
   Keep any legally approved customer-exception basis distinct from consent.
3. Reuse current identity, authorisation and audit infrastructure for a narrowly
   scoped eligible-contact export or destination API adapter. Transfer minimum
   necessary fields and evidence references, with duplicate protection and delivery
   status. Do not enable the entire disabled portability subsystem just for this.
4. Keep campaigns and unsubscribe handling external. Agree a suppression-aware
   handoff contract: never overwrite an external unsubscribe or re-subscribe a
   previously opted-out contact on every booking/sync. No external unsubscribe
   implementation was inspected or changed in this task.
5. Exclude unknown/refused/withdrawn contacts until an evidenced lawful basis is
   approved. No blanket historic backfill, speculative consent or automatic
   marketing enrolment. No campaign-sending engine is required in Zingara.

Conclusion: email capture is already present; reliable, evidenced and consent-aware
automatic marketing handover is **not currently implemented**. No code or release
was necessary or authorised for this audit. No per-customer consent claim/count
can be made from this schema/source-only investigation.

## CRM Data And Custom Customer Export Follow-Up — 24 November 2026

Focused source-only extension of this audit, reusing today's CRM integrity
findings and existing consent evidence. No Production customer query, export,
browser testing, application change or implementation. Frontend 2.0 untouched.

### Data Available

- Profile: stable customer ID, first/surname, normalised email/mobile, primary
  company/job title and additional company associations, VIP status/tags,
  relationship/service notes, dietary requirements, archive state/reason/actor,
  CRM revision, creation/update timestamps and merge destination.
- Linked data: paginated bookings (reference, performance/venue, guests, zone,
  table, status, totals/paid/outstanding and original contact snapshot), messages,
  customer audit activity, promotions/discount use and add-on preferences.
- Derived CRM summary: booking counts, checked-in attendance count/rate,
  favourite seating zone, guest entitlement, add-ons/promotions and money totals.
  These are derived, not separately verified immutable profile financial fields.
- Existing totalSpend sums total_amount for all non-cancelled bookings. It is
  booking value, NOT necessarily money received or net spend after refunds.
  paid/outstanding are separate sums. Future/unpaid bookings can enter these
  metrics; a custom export must label and filter them explicitly.
- Marketing preference is customers.preferences.marketingPreference, not a
  verified consent ledger. Separate timestamp/source/channel/notice/withdrawal
  evidence remains missing as already established; booking/cookie consent and
  operational message pauses are not email-marketing eligibility.

### Matching And Uniqueness — Reused Evidence

Today's released CRM correction preserves matched profile identity, prioritises
exact normalised email, permits mobile fallback only for a unique compatible
identity, excludes merged-away profiles and never implicitly merges by name.
Corporate conversion already protects identities. Explicit audited CRM edits
and merge controls remain. Gift recipients are booking attendees, not duplicate
purchaser CRM profiles. Prior read-only audit: 12,854 customer rows, zero duplicate
normalised-email groups among unmerged profiles, ten shared-phone candidate
groups. These are prior findings, not refreshed counts or an automatic merge list.

### Existing Exports And Permissions

- Customers workspace has no active custom field-selection/export control.
  Existing customer list supports search and active/archived/all filtering.
- Retired Data Portability contains buildCustomersPortabilityRows and CSV/XLSX
  download helpers. Fixed columns: name/contact, status, notes, last booking,
  marketing preference, booking/guest counts; Company is hardcoded Not recorded.
  It relies on in-memory customerProfiles/bookings, not a complete authoritative
  server-wide customer aggregation. Do not simply enable it for this requirement.
- Active filtered Bookings XLSX export provides server-side authorisation,
  venue-scoped loading, batching and export audit to reuse. It is booking-shaped,
  not one row per customer, and has no verified marketing eligibility filter.
- Customer read: crm:read OR bookings:manage. Profile management uses
  bookings:manage; communication controls additionally require crm:read and
  communications:manage. Booking export accepts bookings:manage OR
  tickets:validate; that ticket-scanning access must NOT automatically grant
  broad CRM/contact/marketing export access.

### Minimum Safe Recommendation — Not Implemented

1. Extend Customers with one compact Export panel: approved selectable columns,
   existing search/archive filters, relevant venue/date/status and consent filters,
   and CSV/XLSX format. Reuse current components and serializers; do not reactivate
   retired import/portability execution or create a separate CRM workflow.
2. Reuse current authenticated customer-management service/search and export
   infrastructure for a bounded server-side export action. Enforce approved
   export permission plus staff venue/field scope, allowlisted columns/filters,
   row limits and audit; exclude private notes/dietary fields by default. Verify
   CSV/spreadsheet formula-injection protection in the reused serializer.
3. One row per canonical unmerged customer ID. Batch-load filtered bookings once
   and aggregate independently before joining company links/payments/refunds,
   avoiding per-customer API loops, current-page-only exports and join multiplication.
   Explicitly distinguish lifetime versus filtered-period values, counts versus
   attendance, booking value versus received payments/net receipts, cancelled
   bookings, refunds and imported payment evidence. Reuse authoritative existing
   payment/reporting helpers; never count both legacy evidence and its allocation.
4. Marketing mode must additionally require a valid normalised email and verified
   purpose/channel consent evidence. Deduplicate case/whitespace-normalised email
   in the output without merging CRM records; exclude conflicting/unknown/refused
   evidence pending review. Never let a subscribed label override a withdrawal.
   Distinct customers sharing one mailbox remain distinct in ordinary CRM exports;
   marketing output emits at most one eligible contact per mailbox.
5. A general customer export can be added without a new CRM schema. Reliable
   verified-consent marketing export first needs approved consent evidence capture
   or an independently evidenced source; no historic consent backfill by assumption.
   Existing-customer legal basis, if approved, must stay distinct from explicit
   consent. No automatic enrolment, external sync or campaign functionality needed.

Sources inspected: src/app/admin/CustomerManagementWorkspace.tsx;
src/app/api/admin/customer-management/route.ts (summary/history/list/permissions);
src/app/admin/page.tsx (disabled portability builder/downloads);
src/app/api/admin/bookings/export/route.ts; src/lib/supabase/bookingsExportServer.ts;
src/lib/supabase/customers.ts; src/lib/customerCommunicationPreferences.ts.
Previous evidence: CUSTOMER_PROFILE_INTEGRITY_GUEST_BOOKING_2026-11-24.md.

### Doctrine Publication Without Deployment

AGENTS.md and .codex/README.md contain the mandatory inspect/reuse-first doctrine
approved in the preceding task. This focused audit is the relevant accompanying
Markdown record. Other dirty task/archive files remain local and preserved.
Main automatically triggers Production and no ignored-build command is configured.
To obey no application deployment without changing Vercel settings, publish the
documentation-only commit under tag codex/reuse-first-crm-audit-2026-11-24, NOT main
or a preview branch. Repository Actions only schedule/manual-trigger database
backup; no tag deployment workflow is configured. Main adoption remains pending
a future authorised release or approved non-deploying main-update mechanism.

## Authorised Custom Customer Export — 24 November 2026

Status: implemented and targeted verification complete; release in progress.

- User explicitly authorised one Export panel within Customers. Reused current
  component, search/archive filters, customer-management POST, staff auth, venue
  normalisation, canonical matching RPC, booking type helper, successful-payment
  status definitions, CSV serializer and installed ExcelJS workbook infrastructure.
  No separate screen/API, dependency, new table or customer data modification.
- Export supports 25 allowlisted fields: ID/name/email/mobile, company/job title,
  creation/archive state, VIP/preferences/notes/dietary, bookings/guests, first/last
  performances, venues/types, booking value, recorded paid, successful payment
  entries, accepted refunds, net payment entries, outstanding and unitemised paid.
- All matching customers or explicit selected IDs intersect applied search/status
  and venue/performance-date/type filters. Cross-page selection is supported.
  Counts and money include matching permitted performances only, not payment-date
  windows. Unassociated customers included only for unrestricted all-venue scope
  without performance/type constraints; restricted staff need an eligible booking.
- One row per canonical unmerged customer. Independent relation pagination and
  maps prevent silent server limits and join-multiplied money. Company associations
  aggregate separately. Receipt entries are never added again to booking amount
  paid; manual/imported amounts without matching payment entries are explicit.
  Cancelled/refunded booking value is excluded; original refunded payment entries
  are retained only with accepted refund evidence, then refunds are shown separately.
  No new VAT/gratuity/refund/pricing rules or retrospective reconciliation.
- Marketing mode excludes all unverified consent and normalises/de-duplicates
  eligible email addresses without merging CRM records. Current persisted CRM has
  NO authoritative email-consent source: labels/cookies/bookings do not qualify,
  so no marketing list can currently be downloaded. Clear error is intentional;
  evidence capture/import is a separately approved future task, not invented here.
- Server requires bookings:manage, venue scope and allowlisted filters/fields;
  private notes/dietary additionally need crm:read. Marketing additionally needs
  crm:read + communications:manage. Read-only/ticket-scanning rights do not grant
  bulk export. Files are private/no-store; export audit stores counts/field/filter
  metadata, not contact rows/search text. No file is publicly stored.
- No new request/query during normal Customers usage or opening the panel. Only
  requested exports retrieve data, in batches of 500. Complete export bound:
  20,000 customers/100,000 matching bookings, with explicit narrow-filter errors
  rather than truncation. Concurrent changing customer result counts/identities
  fail with retry guidance. Empty results and missing optional values handled.
- Shared legacy CSV functions extracted, not duplicated; special characters,
  Unicode/BOM, quotes/newlines and spreadsheet formula injection covered. XLSX
  uses existing workbook library with typed numeric cells, gold header, filters
  and frozen row. Large binary dependencies remain server-side/on-demand.
- Necessary function-only migration 20261124150000 extends existing customer
  search ONLY for explicit p_page_size=500. Other existing caps/defaults remain.
  Original function backup local-evidence/customer-export-search-rollback.json.
  Rollback-only synthetic SQL verified 1,201 customers, 500/500/201 export pages
  and byte-equal normal 10-row and capped 50-row request results. No real profile
  data queried or exported for QA. Only function definition/migration metadata change.
- 35 targeted tests pass: loader aggregates, all pages/limits, search/date/type,
  selected IDs, role/venue/private fields, consent/dedup, empty/missing values,
  CSV/XLSX encoding/security and actual POST response/authentication/audit. Existing
  CRM and booking export regressions pass. A stale existing source assertion for
  pre-RPC pagination was updated to the current unchanged RPC contract after
  confirming it was already stale at HEAD; no underlying GET changes were made.
- Actual Customers UI synthetic Chromium checks 390/1280px: no request on panel
  open, selections across pages, all matching vs selected, CSV/Excel commands,
  consent error and no horizontal overflow/page errors. No physical Safari claim.
  TypeScript, focused lint and optimised Webpack build pass; final Vercel build
  is the release gate. Existing checkpoints and Frontend 2.0 untouched.
- Outstanding doctrine commit 251d7e1 is the release parent and will enter Main
  with this authorised application release. No branch/configuration workaround.

Staff: Customers -> apply search/status -> Export -> choose columns and performance
filters -> All matching or select customers across pages -> Download Excel/CSV.
Marketing export remains intentionally unavailable until real consent evidence
can be verified. General CRM exports must not be treated as consented audiences.
