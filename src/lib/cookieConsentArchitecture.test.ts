import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("System has concise Operations, Issues and Preferences destinations", async () => {
  const admin = await source("../app/admin/page.tsx");
  assert.match(admin, /type SystemTab = "dineplan" \| "issues" \| "operations" \| "preferences"/);
  assert.match(admin, /aria-label="System sections"/);
  assert.match(admin, /activeSystemTab === "preferences"/);
});

test("Cookie configuration mutation is authenticated and Super Admin-only", async () => {
  const route = await source(
    "../app/api/admin/system-preferences/cookie-consent/route.ts",
  );
  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /isSuperAdminProfile\(auth\.staffProfile\)/);
  assert.match(route, /save_platform_preference_atomic/);
});

test("Admin preview is isolated and uses the simplified notice", async () => {
  const preview = await source("../app/admin/CookiePrivacyPreferences.tsx");
  assert.doesNotMatch(preview, /updateConsent|localStorage/);
  assert.match(preview, /Preview · No consent is saved/);
  assert.match(preview, /onAcceptAll=\{\(\) => undefined\}/);
  assert.match(preview, /onEssentialOnly=\{\(\) => undefined\}/);
});

test("public notice is absent from Admin and optional analytics requires an explicit choice", async () => {
  const publicConsent = await source("../app/components/PublicCookieConsent.tsx");
  const panel = await source("../app/components/CookieConsentPanel.tsx");
  assert.match(publicConsent, /pathname\.startsWith\("\/admin"\)/);
  assert.match(publicConsent, /analytics: false/);
  assert.match(publicConsent, /marketing: false/);
  assert.match(publicConsent, /analytics: true/);
  assert.match(publicConsent, /marketing: true/);
  assert.match(publicConsent, /onAcceptAll/);
  assert.match(publicConsent, /onEssentialOnly/);
  assert.match(publicConsent, /footerLinkLabel/);
  assert.match(publicConsent, /setIsVisible\(true\)/);
  assert.match(panel, /config\.acceptAllLabel/);
  assert.match(panel, /config\.essentialOnlyLabel/);
  assert.doesNotMatch(panel, /type="checkbox"|managePreferencesLabel|onSavePreferences/);
  assert.match(panel, /\/royal-decrees\/cookie-policy/);
});

test("Legal Centre cross-references Cookie and Privacy policies", async () => {
  const legal = await source("./royalDecrees.ts");
  assert.match(legal, /slug: "cookie-policy"/);
  assert.match(legal, /including the Privacy Policy and Cookie Policy/);
  assert.match(legal, /Cookie Policy explains how the saved choice can be changed/);
  assert.match(legal, /Selecting Accept All permits optional Analytics and Marketing/);
  assert.match(legal, /Selecting Essential Only keeps both optional categories off/);
  assert.match(legal, /Advertising purchase measurement remains disabled/);
  assert.doesNotMatch(legal, /Google Analytics is active|Meta Pixel is active/);
});

test("public advertising runtime is isolated behind explicit consent", async () => {
  const layout = await source("../app/layout.tsx");
  const tracking = await source("./advertisingTracking.ts");
  assert.match(layout, /PublicAdvertisingTracking/);
  assert.match(tracking, /ad_storage: "denied"/);
  assert.match(tracking, /analytics_storage: "denied"/);
  assert.match(tracking, /dataLayer\?\.push\(arguments\)/);
  assert.doesNotMatch(tracking, /dataLayer\?\.push\(args\)/);
  assert.match(tracking, /if \(consent\.analytics \|\| consent\.marketing\)/);
  assert.match(tracking, /if \(consent\.marketing\)/);
  assert.match(tracking, /window\.fbq\?\.\("consent", "revoke"\)/);
});
