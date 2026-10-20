"use client";

import { useEffect, useRef, useState } from "react";
import type { TicketSalesBookingType, TicketSalesPaymentFilter, TicketSalesRow, TicketSalesSummary, TicketSalesVenue } from "@/lib/ticketSalesReport";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import { getAdminAuthSession } from "@/lib/supabase/auth";
import ZingaraDatePicker from "./ZingaraDatePicker";

const money = new Intl.NumberFormat("en-ZA", { currency: "ZAR", style: "currency" });
const integer = new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 });
type ReportResponse = {
  daily: Array<TicketSalesSummary & { date: string }>;
  excluded: { complimentary: number; importedUnreliableSaleDate: number; inactiveLifecycle: number; unpaidTicketEntitlements: number };
  pagination: { page: number; pageSize: number; totalPages: number; totalRows: number };
  performances: Array<{ date: string; id: string; label: string; venue: TicketSalesVenue }>;
  rows: TicketSalesRow[];
  serverTimeMs: number;
  summary: TicketSalesSummary;
  venues: Array<TicketSalesSummary & { venue: TicketSalesVenue }>;
};
type Filters = { bookingType: "all" | TicketSalesBookingType; from: string; paymentStatus: TicketSalesPaymentFilter; performanceId: string; to: string; venue: "all" | TicketSalesVenue };

function dateKey(date: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(date); }
function offsetDate(days: number) { const date = new Date(); date.setDate(date.getDate() + days); return dateKey(date); }
const defaultFilters: Filters = { bookingType: "all", from: offsetDate(-29), paymentStatus: "all", performanceId: "", to: offsetDate(0), venue: "all" };

