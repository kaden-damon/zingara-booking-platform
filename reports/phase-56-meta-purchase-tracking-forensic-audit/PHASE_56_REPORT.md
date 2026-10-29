# Phase 56 - Meta Purchase Tracking Forensic Audit

Date: 29 October 2026
Production baseline: `6f0cfbaaed32870824f587b704f774382cf198f9`
Method: read-only source inspection, live consent/browser diagnostics, safe endpoint verification and bounded Production evidence queries

## Executive Finding

The immediate reason Meta receives checkout events but no completed Purchase events is confirmed: Production Purchase dispatch is disabled. A safe request to the live Purchase verification endpoint returned `{"dispatchAuthorized":false}`. That gate also blocks GA4 `purchase` and the Google Ads purchase conversion.

There is a second architectural problem that must be corrected before enabling the gate. Purchase is dispatched only by the customer's browser after returning from PayFast. The authoritative PayFast ITN verifies and records the payment, but does not create a durable advertising conversion. Customers who close the page, do not return, decline marketing consent, return after the 30-second retry window, or lose the local journey context cannot produce a browser Purchase event.

## Current Implementation

| Area | Verified state |
| --- | --- |
| Meta Pixel | Pixel `1434578967806435`, browser-only, consent controlled |
| GA4 | `G-PP7C1SBY8N`, consent controlled |
| Google Ads | `AW-18530431025`; purchase destination configured |
| Checkout | GA4 `begin_checkout`; Meta `InitiateCheckout` |
| Payment initiation | GA4 `add_payment_info`; Meta `AddPaymentInfo` |
| Purchase | Implemented for Meta, GA4 and Ads, but disabled in Production |
| CAPI | Not implemented; no Graph API delivery or access-token configuration |
| Authoritative payment | PayFast ITN with signature, merchant, source, amount and server verification |
| Conversion audit | None; browser failures are swallowed and provider acceptance is not stored |

The browser Purchase dispatcher supplies ZAR currency, value, GA4/Ads `transaction_id` and Meta `eventID`. Repeated dispatch in one browser is guarded by local storage. The ID is derived from the booking ID, not the verified payment transaction.

## Payment Lifecycle

1. The public checkout records `InitiateCheckout` and later `AddPaymentInfo` after the relevant consent.
2. PayFast processes the payment and calls the ITN endpoint.
3. The ITN performs authoritative validation, records the payment idempotently and emits internal `payment_confirmed` / `booking_completed` events.
4. Advertising Purchase is not emitted by the ITN.
5. The customer return page polls Purchase eligibility every two seconds for at most 30 seconds.
6. Only a fully paid public booking with matching browser journey context and complete verified PayFast evidence can dispatch.

The retained ITN ledger is healthy: 1,473 receipts were processed, with no retained rejected or retryable receipts. The missing Purchase is not caused by PayFast confirmation failure.

## Values and Deduplication

Current eligibility is full-settlement only. A partial or deposit payment does not dispatch. Once the booking becomes fully paid, the payload value is the full booking total rather than the latest verified payment transaction amount. This does not safely distinguish a deposit from a later balance payment.

Browser deduplication is stable for repeated views in the same browser, but is not durable across devices or cleared storage. There is no server-side conversion ledger, retry state or destination response evidence. There is also no browser/CAPI deduplication because CAPI does not exist.

Current Production evidence contains 2,357 active, fully paid public bookings with complete PayFast evidence, totalling R15,480,286.70. Of these, 397 bookings totalling R2,449,166.70 reached that state after the tracking release. These figures show potential eligibility only. They do not prove advertising consent, browser return or event delivery.

## Consent and Privacy

Live browser verification confirmed that the shared Google tag and Meta Pixel do not load before consent and load after `ACCEPT ALL`. The application injects one Google tag; Google's loader then loads the configured Ads destination. No duplicate application-injected Google or Meta script was found.

No customer PII is included in the inspected tracking payloads. Purchase conversion activation remains disabled.

## Attribution

Bookings retain their booking reference, amounts, timestamps and public checkout journey identity. Payments retain verified amount, provider transaction identity and processing time. Platform events retain coarse journey/session context.

Production does not retain UTM campaign fields, `fbclid`, `fbc` or `fbp` against the booking journey. Exact Meta campaign attribution and campaign revenue cannot be reconstructed historically.

Coarse referrer evidence associated 16 fully paid bookings (R64,720.00) with Facebook and 13 (R47,360.00) with Instagram. The combined R112,080.00 is directional referral evidence only. It must not be reported as confirmed Meta Ads revenue.

## The Reported 77 Events

The 77 cannot be classified from Zingara's retained evidence. Because the Production Purchase gate is disabled, they are not Purchase events generated by Zingara's Purchase implementation. They may represent a Meta Events Manager date-range subset of PageView, ViewContent, InitiateCheckout, AddPaymentInfo or another aggregate.

Jurelle must provide the Events Manager date range and event-name breakdown to identify them. Internal event totals do not reconcile to 77, so treating them as sales or purchases would be unsupported.

## GA4 Status

GA4 page and funnel events are implemented and the live GA4 tag loads after consent. `begin_checkout` and `add_payment_info` are emitted by the booking journey. GA4 `purchase` exists in code but is blocked by the same Production gate, so this implementation is not currently sending verified purchase revenue to GA4.

GA4 account-side receipt was not inspected in this audit. The application uses a stable transaction ID for the intended event, which follows Google's duplicate-minimisation mechanism, but no event is currently authorised to leave the app.

## Smallest Safe Correction

Do not fix this by only setting the current gate to true. That would activate a return-page-only event with incomplete delivery evidence and unsuitable deposit/balance semantics.

1. Create a durable, idempotent advertising conversion outbox from the authoritative PayFast ITN result.
2. Record one conversion identity per verified provider payment transaction and use that transaction's actual ZAR amount.
3. Add Meta CAPI delivery with provider response auditing and bounded retries. If a browser Pixel Purchase is retained, use the same `event_id` for deduplication.
4. Dispatch GA4 and Google Ads purchases from the same verified conversion record or use an approved server-side measurement path.
5. Persist only consented, allowlisted attribution fields (`fbclid`, `fbc`, `fbp`, UTMs) with retention and privacy controls.
6. Keep the live Purchase gate off until deposits, balances, duplicate ITNs, retries, consent and provider response handling pass isolated verification.
7. Stop the complimentary zero-value completion path from emitting `AddPaymentInfo`.

## Verification and Limits

- Focused advertising Purchase tests: 4 passed.
- Live consent and tag loading verified without logging into Meta.
- No live Purchase or financial event generated.
- No Meta Events Manager access was available; agency-side dataset receipt/rejection remains for Jurelle.
- Vercel CLI logs were unavailable. Current browser dispatches are not logged server-side, so application logs would not establish Meta provider acceptance.
- Production business-data delta: none.
- No code change, migration, commit or deployment.

PHASE 56 - META PURCHASE TRACKING AUDITED.
