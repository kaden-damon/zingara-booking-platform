import ExcelJS from "exceljs";
import { PDFParse } from "pdf-parse";
import {
  parseDelimitedRows,
  recordsFromRows,
  snapshotFromRecords,
  type DineplanSnapshot,
} from "./dineplanReconciliation.ts";

export const dineplanMaximumFileSize = 10 * 1024 * 1024;
const allowedExtensions = new Set(["csv", "pdf", "xlsx"]);

function extensionOf(filename: string) {
  return filename.toLowerCase().split(".").pop() ?? "";
}

function detectVenue(text: string) {
  if (/cape\s*town|(?:^|[^a-z])cpt(?:[^a-z]|$)/i.test(text)) return "cape-town" as const;
  if (/johannesburg|(?:^|[^a-z])(?:joburg|jhb)(?:[^a-z]|$)/i.test(text)) return "johannesburg" as const;
  return null;
}

function parseGeneratedAt(text: string) {
  const match = text.match(
    /(?:generated|printed|created)(?:\s+(?:at|on))?\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})(?:\s+(\d{1,2}:\d{2}))?/i,
  );
  if (!match) return null;
  const [day, month, rawYear] = match[1].split(/[\/-]/);
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  const time = match[2] ?? "00:00";
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${time}:00+02:00`;
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
  const dateMatch = text.match(/(?:show|report|booking)?\s*date\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i);
  if (dateMatch) records.forEach((record) => { record["Booking Date"] ||= dateMatch[1]; });
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
  if (extension === "pdf") {
    if (!input.bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error("The selected file is not a valid PDF.");
    }
    if (input.extractPdfText) {
      evidenceText = await input.extractPdfText(input.bytes);
    } else {
      const parser = new PDFParse({ data: input.bytes });
      try {
        evidenceText = (await parser.getText()).text;
      } finally {
        await parser.destroy();
      }
    }
    generatedAt = parseGeneratedAt(evidenceText);
    records = parseDineplanPdfText(evidenceText);
  } else if (extension === "csv") {
    evidenceText = input.bytes.toString("utf8");
    if (evidenceText.includes("\u0000")) throw new Error("The CSV contains unsupported binary content.");
    records = recordsFromRows(parseDelimitedRows(evidenceText));
  } else {
    if (!input.bytes.subarray(0, 2).equals(Buffer.from("PK"))) {
      throw new Error("The selected file is not a valid XLSX workbook.");
    }
    const rows = await rowsFromWorkbook(input.bytes);
    records = recordsFromRows(rows);
    evidenceText = rows.slice(0, 12).flat().join(" ");
  }
  return snapshotFromRecords({
    bytes: input.bytes,
    generatedAt,
    records,
    venue: detectVenue(`${input.filename} ${evidenceText}`),
  });
}
