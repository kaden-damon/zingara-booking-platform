import ExcelJS from "exceljs";
import {
  parseDelimitedRows,
  recordsFromRows,
  snapshotFromRecords,
  type DineplanSnapshot,
} from "./dineplanReconciliation.ts";

export const dineplanMaximumFileSize = 10 * 1024 * 1024;
const allowedExtensions = new Set(["csv", "pdf", "xlsx"]);

async function loadPdfParser() {
  const { getData } = await import("pdf-parse/worker");
  const pdfParser = await import("pdf-parse");
  pdfParser.PDFParse.setWorker(getData());
  return pdfParser;
}

function extensionOf(filename: string) {
  return filename.toLowerCase().split(".").pop() ?? "";
}

function detectVenue(text: string) {
  if (/cape\s*town|(?:^|[^a-z])cpt(?:[^a-z]|$)/i.test(text)) return "cape-town" as const;
  if (/johannesburg|(?:^|[^a-z])(?:joburg|jhb)(?:[^a-z]|$)/i.test(text)) return "johannesburg" as const;
  return null;
}

const dineplanMonths: Record<string, string> = {
  april: "04",
  august: "08",
  december: "12",
  february: "02",
  january: "01",
  july: "07",
  june: "06",
  march: "03",
  may: "05",
  november: "11",
  october: "10",
  september: "09",
};

function validIsoDate(year: string, month: string, day: string) {
  const normalized = `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : null;
}

function parseDineplanDate(value: string) {
  const iso = value.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return validIsoDate(iso[1], iso[2], iso[3]);

  const local = value.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (local) {
    const year = local[3].length === 2 ? `20${local[3]}` : local[3];
    return validIsoDate(year, local[2], local[1]);
  }

  const textual = value.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i,
  );
  if (!textual) return null;
  return validIsoDate(textual[3], dineplanMonths[textual[2].toLowerCase()], textual[1]);
}

function performanceDateFromPdfContent(text: string) {
  const labelled = text.match(
    /(?:show|report|booking)?\s*date\s*[:\-]?\s*([^\n\r]+)/i,
  );
  const bookingHeader = text.match(/\bBOOKINGS\s*\(([^)]+)\)/i);
  const title = text.match(/Dineplan\s+Bookings\s*:\s*([^\n\r]+)/i);
  const printList = text.match(/\/printlist\/(\d{4}-\d{1,2}-\d{1,2})\b/i);
  return (
    parseDineplanDate(labelled?.[1] ?? "") ??
    parseDineplanDate(bookingHeader?.[1] ?? "") ??
    parseDineplanDate(title?.[1] ?? "") ??
    parseDineplanDate(printList?.[1] ?? "")
  );
}

function recognizedPdfFilenameMetadata(filename: string) {
  const match = filename.match(
    /^Dineplan\s+Bookings[_:]\s*(.+?)\s+-\s+Zingara\s+(JHB|Johannesburg|CPT|Cape\s+Town)\b.*\.pdf$/i,
  );
  if (!match) return null;
  return {
    performanceDate: parseDineplanDate(match[1]),
    venue: detectVenue(match[2]),
  };
}

function formatSastTimestamp(date: string, rawTime: string, meridiem?: string) {
  const time = rawTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!time) return null;
  let hour = Number(time[1]);
  const minute = Number(time[2]);
  if (minute > 59 || hour > (meridiem ? 12 : 23)) return null;
  if (meridiem) {
    if (hour === 12) hour = 0;
    if (meridiem.toLowerCase() === "pm") hour += 12;
  }
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+02:00`;
}

function parseGeneratedAt(text: string) {
  const match = text.match(
    /(?:generated|printed|created)(?:\s+(?:at|on))?\s*[:\-]?\s*((?:\d{4}-\d{1,2}-\d{1,2})|(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})|(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}))(?:[\s,]+(?:at\s*)?)(\d{1,2}:\d{2})(?:\s*(am|pm))?/i,
  );
  if (!match) return null;
  const date = parseDineplanDate(match[1]);
  return date ? formatSastTimestamp(date, match[2], match[3]) : null;
}

