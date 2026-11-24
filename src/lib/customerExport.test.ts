import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { canExportCustomerFields, customerExportColumns, customerExportVenues, deduplicateMarketingCustomers, parseCustomerExportOptions, type CustomerExportOptions } from "./customerExport.ts";
import { loadCustomerExportRows } from "./supabase/customerExportServer.ts";
import { createCsvFromSheet } from "./exports/csv.ts";
import { buildTabularWorkbook } from "./exports/bookingsWorkbook.ts";

type Row = Record<string, unknown>;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const options: CustomerExportOptions = { action: "export", format: "csv", columns: ["id", "name", "email", "bookings", "guests", "value", "recordedPaid", "payments", "refunds", "netPayments", "outstanding", "unitemised"],
  venue: "all", from: "", to: "", kind: "all", selectedIds: null, search: "", archived: "active", marketing: false };
function fixture(extra: Record<string, Row[]> = {}) {
  const customers = [1, 2, 3].map(n => ({ id: id(n), first_name: `Guest ${n}`, surname: "Example", email: `guest${n}@example.test`, preferences: {} }));
  const booking = (n: number, customer: number, venue: string, overrides = {}) => ({ id: id(n), customer_id: id(customer), shows: { date: "2026-12-02", venue }, booking_source: "online", booking_origin: "customer_public", booking_status: "confirmed", payment_status: "fully_paid", guest_count: 2, total_amount: 1000, amount_paid: 1000, balance_outstanding: 0, ...overrides });
  return { customers, bookings: [booking(11, 1, "Cape Town"), booking(12, 1, "Johannesburg", { amount_paid: 600, balance_outstanding: 400 }), booking(13, 2, "Cape Town", { booking_status: "refunded" })],
    payments: [{ id: id(21), booking_id: id(11), amount: 1000, payment_status: "fully_paid" }, { id: id(22), booking_id: id(12), amount: 300, payment_status: "deposit_paid" }, { id: id(23), booking_id: id(13), amount: 1000, payment_status: "refunded" }, { id: id(24), booking_id: id(11), amount: 9999, payment_status: "pending_payment" }],
    payment_refunds: [{ id: id(31), payment_id: id(23), booking_id: id(13), refund_amount: 1000, refund_status: "accepted" }, { id: id(32), payment_id: id(21), booking_id: id(11), refund_amount: 200, refund_status: "processing" }],
    corporate_buyouts: [], companies: [], customer_company_associations: [], ...extra };
}

