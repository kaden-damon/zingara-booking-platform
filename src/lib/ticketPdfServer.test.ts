import assert from "node:assert/strict";
import { test } from "node:test";

import { createCanvas, loadImage } from "@napi-rs/canvas";

import type { DownloadableTicketPdfInput } from "./ticketPdf";
import { createServerDownloadableTicketPdf } from "./ticketPdfServer";

const canvasSize = { height: 2291, width: 1080 };

function findBytes(haystack: Uint8Array, needle: Uint8Array, from = 0) {
  for (let index = from; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((value, offset) => haystack[index + offset] === value)) {
      return index;
    }
  }
  return -1;
}

function extractTicketJpeg(pdf: Uint8Array) {
  const encoder = new TextEncoder();
  const imageObject = findBytes(pdf, encoder.encode("4 0 obj"));
  const streamMarker = encoder.encode("stream\n");
  const endMarker = encoder.encode("\nendstream");
  const streamStart = findBytes(pdf, streamMarker, imageObject) + streamMarker.length;
  const streamEnd = findBytes(pdf, endMarker, streamStart);

  assert.ok(imageObject >= 0 && streamStart >= streamMarker.length && streamEnd > streamStart);
  return pdf.slice(streamStart, streamEnd);
}

function countLightPixels(
  pixels: Uint8ClampedArray,
  region: { height: number; width: number; x: number; y: number },
) {
  let count = 0;

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const offset = (y * canvasSize.width + x) * 4;

      if (pixels[offset] > 180 && pixels[offset + 1] > 180 && pixels[offset + 2] > 180) {
        count += 1;
      }
    }
  }
  return count;
}

function ticketInput(ticketIndex: number, location: "cape-town" | "johannesburg") {
  return {
    courtName: location === "johannesburg" ? "THE SPRING COURT" : "THE NIGHT COURT",
    guestName: ticketIndex === 1 ? "GEETA MAKKAN" : `GUEST ${ticketIndex}`,
    groundsOpen: "17:00",
    guestSeating: "18:30",
    location,
    secretPassword: null,
    showDate: "19 NOVEMBER 2026",
    showStarts: "19:30",
    tableSeat: "TBC",
    ticketCode: `ZNG-R9XFTN-${String(ticketIndex).padStart(2, "0")}`,
    ticketIndex,
    ticketTotal: 20,
    venueName: location === "johannesburg" ? "MELROSE ARCH" : "CENTURY CITY",
    zoneBackground: "#3B1B52",
    zoneBorder: "#8C62A8",
    zoneTitle: "ROYAL BALCONY",
  } satisfies DownloadableTicketPdfInput;
}

test("server PDF visibly renders ticket details with bundled fonts", async () => {
  for (const input of [ticketInput(15, "johannesburg"), ticketInput(20, "cape-town")]) {
    const pdf = await createServerDownloadableTicketPdf(input);
    const image = await loadImage(extractTicketJpeg(pdf));
    const canvas = createCanvas(canvasSize.width, canvasSize.height);
    const context = canvas.getContext("2d");

    context.drawImage(image, 0, 0, canvasSize.width, canvasSize.height);
    const pixels = context.getImageData(0, 0, canvasSize.width, canvasSize.height).data;

    assert.ok(countLightPixels(pixels, { x: 120, y: 890, width: 840, height: 120 }) > 500);
    assert.ok(countLightPixels(pixels, { x: 150, y: 1080, width: 780, height: 400 }) > 1_000);
    assert.ok(countLightPixels(pixels, { x: 250, y: 2000, width: 580, height: 170 }) > 500);
  }
});

test("server PDF keeps each authoritative ticket code visually unique", async () => {
  const first = await createServerDownloadableTicketPdf(ticketInput(1, "johannesburg"));
  const fifteenth = await createServerDownloadableTicketPdf(ticketInput(15, "johannesburg"));
  const twentieth = await createServerDownloadableTicketPdf(ticketInput(20, "johannesburg"));

  assert.notDeepEqual(extractTicketJpeg(first), extractTicketJpeg(fifteenth));
  assert.notDeepEqual(extractTicketJpeg(fifteenth), extractTicketJpeg(twentieth));
});
