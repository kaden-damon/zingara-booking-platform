"use client";

import { useState } from "react";

import {
  boxOfficeReportTimezone,
  getLastWeekend,
  type BoxOfficeFinancialReport,
  type BoxOfficeLocation,
  type BoxOfficeReportFilters,
} from "@/lib/boxOfficeFinancialReport";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

function rand(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    currency: "ZAR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function sastToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: boxOfficeReportTimezone }).format(new Date());
}

function atNoon(key: string) {
  return new Date(`${key}T12:00:00Z`);
}

function addDays(key: string, days: number) {
  const date = atNoon(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function presetRange(preset: string) {
  const today = sastToday();
  const date = atNoon(today);
  const weekday = date.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") return { from: addDays(today, -1), to: addDays(today, -1) };
  if (preset === "this-week") return { from: addDays(today, mondayOffset), to: addDays(today, mondayOffset + 6) };
  if (preset === "last-week") return { from: addDays(today, mondayOffset - 7), to: addDays(today, mondayOffset - 1) };
  if (preset === "this-weekend") return { from: addDays(today, mondayOffset + 5), to: addDays(today, mondayOffset + 6) };
  if (preset === "last-weekend") return getLastWeekend();
  if (preset === "this-month") {
    return { from: `${today.slice(0, 7)}-01`, to: dateKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))) };
  }
  const previous = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return {
    from: dateKey(previous),
    to: dateKey(new Date(Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 0))),
  };
}

const initialWeekend = getLastWeekend();

