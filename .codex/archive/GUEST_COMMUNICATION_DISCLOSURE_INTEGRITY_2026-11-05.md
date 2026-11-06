# Guest Communication & Disclosure Integrity

## 6 November 2026 - Seating Preview Follow-up

- Every public Seating Preview now renders the approved venue-specific ticket
  inclusion sentence immediately beneath the seating-zone title through the
  shared popup path.
- Cape Town uses the approved 3-course sentence and Johannesburg the approved
  4-course sentence. The existing guest-disclosure module remains the single
  venue resolver; no availability, price or booking rule was duplicated.
- Focused disclosure tests passed 4/4. TypeScript, focused disclosure lint,
  whitespace checks and the Production Next.js build passed. The public
  booking page's existing full-file lint findings remain in untouched effect
  code and were not broadened by this change.
- Production was inspected for Johannesburg and Cape Town. Both sentences
  appeared directly below Golden Circle, and the shared renderer applies the
  same placement to every zone. Desktop and 390 x 844 mobile layouts remained
  readable and contained, with existing pricing, availability, descriptions
  and actions unchanged.
- Local commit: `63e2abf`. Production commit:
  `7e041ca0be429722ce9d4998e1d3aa467af7e7f9`. Deployment:
  `7uJzSR8vQQ6J5818DCpVDqMMcwKH`, READY.
- No API request, polling, dependency or background work was added. Business-
  data delta: none.

### 6 November 2026 - Seating Preview Recommendation Spacing

- Corrected the shared recommendation renderer so show times always retain a
  space before `for`, for example `18:00 for Golden Circle.`
- The defect was caused by adjacent JSX text and expression nodes relying on
  source-line whitespace that React did not preserve. A shared, tested
  formatter now assembles the complete sentence for every zone and venue.
- Regression tests passed 5/5. TypeScript, focused lint, whitespace checks and
  the Production Next.js build passed.
- Authenticated Production verification confirmed the corrected Johannesburg
  sentence on desktop and Cape Town at 390 x 844, including Golden Circle and
  Middle Ring previews.
- Local application commit: `abfe6a4`. Production commit:
  `ea43f01221d07318d5e3127633ea8690b49026f0`. Deployment:
  `9yzMsHPQ2MmqUZ9tTmsMGBoip3kY`, READY.
- No API request, state, effect, dependency or background work was added.
  Business-data delta: none.

---

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 5 NOVEMBER 2026

## Scope And Baseline

The completed Pre-Show Reminder release was verified before this work began.
Its attendance actions, authoritative venue times, schedule, legal footer and
shared Admin preview/scheduled renderer were preserved.

The audit covered public booking and checkout, payment summaries, reservation
and payment confirmations, Pre-Show Reminders, Find My Booking, digital
tickets, ticket PDFs, Apple Wallet and Corporate communications.

## Touchpoint Findings And Corrections

| Touchpoint | Existing behaviour | Confirmed correction |
| --- | --- | --- |
| Public booking and checkout | Totals correctly itemised the 12.5% service fee, but explanatory copy said it would be applied to dinner and beverages without distinguishing the already charged amount from venue spend. | Added compact venue inclusions and booking-derived payment/gratuity disclosure before confirmation; removed the conflicting legacy note. |
| Balance-payment link | Showed authoritative amount due and PayFast transaction fee but no inclusions or gratuity context. | Added the shared venue-aware disclosure using persisted balance and `service_fee`. |
| Find My Booking | Correctly showed status, tickets, balance and payment action but lacked the shared inclusions/exclusions context. | Added the same compact disclosure without changing payment actions. |
| Reservation confirmation | Branded ticket email contained booking/ticket details and times, but no venue inclusions/payment disclosure; editable Reservation Confirmed body was not included in the initial branded email. | Added shared inclusions/payment sections and inserted the rendered editable body for the initial confirmation. Ticket resends remain focused and unchanged. |
| Payment confirmation | Correctly recorded the provider transaction breakdown but did not carry the shared venue/payment explanation. | Appended authoritative inclusions and balance/service-fee disclosures while preserving idempotent PayFast communication claims. |
| Pre-Show Reminder | Venue inclusions were correct. Six-plus copy incorrectly said a discretionary 12.5% charge would be billed on the night. | Reused the shared disclosure source. A 12.5% notice now appears only when persisted `service_fee` evidence exists, and identifies the actual calculation basis. |
| Corporate enquiry | Correctly starts at 20 guests. Generic gratuity copy did not explain quote treatment or additional venue spend. | States that applicable 12.5% gratuity is itemised in the quote and that additional drinks/gratuity are payable at the venue unless included in the agreed booking. |
| Digital ticket, ticket PDF and Apple Wallet | Already present authoritative event, venue, timing, seating, status and compact payment information where applicable. No conflicting disclosure was found. | Intentionally unchanged to avoid cluttering entry credentials. |

## Financial Rule Reconciliation

The application calculates the six-plus 12.5% amount on the discounted seating
and add-on subtotal and includes it in the booking total. This is not optional
in the current pricing implementation. The requested word `discretionary`
therefore conflicted with the authoritative calculation and was not repeated in
guest copy. No financial rule was changed; the communication now describes the
persisted calculation accurately.

Deposit bookings show an outstanding-balance notice. Fully paid bookings do
not. Additional drinks and gratuity on drinks remain identified as payable at
the venue. The existing NYE full-payment-only rule and Corporate agreed pricing
remain unchanged.

## Verification

- `node --test --experimental-strip-types` focused suite: 14/14 passed.
- `npx tsc --noEmit`: passed.
- Targeted changed-file ESLint: zero errors; one pre-existing internal
  navigation warning remains in the payment-link client.
- `git diff --check`: passed.
- `npx next build --webpack`: passed with Next.js 16.3.4.
- The default Turbopack build was stopped after its known local compiler stall;
  the clean Webpack build initially required network access for existing Google
  fonts and then passed.
- The existing Admin performance-budget script could not parse the Webpack
  client-reference manifest, matching the prior documented limitation.
- Live public browser verification confirmed the corrected Corporate copy.
  Production Booking and Find My Booking returned HTTP 200.
- The available Production browser session was not authenticated for Admin;
  no claim of live authenticated Admin preview inspection is made. Shared
  renderer tests and the Production build verify the preview path.

## Release

- Application commit: `6a9515bf` (`fix: align guest booking disclosures`).
- Production deployment: `dpl_BVQ9EbmokQkGNqWx9BMFNKNgb9AH`.
- Production URL: `https://book.zingara.co.za`.
- Deployment state: READY.
- Migration: none.
- Business-data delta: zero. No customer/test email was sent; no booking,
  payment, seating, ticket, communication, Wallet or financial record changed.
- Rollback: revert `6a9515bf` and redeploy; no database rollback is needed.

## Genuine Outstanding Item

Authenticated live Admin preview inspection remains outstanding because the
available Production browser session presented the Admin login screen. This is
an evidence limitation only; no functional or build defect was identified.
