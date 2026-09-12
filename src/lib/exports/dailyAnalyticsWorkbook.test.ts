import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { calculateDailyAnalytics } from "../dailyAnalytics.ts";
import { buildDailyAnalyticsWorkbook } from "./dailyAnalyticsWorkbook.ts";

function report() {
  return calculateDailyAnalytics({
    audits: [],
    bookings: [
      {
        archivedAt: null,
        bookingOrigin: "customer_public",
        bookingReference: "ZNG-WORKBOOK",
        bookingSource: "online",
        createdAt: "2026-09-09T08:00:00+02:00",
        customerCreatedAt: "2026-09-09T07:00:00+02:00",
        customerHasCompleteContact: true,
        customerId: "customer-1",
        customerIsSynthetic: false,
        guestCount: 4,
        id: "booking-1",
        section: "golden-circle",
        showId: "show-1",
        totalAmount: 10_000,
      },
    ],
    communications: 2,
    excludedOtherActivity: 3,
    lifecycleEvents: [],
    payments: [
      {
        amount: 10_000,
        bookingCreatedAt: "2026-09-09T08:00:00+02:00",
        bookingId: "booking-1",
        bookingReference: "ZNG-WORKBOOK",
        createdAt: "2026-09-09T08:05:00+02:00",
        id: "payment-1",
        method: "payfast",
        paymentStatus: "fully_paid",
        paymentType: "full_payment",
        processedAt: "2026-09-09T08:06:00+02:00",
        providerGrossAmount: 10_250,
        transactionFeeAmount: 250,
      },
    ],
    receivedPayments: [],
    reportDate: "2026-09-09",
    shows: [
      {
        date: "2026-10-17",
        id: "show-1",
        name: "The Royal Countess",
        time: "18:00:00",
        venue: "cape-town",
      },
    ],
    tickets: 4,
    walletRegistrations: 1,
  });
}

async function workbookParts() {
  const zip = await JSZip.loadAsync(await buildDailyAnalyticsWorkbook(report()));
  const read = async (path: string) => {
    const file = zip.file(path);
    assert.ok(file, `${path} should exist`);
    return file.async("string");
  };
  return {
    bookings: await read("xl/worksheets/sheet2.xml"),
    contentTypes: await read("[Content_Types].xml"),
    relationships: await read("xl/worksheets/_rels/sheet1.xml.rels"),
    styles: await read("xl/styles.xml"),
    workbook: await read("xl/workbook.xml"),
  };
}

test("Daily Analytics workbook preserves the established five-sheet order", async () => {
  const parts = await workbookParts();
  const names = Array.from(
    parts.workbook.matchAll(/<(?:x:)?sheet name="([^"]+)"/g),
    (match) => match[1],
  );
  assert.deepEqual(names, [
    "EXEC SUMMARY",
    "BOOKINGS",
    "PAYMENTS",
    "SEATING",
    "SHOWS",
  ]);
});

test("Daily Analytics workbook retains template styling, tables, charts, and valid formulas", async () => {
  const parts = await workbookParts();
  assert.match(parts.styles, /<x:cellXfs count="/);
  assert.match(parts.relationships, /drawing/);
  assert.match(parts.contentTypes, /spreadsheetml\.table/);
  assert.match(parts.bookings, /ZNG-WORKBOOK/);
  assert.match(parts.bookings, /COUNTA\(B7:B7\)/);
  assert.doesNotMatch(parts.bookings, /#REF!|#DIV\/0!|#VALUE!|#NAME\?/);
});

test("repeated generation keeps business worksheet XML deterministic", async () => {
  const first = await JSZip.loadAsync(await buildDailyAnalyticsWorkbook(report()));
  const second = await JSZip.loadAsync(await buildDailyAnalyticsWorkbook(report()));
  for (let index = 1; index <= 5; index += 1) {
    const path = `xl/worksheets/sheet${index}.xml`;
    assert.equal(
      await first.file(path)!.async("string"),
      await second.file(path)!.async("string"),
    );
  }
});