export default function BoxOfficeFinancialReportPanel({
  permittedLocations,
}: {
  permittedLocations: BoxOfficeLocation[];
}) {
  const canSelectAll = permittedLocations.length > 1;
  const [filters, setFilters] = useState<BoxOfficeReportFilters>({
    bookingType: "all",
    from: initialWeekend.from,
    location: canSelectAll ? "all" : permittedLocations[0] ?? "johannesburg",
    to: initialWeekend.to,
  });
  const [report, setReport] = useState<BoxOfficeFinancialReport | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  function patchFilters(patch: Partial<BoxOfficeReportFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setReport(null);
    setStatus("");
  }

  async function generateReport() {
    if (loading) return;
    setLoading(true);
    setStatus("");
    try {
      const query = new URLSearchParams({
        bookingType: filters.bookingType,
        from: filters.from,
        location: filters.location,
        to: filters.to,
      });
      const payload = await fetchSupabaseApi<{ report: BoxOfficeFinancialReport }>(
        `/api/admin/financial-reports/box-office?${query}`,
        { cache: "no-store" },
      );
      setReport(payload.report);
      setStatus("REPORT READY");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Report could not be generated.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-8 rounded-[2rem] border border-[#8D7A2F]/35 bg-black/55 p-4 sm:p-6">
      <div className="border-b border-white/10 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#D8C36A]">Operations · Financial Reports</p>
        <h2 className="mt-2 font-serif text-3xl font-bold text-white">Box Office Financial Report</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Sales created and cash received are reported independently. Reporting boundaries use Africa/Johannesburg.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {[
          ["today", "Today"], ["yesterday", "Yesterday"], ["this-week", "This Week"], ["last-week", "Last Week"],
          ["this-weekend", "This Weekend"], ["last-weekend", "Last Weekend"], ["this-month", "This Month"], ["last-month", "Last Month"],
        ].map(([value, label]) => (
          <button key={value} type="button" onClick={() => patchFilters(presetRange(value))}
            className="min-h-10 rounded-full border border-white/15 px-3 py-2 text-xs font-semibold uppercase text-zinc-300 transition hover:border-[#D8C36A]/60 hover:text-white">
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-sm text-zinc-400">From Date
          <input type="date" value={filters.from} onChange={(event) => patchFilters({ from: event.target.value })}
            className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white" />
        </label>
        <label className="text-sm text-zinc-400">To Date
          <input type="date" value={filters.to} onChange={(event) => patchFilters({ to: event.target.value })}
            className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white" />
        </label>
        <label className="text-sm text-zinc-400">Location
          <select value={filters.location} onChange={(event) => patchFilters({ location: event.target.value as BoxOfficeReportFilters["location"] })}
            className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white">
            {canSelectAll && <option value="all">All Locations</option>}
            {permittedLocations.includes("johannesburg") && <option value="johannesburg">Johannesburg</option>}
            {permittedLocations.includes("cape-town") && <option value="cape-town">Cape Town</option>}
          </select>
        </label>
        <label className="text-sm text-zinc-400">Booking Type
          <select value={filters.bookingType} onChange={(event) => patchFilters({ bookingType: event.target.value as BoxOfficeReportFilters["bookingType"] })}
            className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white">
            <option value="all">All</option><option value="standard">Standard</option><option value="corporate">Corporate</option>
          </select>
        </label>
        <div className="flex items-end">
          <button type="button" disabled={loading || !filters.from || !filters.to} onClick={() => void generateReport()}
            className="min-h-12 w-full rounded-xl bg-[#D8C36A] px-4 py-3 text-sm font-bold uppercase text-black transition hover:bg-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-45">
            {loading ? "Generating..." : "Generate Report"}
          </button>
        </div>
      </div>
      {status && <p className={`mt-3 text-sm ${report ? "text-emerald-300" : "text-amber-200"}`} role="status">{status}</p>}

      {report && (
        <div className="mt-6 space-y-5">
          {report.reconciliation.warning && (
            <div className="rounded-xl border border-red-400/40 bg-red-950/30 p-4 text-sm text-red-100">
              <strong className="block uppercase">Reconciliation Warning</strong>
              Cash detail differs from the management total by {rand(report.reconciliation.difference)}.
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border-l-2 border-[#D8C36A] bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase text-[#D8C36A]">Sales Created</p>
              <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
                {[ ["Bookings Created", report.sales.bookings], ["Pax Booked", report.sales.guests], ["Gross Booking Value", rand(report.sales.bookingValue)], ["Paid Against Those Bookings", rand(report.sales.amountPaid)], ["Outstanding On Those Bookings", rand(report.sales.outstanding)] ].map(([label, value]) => (
                  <div key={String(label)}><p className="text-zinc-500">{label}</p><p className="mt-1 text-lg font-semibold text-white">{value}</p></div>
                ))}
              </div>
            </div>
            <div className="border-l-2 border-emerald-400 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase text-emerald-300">Cash Received</p>
              <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
                {[ ["Booking-Applied Receipts", rand(report.cash.bookingAppliedReceipts)], ["Booking Fees Collected", rand(report.cash.bookingFees)], ["Gross Cash Received", rand(report.cash.grossCashReceived)], ["Refunds Processed", rand(report.cash.refunds)], ["Net Receipts", rand(report.cash.netReceipts)] ].map(([label, value]) => (
                  <div key={String(label)}><p className="text-zinc-500">{label}</p><p className="mt-1 text-lg font-semibold text-white">{value}</p></div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Breakdown title="Location Breakdown" rows={[
              ["Johannesburg", report.locations.johannesburg], ["Cape Town", report.locations["cape-town"]], ["Total Zingara", report.locations.total],
            ]} />
            <Breakdown title="Standard vs Corporate" rows={[
              ["Standard", report.bookingTypes.standard], ["Corporate", report.bookingTypes.corporate],
            ]} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <CompactAmounts title="Payment Method" rows={report.paymentMethods} />
            <CompactAmounts title="Payment Classification" rows={report.paymentClassifications} />
            <div className="rounded-xl border border-white/10 p-4 text-sm">
              <h3 className="font-serif text-xl text-white">Revenue Components</h3>
              {[ ["Booking / Ticket Subtotal", report.revenue.ticketSubtotal], ["Add-ons", report.revenue.addons], ["Gratuity / Service Charge", report.revenue.serviceCharge], ["Booking Fees", report.revenue.bookingFees], ["Discounts", report.revenue.discounts] ].map(([label, value]) => (
                <div key={String(label)} className="mt-3 flex justify-between gap-3"><span className="text-zinc-400">{label}</span><strong>{rand(Number(value))}</strong></div>
              ))}
            </div>
          </div>

          {report.requiresReview.length > 0 && (
            <div className="rounded-xl border border-amber-300/30 bg-amber-950/15 p-4">
              <h3 className="font-serif text-xl text-amber-100">Requires Review</h3>
              {report.requiresReview.map((item) => (
                <div key={item.id} className="mt-3 grid gap-1 border-t border-amber-200/10 pt-3 text-sm sm:grid-cols-[10rem_1fr_auto]">
                  <span className="font-mono text-[#F2D66C]">{item.bookingReference}</span><span className="text-zinc-300">{item.reviewReason}</span><strong>{rand(item.amount)}</strong>
                </div>
              ))}
            </div>
          )}

          <details className="rounded-xl border border-white/10">
            <summary className="cursor-pointer px-4 py-4 font-semibold uppercase text-[#F2D66C]">Payment Reconciliation</summary>
            <div className="overflow-x-auto border-t border-white/10">
              <table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-[#D8C36A]/10 text-xs uppercase text-[#F2D66C]"><tr>
                {['Date / Time','Booking Reference','Customer / Company','Location','Booking Type','Payment Method','Classification','Applied Amount','Booking Fee','Gross Cash'].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}
              </tr></thead><tbody className="divide-y divide-white/10">{report.receipts.map((row) => <tr key={row.id}>
                <td className="px-3 py-3">{new Date(row.date).toLocaleString("en-ZA", { timeZone: boxOfficeReportTimezone })}</td><td className="px-3 py-3 font-mono text-[#F2D66C]">{row.bookingReference}</td><td className="px-3 py-3">{row.customerName}</td><td className="px-3 py-3">{row.location === "johannesburg" ? "Johannesburg" : "Cape Town"}</td><td className="px-3 py-3 capitalize">{row.bookingType}</td><td className="px-3 py-3">{row.method}</td><td className="px-3 py-3">{row.classification}</td><td className="px-3 py-3">{rand(row.amount)}</td><td className="px-3 py-3">{rand(row.bookingFee)}</td><td className="px-3 py-3 font-semibold">{rand(row.grossCash)}</td>
              </tr>)}</tbody></table>
            </div>
          </details>

          <details className="rounded-xl border border-white/10">
            <summary className="cursor-pointer px-4 py-4 font-semibold uppercase text-[#F2D66C]">Bookings Created</summary>
            <div className="overflow-x-auto border-t border-white/10">
              <table className="w-full min-w-[860px] text-left text-sm"><thead className="bg-[#D8C36A]/10 text-xs uppercase text-[#F2D66C]"><tr>
                {['Created','Booking Reference','Customer / Company','Location','Type','Pax','Booking Value','Paid','Outstanding'].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}
              </tr></thead><tbody className="divide-y divide-white/10">{report.bookings.map((row) => <tr key={row.id}>
                <td className="px-3 py-3">{new Date(row.createdAt).toLocaleString("en-ZA", { timeZone: boxOfficeReportTimezone })}</td><td className="px-3 py-3 font-mono text-[#F2D66C]">{row.bookingReference}</td><td className="px-3 py-3">{row.customerName}</td><td className="px-3 py-3">{row.location === "johannesburg" ? "Johannesburg" : "Cape Town"}</td><td className="px-3 py-3 capitalize">{row.bookingSource.includes("corporate") || row.corporateRequestId ? "Corporate" : "Standard"}</td><td className="px-3 py-3">{row.guestCount}</td><td className="px-3 py-3">{rand(row.totalAmount)}</td><td className="px-3 py-3">{rand(row.amountPaid)}</td><td className="px-3 py-3">{rand(row.balanceOutstanding)}</td>
              </tr>)}</tbody></table>
            </div>
          </details>
          <p className="text-xs text-zinc-500">Generated {new Date(report.generatedAt).toLocaleString("en-ZA", { timeZone: boxOfficeReportTimezone })} · Current outstanding is shown for bookings created in the selected period.</p>
        </div>
      )}
    </section>
  );
}

function CompactAmounts({ title, rows }: { title: string; rows: Array<{ amount: number; count: number; label: string }> }) {
  return <div className="rounded-xl border border-white/10 p-4 text-sm"><h3 className="font-serif text-xl text-white">{title}</h3>{rows.length === 0 ? <p className="mt-3 text-zinc-500">No qualifying records.</p> : rows.map((row) => <div key={row.label} className="mt-3 flex justify-between gap-3"><span className="text-zinc-400">{row.label} · {row.count}</span><strong>{rand(row.amount)}</strong></div>)}</div>;
}

function Breakdown({ title, rows }: { title: string; rows: Array<[string, { bookingValue: number; bookings: number; cashReceived: number; guests: number; netReceipts: number; refunds: number }]> }) {
  return <div className="overflow-x-auto rounded-xl border border-white/10"><h3 className="px-4 pt-4 font-serif text-xl text-white">{title}</h3><table className="mt-3 w-full min-w-[600px] text-left text-sm"><thead className="bg-white/[0.04] text-xs uppercase text-zinc-400"><tr>{['Scope','Bookings','Pax','Booking Value','Cash','Refunds','Net'].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-white/10">{rows.map(([label, row]) => <tr key={label}><td className="px-3 py-3 font-semibold text-white">{label}</td><td className="px-3 py-3">{row.bookings}</td><td className="px-3 py-3">{row.guests}</td><td className="px-3 py-3">{rand(row.bookingValue)}</td><td className="px-3 py-3">{rand(row.cashReceived)}</td><td className="px-3 py-3">{rand(row.refunds)}</td><td className="px-3 py-3">{rand(row.netReceipts)}</td></tr>)}</tbody></table></div>;
}
