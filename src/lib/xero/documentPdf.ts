import { zingaraDocumentLogo } from "./documentPdfLogo.ts";
import type { XeroCalculatedLine, XeroLineAmountType } from "./documentMath";

export type XeroPdfDocument = {
  accountNumber: string | null;
  billingAddress: string | null;
  customerEmail: string | null;
  customerName: string;
  customerNotes: string | null;
  documentDate: string;
  guestCount: number | null;
  kind: "invoice" | "quote";
  lineAmountType: XeroLineAmountType;
  lines: XeroCalculatedLine[];
  localReference: string;
  paymentTerms: string | null;
  performanceDate: string | null;
  performanceTime: string | null;
  seatingSummary: string | null;
  sourceBookingReference: string | null;
  status: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  validUntil: string | null;
  venue: string;
  xeroDocumentNumber: string | null;
};

type Align = "left" | "center" | "right";
type PdfPage = { content: string; height: number; width: number };
const BLACK = "0 0 0";
const GREY = "0.82 0.82 0.82";
const LIGHT_GREY = "0.90 0.90 0.90";

function ascii(value: string) {
  return value.normalize("NFKD").replace(/[^\x20-\x7E\n]/g, " ")
    .replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function plain(value: string) {
  return value.normalize("NFKD").replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function textWidth(value: string, size: number, bold = false) {
  return plain(value).length * size * (bold ? 0.55 : 0.51);
}

function wrap(value: string, width: number, size: number, bold = false) {
  const result: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    const words = plain(paragraph).split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || textWidth(candidate, size, bold) <= width) line = candidate;
      else { result.push(line); line = word; }
    }
    result.push(line || "-");
  }
  return result;
}

class Canvas {
  content = "";
  readonly height: number;
  readonly width: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  text(value: string, x: number, y: number, options: {
    align?: Align; bold?: boolean; color?: string; size?: number;
  } = {}) {
    const size = options.size ?? 9;
    const bold = options.bold ?? false;
    const measured = textWidth(value, size, bold);
    const tx = options.align === "center" ? x - measured / 2 : options.align === "right" ? x - measured : x;
    this.content += `${options.color ?? BLACK} rg BT /${bold ? "F2" : "F1"} ${size} Tf ${tx.toFixed(2)} ${y.toFixed(2)} Td (${ascii(value)}) Tj ET\n`;
  }

  textLines(lines: string[], x: number, y: number, options: {
    align?: Align; bold?: boolean; color?: string; leading?: number; size?: number;
  } = {}) {
    const leading = options.leading ?? (options.size ?? 9) * 1.3;
    lines.forEach((line, index) => this.text(line, x, y - index * leading, options));
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.7, color = BLACK) {
    this.content += `${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`;
  }

  rect(x: number, y: number, width: number, height: number, color: string) {
    this.content += `${color} rg ${x} ${y} ${width} ${height} re f\n`;
  }

  logo(x: number, y: number, width: number, height: number) {
    this.content += `q ${width} 0 0 ${height} ${x} ${y} cm /Logo Do Q\n`;
  }
}

function formatDate(value: string | null) {
  if (!value) return "Not set";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return plain(value);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
}

