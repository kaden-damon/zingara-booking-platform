"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateManagementAnalytics,
  defaultManagementAnalyticsFilters,
  getJohannesburgDateKey,
  type AnalyticsVenue,
  type ManagementAnalyticsDataset,
} from "@/lib/managementAnalytics";
import {
  getCalendarGridDates,
  getCalendarMonthRange,
  groupSalesPerformanceByDate,
  shiftCalendarMonth,
  summarizeSalesPerformance,
  type SalesPerformanceRow,
} from "@/lib/salesPerformanceCalendar";

const money = new Intl.NumberFormat("en-ZA", {
  currency: "ZAR",
  maximumFractionDigits: 0,
  style: "currency",
});
const integer = new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 });
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthLabel(month: string) {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-ZA", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  });
}

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function venueLabel(venue: AnalyticsVenue) {
  return venue === "cape-town" ? "CPT" : "JHB";
}

function statusLabel(status: string) {
  return (
    {
      active: "Open",
      booking_blackout: "Booking blackout",
      cancelled: "Closed",
      closed: "Closed",
      inactive: "Closed",
      sold_out: "Sold out",
      special_event: "Special event",
      venue_closed: "Venue closed",
    }[status] ?? status.replaceAll("_", " ")
  );
}

function PerformanceCard({ row }: { row: SalesPerformanceRow }) {
  return (
    <article className="border-l-2 border-[#D8C36A]/60 bg-black/30 px-2 py-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-white">
          {venueLabel(row.venue)} · {row.showTime}
        </p>
        <span className="text-[10px] font-semibold uppercase text-zinc-500">
          {statusLabel(row.status)}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] font-semibold text-white">
        {integer.format(row.guests)} guests · {row.occupancy.toFixed(1)}% full
      </p>
      <dl className="mt-0.5 text-[10px] leading-4 text-zinc-400">
        <div className="flex justify-between gap-2"><dt>Booked</dt><dd className="font-medium text-zinc-200">{money.format(row.bookingValue)}</dd></div>
        <div className="flex flex-wrap justify-between gap-x-2"><dt className="sr-only">Payment</dt><dd><span className="text-emerald-200">{money.format(row.amountPaid)} paid</span><span className="text-zinc-600"> · </span><span className="text-amber-100">{money.format(row.outstanding)} due</span></dd></div>
      </dl>
    </article>
  );
}

