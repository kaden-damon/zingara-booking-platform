import assert from "node:assert/strict";
import test from "node:test";

import {
  canInitializeConsentCategory,
  createConsent,
  isConsentCurrent,
  parseStoredConsent,
} from "./cookieConsent.ts";
import {
  defaultCookieConsentConfig,
  getChangedCookieConsentFields,
  normalizeCookieConsentConfig,
  validateCookieConsentConfig,
} from "./cookieConsentConfig.ts";

test("optional consent defaults off while Essential remains active", () => {
  const consent = createConsent(1, { analytics: false, marketing: false }, "2026-08-31T00:00:00.000Z");
  assert.equal(consent.essential, true);
  assert.equal(consent.analytics, false);
  assert.equal(consent.marketing, false);
});

test("the two consent choices record all optional categories atomically", () => {
  const accepted = createConsent(5, { analytics: true, marketing: true });
  const essentialOnly = createConsent(5, { analytics: false, marketing: false });
  assert.equal(accepted.analytics, true);
  assert.equal(accepted.marketing, true);
  assert.equal(essentialOnly.essential, true);
  assert.equal(essentialOnly.analytics, false);
  assert.equal(essentialOnly.marketing, false);
});

test("custom preferences remain independent", () => {
  const consent = createConsent(1, { analytics: true, marketing: false });
  assert.equal(consent.analytics, true);
  assert.equal(consent.marketing, false);
});

test("stored consent is validated and versioned", () => {
  const consent = createConsent(3, { analytics: true, marketing: false }, "2026-08-31T00:00:00.000Z");
  assert.deepEqual(parseStoredConsent(JSON.stringify(consent)), consent);
  assert.equal(isConsentCurrent(consent, 3), true);
  assert.equal(isConsentCurrent(consent, 4), false);
  assert.equal(parseStoredConsent("{}"), null);
  assert.equal(parseStoredConsent("not-json"), null);
});

test("existing explicit optional consent requires the advertising disclosure version", () => {
  const existing = createConsent(1, { analytics: true, marketing: false });
  assert.equal(
    isConsentCurrent(existing, defaultCookieConsentConfig.consentVersion),
    false,
  );
  assert.equal(canInitializeConsentCategory("analytics", existing, 1), true);
  assert.equal(canInitializeConsentCategory("marketing", existing, 1), false);
});

test("withdrawal replaces optional permission without disabling Essential", () => {
  const withdrawn = createConsent(2, { analytics: false, marketing: false });
  assert.equal(withdrawn.essential, true);
  assert.equal(canInitializeConsentCategory("analytics", withdrawn, 2), false);
  assert.equal(canInitializeConsentCategory("marketing", withdrawn, 2), false);
});

test("optional integrations fail closed without current explicit consent", () => {
  const stale = createConsent(1, { analytics: true, marketing: true });
  assert.equal(canInitializeConsentCategory("analytics", null, 2), false);
  assert.equal(canInitializeConsentCategory("marketing", stale, 2), false);
  assert.equal(canInitializeConsentCategory("analytics", stale, 1), true);
});

test("disabled consent UI never implies optional permission", () => {
  const disabledConfig = normalizeCookieConsentConfig({ enabled: false });
  assert.equal(disabledConfig.enabled, false);
  assert.equal(
    canInitializeConsentCategory(
      "analytics",
      null,
      disabledConfig.consentVersion,
    ),
    false,
  );
});

test("configuration defaults preserve locked category semantics", () => {
  assert.equal(defaultCookieConsentConfig.enabled, true);
  assert.equal(defaultCookieConsentConfig.consentVersion, 6);
  assert.equal(defaultCookieConsentConfig.acceptAllLabel, "ACCEPT ALL");
  assert.equal(defaultCookieConsentConfig.essentialOnlyLabel, "ESSENTIAL ONLY");
  assert.match(defaultCookieConsentConfig.essentialDescription, /Required/);
});

test("legacy acknowledgement label upgrades to the explicit two-choice wording", () => {
  const normalized = normalizeCookieConsentConfig({
    ...defaultCookieConsentConfig,
    acceptAllLabel: "OKAY",
    essentialOnlyLabel: "",
  });
  assert.equal(normalized.acceptAllLabel, "ACCEPT ALL");
  assert.equal(normalized.essentialOnlyLabel, "ESSENTIAL ONLY");
});

test("legacy generic disclosures upgrade to the named advertising providers", () => {
  const normalized = normalizeCookieConsentConfig({
    ...defaultCookieConsentConfig,
    analyticsDescription:
      "Allows optional analytics technologies that help us understand and improve the booking experience.",
    consentVersion: 3,
    marketingDescription:
      "Allows optional marketing technologies where Zingara introduces them and you choose to consent.",
  });

  assert.equal(normalized.consentVersion, 6);
  assert.match(normalized.analyticsDescription, /Google Analytics/);
  assert.match(normalized.marketingDescription, /Google Ads and Meta Pixel/);
});

test("configuration normalisation strips control characters and limits copy", () => {
  const normalized = normalizeCookieConsentConfig({
    bannerHeading: "  YOUR\u0000 PRIVACY  ",
    footerLinkLabel: "x".repeat(100),
  });
  assert.equal(normalized.bannerHeading, "YOUR  PRIVACY");
  assert.equal(normalized.footerLinkLabel.length, 40);
});

test("legacy implied-consent copy upgrades to the explicit provider choice", () => {
  const normalized = normalizeCookieConsentConfig({
    ...defaultCookieConsentConfig,
    bannerDescription:
      "We use cookies to ensure that we give you the best experience on our website. If you continue to use this site we will assume that you are happy with it.",
  });
  assert.match(normalized.bannerDescription, /Choose Accept All/);
  assert.match(normalized.bannerDescription, /Essential Only/);
});

test("configuration permits blank hidden fields and optional heading", () => {
  const config = {
    ...defaultCookieConsentConfig,
    bannerHeading: "",
    footerLinkLabel: "",
    managePreferencesLabel: "",
    savePreferencesLabel: "",
  };
  assert.equal(validateCookieConsentConfig(config), null);
  assert.equal(normalizeCookieConsentConfig(config).bannerHeading, "");
  assert.equal(normalizeCookieConsentConfig(config).footerLinkLabel, "");
});

test("configuration requires only active notice copy", () => {
  assert.match(
    validateCookieConsentConfig({
      ...defaultCookieConsentConfig,
      bannerDescription: " ",
    }) ?? "",
    /bannerDescription is required/,
  );
  assert.match(
    validateCookieConsentConfig({
      ...defaultCookieConsentConfig,
      acceptAllLabel: "",
    }) ?? "",
    /acceptAllLabel is required/,
  );
  assert.match(
    validateCookieConsentConfig({
      ...defaultCookieConsentConfig,
      essentialOnlyLabel: "",
    }) ?? "",
    /essentialOnlyLabel is required/,
  );
  assert.match(
    validateCookieConsentConfig({
      ...defaultCookieConsentConfig,
      bannerHeading: "x".repeat(81),
    }) ?? "",
    /80 characters or fewer/,
  );
});

test("configuration changes are deterministic for audit fields", () => {
  const next = {
    ...defaultCookieConsentConfig,
    bannerHeading: "YOUR PRIVACY AT ZINGARA",
    consentVersion: 7,
  };
  assert.deepEqual(
    getChangedCookieConsentFields(defaultCookieConsentConfig, next),
    ["bannerHeading", "consentVersion"],
  );
});
