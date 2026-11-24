import type { SupabaseClient } from "@supabase/supabase-js";
import { CustomerExportError, customerExportColumns, customerExportVenues, deduplicateMarketingCustomers, type CustomerExportOptions } from "../customerExport";
import { normalizeStaffLocation } from "../staffLocations";
import { getBookingExportType } from "../bookingsExport";
import { successfulPaymentStatuses } from "../bookingManagementPolicy";
import { toMoney } from "../bookingReconciliation";

type Row = Record<string, unknown>;
const batchSize = 500;
const maxCustomers = 20000;
const maxBookings = 100000;
const text = (v: unknown) => typeof v === "string" ? v : "";
const amount = (v: unknown) => { const n = Number(v ?? 0); if (!Number.isFinite(n)) throw new CustomerExportError("A saved financial amount needs review.", 409); return toMoney(n); };
const relation = (v: unknown) => (Array.isArray(v) ? v[0] : v) as Row | null;

// Every relation is independently paginated: no PostgREST default-limit truncation.
async function pages(make: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>, limit = maxBookings) {
  const rows: Row[] = [];
  for (let from = 0; ; from += batchSize) {
    const { data, error } = await make(from, from + batchSize - 1);
    if (error) throw error;
    const page = (data ?? []) as Row[]; rows.push(...page);
    if (rows.length > limit) throw new CustomerExportError("This export is too large. Narrow the filters and try again.", 413);
    if (page.length < batchSize) return rows;
  }
}