function money(cents: number) {
  const sign = cents < 0 ? "-" : "";
  return `${sign}${(Math.abs(cents) / 100).toLocaleString("en-ZA", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function quantity(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("en-ZA", { maximumFractionDigits: 4, minimumFractionDigits: parsed % 1 ? 2 : 0 })
    : value;
}

function unitPrice(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("en-ZA", { maximumFractionDigits: 4, minimumFractionDigits: 2 })
    : value;
}

function venueLabel(value: string) {
  return value === "johannesburg" ? "Johannesburg" : "Cape Town";
}

function addPageNumber(page: Canvas, index: number, count: number, margin: number) {
  page.text(`Page ${index + 1} of ${count}`, page.width / 2, 25, { align: "center", size: 7.5 });
  page.text("Zingara Productions (Pty) Ltd | 2025/603851/07", margin, 25, { size: 7.5 });
}

function quoteHeader(page: Canvas, continued = false) {
  page.logo(205, 694, 185, 109);
  page.text(continued ? "COST ESTIMATE QUOTE - CONTINUED" : "COST ESTIMATE QUOTE", page.width / 2, 665, {
    align: "center", bold: true, size: continued ? 13 : 15,
  });
}

function quoteTableHeader(page: Canvas, y: number) {
  page.rect(52, y - 3, 491, 16, GREY);
  page.text("Description", 55, y + 1, { bold: true, size: 8.5 });
  page.text("Units", 350, y + 1, { align: "right", bold: true, size: 8.5 });
  page.text("Unit Price", 442, y + 1, { align: "right", bold: true, size: 8.5 });
  page.text("Total", 535, y + 1, { align: "right", bold: true, size: 8.5 });
}

function quoteIdentity(page: Canvas, document: XeroPdfDocument) {
  const left = [
    `Guest / Company: ${document.customerName}`,
    `Email: ${document.customerEmail || "Not recorded"}`,
    "",
    `Seating: ${document.seatingSummary || "Not recorded"}`,
    `Pax: ${document.guestCount === null ? "Not recorded" : `${document.guestCount}-pax`}`,
    document.performanceDate
      ? `${formatDate(document.performanceDate)}${document.performanceTime ? ` at ${document.performanceTime}` : ""} | ${venueLabel(document.venue)}`
      : venueLabel(document.venue),
  ];
  page.textLines(left, 53, 575, { leading: 13, size: 9 });
  const reference = document.sourceBookingReference || document.customerName;
  page.text("Quote:", 420, 575, { align: "right", size: 9 });
  page.text(document.localReference, 539, 575, { align: "right", size: 9 });
  page.text("Date:", 420, 561, { align: "right", size: 9 });
  page.text(formatDate(document.documentDate), 539, 561, { align: "right", size: 9 });
  page.text("Reference:", 420, 547, { align: "right", size: 9 });
  page.textLines(wrap(reference, 108, 8.2).slice(0, 2), 539, 547, {
    align: "right", leading: 10, size: 8.2,
  });
  page.text("Valid until:", 420, 520, { align: "right", size: 9 });
  page.text(formatDate(document.validUntil), 539, 520, { align: "right", size: 9 });
}

function drawQuote(document: XeroPdfDocument) {
  const pages: Canvas[] = [];
  let page = new Canvas(595, 842);
  pages.push(page);
  quoteHeader(page);
  quoteIdentity(page, document);
  let y = 493;
  quoteTableHeader(page, y);
  y -= 24;
  for (const line of document.lines) {
    const description = wrap(line.description, 270, 9);
    const rowHeight = Math.max(19, description.length * 12 + 5);
    if (y - rowHeight < 185) {
      page = new Canvas(595, 842); pages.push(page); quoteHeader(page, true);
      y = 640; quoteTableHeader(page, y); y -= 24;
    }
    page.textLines(description, 55, y, { leading: 11, size: 9 });
    page.text(quantity(line.quantity), 350, y, { align: "right", size: 9 });
    page.text("R", 374, y, { size: 9 });
    page.text(unitPrice(line.unitPrice), 442, y, { align: "right", size: 9 });
    page.text("R", 466, y, { size: 9 });
    page.text(money(line.totalCents), 535, y, { align: "right", size: 9 });
    y -= rowHeight;
  }
  if (y < 172) {
    page = new Canvas(595, 842); pages.push(page); quoteHeader(page, true); y = 625;
  }
  page.line(450, y + 8, 539, y + 8, 1.4);
  [
    ["SUB-TOTAL", money(document.subtotalCents), -2],
    ["VAT", document.taxCents ? money(document.taxCents) : "-", -17],
  ].forEach(([label, value, offset]) => {
    page.text(String(label), 445, y + Number(offset), { align: "right", bold: true, size: 9 });
    page.text("R", 461, y + Number(offset), { size: 9 });
    page.text(String(value), 535, y + Number(offset), { align: "right", bold: true, size: 9 });
  });
  page.line(450, y - 23, 539, y - 23, 0.8);
  page.text("TOTAL", 445, y - 33, { align: "right", bold: true, size: 9 });
  page.text("R", 461, y - 33, { size: 9 });
  page.text(money(document.totalCents), 535, y - 33, { align: "right", bold: true, size: 9 });
  page.line(450, y - 39, 539, y - 39, 1.4);
  const terms = [
    document.paymentTerms || "Payment and confirmation remain subject to the accepted quotation and Zingara's current Payment Terms.",
    document.customerNotes || "Current Booking Terms and the Booking & Cancellation Policy apply.",
  ].join(" ");
  page.textLines(wrap(terms, 485, 7.8).slice(0, 5), page.width / 2, Math.min(y - 70, 105), {
    align: "center", leading: 10, size: 7.8,
  });
  pages.forEach((item, index) => addPageNumber(item, index, pages.length, 52));
  return pages.map((item) => ({ content: item.content, height: item.height, width: item.width }));
}

function invoiceLogo(page: Canvas) { page.logo(205, 664, 202, 106); }

function invoiceTableHeader(page: Canvas, y: number) {
  page.text("Description", 55, y, { bold: true, size: 8.5 });
  page.text("Quantity", 333, y, { align: "right", bold: true, size: 8.5 });
  page.text("Unit Price", 424, y, { align: "right", bold: true, size: 8.5 });
  page.text("VAT", 485, y, { align: "center", bold: true, size: 8.5 });
  page.text("Amount ZAR", 558, y, { align: "right", bold: true, size: 8.5 });
  page.line(55, y - 6, 558, y - 6, 1.1);
}

function invoiceIdentity(page: Canvas, document: XeroPdfDocument) {
  page.text(document.xeroDocumentNumber ? "TAX INVOICE" : "TAX INVOICE DRAFT", 55, 610, { size: 19 });
  const customerName = wrap(document.customerName, 180, 8.7, true);
  const customerDetails = [
    ...wrap(document.billingAddress || "Billing address not recorded", 180, 8.2),
    document.customerEmail || "Billing email not recorded",
  ];
  page.textLines(customerName, 67, 580, { bold: true, leading: 11, size: 8.7 });
  page.textLines(customerDetails, 67, 580 - customerName.length * 11 - 2, { leading: 11, size: 8.2 });
  [
    ["Invoice Date", formatDate(document.documentDate)],
    ["Account Number", document.accountNumber || "Awaiting Accounts"],
    ["Invoice Number", document.xeroDocumentNumber || "Awaiting Xero"],
    ["Reference", document.sourceBookingReference || document.localReference],
  ].forEach(([label, value], index) => {
    const y = 607 - index * 37;
    page.text(label, 285, y, { bold: true, size: 8.5 });
    page.text(value, 285, y - 12, { size: 8.5 });
  });
  page.textLines([
    "Zingara Productions (Pty) Ltd", "", "22 Tiverton Road", "Plumstead", "Cape Town", "",
    "Registration Number:", "2025/603851/07", "", "Office Number: 021 891 0448", "",
    "VAT Number", "4450323193",
  ], 438, 607, { leading: 12, size: 8.5 });
}

function invoiceContinuation(page: Canvas, document: XeroPdfDocument) {
  page.text("TAX INVOICE - CONTINUED", 55, 730, { size: 15 });
  page.text(document.xeroDocumentNumber || document.localReference, 558, 730, { align: "right", bold: true, size: 9 });
}

function drawInvoice(document: XeroPdfDocument) {
  const pages: Canvas[] = [];
  let page = new Canvas(612, 792);
  pages.push(page); invoiceLogo(page); invoiceIdentity(page, document);
  let y = 446; invoiceTableHeader(page, y); y -= 22;
  for (const line of document.lines) {
    const description = wrap(line.description, 225, 8.5);
    const rowHeight = Math.max(20, description.length * 11 + 7);
    if (y - rowHeight < 180) {
      page = new Canvas(612, 792); pages.push(page); invoiceContinuation(page, document);
      y = 690; invoiceTableHeader(page, y); y -= 22;
    }
    page.textLines(description, 55, y, { leading: 10.5, size: 8.5 });
    page.text(quantity(line.quantity), 333, y, { align: "right", size: 8.5 });
    page.text(unitPrice(line.unitPrice), 424, y, { align: "right", size: 8.5 });
    page.text(line.taxCents ? `${line.taxRatePercent || "0"}%` : "No VAT", 485, y, { align: "center", size: 8.5 });
    page.text(money(line.subtotalCents), 558, y, { align: "right", size: 8.5 });
    page.line(55, y - rowHeight + 5, 558, y - rowHeight + 5, 0.35, LIGHT_GREY);
    y -= rowHeight;
  }
  if (y < 180) {
    page = new Canvas(612, 792); pages.push(page); invoiceContinuation(page, document); y = 660;
  }
  page.text("Subtotal", 475, y - 3, { align: "right", size: 8.5 });
  page.text(money(document.subtotalCents), 558, y - 3, { align: "right", size: 8.5 });
  page.text(document.lineAmountType === "no-tax" ? "Total No VAT 0%" : "Total Standard Rate Sales 15%", 475, y - 20, { align: "right", size: 8.5 });
  page.text(money(document.taxCents), 558, y - 20, { align: "right", size: 8.5 });
  page.line(300, y - 28, 558, y - 28, 0.7);
  page.text("Invoice Total ZAR", 475, y - 40, { align: "right", size: 8.5 });
  page.text(money(document.totalCents), 558, y - 40, { align: "right", size: 8.5 });
  page.text("Total Net Payments ZAR", 475, y - 57, { align: "right", size: 8.5 });
  page.text("Review verified payments", 558, y - 68, { align: "right", size: 7.4 });
  page.line(300, y - 76, 558, y - 76, 1);
  page.text("Amount Due ZAR", 475, y - 89, { align: "right", bold: true, size: 8.5 });
  page.text("Awaiting Accounts", 558, y - 89, { align: "right", bold: true, size: 7.6 });
  const bankY = Math.max(54, y - 146);
  page.text("Bank Details:", 55, bankY, { bold: true, size: 8.5 });
  page.text("The approved Confirmation of Banking Details is supplied as a separate secure PDF attachment.", 55, bankY - 14, { size: 7.8 });

  const termsPage = new Canvas(612, 792);
  pages.push(termsPage); invoiceLogo(termsPage);
  termsPage.text("Terms and Conditions", 55, 610, { bold: true, size: 11 });
  const terms: Array<[string, string]> = [
    ["Payment Terms", document.paymentTerms || "Payment is governed by the accepted quotation, verified payment records and Zingara's current Payment Terms."],
    ["Booking Confirmation", "A booking remains subject to authoritative booking and payment confirmation. Tickets are issued only after successful payment confirmation."],
    ["Seating Allocation", "Seating remains subject to the confirmed booking, venue availability and operational requirements."],
    ["Changes, Cancellations and Refunds", "Requests are reviewed under Zingara's current Booking & Cancellation Policy and applicable consumer-protection requirements."],
    ["Dietary and Accessibility Requirements", "Guests should notify Zingara as early as possible so reasonable operational arrangements can be considered."],
    ["Customer Notes", document.customerNotes || "No additional customer notes."],
  ];
  let termsY = 585;
  for (const [heading, body] of terms) {
    termsPage.text(heading, 55, termsY, { bold: true, size: 8.8 }); termsY -= 13;
    const lines = wrap(body, 500, 8.2);
    termsPage.textLines(lines, 55, termsY, { leading: 11, size: 8.2 });
    termsY -= lines.length * 11 + 15;
  }
  pages.forEach((item, index) => addPageNumber(item, index, pages.length, 55));
  return pages.map((item) => ({ content: item.content, height: item.height, width: item.width }));
}

function logoHex() {
  const binary = atob(zingaraDocumentLogo);
  let result = "";
  for (let index = 0; index < binary.length; index += 1) {
    result += binary.charCodeAt(index).toString(16).padStart(2, "0");
  }
  return `${result}>`;
}

function buildPdf(pages: PdfPage[]) {
  const encoder = new TextEncoder();
  const image = logoHex();
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>", "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Type /XObject /Subtype /Image /Width 357 /Height 210 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${image.length} >>\nstream\n${image}\nendstream`,
  ];
  const pageRefs: string[] = [];
  for (const page of pages) {
    const pageId = objects.length + 1;
    const contentId = pageId + 1;
    pageRefs.push(`${pageId} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 5 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${encoder.encode(page.content).byteLength} >>\nstream\n${page.content}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pages.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(pdf).byteLength);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = encoder.encode(pdf).byteLength;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return encoder.encode(pdf);
}

export function createXeroDocumentPdf(document: XeroPdfDocument) {
  return buildPdf(document.kind === "invoice" ? drawInvoice(document) : drawQuote(document));
}
