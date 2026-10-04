import { createCanvas, loadImage } from "@napi-rs/canvas";
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
  return createDownloadableTicketPdfBytes(input, {
    createCanvas(width, height) {
      return createCanvas(width, height) as unknown as TicketPdfRenderCanvas;
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