export default function SalesPerformanceCalendar({
  dataset,
}: {
  dataset: ManagementAnalyticsDataset;
}) {
  const currentMonth = getJohannesburgDateKey(dataset.asOf).slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [venue, setVenue] = useState<"all" | AnalyticsVenue>("all");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const requestedMonth = params.get("month");
      const requestedVenue = params.get("venue");
      if (requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth)) setMonth(requestedMonth);
      if (requestedVenue === "cape-town" || requestedVenue === "johannesburg") setVenue(requestedVenue);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("section", "reports");
    url.searchParams.set("report", "sales-performance");
    url.searchParams.set("month", month);
    if (venue === "all") url.searchParams.delete("venue");
    else url.searchParams.set("venue", venue);
    window.history.replaceState(window.history.state, "", url);
  }, [month, venue]);

  const rows = useMemo(() => {
    const range = getCalendarMonthRange(month);
    return calculateManagementAnalytics(dataset, {
      ...defaultManagementAnalyticsFilters,
      performanceFrom: range.from,
      performanceTo: range.to,
      venue,
    }).performanceDemand;
  }, [dataset, month, venue]);
  const summary = useMemo(() => summarizeSalesPerformance(rows), [rows]);
  const rowsByDate = useMemo(() => groupSalesPerformanceByDate(rows), [rows]);
  const gridDates = useMemo(() => getCalendarGridDates(month), [month]);
  const today = getJohannesburgDateKey(dataset.asOf);
  const emptyMessage = venue === "cape-town"
    ? "No Cape Town performances this month."
    : venue === "johannesburg"
      ? "No Johannesburg performances this month."
      : "No performances this month.";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 border-b border-white/10 pb-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous month" onClick={() => setMonth((value) => shiftCalendarMonth(value, -1))} className="h-10 w-10 rounded-lg border border-white/15 text-xl text-zinc-200 hover:border-[#D8C36A]/60">‹</button>
          <button type="button" onClick={() => setMonth(currentMonth)} className="h-10 rounded-lg border border-white/15 px-3 text-xs font-bold uppercase text-zinc-300 hover:border-[#D8C36A]/60">Today</button>
          <button type="button" aria-label="Next month" onClick={() => setMonth((value) => shiftCalendarMonth(value, 1))} className="h-10 w-10 rounded-lg border border-white/15 text-xl text-zinc-200 hover:border-[#D8C36A]/60">›</button>
        </div>
        <h3 className="order-first text-lg font-bold uppercase lg:order-none" aria-live="polite">{monthLabel(month)}</h3>
        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
          Venue
          <select value={venue} onChange={(event) => setVenue(event.target.value as typeof venue)} className="mt-2 h-10 w-full rounded-lg border border-white/15 bg-black px-3 text-sm font-medium normal-case text-white sm:w-48 lg:ml-2 lg:mt-0">
            <option value="all">All venues</option>
            <option value="cape-town">Cape Town</option>
            <option value="johannesburg">Johannesburg</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-y-1 md:grid-cols-3 xl:grid-cols-6">
        <SummaryMetric label="Shows" value={integer.format(summary.shows)} />
        <SummaryMetric label="Guests booked" value={integer.format(summary.guests)} />
        <SummaryMetric label="Occupancy" value={`${summary.occupancy.toFixed(1)}%`} />
        <SummaryMetric label="Booking value" value={money.format(summary.bookingValue)} />
        <SummaryMetric label="Paid" value={money.format(summary.amountPaid)} />
        <SummaryMetric label="Outstanding" value={money.format(summary.outstanding)} />
      </div>

      {rows.length === 0 ? (
        <p className="border-y border-white/10 py-12 text-center text-zinc-400">{emptyMessage}</p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-white/10 xl:block">
            <div className="grid grid-cols-7 bg-[#17140e] text-center text-xs font-bold uppercase text-[#D8C36A]">
              {weekdays.map((day) => <div key={day} className="border-r border-white/10 px-2 py-1.5 last:border-r-0">{day}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {gridDates.map((date, index) => (
                <div key={date ?? `empty-${index}`} className={`min-h-20 border-r border-t border-white/10 p-1 last:border-r-0 ${date === today ? "bg-[#D8C36A]/8" : "bg-black/10"}`}>
                  {date ? <><p className={`mb-1 text-[11px] font-bold ${date === today ? "text-[#F2D66C]" : "text-zinc-500"}`}>{Number(date.slice(-2))}</p><div className="space-y-1">{(rowsByDate.get(date) ?? []).map((row) => <PerformanceCard key={row.id} row={row} />)}</div></> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:hidden">
            {Array.from(rowsByDate.entries()).map(([date, dateRows]) => (
              <section key={date} aria-labelledby={`sales-date-${date}`} className={`rounded-lg border p-3 ${date === today ? "border-[#D8C36A]/50 bg-[#D8C36A]/5" : "border-white/10 bg-black/20"}`}>
                <h4 id={`sales-date-${date}`} className="text-sm font-bold uppercase text-[#F2D66C]">{dateLabel(date)}</h4>
                <div className="mt-2 space-y-2">{dateRows.map((row) => <PerformanceCard key={row.id} row={row} />)}</div>
              </section>
            ))}
          </div>
        </>
      )}

      <p className="text-xs leading-5 text-zinc-500">Occupancy uses the same approved capacity denominator as Forward Forecast. Detailed Forecast and Excel remain available below.</p>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-[#D8C36A]/55 px-3 py-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className="break-words text-base font-bold text-white">{value}</p>
    </div>
  );
}