function Select({ children, label, onChange, value }: { children: React.ReactNode; label: string; onChange: (value: string) => void; value: string }) {
  return <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm font-medium normal-case tracking-normal text-white outline-none focus:border-[#D8C36A]">{children}</select></label>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 border-l-2 border-[#D8C36A] pl-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p><p className="mt-1 truncate text-lg font-semibold text-white" title={value}>{value}</p></div>;
}

export default function TicketSalesReport() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"idle" | "loading" | "downloading">("idle");
  const [error, setError] = useState("");
  const requestVersion = useRef(0);
  function params(targetPage = page) { return new URLSearchParams({ bookingType: filters.bookingType, from: filters.from, page: String(targetPage), pageSize: "25", paymentStatus: filters.paymentStatus, performanceId: filters.performanceId, to: filters.to, venue: filters.venue }); }
  async function generate(targetPage = page) {
    const version = ++requestVersion.current; setStatus("loading"); setError("");
    try {
      const response = await fetchSupabaseApi<{ report: ReportResponse }>(`/api/admin/analytics/ticket-sales?${params(targetPage)}`, { cache: "no-store" });
      if (version !== requestVersion.current) return;
      setReport(response.report); setPage(response.report.pagination.page);
    } catch (loadError) {
      if (version === requestVersion.current) setError(loadError instanceof Error ? loadError.message : "The Ticket Sales report could not be generated.");
    } finally { if (version === requestVersion.current) setStatus("idle"); }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void generate(1), 0);
    return () => window.clearTimeout(timer);
    // The initial report uses the stable default filter snapshot only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function change<Key extends keyof Filters>(key: Key, value: Filters[Key]) { setFilters((current) => ({ ...current, [key]: value, ...(key === "venue" ? { performanceId: "" } : {}) })); setPage(1); setReport(null); }
  function quickRange(days: number | "mtd" | "campaign") { const to = days === "campaign" ? offsetDate(-1) : offsetDate(0); const from = days === "mtd" ? `${to.slice(0, 7)}-01` : days === "campaign" ? "2026-09-30" : offsetDate(-(days - 1)); setFilters((current) => ({ ...current, from, to })); setPage(1); setReport(null); }
  async function download() {
    setStatus("downloading"); setError("");
    try {
      const auth = await getAdminAuthSession(); if (!auth) throw new Error("Your Admin session has expired. Please sign in again.");
      const query = params(1); query.set("format", "xlsx");
      const response = await fetch(`/api/admin/analytics/ticket-sales?${query}`, { cache: "no-store", headers: { Authorization: `Bearer ${auth.session.access_token}` } });
      if (!response.ok) { const payload = await response.json().catch(() => ({})) as { error?: string }; throw new Error(payload.error ?? "The Ticket Sales workbook could not be downloaded."); }
      const blob = await response.blob(); const disposition = response.headers.get("Content-Disposition") ?? ""; const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "Zingara_Ticket_Sales.xlsx";
      const href = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = href; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(href);
    } catch (downloadError) { setError(downloadError instanceof Error ? downloadError.message : "The Ticket Sales workbook could not be downloaded."); } finally { setStatus("idle"); }
  }
  const busy = status !== "idle";
  return <section className="rounded-xl border border-white/10 bg-black/30 p-4 sm:p-5" aria-busy={status === "loading"}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D8C36A]">Ticket Sales</p><p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">Paid ticket entitlements by booking sale date in SAST. Current paid and outstanding values follow the selected booking cohort.</p></div><button type="button" disabled={!report || busy} onClick={() => void download()} className="min-h-11 rounded-lg border border-[#D8C36A]/60 px-4 text-xs font-bold uppercase tracking-[0.12em] text-[#E8D98B] disabled:cursor-not-allowed disabled:opacity-40">{status === "downloading" ? "Preparing..." : "Download Excel"}</button></div>
    <div className="mt-4 flex flex-wrap gap-2">{[["Last 7 Days", 7], ["Last 30 Days", 30], ["Month To Date", "mtd"], ["Campaign", "campaign"]].map(([label, value]) => <button key={label} type="button" onClick={() => quickRange(value as number | "mtd" | "campaign")} className="min-h-10 rounded-full border border-white/15 px-3 text-[11px] font-bold uppercase text-zinc-300 hover:border-[#D8C36A]/60">{label}</button>)}</div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">From<span className="mt-2 block"><ZingaraDatePicker label="Ticket sales from" placeholder="Select date" value={filters.from} onChange={(value) => change("from", value)} /></span></label>
      <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">To<span className="mt-2 block"><ZingaraDatePicker label="Ticket sales to" placeholder="Select date" value={filters.to} onChange={(value) => change("to", value)} /></span></label>
      <Select label="Venue" value={filters.venue} onChange={(value) => change("venue", value as Filters["venue"])}><option value="all">All Venues</option><option value="cape-town">Cape Town</option><option value="johannesburg">Johannesburg</option></Select>
      <Select label="Booking Type" value={filters.bookingType} onChange={(value) => change("bookingType", value as Filters["bookingType"])}><option value="all">All Types</option><option value="standard">Standard</option><option value="corporate">Corporate</option><option value="buyout">Buyout</option></Select>
      <Select label="Payment Status" value={filters.paymentStatus} onChange={(value) => change("paymentStatus", value as Filters["paymentStatus"])}><option value="all">All Payment States</option><option value="paid">Paid</option><option value="partially-paid">Partially Paid</option><option value="unpaid">Unpaid</option></Select>
      <div className="sm:col-span-2"><Select label="Performance" value={filters.performanceId} onChange={(value) => change("performanceId", value)}><option value="">All Performances</option>{(report?.performances ?? []).filter((item) => filters.venue === "all" || item.venue === filters.venue).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></div>
      <button type="button" disabled={busy || !filters.from || !filters.to} onClick={() => void generate(1)} className="min-h-11 self-end rounded-lg bg-[#D8C36A] px-5 text-xs font-black uppercase tracking-[0.12em] text-black disabled:opacity-50">{status === "loading" ? "Generating..." : "Generate Report"}</button>
    </div>
    {error ? <p className="mt-4 rounded-lg border border-red-300/25 bg-red-950/20 px-4 py-3 text-sm text-red-200" role="alert">{error}</p> : null}
    {report ? <>
      <div className="mt-6 grid grid-cols-2 gap-4 border-y border-white/10 py-5 lg:grid-cols-5"><Metric label="Tickets Sold" value={integer.format(report.summary.ticketsSold)} /><Metric label="Bookings" value={integer.format(report.summary.bookings)} /><Metric label="Booking Value" value={money.format(report.summary.bookingValue)} /><Metric label="Current Paid" value={money.format(report.summary.amountPaid)} /><Metric label="Outstanding" value={money.format(report.summary.outstanding)} /></div>
      {filters.venue === "all" ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{report.venues.map((venue) => <div key={venue.venue} className="rounded-lg border border-white/10 p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#D8C36A]">{venue.venue === "cape-town" ? "Cape Town" : "Johannesburg"}</p><p className="mt-2 text-sm text-zinc-300">{integer.format(venue.ticketsSold)} tickets · {integer.format(venue.bookings)} bookings</p><p className="mt-1 text-sm text-zinc-500">{money.format(venue.bookingValue)} value · {money.format(venue.amountPaid)} paid</p></div>)}</div> : null}
      <div className="mt-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#D8C36A]">Daily Breakdown</p>
        <div className="mt-2 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[#D8C36A]/35 text-[10px] uppercase tracking-[0.12em] text-zinc-500"><tr>{["Sale Date", "Tickets", "Bookings", "Booking Value", "Current Paid", "Outstanding"].map((heading) => <th key={heading} className="px-3 py-3 font-bold">{heading}</th>)}</tr></thead>
            <tbody>{report.daily.map((day) => <tr key={day.date} className="border-b border-white/[0.07] last:border-b-0 text-zinc-300"><td className="whitespace-nowrap px-3 py-3 font-semibold text-white">{day.date}</td><td className="px-3 py-3 text-right">{integer.format(day.ticketsSold)}</td><td className="px-3 py-3 text-right">{integer.format(day.bookings)}</td><td className="whitespace-nowrap px-3 py-3 text-right">{money.format(day.bookingValue)}</td><td className="whitespace-nowrap px-3 py-3 text-right">{money.format(day.amountPaid)}</td><td className="whitespace-nowrap px-3 py-3 text-right">{money.format(day.outstanding)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><thead className="border-b border-[#D8C36A]/35 text-[10px] uppercase tracking-[0.12em] text-zinc-500"><tr>{["Sale Date", "Booking", "Customer / Company", "Venue", "Type", "Payment", "Tickets", "Value", "Paid", "Outstanding"].map((heading) => <th key={heading} className="px-2 py-3 font-bold">{heading}</th>)}</tr></thead><tbody>{report.rows.map((row) => <tr key={row.bookingReference} className="border-b border-white/[0.07] text-zinc-300"><td className="whitespace-nowrap px-2 py-3">{row.saleDate}</td><td className="px-2 py-3 font-semibold text-white">{row.bookingReference}</td><td className="max-w-52 px-2 py-3">{row.customerName}</td><td className="px-2 py-3">{row.venue === "cape-town" ? "CPT" : "JHB"}</td><td className="px-2 py-3 capitalize">{row.bookingType}</td><td className="whitespace-nowrap px-2 py-3">{row.paymentStatus.replaceAll("_", " ")}</td><td className="px-2 py-3 text-right">{row.ticketEntitlements}</td><td className="whitespace-nowrap px-2 py-3 text-right">{money.format(row.bookingValue)}</td><td className="whitespace-nowrap px-2 py-3 text-right">{money.format(row.amountPaid)}</td><td className="whitespace-nowrap px-2 py-3 text-right">{money.format(row.outstanding)}</td></tr>)}</tbody></table></div>
      <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between"><p>{integer.format(report.pagination.totalRows)} matching bookings · Page {report.pagination.page} of {report.pagination.totalPages} · Server {report.serverTimeMs} ms</p><div className="flex gap-2"><button type="button" disabled={busy || report.pagination.page <= 1} onClick={() => void generate(page - 1)} className="min-h-10 rounded-lg border border-white/15 px-4 font-bold text-zinc-300 disabled:opacity-35">Previous</button><button type="button" disabled={busy || report.pagination.page >= report.pagination.totalPages} onClick={() => void generate(page + 1)} className="min-h-10 rounded-lg border border-white/15 px-4 font-bold text-zinc-300 disabled:opacity-35">Next</button></div></div>
      <p className="mt-3 text-xs leading-5 text-zinc-600">Excluded from paid ticket totals: {report.excluded.complimentary} complimentary, {report.excluded.inactiveLifecycle} inactive lifecycle, and {report.excluded.importedUnreliableSaleDate} historical imported rows with unreliable sale timestamps. Unpaid bookings contribute no sold ticket entitlement.</p>
    </> : <div className="mt-6 border-y border-white/10 py-8 text-center text-sm text-zinc-500">Choose filters and generate the report.</div>}
  </section>;
}
