import {
  corporateChecklistItems,
  type CorporateBookingOperations,
  type CorporateOperationsBookingSnapshot,
  type CorporateOperationsDocument,
} from "@/lib/corporateBookingOperations";
import {
  buildZingaraDocumentPdf,
  measureZingaraDocumentText,
  wrapZingaraDocumentText,
  ZingaraDocumentCanvas,
} from "@/lib/xero/documentPdf";

export type CorporateOperationsPdfContext = {
  operations: CorporateBookingOperations;
  snapshot: CorporateOperationsBookingSnapshot;
};

const A4_WIDTH = 595.25;
const A4_HEIGHT = 842;
const CONTENT_LEFT = 72;
const CONTENT_RIGHT = 523;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
const RED = "0.82 0 0";
const YELLOW = "1 1 0";
const LIGHT_GREY = "0.86 0.86 0.86";
const EMPTY_VALUES = new Set([
  "not recorded",
  "company not linked",
  "floor assignment required",
  "not assigned",
  "none",
  "n/a",
  "not applicable",
]);

function clean(value: string) {
  const normalized = value.trim();
  return EMPTY_VALUES.has(normalized.toLowerCase()) ? "" : normalized;
}

function wrapOperationalText(value: string, width: number, size: number, bold = false) {
  return wrapZingaraDocumentText(value, width, size, bold).filter((line) => line !== "-");
}

