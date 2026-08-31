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

test("Accept All records both optional categories", () => {
  const consent = createConsent(1, { analytics: true, marketing: true });
  assert.equal(consent.analytics, true);
  assert.equal(consent.marketing, true);
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
  assert.match(defaultCookieConsentConfig.essentialDescription, /Required/);
});

test("configuration normalisation strips control characters and limits copy", () => {
  const normalized = normalizeCookieConsentConfig({
    bannerHeading: "  YOUR\u0000 PRIVACY  ",
    footerLinkLabel: "x".repeat(100),
  });
  assert.equal(normalized.bannerHeading, "YOUR  PRIVACY");
  assert.equal(normalized.footerLinkLabel.length, 40);
});

test("configuration validation rejects blank or oversized customer copy", () => {
  assert.match(
    validateCookieConsentConfig({
      ...defaultCookieConsentConfig,
      essentialOnlyLabel: " ",
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
    consentVersion: 2,
  };
  assert.deepEqual(
    getChangedCookieConsentFields(defaultCookieConsentConfig, next),
    ["bannerHeading", "consentVersion"],
  );
});
