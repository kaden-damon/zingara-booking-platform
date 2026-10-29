# Phase 56 - Meta Purchase Tracking Forensic Audit

STATUS: COMPLETE - READ-ONLY

DATE: 29 OCTOBER 2026

## Scope

Audited the Production Meta Pixel, GA4 and Google Ads event paths, consent controls, PayFast ITN lifecycle, Purchase eligibility and deduplication, durable payment evidence, and retained attribution data.

## Confirmed Findings

1. Production Purchase dispatch is disabled by `ADVERTISING_PURCHASE_CONVERSIONS_AUTHORISED`.
2. The live verification endpoint safely confirmed `dispatchAuthorized: false` without identifying a booking or sending an event.
3. Meta `Purchase`, GA4 `purchase` and Google Ads purchase conversion exist in code but share that disabled gate.
4. `InitiateCheckout` and `AddPaymentInfo` are browser Pixel events. No Meta Conversions API integration exists.
5. Purchase verification depends on a consented browser returning from PayFast and remaining on the return page while the ITN completes. The authoritative ITN does not create a durable conversion job.
6. Browser deduplication uses local storage and a booking-based ID. No server-side conversion ledger records dispatch or provider acceptance.
7. The Purchase payload uses the booking total, not the verified payment transaction value. Deposits and later balance payments are not represented independently.
8. GA4 and Google Ads tags load after consent. Their purchase events are blocked by the same Production gate.
9. Production does not retain Meta campaign identifiers, UTM parameters, `fbclid`, `fbc` or `fbp` against the booking journey. Exact historical Meta revenue attribution is therefore unavailable.
10. The reported 77 Meta events require an Events Manager breakdown from Jurelle. They cannot be Purchases emitted by the disabled Zingara Purchase path.

## Production Evidence

- 1,473 retained PayFast ITN receipts: all processed, none retained as rejected or retryable.
- 2,357 currently active, fully paid public bookings have complete verified PayFast evidence, totalling R15,480,286.70. This is eligibility evidence, not proof of advertising consent or conversion delivery.
- Since the tracking release, 397 bookings reached that eligible state, totalling R2,449,166.70.
- Coarse Facebook/Instagram referrer evidence covered 29 fully paid bookings totalling R112,080.00. This is directional referral evidence only, not confirmed paid Meta attribution.

## Recommended Correction

Keep live Purchase conversion dispatch disabled until a durable conversion outbox is driven by the authoritative PayFast ITN. Record one idempotent conversion per verified payment transaction, use the actual transaction value in ZAR, preserve a stable non-PII transaction/event ID, and audit destination acceptance. Add consented Meta CAPI delivery and use the same event ID for any paired browser event. Persist only approved attribution fields with expiry and privacy controls. Correct the zero-value complimentary path so it does not emit `AddPaymentInfo`.

## Verification

- Focused advertising Purchase tests: 4 passed.
- Live consent diagnostics: Google and Meta scripts remained blocked before consent and loaded after `ACCEPT ALL`.
- No Meta login was attempted.
- No live Purchase event was generated.
- Vercel CLI logs were unavailable; browser dispatches are not server-logged in the current design, so they could not establish Meta acceptance in any case.

## Safety

- No Production data modified.
- No code, migration, commit or deployment.
- Purchase conversion activation remains pending a separately verified correction and authorisation.

PHASE 56 - META PURCHASE TRACKING AUDITED.
