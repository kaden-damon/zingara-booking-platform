import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  corporateChecklistItems,
  createEmptyCorporateBookingOperations,
  getCorporateOperationsReadiness,
  normalizeCorporateBookingOperations,
} from "./corporateBookingOperations";
import { buildCorporateOperationsPdf, type CorporateOperationsContext } from "./corporateBookingOperationsServer";

const root = process.cwd();
const migrationPath = `${root}/supabase/migrations/20260928230000_phase_42_corporate_operations_briefs.sql`;
const apiPath = `${root}/src/app/api/admin/corporate-booking-operations/route.ts`;
const panelPath = `${root}/src/app/admin/CorporateBookingOperationsPanel.tsx`;
const adminPath = `${root}/src/app/admin/page.tsx`;

function readyOperations() {
  const operations = createEmptyCorporateBookingOperations();
  operations.eventRequirements = "Welcome drinks and speeches";
  operations.runningOrder = "17:00 arrival\n19:00 show";
  operations.dietaryNotes = "Strict Halaal x2";
  operations.accessibilityNotes = "None";
  operations.gratuityAllocation = "Waiters 9; runners 6; bar 10";
  operations.wristbandDetails = "Orange";
  operations.barServicePlan = "limited";
  operations.operationalBarLimit = 12_000;
  operations.alcoholRestrictions = "No top-shelf alcohol";
  operations.settlementContact = "Richard Osborne";
  for (const item of corporateChecklistItems) {
    operations.checklist[item.id] = { note: "", status: "complete" };
  }
  return operations;
}

function context(): CorporateOperationsContext {
  return {
    bookingId: "booking-1",
    location: "Johannesburg",
    operations: readyOperations(),
    snapshot: {
      amountPaid: 42_080,
      barGratuityAmount: 0,
      barTabAmount: 0,
      bookedThrough: "Michael Davis",
      bookingReference: "ZNG-CORP01",
      companyName: "MCT Telecommunications (Pty) Ltd",
      dietaryRequirements: ["Strict Halaal"],
      eventName: "Client function",
      guestCount: 24,
      organiserName: "Lisl Whytock",
      outstandingAmount: 0,
      paymentStatus: "Fully Paid",
      seating: "Golden Circle 24",
      showDate: "2026-09-04",
      showTime: "17:00",
      tableSummary: "Floor assignment required",
      ticketGratuityAmount: 4_620,
      ticketValue: 36_930,
      totalAmount: 42_080,
      venue: "Johannesburg",
    },
  };
}

test("empty operations are not ready", () => {
  const readiness = getCorporateOperationsReadiness(createEmptyCorporateBookingOperations());
  assert.equal(readiness.function.ready, false);
  assert.equal(readiness.bar.ready, false);
  assert.equal(readiness.checklist.ready, false);
});

test("complete operations resolve all three readiness states", () => {
  const readiness = getCorporateOperationsReadiness(readyOperations());
  assert.equal(readiness.function.ready, true);
  assert.equal(readiness.bar.ready, true);
  assert.equal(readiness.checklist.ready, true);
});

test("readiness does not inspect booking payment, confirmation or table state", () => {
  const source = getCorporateOperationsReadiness.toString();
  assert.doesNotMatch(source, /amountPaid|paymentStatus|tableSummary/);
});

test("limited bar service requires a positive operational limit", () => {
  const operations = readyOperations();
  operations.operationalBarLimit = null;
  assert.equal(getCorporateOperationsReadiness(operations).bar.ready, false);
});

test("no-bar-tab service does not require settlement contact or limit", () => {
  const operations = readyOperations();
  operations.barServicePlan = "no-bar-tab";
  operations.operationalBarLimit = null;
  operations.settlementContact = "";
  assert.equal(getCorporateOperationsReadiness(operations).bar.ready, true);
});

test("open bar service requires a settlement contact", () => {
  const operations = readyOperations();
  operations.barServicePlan = "open";
  operations.settlementContact = "";
  assert.equal(getCorporateOperationsReadiness(operations).bar.ready, false);
});

test("checklist completion accepts not-applicable as reviewed", () => {
  const operations = readyOperations();
  operations.checklist["bar-tab-arranged"].status = "not-applicable";
  assert.equal(getCorporateOperationsReadiness(operations).checklist.ready, true);
});

test("one needs-attention checklist item keeps checklist incomplete", () => {
  const operations = readyOperations();
  operations.checklist.accessibility.status = "needs-attention";
  assert.equal(getCorporateOperationsReadiness(operations).checklist.completed, 8);
});

test("all nine source checklist decisions are represented", () => {
  assert.equal(corporateChecklistItems.length, 9);
  assert.deepEqual(corporateChecklistItems.map((item) => item.id), [
    "payment-full", "bar-tab-arranged", "bar-limit-specified", "religious-dietary",
    "general-dietary", "accessibility", "follow-up", "departments-informed",
    "function-sheet-accurate",
  ]);
});

test("normalization trims operational text", () => {
  assert.equal(normalizeCorporateBookingOperations({ runningOrder: "  Arrival  " }).runningOrder, "Arrival");
});

test("normalization limits untrusted long text", () => {
  assert.equal(normalizeCorporateBookingOperations({ runningOrder: "x".repeat(5000) }).runningOrder.length, 4000);
});

test("normalization rejects negative bar limits", () => {
  assert.equal(normalizeCorporateBookingOperations({ operationalBarLimit: -1 }).operationalBarLimit, null);
});

test("normalization rounds bar limits to cents", () => {
  assert.equal(normalizeCorporateBookingOperations({ operationalBarLimit: 12.345 }).operationalBarLimit, 12.35);
});

