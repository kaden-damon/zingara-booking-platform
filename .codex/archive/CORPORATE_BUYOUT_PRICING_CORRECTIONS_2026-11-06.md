# Corporate & Buyout Pricing Corrections

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Existing Infrastructure Reused

- The established Corporate/Buyout add-on catalogue, authoritative pricing
  calculation, upfront-gratuity allocation and downstream financial readers.
- Existing versioned Buyout package snapshots, booking metadata, permissions,
  immutable audit records and Venue settings workspace.
- Existing atomic payment-link and manual-EFT settlement functions, PayFast
  reconciliation, idempotency and booking-fee configuration.

## Corrections

### Bar Tab

- `Bar Tab` remains Corporate/Full Show Buyout only and now accepts an
  authorised custom Rand amount in the established add-on editor.
- The existing quantity structure is retained where applicable. Server-side
  normalisation requires one valid amount, blocks duplicate lines and keeps
  broad arbitrary custom-pricing permission separate from the Bar Tab control.
- Its chargeable value participates once in the existing 12.5% upfront
  gratuity calculation. Booking totals, balances, quotes, invoices, Booking
  Details, Function Briefs, Table Plans and reports use the persisted values.

### Buyout Packages

- Added venue-specific package name, description and total configuration under
  Admin -> Settings -> Venue -> Buyout Packages.
- Preserved The Grand Society, The Private Salon and The Speakeasy as the three
  initial global templates for each venue.
- Saving creates a new active version for that venue and package code through
  `save_corporate_buyout_package_version_atomic`; older versions remain
  historical evidence.
- Buyout creation accepts an optional agreed total. The selected package,
  custom total and proportional VAT/gratuity composition are stored in the
  immutable booking snapshot. Package edits never reprice existing bookings.
- Package reads and writes require the existing `settings:manage` permission;
  creation retains its established booking and settings permissions.

### Booking Fee

- New-version bookings record exact fee provenance: payment method, fee amount
  and `payment-method-v1` policy version.
- `create_booking_balance_payment_link_fee_aware_atomic` applies the existing
  configured fee when PayFast/payment-link settlement is chosen.
- `record_manual_eft_payment_fee_aware_atomic` removes that fee for EFT only
  when no successful PayFast payment already owns it.
- Both wrappers call the proven payment functions inside the same database
  transaction, preserve idempotency and append audit evidence. Historical
  records without the new policy version are never repriced.

## Production Reconciliation

Reference: `ZNG-48B964B9`, Vodacom, Johannesburg, 6 November 2026, 400 guests.

- Original package snapshot: Private Salon v1, R590,000 base, R73,750
  gratuity, R88,500 VAT and R752,250 total.
- Current authoritative booking position: R610,650 subtotal, R73,750 service,
  R684,400 total, R684,400 paid and R0 balance.
- Lisa Rodderick's audited management reconciliation records the agreed
  R684,400 amount with reason `Vodacome Deal`.
- No payment row was fabricated or rewritten. The management-agreed exception
  and original package snapshot remain unchanged.

## Verification

- Focused regression tests: 101/101 passed.
- TypeScript: passed.
- Targeted ESLint: zero errors, four pre-existing warnings.
- Next.js 16.3.4 Production Webpack build: passed.
- Whitespace validation: passed.
- Migration syntax was validated in a rollback-only Production transaction.
- A second rollback-only Production fixture proved PayFast fee R0 -> R10, EFT
  fee R10 -> R0, atomic manual EFT settlement and venue package versioning.
  Follow-up queries confirmed no fixture booking, evidence or audit row survived.
- Post-migration Production checks confirmed all three functions, three global
  active packages, zero venue overrides and unchanged Vodacom values.
- Authenticated Production UI inspection confirmed the new Cape Town and
  Johannesburg editors, all three packages, descriptions, totals and Save
  controls. No Production settings were changed during QA.
- Responsive behaviour is provided by the existing mobile-first controls and
  single-column layout below the desktop breakpoint; no new fixed-width or
  overflow-prone control was introduced.

## Release

- Application commit: `6ca491e3` (source commit `7b77122`).
- Migration: `20261106160000_corporate_buyout_pricing_corrections.sql`.
- Production deployment: `dpl_4sfWsHBUWndJRqRt2hVY1PWGK4Xh`, Ready and aliased
  to `https://book.zingara.co.za` at approximately 12:39 SAST.
- Performance: package data loads once and only when Venue settings is opened;
  there is no polling, booking-flow request, background processing or new
  runtime dependency.
- Business-data delta: none. The release added schema/functions and UI/API
  capability only; zero bookings, payments, invoices, quotes, package override
  rows, tickets, seating assignments or historical financial values changed.
- Rollback: revert `6ca491e3` and redeploy. Keep the additive audit-compatible
  schema in place unless a separately reviewed cleanup is authorised.

## Final Status

COMPLETE - CORPORATE & BUYOUT PRICING CORRECTIONS LIVE.
