# Phase 50.15 - GA4, Google Ads and Meta tracking

Zingara is live Production. Extend the existing consent-aware first-party conversion telemetry with the agency's advertising measurement while preserving booking performance, payment integrity and existing analytics.

## Approved destinations

- GA4: `G-PP7C1SBY8N`
- Google Ads: `AW-18530431025`
- Google Ads Purchase: `AW-18530431025/mApNCLCkxaUdELHg_4NF`
- Meta Pixel: `1434578967806435`

## Authorised implementation

- Audit the existing analytics, consent and journey telemetry before editing.
- Load one shared Google tag for GA4 and Google Ads and one Meta Pixel without duplicate scripts.
- Map the existing booking journey to appropriate GA4 and Meta standard events without adding PII.
- Keep all tracking asynchronous, consent-controlled, bounded and unable to block booking or payment workflows.
- Preserve attribution between `zingara.co.za`, `book.zingara.co.za` and the PayFast return journey where the connected domains support it.

## Purchase safety boundary

- A purchase conversion may only originate from authoritative server-verified payment evidence for a fully paid booking.
- Use the actual ZAR booking value and a stable opaque deduplication identity.
- Refreshes, returns, retries, partial payments and repeated booking access must not create duplicate conversions.
- Implement and verify the purchase payload and deduplication contract, but keep live advertising purchase conversion dispatch disabled pending separate approval.

## Verification and release

- Verify event payloads, consent transitions, duplicate protection, privacy and browser performance.
- Run focused tests, TypeScript, changed-file ESLint, `git diff --check` and the Production build.
- Commit only Phase 50.15 changes, push to `main`, deploy to Vercel Production and verify the live non-purchase tracking integration.
- Keep Phase 50.14 Guided Training local, untouched and undeployed.

Final status: Phase 50.15 complete - Advertising tracking integrated; live purchase conversion activation remains approval-gated.
