import assert from "node:assert/strict";
import { test } from "node:test";

import JSZip from "jszip";

import { createAllTicketsZip } from "./ticketBulkZipServer";
import type { BulkTicketPdfEntry } from "./ticketBulkZipServer";

function entries(total: number): BulkTicketPdfEntry[] {
  return Array.from({ length: total }, (_, ticketIndex) => {
    const index = ticketIndex + 1;
    const ticketCode = `ZNG-ABC123-${String(index).padStart(2, "0")}`;

    return {
      input: {
        courtName: "THE SPRING COURT",
        guestName: index === 1 ? "Corporate Guest" : `Guest ${index}`,
        groundsOpen: "16:00",
        guestSeating: "16:30",
        location: "johannesburg",
        secretPassword: null,
        showDate: "17 October 2026",
        showStarts: "17:00",
        tableSeat: "Table 501",
        ticketCode,
        ticketIndex: index,
        ticketTotal: total,
        venueName: "MELROSE ARCH",
        zoneBackground: "#4A0D2B",
        zoneBorder: "#8F4B68",
        zoneTitle: "Golden Circle",
      },
      issuedAt: "2026-10-04T10:00:00+02:00",
      ticketCode,
    };
  });
}

test("server ZIP contains one readable PDF per authoritative entry", async () => {
  const bytes = await createAllTicketsZip(entries(2));
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files);

  assert.deepEqual(names, ["ZNG-ABC123-01.pdf", "ZNG-ABC123-02.pdf"]);
  for (const name of names) {
    const pdf = await zip.file(name)!.async("uint8array");

    assert.equal(new TextDecoder().decode(pdf.slice(0, 8)), "%PDF-1.4");
    assert.ok(pdf.byteLength > 10_000);
  }
});

test(
  "105-ticket server ZIP completes without omissions or duplicate filenames",
  { timeout: 120_000 },
  async () => {
    const startedAt = performance.now();
    const bytes = await createAllTicketsZip(entries(105));
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);

    assert.equal(names.length, 105);
    assert.equal(new Set(names).size, 105);
    assert.ok(zip.file("ZNG-ABC123-01.pdf"));
    assert.ok(zip.file("ZNG-ABC123-105.pdf"));
    assert.ok(performance.now() - startedAt < 120_000);
  },
);
