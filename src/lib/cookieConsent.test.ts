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

test("simplified acknowledgement records Essential only", () => {
  const consent = createConsent(1, { analytics: false, marketing: false });
  assert.equal(consent.essential, true);
  assert.equal(consent.analytics, false);
  assert.equal(consent.marketing, false);
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

test("existing explicit optional consent remains valid without a version bump", () => {
  const existing = createConsent(1, { analytics: true, marketing: false });
  assert.equal(
    isConsentCurrent(existing, defaultCookieConsentConfig.consentVersion),
    true,
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
  assert.equal(defaultCookieConsentConfig.consentVersion, 1);
  assert.equal(defaultCookieConsentConfig.acceptAllLabel, "OKAY");
  assert.match(defaultCookieConsentConfig.essentialDescription, /Required/);
});

test("legacy Accept All label is safely presented as acknowledgement", () => {
  const normalized = normalizeCookieConsentConfig({
    ...defaultCookieConsentConfig,
    acceptAllLabel: "ACCEPT ALL",
  });
  assert.equal(normalized.acceptAllLabel, "OKAY");
});

test("configuration normalisation strips control characters and limits copy", () => {
  const normalized = normalizeCookieConsentConfig({
    bannerHeading: "  YOUR\u0000 PRIVACY  ",
    footerLinkLabel: "x".repeat(100),
  });
  assert.equal(normalized.bannerHeading, "YOUR  PRIVACY");
  assert.equal(normalized.footerLinkLabel.length, 40);
});

test("configuration permits blank hidden fields and optional heading", () => {
  const config = {
    ...defaultCookieConsentConfig,
    bannerHeading: "",
    essentialOnlyLabel: "",
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
      bannerHeading: "x".repeat(81),
    }) ?? "",
    /80 characters or fewer/,
  );
});

test("configuration changes are deterministic for audit fields", () => {
  const next = {
    ...defaultCookieConsentConfig,
    bannerHeading: "YOUR PRIVACY AT ZINGARA",
    consentVersion: 2,
  };
  assert.deepEqual(
    getChangedCookieConsentFields(defaultCookieConsentConfig, next),
    ["bannerHeading", "consentVersion"],
  );
});
