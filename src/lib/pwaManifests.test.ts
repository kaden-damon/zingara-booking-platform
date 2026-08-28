import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's built-in TypeScript test runner requires the extension.
import {
  getPublicPwaManifest,
  getStaffPwaManifest,
  publicManifestPath,
  staffManifestPath,
} from "./pwaManifests.ts";

test("preserves the public booking PWA identity and launch destination", () => {
  const manifest = getPublicPwaManifest();

  assert.equal(publicManifestPath, "/manifest.webmanifest");
  assert.equal(manifest.id, "/book");
  assert.equal(manifest.name, "The Royal Countess Zingara");
  assert.equal(manifest.short_name, "Zingara");
  assert.equal(manifest.start_url, "/book");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
});

test("defines a distinct staff PWA identity and Admin launch destination", () => {
  const manifest = getStaffPwaManifest();

  assert.equal(staffManifestPath, "/admin/manifest.webmanifest");
  assert.equal(manifest.id, "/admin");
  assert.equal(manifest.name, "Zingara Staff");
  assert.equal(manifest.short_name, "Zingara Staff");
  assert.equal(manifest.start_url, "/admin/quick-start");
  assert.equal(manifest.scope, "/admin");
  assert.equal(manifest.display, "standalone");
});

test("reuses the public PWA presentation assets for staff", () => {
  const publicManifest = getPublicPwaManifest();
  const staffManifest = getStaffPwaManifest();

  assert.deepEqual(staffManifest.icons, publicManifest.icons);
  assert.equal(staffManifest.background_color, publicManifest.background_color);
  assert.equal(staffManifest.theme_color, publicManifest.theme_color);
  assert.notEqual(staffManifest.id, publicManifest.id);
});