export function parseDineplanPdfText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00a0/g, " ").trimEnd())
    .filter((line) => line.trim());
  const headerIndex = lines.findIndex(
    (line) => /\b(time)\b/i.test(line) && /\b(pax|covers)\b/i.test(line) && /\b(guest|customer)\b/i.test(line),
  );
  if (headerIndex < 0) {
    throw new Error("The Dineplan PDF reservation columns could not be detected.");
  }
  const header = lines[headerIndex];
  const labels = ["Time", /Pax|Covers/i.test(header) ? (header.match(/Pax|Covers/i)?.[0] ?? "Pax") : "Pax", "Guest", "Payment", "Notes", "Telephone", "Seating", "Table"];
  const indexes = labels.map((label) => {
    const match = header.match(new RegExp(`\\b${String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"));
    return match?.index ?? -1;
  });
  const records: Record<string, string>[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (/^(reservations|covers|total|generated|page)\b/i.test(line.trim())) continue;
    const startsReservation = /^\s*\d{1,2}:\d{2}\b/.test(line);
    if (!startsReservation) {
      if (records.length) records[records.length - 1].Notes = `${records[records.length - 1].Notes ?? ""} ${line.trim()}`.trim();
      continue;
    }
    const record: Record<string, string> = {};
    const usable = indexes
      .map((start, index) => ({ label: labels[index], start }))
      .filter((entry) => entry.start >= 0)
      .sort((left, right) => left.start - right.start);
    for (let index = 0; index < usable.length; index += 1) {
      const current = usable[index];
      const end = usable[index + 1]?.start;
      record[current.label] = line.slice(current.start, end).trim();
    }
    records.push(record);
  }
  if (!records.length) {
    throw new Error("No Dineplan reservations were found in the PDF.");
  }
  const performanceDate = performanceDateFromPdfContent(text);
  if (performanceDate) {
    records.forEach((record) => {
      record["Booking Date"] ||= performanceDate;
    });
  }
  return records;
}

async function rowsFromWorkbook(bytes: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("The workbook does not contain a worksheet.");
  const rows: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push(values.map((value: ExcelJS.CellValue) => {
      if (value instanceof Date) return value.toISOString();
      if (value && typeof value === "object" && "text" in value) return String(value.text ?? "");
      if (value && typeof value === "object" && "result" in value) return String(value.result ?? "");
      return String(value ?? "");
    }));
  });
  return rows;
}

export async function parseDineplanFile(input: {
  bytes: Buffer;
  extractPdfText?: (bytes: Buffer) => Promise<string>;
  filename: string;
  mimeType: string;
}): Promise<DineplanSnapshot> {
  if (!input.bytes.length || input.bytes.length > dineplanMaximumFileSize) {
    throw new Error("Upload a Dineplan export smaller than 10 MB.");
  }
  const extension = extensionOf(input.filename);
  if (!allowedExtensions.has(extension)) {
    throw new Error("Upload a PDF, CSV or XLSX Dineplan export. Legacy XLS files must first be saved as XLSX.");
  }
  let records: Record<string, string>[];
  let generatedAt: string | null = null;
  let evidenceText = "";
  let venue: "cape-town" | "johannesburg" | null = null;
  if (extension === "pdf") {
    if (!input.bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error("The selected file is not a valid PDF.");
    }
    if (input.extractPdfText) {
      evidenceText = await input.extractPdfText(input.bytes);
    } else {
      const { PDFParse } = await loadPdfParser();
      const parser = new PDFParse({ data: input.bytes });
      try {
        evidenceText = (await parser.getText()).text;
      } finally {
        await parser.destroy();
      }
    }
    generatedAt = parseGeneratedAt(evidenceText);
    records = parseDineplanPdfText(evidenceText);
    const filenameMetadata = recognizedPdfFilenameMetadata(input.filename);
    const contentDate = performanceDateFromPdfContent(evidenceText);
    const fallbackDate = contentDate ? null : filenameMetadata?.performanceDate;
    if (fallbackDate) {
      records.forEach((record) => {
        record["Booking Date"] ||= fallbackDate;
      });
    }
    venue = detectVenue(evidenceText) ?? filenameMetadata?.venue ?? null;
  } else if (extension === "csv") {
    evidenceText = input.bytes.toString("utf8");
    if (evidenceText.includes("\u0000")) throw new Error("The CSV contains unsupported binary content.");
    records = recordsFromRows(parseDelimitedRows(evidenceText));
    venue = detectVenue(`${input.filename} ${evidenceText}`);
  } else {
    if (!input.bytes.subarray(0, 2).equals(Buffer.from("PK"))) {
      throw new Error("The selected file is not a valid XLSX workbook.");
    }
    const rows = await rowsFromWorkbook(input.bytes);
    records = recordsFromRows(rows);
    evidenceText = rows.slice(0, 12).flat().join(" ");
    venue = detectVenue(`${input.filename} ${evidenceText}`);
  }
  return snapshotFromRecords({
    bytes: input.bytes,
    generatedAt,
    records,
    venue,
  });
}