function clientFor(data: Record<string, Row[]>) {
  const calls: string[] = [];
  const client = {
    rpc: async (name: string, args: { p_page: number; p_page_size: number; p_search: string; p_archived: string }) => {
      calls.push(name);
      let matches = data.customers.filter(c => !c.merged_into_customer_id);
      if (args.p_search) matches = matches.filter(c => String(c.first_name).includes(args.p_search));
      if (args.p_archived !== "all") matches = matches.filter(c => Boolean((c.preferences as Row)?.archivedAt) === (args.p_archived === "archived"));
      return { data: { total: matches.length, ids: matches.slice((args.p_page - 1) * args.p_page_size, args.p_page * args.p_page_size).map(c => c.id) }, error: null };
    },
    from: (table: string) => {
      calls.push(table); let rows = [...(data[table] ?? [])];
      const builder = {
        select: () => builder,
        in: (key: string, values: unknown[]) => { rows = rows.filter(r => values.includes(r[key])); return builder; },
        is: (key: string, value: unknown) => { rows = rows.filter(r => (r[key] ?? null) === value); return builder; },
        eq: (key: string, value: unknown) => { rows = rows.filter(r => r[key] === value); return builder; },
        order: () => { rows.sort((a, b) => String(a.id).localeCompare(String(b.id))); return builder; },
        range: (from: number, to: number) => { rows = rows.slice(from, to + 1); return builder; },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
      }; return builder;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test("validates columns, formats, date ranges and selected UUIDs; rejects empty selection", () => {
  assert.deepEqual(parseCustomerExportOptions(options), options);
  for (const changes of [{ columns: [] }, { columns: ["password"] }, { format: "pdf" }, { from: "2026-02-30" }, { from: "2026-12-03", to: "2026-12-02" }, { selectedIds: [] }, { selectedIds: ["bad"] }]) {
    assert.throws(() => parseCustomerExportOptions({ ...options, ...changes }));
  }
});

test("venue permissions fail closed and aliases reuse existing normalisation", () => {
  assert.deepEqual(customerExportVenues(["Cape Town"], "all"), ["cape-town"]);
  assert.throws(() => customerExportVenues([], "all"));
  assert.throws(() => customerExportVenues(["cape-town"], "johannesburg"));
});

test("export permission does not extend CRM bulk downloads to ticket-scanning or read-only roles", () => {
  for (const permissions of [[], ["tickets:validate"], ["crm:read"]]) assert.equal(canExportCustomerFields(permissions, options), false);
  assert.equal(canExportCustomerFields(["bookings:manage"], options), true);
  assert.equal(canExportCustomerFields(["bookings:manage"], { ...options, columns: ["dietary"] }), false);
  assert.equal(canExportCustomerFields(["bookings:manage", "crm:read"], { ...options, columns: ["dietary"] }), true);
  assert.equal(canExportCustomerFields(["bookings:manage", "crm:read"], { ...options, marketing: true }), false);
  assert.equal(canExportCustomerFields(["bookings:manage", "crm:read", "communications:manage"], { ...options, marketing: true }), true);
});

test("one row per customer: value, ledger payments, accepted refunds and outstanding remain distinct", async () => {
  const { client } = clientFor(fixture()); const rows = await loadCustomerExportRows(client, options, ["all"]);
  assert.equal(rows.length, 3);
  const a = rows[0], b = rows[1];
  assert.equal(a[customerExportColumns.bookings], 2); assert.equal(a[customerExportColumns.value], 2000);
  assert.equal(a[customerExportColumns.payments], 1300); assert.equal(a[customerExportColumns.recordedPaid], 1600);
  assert.equal(a[customerExportColumns.unitemised], 300); assert.equal(a[customerExportColumns.outstanding], 400);
  assert.equal(b[customerExportColumns.value], 0); assert.equal(b[customerExportColumns.payments], 1000);
  assert.equal(b[customerExportColumns.refunds], 1000); assert.equal(b[customerExportColumns.netPayments], 0);
});

test("scope filters financial totals and contacts, never exposing other-venue-only customers", async () => {
  const data = fixture(); data.bookings.push({ ...data.bookings[1], id: id(14), customer_id: id(3) });
  const { client } = clientFor(data); const rows = await loadCustomerExportRows(client, options, ["cape-town"]);
  assert.equal(rows.length, 2); assert.equal(rows[0][customerExportColumns.value], 1000);
  assert.equal(rows[0][customerExportColumns.outstanding], 0);
});

test("selected customers intersect search/date/type filters and include no invisible unselected IDs", async () => {
  const data = fixture(); data.bookings[0].booking_origin = "corporate";
  const { client } = clientFor(data);
  const rows = await loadCustomerExportRows(client, { ...options, selectedIds: [id(1), id(2)], search: "Guest 1", kind: "corporate", from: "2026-12-01", to: "2026-12-03" }, ["all"]);
  assert.equal(rows.length, 1); assert.equal(rows[0][customerExportColumns.bookings], 1);
  await assert.rejects(loadCustomerExportRows(client, { ...options, from: "2026-12-03" }, ["all"]), /No customers match/);
});

test("buyout and complimentary filters reuse saved entitlements without multiplying bookings", async () => {
  const data = fixture({ corporate_buyouts: [{ id: id(70), booking_id: id(11) }] });
  data.bookings[1].payment_status = "comp_vip";
  const { client } = clientFor(data);
  for (const kind of ["buyout", "comp"] as const) {
    const rows = await loadCustomerExportRows(client, { ...options, kind }, ["all"]);
    assert.equal(rows.length, 1); assert.equal(rows[0][customerExportColumns.bookings], 1);
  }
});

test("all result pages export completely; no query per customer, and too-large results fail without truncation", async () => {
  const customers = Array.from({ length: 1201 }, (_, n) => ({ id: id(n + 1), first_name: "Guest", preferences: {} }));
  const { client, calls } = clientFor(fixture({ customers, bookings: [] }));
  const rows = await loadCustomerExportRows(client, { ...options, columns: ["id"] }, ["all"]);
  assert.equal(rows.length, 1201); assert.equal(new Set(rows.map(r => r[customerExportColumns.id])).size, 1201);
  assert.equal(calls.filter(c => c === "search_customer_crm_page").length, 3);
  assert.equal(calls.filter(c => c === "customers").length, 5); // includes end-of-page probes
  const huge = clientFor(fixture({ customers: Array.from({ length: 20001 }, (_, n) => ({ id: id(n + 1), preferences: {} })) }));
  await assert.rejects(loadCustomerExportRows(huge.client, options, ["all"]), /20,000/);
});

test("marketing preferences cannot masquerade as verified consent", async () => {
  const data = fixture(); data.customers[0].preferences = { marketingPreference: "subscribed" };
  await assert.rejects(loadCustomerExportRows(clientFor(data).client, { ...options, marketing: true }, ["all"]), /verified email-marketing consent/);
});

test("marketing output normalises email and excludes unknown/conflicting consent without merging CRM", () => {
  const rows = [{ id: "b", email: " HELLO@example.test ", verifiedConsent: true }, { id: "a", email: "hello@EXAMPLE.test", verifiedConsent: true }, { id: "c", email: "no@example.test", verifiedConsent: false }];
  assert.deepEqual(deduplicateMarketingCustomers(rows).map(r => r.id), ["a"]);
  assert.equal(deduplicateMarketingCustomers([...rows, { id: "d", email: "hello@example.test", verifiedConsent: false }]).length, 0);
  assert.equal(rows.length, 3);
});

test("companies are de-duplicated separately from money; missing optional values remain blank", async () => {
  const data = fixture({ companies: [{ id: id(50), legal_name: "Company" }], customer_company_associations: [{ id: id(60), customer_id: id(1), company_id: id(50) }, { id: id(61), customer_id: id(1), company_id: id(50) }] });
  const rows = await loadCustomerExportRows(clientFor(data).client, { ...options, columns: ["company", "mobile", "value"] }, ["all"]);
  assert.equal(rows[0].Company, "Company"); assert.equal(rows[0].Mobile, ""); assert.equal(rows[0][customerExportColumns.value], 2000);
});

test("CSV/XLSX retain Unicode, commas, newlines, quotes and numeric values without formulas", async () => {
  const columns = ["Name", "Amount"], rows = [{ Name: 'Zoë, "Guest"\nLine', Amount: -12.5 }, { Name: " =HYPERLINK(\"bad\")", Amount: 0 }];
  const csv = createCsvFromSheet({ columns, rows });
  assert.match(csv, /Zoë, ""Guest""/); assert.match(csv, /' =HYPERLINK/); assert.match(csv, /,-12.5/);
  const buffer = await buildTabularWorkbook({ columns, rows, title: "Customers", exportedAt: "2026-11-24T10:00:00Z" });
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  assert.equal(workbook.worksheets[0].getCell("A2").value, rows[0].Name);
  assert.equal(workbook.worksheets[0].getCell("A3").type, ExcelJS.ValueType.String);
  assert.equal(workbook.worksheets[0].getCell("B2").value, -12.5);
});
