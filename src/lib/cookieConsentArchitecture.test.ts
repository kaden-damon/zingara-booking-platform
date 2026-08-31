import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("System has concise Operations, Issues and Preferences destinations", async () => {
  const admin = await source("../app/admin/page.tsx");
  assert.match(admin, /type SystemTab = "issues" \| "operations" \| "preferences"/);
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
  assert.match(preview, /onAcknowledge=\{\(\) => undefined\}/);
});

test("public notice is simplified, absent from Admin and exposes Cookie Policy", async () => {
  const publicConsent = await source("../app/components/PublicCookieConsent.tsx");
  const panel = await source("../app/components/CookieConsentPanel.tsx");
  assert.match(publicConsent, /pathname\.startsWith\("\/admin"\)/);
  assert.match(publicConsent, /analytics: false/);
  assert.match(publicConsent, /marketing: false/);
  assert.doesNotMatch(publicConsent, /footerLinkLabel|openPreferences/);
  assert.doesNotMatch(panel, /ACCEPT ALL|ESSENTIAL ONLY|MANAGE PREFERENCES/);
  assert.match(panel, /onAcknowledge/);
  assert.match(panel, /\/royal-decrees\/cookie-policy/);
});

test("Legal Centre cross-references Cookie and Privacy policies", async () => {
  const legal = await source("./royalDecrees.ts");
  assert.match(legal, /slug: "cookie-policy"/);
  assert.match(legal, /including the Privacy Policy and Cookie Policy/);
  assert.match(legal, /The Cookie Policy explains the categories/);
  assert.match(legal, /Selecting OKAY acknowledges the notice/);
  assert.doesNotMatch(legal, /Google Analytics is active|Meta Pixel is active/);
});

test("public runtime contains no GA4 or Meta Pixel integration", async () => {
  const layout = await source("../app/layout.tsx");
  const consent = await source("../app/components/PublicCookieConsent.tsx");
  assert.doesNotMatch(`${layout}\n${consent}`, /gtag\(|googletagmanager|fbq\(|connect\.facebook/);
});
