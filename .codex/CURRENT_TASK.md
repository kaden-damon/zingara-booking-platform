# Phase 50.15B - Tracking fix and cookie UX

Zingara is live Production. Correct the confirmed Google gtag command-queue defect and simplify the existing consent experience without replacing its consent architecture.

## Authorised implementation

- Correct the Google command shim to use Google's supported `dataLayer.push(arguments)` command format.
- Preserve the approved identifiers: GA4 `G-PP7C1SBY8N`, Google Ads `AW-18530431025`, purchase destination `AW-18530431025/mApNCLCkxaUdELHg_4NF`, and Meta Pixel `1434578967806435`.
- Replace the two-stage consent UI with one compact notice containing only `ACCEPT ALL` and `ESSENTIAL ONLY`.
- `ACCEPT ALL` records Analytics and Marketing consent; `ESSENTIAL ONLY` records both optional categories as denied.
- Preserve the existing versioned consent record, later `COOKIE PREFERENCES` reopen control, admin preview, and fail-closed tracking behavior.
- Update the existing Cookie Policy, Privacy Policy and Terms & Conditions to describe GA4, Google Ads, Meta Pixel, the two choices and the separate purchase-activation boundary accurately.
- Keep live purchase conversions disabled pending separate authorisation.
- Keep Phase 50.14 Academy Guided Training untouched.

## Verification and release

- Run focused consent and advertising tests, TypeScript, changed-file ESLint, `git diff --check` and the Production build.
- Verify no optional vendor script or event is sent before consent.
- Verify `ESSENTIAL ONLY` remains vendor-free and `ACCEPT ALL` produces GA4, Google Ads and Meta non-purchase events without duplicate scripts or events.
- Verify the notice and reopen experience at desktop, tablet and mobile widths.
- Commit only authorised changes, push to `main`, deploy to Vercel Production and verify live delivery.
- Do not generate a real booking, payment, purchase conversion or customer communication.

## Verified implementation

- Google commands now use the provider-supported `dataLayer.push(arguments)` format.
- The notice contains only `ACCEPT ALL` and `ESSENTIAL ONLY`; no checkbox or secondary preferences screen remains.
- Consent version 5 records the visitor's timestamped choice and prompts visitors with older records to choose again.
- The existing footer control reopens the same two-choice notice.
- Cookie Policy, Privacy Policy and Terms & Conditions identify GA4, Google Ads and Meta Pixel and state that advertising purchase measurement remains disabled.
- Focused tests, TypeScript, changed-file ESLint, `git diff --check` and the Production build pass.
- Desktop 1440px, tablet 900px and mobile 390px rendering has no horizontal overflow.

Final status: Phase 50.15B complete - tracking queue corrected and cookie consent simplified; advertising purchase conversions remain disabled.
