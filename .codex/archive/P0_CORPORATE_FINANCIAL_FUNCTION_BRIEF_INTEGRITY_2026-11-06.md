# P0 Corporate Financial & Function Brief Integrity

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Root Cause

The Function Brief loader used the complete booking total as `Tickets` when a
native Corporate booking had no imported legacy payment-evidence row. It also
derived Bar Tab and gratuity only from that optional legacy table. Native
Corporate bookings therefore duplicated the total as ticket value and omitted
their structured add-on and collected-gratuity split.

Corporate history also contains two valid subtotal conventions: legacy rows
include add-ons in `subtotal_amount`, while newer rows store add-ons separately.
The corrected resolver uses the authoritative total boundary and separately
recorded gratuity/add-on components, so both conventions reconcile without a
data migration or historical repricing.

## Reference Reconciliation

Booking: `ZNG-BCP2C3` - Pulling Power Media - Cape Town - 6 November 2026 -
29 guests.

Verified lifecycle:

- Created for 27 guests at R1,360 each, with a R2,700 Bar Tab, R4,928 service
  fee and R44,348 total.
- Manual EFT R44,347.50 was recorded, followed by an audited R0.50 financial
  reconciliation.
- Guest count increased from 27 to 29 under the fixed Corporate agreement with
  a R3,060 total increment, equivalent to R1,530 per additional guest.
- Bar Tab increased from R2,700 to R2,900; its R200 increase added R25
  gratuity. The final service-fee record is R4,953.
- Lisa Rodderick's audited manual reconciliation then set the authoritative
  booking subtotal to R42,679.50 and total/paid to R47,632.50.

The R329.50 difference from 29 x R1,360 is therefore verified, not a pricing
calculation defect: +R340 for two guests at the fixed R1,530 rate, -R0.50 from
the earlier reconciliation, and -R10 when the embedded booking fee is separated
from ticket value.

Correct live Function Brief components:

- Full Payment: R47,632.50
- Tickets: R39,769.50
- Ticket Gratuity Paid: R4,590.50
- Booking Fee: R10.00
- Bar Tab: R2,900.00
- Bar Tab Gratuity Paid: R362.50
- Reconciled total: R47,632.50

The original single EFT payment row remains R44,347.50. The later R3,285
increase is supported by immutable manual financial-reconciliation audit
evidence and the authoritative paid booking header. No payment history was
rewritten.

## Corrections

- Added one authoritative Function Brief financial resolver with explicit
  support for native records, imported payment evidence, fixed Buyout packages
  and both subtotal conventions.
- Added the permanent `Bar Tab` catalogue entry for Corporate bookings and
  Full Show Buyouts only. It accepts one custom monetary amount and remains
  protected by existing financial-reconciliation permissions.
- Kept Corporate/Buyout upfront gratuity on eligible ticket and add-on value;
  ordinary Standard bookings remain venue-paid.
- Replaced the duplicated PDF summary with separately labelled payment,
  ticket, booking-fee, add-on and collected-gratuity lines in the existing
  Function Brief block.
- Removed the unsafe PDF fallback that displayed manually entered operational
  gratuity notes as though they were confirmed collected value.

## Wider Audit

- 582 active Corporate-origin bookings reviewed.
- 33 contain authoritative structured add-on value.
- Two fixed Full Show Buyouts were included in the compatibility check.
- `ZNG-490E35` confirmed the newer convention where R9,600 add-ons sit outside
  subtotal; the corrected resolver reconciles it without mutation.
- One cancelled and unpaid historical booking, `ZNG-JVFMG6`, has a pre-existing
  R250 difference between stored total and its subtotal/add-on/gratuity
  components. It has no collected amount and was deliberately left for manual
  review rather than inferred or backfilled.

## Verification

- Focused regression tests: 61/61 passed.
- TypeScript: passed.
- Whitespace validation: passed.
- Next.js 16.3.4 Production Webpack build: passed.
- Vercel Production build and performance status: successful.
- Authenticated Production UI confirmed the permanent Bar Tab in the existing
  Corporate add-on editor for `ZNG-BCP2C3`; no save was performed.
- A fresh Production Function Brief was downloaded. Text extraction and visual
  inspection of all three A4 pages confirmed exact cents, separate gratuity
  lines, unchanged operational content, and no clipping or overlap.

## Release

- Local application commit: `d8a43bf`.
- Production application commit: `9b4c9cae`.
- Vercel deployment: `BTcGsmMWoKAPenK1ZHK4wK1iS23w`.
- Deployment completed successfully at 11:33:15 SAST on 6 November 2026.
- Migration: none.
- Performance: no additional page request, polling, dependency, background
  job or per-render calculation. Function Brief resolution runs only in the
  existing on-demand Corporate operations request.
- Rollback: revert Production commit `9b4c9cae`; no database rollback is
  required.
- Business-data delta: none.

## Final Status

P0 COMPLETE - CORPORATE FINANCIALS AND FUNCTION BRIEFS RECONCILED.