test("normalization rejects unknown bar service plans", () => {
  assert.equal(normalizeCorporateBookingOperations({ barServicePlan: "free" }).barServicePlan, "not-confirmed");
});

test("normalization rejects unknown checklist status", () => {
  const operations = normalizeCorporateBookingOperations({ checklist: { "payment-full": { status: "maybe" } } });
  assert.equal(operations.checklist["payment-full"].status, "needs-attention");
});

test("function PDF uses booking-derived identity and financial values", () => {
  const pdf = new TextDecoder("latin1").decode(buildCorporateOperationsPdf("function-brief", context()));
  assert.match(pdf, /MCT Telecommunications/);
  assert.match(pdf, /ZNG-CORP01/);
  assert.match(pdf, /R42,080.00/);
});

test("bar PDF distinguishes operational limit from accounting Bar Tab", () => {
  const pdf = new TextDecoder("latin1").decode(buildCorporateOperationsPdf("bar-brief", context()));
  assert.match(pdf, /Operational limit.*R12,000.00/);
  assert.match(pdf, /Bar tab paid.*R0.00/);
});

test("checklist PDF includes every checklist label", () => {
  const pdf = new TextDecoder("latin1").decode(buildCorporateOperationsPdf("checklist", context()));
  for (const item of corporateChecklistItems) assert.match(pdf, new RegExp(item.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("PDFs are valid PDF documents", () => {
  for (const kind of ["function-brief", "bar-brief", "checklist"] as const) {
    const pdf = buildCorporateOperationsPdf(kind, context());
    assert.equal(new TextDecoder().decode(pdf.slice(0, 8)), "%PDF-1.4");
    assert.ok(pdf.length > 1_000);
  }
});

test("PDF footer states live booking provenance", () => {
  const pdf = new TextDecoder("latin1").decode(buildCorporateOperationsPdf("function-brief", context()));
  assert.match(pdf, /live Zingara Corporate booking record/);
});

test("database stores only operational fields beside booking id", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.doesNotMatch(sql, /company_name|guest_count|show_date|amount_paid|total_amount/);
  assert.match(sql, /booking_id uuid primary key references public\.bookings/);
});

test("database record is one-to-one with the booking", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /booking_id uuid primary key/);
});

test("save requires Corporate booking provenance", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /booking_source <> 'corporate-direct'/);
  assert.match(sql, /NOT_CORPORATE_BOOKING/);
});

test("save is revision protected", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /p_expected_revision/);
  assert.match(sql, /OPERATIONS_CHANGED/);
});

test("save and immutable audit occur in one database function", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /insert into public\.corporate_booking_operations[\s\S]*insert into public\.audit_events/);
});

test("service-only data access is enforced", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /revoke all on public\.corporate_booking_operations from public, anon, authenticated/);
  assert.match(sql, /grant execute[\s\S]*to service_role/);
});

test("API requires active staff and booking management permission", async () => {
  const api = await readFile(apiPath, "utf8");
  assert.match(api, /requireActiveStaff\(request\)/);
  assert.match(api, /bookings:manage/);
});

test("API applies venue scope", async () => {
  const api = await readFile(apiPath, "utf8");
  assert.match(api, /normalizeStaffVenueScope/);
  assert.match(api, /outside your assigned location/);
});

test("exports are private and never cached", async () => {
  const api = await readFile(apiPath, "utf8");
  assert.match(api, /private, no-store/);
  assert.match(api, /application\/pdf/);
});

test("all three PDFs are routed through one live context loader", async () => {
  const api = await readFile(apiPath, "utf8");
  assert.match(api, /loadCorporateOperationsContext/);
  assert.match(api, /buildCorporateOperationsPdf\(document, context\)/);
});

test("panel is Corporate-only and lazy within Booking Details", async () => {
  const admin = await readFile(adminPath, "utf8");
  assert.match(admin, /isCorporateBooking && \(\s*<CorporateBookingOperationsPanel/);
  assert.match(admin, /bookingReference=\{booking\.reference\}/);
});

test("panel does not add polling or an Admin boot request", async () => {
  const panel = await readFile(panelPath, "utf8");
  assert.doesNotMatch(panel, /setInterval|setTimeout|poll/);
  assert.match(panel, /useEffect[\s\S]*getCorporateBookingOperations\(props\.bookingReference\)/);
});

test("panel exposes all three source documents", async () => {
  const panel = await readFile(panelPath, "utf8");
  assert.match(panel, /Function Brief/);
  assert.match(panel, /Bar Brief/);
  assert.match(panel, /Checklist/);
});

test("panel has no communication or automatic email action", async () => {
  const panel = await readFile(panelPath, "utf8");
  assert.doesNotMatch(panel, /sendEmail|communication|mailer|recipient/i);
});

test("accounting Bar Tab remains read-only in the operational editor", async () => {
  const panel = await readFile(panelPath, "utf8");
  assert.match(panel, /Accounting Bar Tab remains derived from the booking/);
  assert.doesNotMatch(panel, /update\("barTabAmount"/);
});

test("shared platform PDF primitive powers reports and Corporate PDFs", async () => {
  const [admin, server] = await Promise.all([
    readFile(adminPath, "utf8"),
    readFile(`${root}/src/lib/corporateBookingOperationsServer.ts`, "utf8"),
  ]);
  assert.match(admin, /createPdfBytesFromPageContent/);
  assert.match(server, /createZingaraTextPdf/);
});

test("Table Plan and payment source files are untouched by the feature", async () => {
  const status = await readFile(`${root}/src/lib/exports/tablePlanFinance.ts`, "utf8");
  assert.match(status, /barTabPaidAmount/);
  assert.doesNotMatch(status, /corporate_booking_operations/);
});