function money(value: number) {
  return `R${value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function dateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-ZA", {
      day: "2-digit",
      month: "long",
      timeZone: "Africa/Johannesburg",
      year: "numeric",
    }).format(date);
}

function page(canvas: ZingaraDocumentCanvas) {
  return { content: canvas.content, height: canvas.height, width: canvas.width };
}

function strokeRect(canvas: ZingaraDocumentCanvas, x: number, y: number, width: number, height: number, lineWidth = 0.7) {
  canvas.line(x, y, x + width, y, lineWidth);
  canvas.line(x + width, y, x + width, y + height, lineWidth);
  canvas.line(x + width, y + height, x, y + height, lineWidth);
  canvas.line(x, y + height, x, y, lineWidth);
}

function underline(
  canvas: ZingaraDocumentCanvas,
  value: string,
  x: number,
  y: number,
  size: number,
  align: "left" | "center" = "center",
) {
  canvas.text(value, x, y, { align, bold: true, size });
  const width = measureZingaraDocumentText(value, size, true);
  const start = align === "center" ? x - width / 2 : x;
  canvas.line(start, y - 2, start + width, y - 2, 0.6);
}

function highlightedLines(
  canvas: ZingaraDocumentCanvas,
  values: string[],
  y: number,
  options: { maxWidth?: number; size?: number } = {},
) {
  const size = options.size ?? 9.5;
  const maxWidth = options.maxWidth ?? 425;
  let cursor = y;
  for (const value of values.filter(Boolean)) {
    for (const line of wrapOperationalText(value, maxWidth, size, true)) {
      const width = Math.min(maxWidth, measureZingaraDocumentText(line, size, true) + 8);
      canvas.rect((A4_WIDTH - width) / 2, cursor - 2, width, size + 4, YELLOW);
      canvas.text(line, A4_WIDTH / 2, cursor, { align: "center", bold: true, color: RED, size });
      cursor -= size + 6;
    }
  }
  return cursor;
}

function footerReference(canvas: ZingaraDocumentCanvas, snapshot: CorporateOperationsBookingSnapshot) {
  canvas.text(snapshot.bookingReference, CONTENT_RIGHT, 24, { align: "right", size: 6.8 });
}

function operationalHeader(canvas: ZingaraDocumentCanvas, title: string, snapshot: CorporateOperationsBookingSnapshot) {
  canvas.logo(205, 665, 185, 109);
  canvas.text(title, A4_WIDTH / 2, 612, { align: "center", bold: true, size: 11.5 });
  strokeRect(canvas, CONTENT_LEFT, 445, CONTENT_WIDTH, 125, 0.8);
  canvas.line(CONTENT_LEFT, 493, CONTENT_RIGHT, 493, 0.7);

  const rows: Array<[string, string, number]> = [
    ["Date:", dateLabel(snapshot.showDate), 554],
    ["Client Name:", clean(snapshot.companyName), 540],
    ["Booked through:", clean(snapshot.bookedThrough), 526],
    ["Organiser:", clean(snapshot.organiserName), 512],
    ["Number of guests:", String(snapshot.guestCount), 481],
    ["TABLE NUMBERS:", clean(snapshot.tableSummary), 467],
    ["Seating:", clean(snapshot.seating), 449],
  ];
  for (const [label, value, y] of rows) {
    canvas.text(label, 79, y, { bold: true, size: 8.8 });
    if (label === "TABLE NUMBERS:") {
      const tableList = value.replaceAll("+", " + ").replace(/\s+/g, " ");
      canvas.textLines(wrapOperationalText(tableList, 330, 6.2).slice(0, 2), 177, y, { leading: 7, size: 6.2 });
    } else {
      canvas.text(value, 177, y, { size: 8.8 });
    }
  }
  footerReference(canvas, snapshot);
}

function financialSummary(snapshot: CorporateOperationsBookingSnapshot) {
  const values = [`(${money(snapshot.totalAmount)})`, `Tickets (${money(snapshot.ticketValue)})`];
  if (snapshot.ticketGratuityAmount > 0) values.push(`Gratuity (${money(snapshot.ticketGratuityAmount)})`);
  if (snapshot.barTabAmount > 0) values.push(`Bar Tab (${money(snapshot.barTabAmount)})`);
  if (snapshot.barGratuityAmount > 0) values.push(`Bar Gratuity (${money(snapshot.barGratuityAmount)})`);
  return values.join(", ");
}

function settlementInstruction(value: string) {
  const contact = clean(value);
  if (!contact) return "";
  return /settle|settling|payment/i.test(contact) ? contact : `${contact} will be settling the bill.`;
}

function barInstructions(operations: CorporateBookingOperations) {
  const result: string[] = [];
  if (operations.barServicePlan === "no-bar-tab") result.push("No Bar Tab");
  if (operations.barServicePlan === "limited" && operations.operationalBarLimit !== null) result.push(`${money(operations.operationalBarLimit)} Bar Limit`);
  if (operations.barServicePlan === "open") result.push("Open Bar Tab");
  result.push(
    clean(operations.barLimitInstructions),
    clean(operations.alcoholRestrictions),
    settlementInstruction(operations.settlementContact),
    clean(operations.barRequests),
  );
  return result.filter(Boolean);
}

function drawContinuation(snapshot: CorporateOperationsBookingSnapshot, documentTitle: string, title: string, lines: string[]) {
  const canvas = new ZingaraDocumentCanvas(A4_WIDTH, A4_HEIGHT);
  canvas.logo(225, 720, 145, 85);
  canvas.text(documentTitle, A4_WIDTH / 2, 700, { align: "center", bold: true, size: 12 });
  strokeRect(canvas, CONTENT_LEFT, 72, CONTENT_WIDTH, 580, 0.7);
  underline(canvas, title, A4_WIDTH / 2, 630, 10);
  canvas.textLines(lines, 84, 603, { leading: 12, size: 9 });
  footerReference(canvas, snapshot);
  return canvas;
}

function createBarBrief(context: CorporateOperationsPdfContext) {
  const { operations, snapshot } = context;
  const canvas = new ZingaraDocumentCanvas(A4_WIDTH, A4_HEIGHT);
  operationalHeader(canvas, "BAR BRIEF:", snapshot);
  strokeRect(canvas, CONTENT_LEFT, 95, CONTENT_WIDTH, 350, 0.7);
  canvas.line(CONTENT_LEFT, 355, CONTENT_RIGHT, 355, 0.7);
  canvas.line(CONTENT_LEFT, 170, CONTENT_RIGHT, 170, 0.7);

  const wristbandLines = clean(operations.wristbandDetails)
    ? wrapOperationalText(clean(operations.wristbandDetails), 425, 9.2, true)
    : [];
  highlightedLines(canvas, wristbandLines.slice(0, 4), 428, { maxWidth: 425, size: 9.2 });

  underline(canvas, "Bar Brief", A4_WIDTH / 2, 337, 10);
  const instructionLines = barInstructions(operations).flatMap((value) => wrapOperationalText(value, 425, 9.2, true));
  highlightedLines(canvas, instructionLines.slice(0, 10), 313, { maxWidth: 425, size: 9.2 });

  underline(canvas, "Special Requests", A4_WIDTH / 2, 151, 10);
  const specialLines = clean(operations.specialRequests)
    ? wrapOperationalText(clean(operations.specialRequests), 425, 8.8)
    : [];
  canvas.textLines(specialLines.slice(0, 3), A4_WIDTH / 2, 130, { align: "center", leading: 11, size: 8.8 });

  const overflow = [
    ...wristbandLines.slice(4).map((value) => `WRISTBANDS: ${value}`),
    ...instructionLines.slice(10).map((value) => `BAR: ${value}`),
    ...specialLines.slice(3).map((value) => `SPECIAL REQUEST: ${value}`),
  ];
  const continuations: ZingaraDocumentCanvas[] = [];
  for (let index = 0; index < overflow.length; index += 43) {
    continuations.push(drawContinuation(snapshot, "BAR BRIEF - CONTINUED", "Operational Notes", overflow.slice(index, index + 43)));
  }
  return buildZingaraDocumentPdf([page(canvas), ...continuations.map(page)]);
}

type FunctionBlock = { title: string; values: string[] };

function functionBlocks(context: CorporateOperationsPdfContext): FunctionBlock[] {
  const { operations, snapshot } = context;
  return [
    {
      title: "Running Order",
      values: [
        clean(operations.eventRequirements),
        clean(operations.runningOrder),
        clean(operations.wristbandDetails),
        ...barInstructions(operations),
        clean(operations.functionNotes),
      ].filter(Boolean),
    },
    { title: "Special Requests", values: [clean(operations.specialRequests)].filter(Boolean) },
    {
      title: "Dietaries and Allergies",
      values: [
        ...snapshot.dietaryRequirements.map(clean),
        clean(operations.dietaryNotes),
        clean(operations.accessibilityNotes),
      ].filter(Boolean),
    },
  ];
}

function createGratuityPage(context: CorporateOperationsPdfContext) {
  const { operations, snapshot } = context;
  const canvas = new ZingaraDocumentCanvas(A4_WIDTH, A4_HEIGHT);
  const bottom = 414;
  const gridTop = 575;
  strokeRect(canvas, CONTENT_LEFT, bottom, CONTENT_WIDTH, 304, 0.8);
  underline(canvas, "Gratuity Breakdown", 80, 700, 10, "left");
  const gratuity = snapshot.ticketGratuityAmount + snapshot.barGratuityAmount;
  canvas.text("GRATUITY:", 80, 677, { bold: true, size: 9 });
  canvas.text(gratuity > 0 ? money(gratuity) : clean(operations.gratuityAllocation), 164, 677, { size: 9 });
  canvas.text("WAITERS: ................................................................", 80, 656, { size: 8.5 });
  canvas.text("RUNNERS: ...............................................................", 80, 639, { size: 8.5 });
  canvas.text("BAR: ........................................................................", 80, 622, { size: 8.5 });
  canvas.text("TIP PER STAFF MEMBER: ................................................", 80, 599, { bold: true, size: 8.5 });
  canvas.line(CONTENT_LEFT, gridTop, CONTENT_RIGHT, gridTop, 0.7);
  canvas.line(222, bottom, 222, gridTop, 0.7);
  canvas.line(373, bottom, 373, gridTop, 0.7);
  const columns = [
    { count: 9, label: "WAITERS", left: 82, center: 147 },
    { count: 6, label: "RUNNERS", left: 233, center: 297.5 },
    { count: 10, label: "BAR", left: 384, center: 448 },
  ];
  for (const column of columns) {
    canvas.text(column.label, column.center, 558, { align: "center", bold: true, size: 8.8 });
    for (let index = 0; index < column.count; index += 1) canvas.text(`${index + 1}.`, column.left, 538 - index * 12, { size: 8.2 });
  }
  footerReference(canvas, snapshot);
  return canvas;
}

function createFunctionBrief(context: CorporateOperationsPdfContext) {
  const { snapshot } = context;
  const canvas = new ZingaraDocumentCanvas(A4_WIDTH, A4_HEIGHT);
  operationalHeader(canvas, "FUNCTION BRIEF:", snapshot);
  strokeRect(canvas, CONTENT_LEFT, 70, CONTENT_WIDTH, 375, 0.7);
  canvas.line(CONTENT_LEFT, 374, CONTENT_RIGHT, 374, 0.7);
  canvas.line(CONTENT_LEFT, 202, CONTENT_RIGHT, 202, 0.7);
  canvas.line(CONTENT_LEFT, 148, CONTENT_RIGHT, 148, 0.7);
  const summaryLines = wrapOperationalText(financialSummary(snapshot), 425, 9, true);
  highlightedLines(canvas, summaryLines.slice(0, 2), 423, { maxWidth: 425, size: 9 });

  const [running, special, dietary] = functionBlocks(context);
  const runningLines = running.values.flatMap((value) => wrapOperationalText(value, 425, 8.7, true));
  underline(canvas, running.title, A4_WIDTH / 2, 355, 9.5);
  highlightedLines(canvas, runningLines.slice(0, 10), 333, { maxWidth: 425, size: 8.7 });
  const specialLines = special.values.flatMap((value) => wrapOperationalText(value, 425, 8.5));
  underline(canvas, special.title, A4_WIDTH / 2, 185, 9.5);
  canvas.textLines(specialLines.slice(0, 2), A4_WIDTH / 2, 166, { align: "center", leading: 10, size: 8.5 });
  const dietaryLines = dietary.values.flatMap((value) => wrapOperationalText(value, 425, 8.5, true));
  underline(canvas, dietary.title, A4_WIDTH / 2, 130, 9.5);
  highlightedLines(canvas, dietaryLines.slice(0, 4), 109, { maxWidth: 425, size: 8.5 });

  const overflowGroups = [
    { lines: runningLines.slice(10), title: running.title },
    { lines: specialLines.slice(2), title: special.title },
    { lines: dietaryLines.slice(4), title: dietary.title },
  ];
  const continuations: ZingaraDocumentCanvas[] = [];
  const overflow = overflowGroups.flatMap((group) => group.lines.length > 0
    ? [`${group.title.toUpperCase()}:`, ...group.lines]
    : []);
  for (let index = 0; index < overflow.length; index += 43) {
    continuations.push(drawContinuation(snapshot, "FUNCTION BRIEF - CONTINUED", "Operational Notes", overflow.slice(index, index + 43)));
  }
  return buildZingaraDocumentPdf([page(canvas), ...continuations.map(page), page(createGratuityPage(context))]);
}

function checklistAnswer(
  operations: CorporateBookingOperations,
  snapshot: CorporateOperationsBookingSnapshot,
  id: (typeof corporateChecklistItems)[number]["id"],
) {
  const entry = operations.checklist[id];
  if (entry.note) return entry.note;
  if (id === "payment-full" && snapshot.totalAmount > 0 && snapshot.outstandingAmount === 0 && snapshot.amountPaid >= snapshot.totalAmount) return "YES";
  if (id === "bar-tab-arranged" && snapshot.barTabAmount > 0) return "YES";
  if (["bar-tab-arranged", "bar-limit-specified"].includes(id) && operations.barServicePlan === "no-bar-tab") return "N/A";
  if (id === "bar-limit-specified" && operations.operationalBarLimit !== null) return "YES";
  if (entry.status === "complete") return id === "follow-up" ? "DONE" : "YES";
  if (entry.status === "not-applicable") return "N/A";
  return "";
}

function checklistQuestion(
  canvas: ZingaraDocumentCanvas,
  number: string,
  heading: string,
  question: string,
  answer: string,
  y: number,
) {
  canvas.text(`${number} ${heading}`.trim(), 83, y, { bold: true, size: 8.5 });
  const questionLines = wrapOperationalText(`o  ${question}`, 390, 8.1);
  canvas.textLines(questionLines, 100, y - 13, { leading: 10, size: 8.1 });
  if (answer) {
    const answerY = y - 13 - (questionLines.length - 1) * 10;
    const width = Math.min(73, measureZingaraDocumentText(answer, 8.1, true) + 7);
    canvas.rect(437, answerY - 2, width, 11.5, YELLOW);
    canvas.text(answer, 440, answerY, { bold: true, color: RED, size: 8.1 });
  } else {
    canvas.line(437, y - 15, 510, y - 15, 0.35, LIGHT_GREY);
  }
}

function createChecklist(context: CorporateOperationsPdfContext) {
  const { operations, snapshot } = context;
  const canvas = new ZingaraDocumentCanvas(A4_WIDTH, A4_HEIGHT);
  canvas.text(`CORPORATE BOOKING NAME: ${clean(snapshot.organiserName) || clean(snapshot.companyName)}`, 72, 780, { bold: true, size: 9.3 });
  underline(canvas, "CORPORATE FUNCTION CHECKLIST (MONDAY REVIEW)", 72, 758, 9.3, "left");
  underline(canvas, "Procedure:", 72, 735, 8.5, "left");
  canvas.textLines([
    "Aswin and Vanessa to be copied on all emails requiring information for the function.",
    "Every Monday, review all Corporate bookings scheduled for the upcoming week and confirm the",
    "following for each booking:",
    "Daily, review bookings for the evening to identify changes since the Monday check.",
    "Send the completed list daily with the Function Brief.",
  ], 72, 719, { leading: 12, size: 8.1 });

  const questions = [
    ["1.", "Payment Status", "Has full payment been received?", "payment-full"],
    ["2.", "Bar Tab", "Has a bar tab been arranged and paid for?", "bar-tab-arranged"],
    ["3.", "Bar Limit", "Has a bar spending limit been specified by the client?", "bar-limit-specified"],
    ["", "Dietary Requirements (Religious)", "Does the booking include strict Halaal or Kosher requirements?", "religious-dietary"],
    ["4.", "Dietary Requirements (General)", "Have all other dietary requirements been provided and noted?", "general-dietary"],
    ["5.", "Accessibility Requirements", "Are there disability or wheelchair-access requirements?", "accessibility"],
  ] as const;
  questions.forEach(([number, heading, question, id], index) => {
    checklistQuestion(canvas, number, heading, question, checklistAnswer(operations, snapshot, id), 638 - index * 50);
  });

  underline(canvas, "Action Required:", 72, 331, 8.5, "left");
  const actions = [
    ["Follow up on anything outstanding immediately.", "follow-up"],
    ["Ensure all relevant departments (kitchen, floor, bar, and operations) are informed.", "departments-informed"],
    ["Confirm all information is accurately reflected in the final function sheet.", "function-sheet-accurate"],
  ] as const;
  actions.forEach(([label, id], index) => {
    const y = 313 - index * 23;
    canvas.text(`- ${label}`, 82, y, { size: 8.1 });
    const answer = checklistAnswer(operations, snapshot, id);
    if (answer) canvas.text(answer, 508, y, { align: "right", bold: true, color: RED, size: 8.1 });
  });

  underline(canvas, "Objective:", 72, 235, 8.5, "left");
  canvas.textLines([
    "To ensure that every Corporate function is fully paid, properly briefed and operationally ready",
    "before the date of the event.",
  ], 72, 219, { leading: 11, size: 8.1 });
  const left = 72;
  const right = 310;
  canvas.text("Employee Name", left, 166, { bold: true, size: 8.2 });
  canvas.text("Manager Name", right, 166, { bold: true, size: 8.2 });
  canvas.line(left, 143, 275, 143, 0.7);
  canvas.line(right, 143, 523, 143, 0.7);
  if (clean(operations.employeeName)) canvas.text(clean(operations.employeeName), left + 5, 147, { size: 8.2 });
  if (clean(operations.managerName)) canvas.text(clean(operations.managerName), right + 5, 147, { size: 8.2 });
  canvas.text("Employee Signature", left, 119, { bold: true, size: 8.2 });
  canvas.text("Manager Signature", right, 119, { bold: true, size: 8.2 });
  canvas.line(left, 94, 275, 94, 0.7);
  canvas.line(right, 94, 523, 94, 0.7);
  footerReference(canvas, snapshot);
  return buildZingaraDocumentPdf([page(canvas)]);
}

export function buildCorporateOperationalPdf(document: CorporateOperationsDocument, context: CorporateOperationsPdfContext) {
  if (document === "bar-brief") return createBarBrief(context);
  if (document === "checklist") return createChecklist(context);
  return createFunctionBrief(context);
}
