import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createDownloadableTicketPdfBytes,
  type DownloadableTicketPdfInput,
  type TicketPdfRenderCanvas,
  type TicketPdfRenderImage,
} from "./ticketPdf";

const publicAssetPaths = new Map([
  ["/brand/tickets/cape-town-card.png", "brand/tickets/cape-town-card.png"],
  ["/brand/tickets/joburg-card.png", "brand/tickets/joburg-card.png"],
  ["/brand/tickets/zingara-stamp.png", "brand/tickets/zingara-stamp.png"],
]);

const serverTicketFonts = {
  sans: {
    family: "Zingara Ticket Sans",
    path: "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
  },
  serif: {
    family: "Zingara Ticket Serif",
    path: "src/app/fonts/EBGaramond-Medium.ttf",
  },
} as const;

let ticketFontsRegistered = false;

export function ensureServerTicketFonts() {
  if (ticketFontsRegistered) {
    return;
  }

  for (const font of Object.values(serverTicketFonts)) {
    const fontPath = join(process.cwd(), font.path);

    if (
      !GlobalFonts.has(font.family) &&
      !GlobalFonts.register(readFileSync(fontPath), font.family)
    ) {
      throw new Error(`Ticket PDF font could not be loaded: ${font.family}.`);
    }
  }

  ticketFontsRegistered = true;
}

function resolveServerImageSource(source: string) {
  if (source.startsWith("data:image/")) {
    return source;
  }

  const relativePath = publicAssetPaths.get(source);

  if (!relativePath) {
    throw new Error("Ticket artwork source is not approved for server rendering.");
  }

  return join(process.cwd(), "public", relativePath);
}

export function createServerDownloadableTicketPdf(
  input: DownloadableTicketPdfInput,
) {
  ensureServerTicketFonts();

  return createDownloadableTicketPdfBytes(input, {
    createCanvas(width, height) {
      return createCanvas(width, height) as unknown as TicketPdfRenderCanvas;
    },
    fontFamilies: {
      sans: `"${serverTicketFonts.sans.family}"`,
      serif: `"${serverTicketFonts.serif.family}"`,
    },
    async loadImage(source) {
      try {
        return (await loadImage(
          resolveServerImageSource(source),
        )) as unknown as TicketPdfRenderImage;
      } catch {
        return null;
      }
    },
  });
}
