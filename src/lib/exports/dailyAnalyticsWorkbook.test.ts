import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";
import { SaxesParser } from "saxes";
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

function parseXml(source: string, filePath: string) {
  const parser = new SaxesParser({ xmlns: true });
  let parseError: Error | null = null;
  parser.onerror = (error) => {
    parseError = error;
  };
  parser.write(source).close();
  assert.equal(parseError, null, `${filePath} should contain valid XML`);
}

function relationshipOwner(relsPath: string) {
  if (relsPath === "_rels/.rels") return "";
  const directory = path.posix.dirname(path.posix.dirname(relsPath));
  const filename = path.posix.basename(relsPath, ".rels");
  return path.posix.join(directory, filename);
}

function relationshipTarget(owner: string, target: string) {
  if (target.startsWith("/")) return target.slice(1);
  return path.posix.normalize(path.posix.join(path.posix.dirname(owner), target));
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

test("Daily Analytics workbook uses valid Office Open XML content types", async () => {
  const zip = await JSZip.loadAsync(await buildDailyAnalyticsWorkbook(report()));
  const contentTypes = await zip.file("[Content_Types].xml")!.async("string");
  assert.match(
    contentTypes,
    /<Default Extension="xml" ContentType="application\/xml"\s*\/>/,
  );
  assert.match(
    contentTypes,
    /<Override PartName="\/xl\/workbook\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet\.main\+xml"\s*\/>/,
  );
  assert.doesNotMatch(
    contentTypes,
    /<Default Extension="xml" ContentType="application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet\.main\+xml"/,
  );

  const overrides = new Set(
    Array.from(
      contentTypes.matchAll(/<Override PartName="\/([^"]+)"/g),
      (match) => match[1],
    ),
  );
  for (const filePath of Object.keys(zip.files).filter((name) => name.endsWith(".xml"))) {
    assert.ok(
      overrides.has(filePath) || filePath === "[Content_Types].xml",
      `${filePath} should have an explicit content-type override`,
    );
  }
});

test("Daily Analytics workbook XML and relationships are structurally valid", async () => {
  const zip = await JSZip.loadAsync(await buildDailyAnalyticsWorkbook(report()));
  const files = new Set(Object.keys(zip.files).filter((name) => !zip.files[name].dir));

  for (const filePath of files) {
    if (!filePath.endsWith(".xml") && !filePath.endsWith(".rels")) continue;
    const source = await zip.file(filePath)!.async("string");
    parseXml(source, filePath);

    if (!filePath.endsWith(".rels")) continue;
    const ids = Array.from(
      source.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*>/g),
      (match) => match[1],
    );
    assert.equal(new Set(ids).size, ids.length, `${filePath} should have unique relationship IDs`);
    const owner = relationshipOwner(filePath);
    for (const relationship of source.matchAll(/<Relationship\b([^>]*)\/>/g)) {
      if (/TargetMode="External"/.test(relationship[1])) continue;
      const target = relationship[1].match(/Target="([^"]+)"/)?.[1];
      assert.ok(target, `${filePath} relationship should have a target`);
      const resolved = relationshipTarget(owner, target!);
      assert.ok(files.has(resolved), `${filePath} target ${target} should resolve to ${resolved}`);
    }
  }

  assert.equal(
    [...files].filter((name) => /\/charts\/chart\d+\.xml$/.test(name)).length,
    3,
  );
});

test("Daily Analytics worksheet cells are serialized in ascending column order", async () => {
  const zip = await JSZip.loadAsync(await buildDailyAnalyticsWorkbook(report()));
  for (let index = 1; index <= 5; index += 1) {
    const filePath = `xl/worksheets/sheet${index}.xml`;
    const source = await zip.file(filePath)!.async("string");
    for (const rowXml of source.matchAll(/<x:row\b[^>]*>([\s\S]*?)<\/x:row>/g)) {
      const columns = Array.from(
        rowXml[1].matchAll(/<x:c r="([A-Z]+)\d+"/g),
        (match) =>
          [...match[1]].reduce(
            (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
            0,
          ),
      );
      assert.deepEqual(columns, [...columns].sort((left, right) => left - right));
    }
  }
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
