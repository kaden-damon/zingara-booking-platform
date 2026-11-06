# Phase 2 - Corporate Dietary Requirements

**Status:** Complete - deployed and verified in Production  
**Date:** 6 November 2026

## Baseline Audit

- Existing Phase 64 services already supplied canonical Kosher and Strictly
  Halaal add-ons, the exact 72-hour cutoff, server-side enforcement, booking
  continuity, idempotent Fatima notification and Table Plan V/W export.
- Corporate enquiries stored dietary labels only. They did not capture
  quantities, omitted Kosher from the public Corporate form, and converted
  labels to plain notes instead of authoritative booking add-ons.
- Production contained 204 Corporate enquiries: 46 with dietary labels, 11
  mentioning Strictly Halaal, none mentioning Kosher and none with structured
  quantity metadata. No converted request depended on label-only dietary data.
- Eight active Full Show Buyouts contained no dietary text. Fatima MB's active
  authoritative staff profile and configured recipient address were verified.

## Implementation

- Added one shared Corporate dietary catalogue and validator for Vegetarian,
  Vegan, Halaal Friendly, Strictly Halaal, Kosher, Gluten Free, Nut Allergy,
  Dairy Free and Other.
- Added explicit integer quantity inputs bounded from one to the enquiry guest
  count. Selected categories cannot be submitted without valid quantities.
- Persisted quantities inside the Corporate request's existing metadata JSON;
  no new table or migration was necessary.
- Corporate conversion now rebuilds canonical dietary add-ons server-side from
  the authoritative request. Client-supplied dietary add-ons cannot replace or
  inflate them, while the agreed Corporate booking total remains unchanged.
- Legacy label-only requests remain convertible and display `Quantity not
  recorded`; no historical quantity is inferred.
- Booking Details retains authorised structured quantity editing for all meal
  categories. Beef/chicken operational instructions remain in Function Brief
  notes and were not moved into dietary quantities.
- Table Plan V (Strictly Halaal) and W (Kosher) continue to use structured
  add-on quantities. A deduplicated structured dietary summary for all meal
  categories is added to the existing NOTES field.

## Notification Trigger

The existing `dietary-order` notification is still the only delivery path. It
runs after an authoritative booking reaches `confirmed` or `checked_in`, or
after a confirmed booking's structured dietary quantities are updated. It sends
only when Kosher or Strictly Halaal increases, includes the complete current
meal summary and confirmed change, and uses the established booking-specific
idempotency key. Abandoned selections, failed payments, retries and repeated
callbacks do not send an email. No QA staff email was sent.

## Verification

- Focused regression tests: 26/26 passed.
- 72-hour suite passed before, exactly at and inside the cutoff, including
  preservation, reduction and removal of existing orders.
- TypeScript and targeted ESLint passed.
- The Production Webpack build passed. The local Turbopack worker remains
  unable to open its temporary process port in this restricted environment;
  this is an environment limitation, not an application build failure.
- Generated Johannesburg and Cape Town workbooks verified exact mixed-order
  quantities in V/W, complete dietary NOTES and unchanged workbook structure.
- Live Production inspection verified all public Corporate dietary options,
  Kosher and Strictly Halaal quantity controls and per-meal pricing. An
  authenticated Kaden Admin session verified the Corporate workspace and all
  204 preserved enquiries. No submit, conversion or booking mutation occurred.

## Release

- Local implementation commit: `79464391`.
- Production commit: `95c85a373d7c358b3bb267d792df6a6bbae26ac8`.
- Vercel deployment: `69kZW4SBXwuUgm15FUcGUx3gW4kq`, healthy.
- Migration: none.
- Performance: no new polling, page-load request, background process, heavy
  dependency or per-render database query.
- Business-data delta: none.
- Rollback: redeploy Production commit `4d7695d2ecd02fd5b4627c16923cb66139ff0a6e`.

## Genuine Outstanding Exception

The 46 legacy enquiries with dietary labels predate quantity capture. They are
preserved as `Quantity not recorded` and require staff confirmation if later
converted; automatically inventing quantities would be unsafe.
