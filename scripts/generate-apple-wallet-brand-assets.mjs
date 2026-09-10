import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const root = process.cwd();
const outputDirectory = path.join(root, "src/templates/apple-wallet");
const sealPath = path.join(root, "public/brand/tickets/zingara-stamp.png");
const fontPath = path.join(root, "src/app/fonts/EBGaramond-Medium.ttf");

function stripSvg(width, height) {
  const scale = width / 375;
  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="sealAmbient" cx="50%" cy="0%" r="58%">
          <stop offset="0%" stop-color="#d8c36a" stop-opacity="0.18" />
          <stop offset="45%" stop-color="#a78431" stop-opacity="0.055" />
          <stop offset="100%" stop-color="#080806" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#f2d66c" stop-opacity="0.28" />
          <stop offset="8%" stop-color="#d8c36a" stop-opacity="0.04" />
          <stop offset="50%" stop-color="#d8c36a" stop-opacity="0" />
          <stop offset="92%" stop-color="#d8c36a" stop-opacity="0.04" />
          <stop offset="100%" stop-color="#f2d66c" stop-opacity="0.28" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="#080806" />
      <rect width="${width}" height="${height}" fill="url(#sealAmbient)" />
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#edge)" />
      <path d="M 0 ${1.25 * scale} H ${width}" stroke="#f2d66c" stroke-opacity="0.22" stroke-width="${0.75 * scale}" />
      <path d="M ${1.25 * scale} 0 V ${height}" stroke="#f2d66c" stroke-opacity="0.13" stroke-width="${0.75 * scale}" />
      <path d="M ${width - 1.25 * scale} 0 V ${height}" stroke="#f2d66c" stroke-opacity="0.13" stroke-width="${0.75 * scale}" />
    </svg>
  `);
}

async function writeWordmark(name, width, height, fontSize) {
  const scale = height / 50;
  const text = await sharp({
    text: {
      align: "left",
      font: `EB Garamond Medium ${fontSize}`,
      fontfile: fontPath,
      rgba: true,
      text: '<span foreground="#f2d66c">Zingara</span>',
    },
  })
    .png()
    .toBuffer();
  const textMetadata = await sharp(text).metadata();
  const top = Math.max(0, Math.round((height - (textMetadata.height ?? height)) / 2));
  const glow = await sharp(text)
    .blur(Math.max(0.6, 0.9 * scale))
    .png()
    .toBuffer();

  await sharp({
    create: {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      channels: 4,
      height,
      width,
    },
  })
    .composite([
      { input: glow, left: Math.round(3 * scale), top },
      { input: text, left: Math.round(3 * scale), top },
    ])
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputDirectory, name));
}

async function writeStrip(name, width, height, seal) {
  const scale = width / 375;
  const sealSize = Math.round(78 * scale);
  const sealTop = Math.round(-16 * scale);
  const sealImage = await sharp(seal)
    .resize(sealSize, sealSize, { fit: "contain" })
    .png()
    .toBuffer();

  await sharp(stripSvg(width, height))
    .composite([
      {
        input: sealImage,
        left: Math.round((width - sealSize) / 2),
        top: sealTop,
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputDirectory, name));
}

async function writeIcon(name, size, seal) {
  await sharp(seal)
    .resize(size, size, { fit: "contain" })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputDirectory, name));
}

const seal = await readFile(sealPath);

await Promise.all([
  writeIcon("icon@3x.png", 87, seal),
  writeWordmark("logo.png", 160, 50, 37),
  writeWordmark("logo@2x.png", 320, 100, 74),
  writeWordmark("logo@3x.png", 480, 150, 111),
  writeWordmark("primaryLogo.png", 126, 30, 24),
  writeWordmark("primaryLogo@2x.png", 252, 60, 48),
  writeWordmark("primaryLogo@3x.png", 378, 90, 72),
  writeStrip("strip.png", 375, 98, seal),
  writeStrip("strip@2x.png", 750, 196, seal),
  writeStrip("strip@3x.png", 1125, 294, seal),
]);
