import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

const assetDirectory = path.join(process.cwd(), "src/templates/apple-wallet");

const expectedAssets = {
  "icon.png": [29, 29],
  "icon@2x.png": [58, 58],
  "icon@3x.png": [87, 87],
  "logo.png": [160, 50],
  "logo@2x.png": [320, 100],
  "logo@3x.png": [480, 150],
  "primaryLogo.png": [126, 30],
  "primaryLogo@2x.png": [252, 60],
  "primaryLogo@3x.png": [378, 90],
  "strip.png": [375, 98],
  "strip@2x.png": [750, 196],
  "strip@3x.png": [1125, 294],
} as const;

async function source(pathname: string) {
  return readFile(new URL(pathname, import.meta.url), "utf8");
}

async function averageRegion(
  assetPath: string,
  region: { height: number; left: number; top: number; width: number },
) {
  const { data, info } = await sharp(assetPath).raw().toBuffer({ resolveWithObject: true });
  const totals = [0, 0, 0];
  let pixels = 0;

  for (let y = region.top; y < region.top + region.height; y += 1) {
    for (let x = region.left; x < region.left + region.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      totals[0] += data[offset];
      totals[1] += data[offset + 1];
      totals[2] += data[offset + 2];
      pixels += 1;
    }
  }

  return totals.map((total) => total / pixels);
}

test("Wallet branding assets use native PassKit dimensions and remain compact", async () => {
  let totalBytes = 0;

  for (const [name, [width, height]] of Object.entries(expectedAssets)) {
    const assetPath = path.join(assetDirectory, name);
    const [metadata, file] = await Promise.all([sharp(assetPath).metadata(), stat(assetPath)]);
    assert.equal(metadata.format, "png", `${name} must be a PNG`);
    assert.equal(metadata.width, width, `${name} width`);
    assert.equal(metadata.height, height, `${name} height`);
    totalBytes += file.size;
  }

  assert.ok(totalBytes < 500_000, `Wallet artwork is unexpectedly large: ${totalBytes} bytes`);
});

test("strip artwork stays dark with a centred gold seal and restrained edge light", async () => {
  const stripPath = path.join(assetDirectory, "strip@2x.png");
  const stats = await sharp(stripPath).stats();
  const averageRgb = stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3;
  assert.ok(averageRgb < 45, `strip is not predominantly dark: ${averageRgb}`);

  const center = await averageRegion(stripPath, { left: 310, top: 0, width: 130, height: 120 });
  const outer = await averageRegion(stripPath, { left: 40, top: 0, width: 130, height: 120 });
  const centerLight = center.reduce((sum, channel) => sum + channel, 0);
  const outerLight = outer.reduce((sum, channel) => sum + channel, 0);
  assert.ok(centerLight > outerLight * 2.5, "gold seal is not the centred upper visual anchor");

  const topEdge = await averageRegion(stripPath, { left: 0, top: 0, width: 750, height: 4 });
  const body = await averageRegion(stripPath, { left: 0, top: 150, width: 750, height: 40 });
  assert.ok(topEdge[0] > body[0], "upper gold edge treatment is missing");
});

test("Wallet generator uses the branded image slots without duplicate native text", async () => {
  const wallet = await source("./appleWalletPass.ts");
  const generator = await source("../../scripts/generate-apple-wallet-brand-assets.mjs");

  for (const name of Object.keys(expectedAssets)) {
    assert.match(wallet, new RegExp(`"${name.replaceAll(".", "\\.")}"`));
  }
  assert.doesNotMatch(wallet, /logoText\s*:/);
  assert.match(generator, /EBGaramond-Medium\.ttf/);
  assert.match(generator, /public\/brand\/tickets\/zingara-stamp\.png/);
});

test("Wallet pass identity, update service and QR source remain unchanged", async () => {
  const wallet = await source("./appleWalletPass.ts");
  assert.match(wallet, /passTypeIdentifier: signing\.passTypeIdentifier/);
  assert.match(wallet, /serialNumber: source\.ticket\.id/);
  assert.match(wallet, /authenticationToken/);
  assert.match(wallet, /webServiceURL/);
  assert.match(wallet, /format: "PKBarcodeFormatQR"/);
  assert.match(wallet, /message: source\.ticket\.qr_payload/);
  assert.match(wallet, /pass\.setRelevantDate\(performance\.value\)/);
});