export async function loadCustomerExportRows(client: SupabaseClient, options: CustomerExportOptions, scope: string[]) {
  const venues = customerExportVenues(scope, options.venue);
  const selected = options.selectedIds && new Set(options.selectedIds);
  const ids: string[] = [];
  let expectedTotal: number | null = null;
  for (let page = 1; ; page++) {
    const { data, error } = await client.rpc("search_customer_crm_page", { p_search: options.search.trim(), p_archived: options.archived, p_page: page, p_page_size: batchSize });
    if (error) throw error;
    const total = Number(data?.total ?? 0);
    if (expectedTotal !== null && total !== expectedTotal) throw new CustomerExportError("Customers changed during export. Please retry.", 409);
    expectedTotal = total;
    if (total > maxCustomers) throw new CustomerExportError("More than 20,000 customers match. Narrow the customer filters.", 413);
    const pageIds = (data?.ids ?? []) as string[];
    ids.push(...pageIds.filter(id => !selected || selected.has(id)));
    if (page * batchSize >= total) break;
    if (pageIds.length !== batchSize) throw new CustomerExportError("The customer export batch is incomplete. Please retry.", 409);
  }
  const customers = new Map<string, Row>();
  const bookings = new Map<string, Row>();
  const buyoutIds = new Set<string>();
  const uniqueIds = [...new Set(ids)];
  if (!selected && uniqueIds.length !== expectedTotal) throw new CustomerExportError("Customers changed during export. Please retry.", 409);
  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batch = uniqueIds.slice(i, i + batchSize);
    const profileFields = new Set(["id", "preferences"]);
    const fields: Partial<Record<typeof options.columns[number], string[]>> = {
      name: ["first_name", "surname"], email: ["email"], mobile: ["mobile"], company: ["company_id"],
      jobTitle: ["job_title"], createdAt: ["created_at"], vip: ["vip_status"], notes: ["relationship_notes"], dietary: ["dietary_requirements"],
    };
    for (const column of options.columns) for (const field of fields[column] ?? []) profileFields.add(field);
    if (options.marketing) profileFields.add("email");
    const customerRows = await pages((from, to) => client.from("customers")
      .select([...profileFields].join(","))
      .in("id", batch).is("merged_into_customer_id", null).order("id").range(from, to), maxCustomers);
    for (const c of customerRows) customers.set(text(c.id), c);
    const bookingRows = await pages((from, to) => client.from("bookings")
      .select("id,customer_id,show_id,section,booking_origin,booking_source,corporate_request_id,payment_status,booking_status,guest_count,total_amount,amount_paid,balance_outstanding,shows!inner(date,venue)")
      .in("customer_id", batch).order("id").range(from, to));
    for (const b of bookingRows) {
      const show = relation(b.shows); const venue = normalizeStaffLocation(text(show?.venue)); const date = text(show?.date);
      if (!venue || !venues.includes(venue) || (options.from && date < options.from) || (options.to && date > options.to)) continue;
      bookings.set(text(b.id), b);
    }
    if (bookings.size > maxBookings) throw new CustomerExportError("Too many bookings match. Narrow the performance dates.", 413);
  }
  const bookingIds = [...bookings.keys()];
  if (customers.size !== uniqueIds.length) throw new CustomerExportError("Customer profiles changed during export. Please retry.", 409);
  for (let i = 0; i < bookingIds.length; i += batchSize) {
    const rows = await pages((from, to) => client.from("corporate_buyouts").select("id,booking_id").in("booking_id", bookingIds.slice(i, i + batchSize)).order("id").range(from, to));
    for (const row of rows) buyoutIds.add(text(row.booking_id));
  }
  const kind = (b: Row) => buyoutIds.has(text(b.id)) || b.section === "Full Show Buyout" ? "buyout" :
    b.payment_status === "comp_vip" ? "comp" : getBookingExportType({ bookingOrigin: text(b.booking_origin), bookingSource: text(b.booking_source), corporateRequestId: text(b.corporate_request_id) }).toLowerCase();
  const grouped = new Map<string, Row[]>();
  for (const [id, b] of bookings) {
    if (options.kind !== "all" && kind(b) !== options.kind) { bookings.delete(id); continue; }
    const key = text(b.customer_id), group = grouped.get(key) ?? []; group.push(b); grouped.set(key, group);
  }
  const needsBooking = options.venue !== "all" || venues.length !== 2 || options.from || options.to || options.kind !== "all";
  let eligible = [...customers.values()].filter(c => !needsBooking || grouped.has(text(c.id)));
  if (options.marketing) {
    // The audited CRM has preference labels only, no authoritative email-consent ledger.
    // Never turn a free-text preference, booking or cookie flag into verified consent.
    eligible = deduplicateMarketingCustomers(eligible.map(c => ({ ...c, id: text(c.id), email: text(c.email), verifiedConsent: false })));
  }
  if (!eligible.length) throw new CustomerExportError(options.marketing
    ? "No customers have verified email-marketing consent evidence. Preference labels alone cannot be exported as a marketing list."
    : "No customers match these export filters.", 404);
  const payments = new Map<string, number>(), refunds = new Map<string, number>();
  const financial = options.columns.some(c => ["payments", "refunds", "netPayments", "unitemised"].includes(c));
  const filteredBookingIds = [...bookings.keys()];
  if (financial) for (let i = 0; i < filteredBookingIds.length; i += batchSize) {
    const batch = filteredBookingIds.slice(i, i + batchSize);
    const refundRows = await pages((from, to) => client.from("payment_refunds").select("id,booking_id,payment_id,refund_amount").in("booking_id", batch).eq("refund_status", "accepted").order("id").range(from, to));
    const refundedPayments = new Set(refundRows.map(r => text(r.payment_id)));
    for (const r of refundRows) refunds.set(text(r.booking_id), toMoney((refunds.get(text(r.booking_id)) ?? 0) + amount(r.refund_amount)));
    const paymentRows = await pages((from, to) => client.from("payments").select("id,booking_id,payment_status,amount").in("booking_id", batch).order("id").range(from, to));
    for (const p of paymentRows) if (successfulPaymentStatuses.has(text(p.payment_status)) || (p.payment_status === "refunded" && refundedPayments.has(text(p.id)))) {
      payments.set(text(p.booking_id), toMoney((payments.get(text(p.booking_id)) ?? 0) + amount(p.amount)));
    }
  }
  const companyNames = new Map<string, Set<string>>();
  if (options.columns.includes("company")) {
    const companyIds = new Set(eligible.map(c => text(c.company_id)).filter(Boolean));
    const links: Row[] = [];
    for (let i = 0; i < eligible.length; i += batchSize) links.push(...await pages((from, to) => client.from("customer_company_associations").select("id,customer_id,company_id").in("customer_id", eligible.slice(i, i + batchSize).map(c => text(c.id))).is("removed_at", null).order("id").range(from, to)));
    for (const link of links) companyIds.add(text(link.company_id));
    const companies = new Map<string, string>(); const list = [...companyIds];
    for (let i = 0; i < list.length; i += batchSize) for (const c of await pages((from, to) => client.from("companies").select("id,legal_name,trading_name").in("id", list.slice(i, i + batchSize)).order("id").range(from, to))) companies.set(text(c.id), text(c.trading_name) || text(c.legal_name));
    for (const c of eligible) companyNames.set(text(c.id), new Set([companies.get(text(c.company_id)) ?? ""].filter(Boolean)));
    for (const link of links) { const name = companies.get(text(link.company_id)); if (name) companyNames.get(text(link.customer_id))?.add(name); }
  }
  return eligible.sort((a, b) => text(a.id).localeCompare(text(b.id))).map(c => {
    const rows = grouped.get(text(c.id)) ?? [], preferences = c.preferences as Row | null;
    const dates = rows.map(b => text(relation(b.shows)?.date)).sort();
    const sum = (field: string, activeOnly = false) => toMoney(rows.filter(b => !activeOnly || !["cancelled", "refunded"].includes(text(b.booking_status))).reduce((s, b) => s + amount(b[field]), 0));
    const paid = toMoney(rows.reduce((s, b) => s + (payments.get(text(b.id)) ?? 0), 0));
    const refunded = toMoney(rows.reduce((s, b) => s + (refunds.get(text(b.id)) ?? 0), 0));
    const values: Record<string, string | number | null> = {
      id: text(c.id), name: [c.first_name, c.surname].filter(Boolean).join(" "), email: text(c.email), mobile: text(c.mobile),
      company: [...(companyNames.get(text(c.id)) ?? [])].sort().join("; "), jobTitle: text(c.job_title), createdAt: text(c.created_at),
      vip: Array.isArray(preferences?.vipTags) ? preferences.vipTags.join("; ") : text(c.vip_status),
      notes: text(c.relationship_notes), dietary: text(c.dietary_requirements), marketing: text(preferences?.marketingPreference) || "Unknown", archived: preferences?.archivedAt ? "Yes" : "No",
      bookings: rows.length, guests: sum("guest_count", true), firstShow: dates[0] ?? "", lastShow: dates.at(-1) ?? "",
      venues: [...new Set(rows.map(b => text(relation(b.shows)?.venue)))].sort().join("; "), kinds: [...new Set(rows.map(kind))].sort().join("; "),
      value: sum("total_amount", true), recordedPaid: sum("amount_paid"), payments: paid, refunds: refunded, netPayments: toMoney(paid - refunded), outstanding: sum("balance_outstanding", true),
      unitemised: toMoney(rows.reduce((s, b) => s + Math.max(0, amount(b.amount_paid) - (payments.get(text(b.id)) ?? 0)), 0)),
    };
    return Object.fromEntries(options.columns.map(key => [customerExportColumns[key], values[key]]));
  });
}
