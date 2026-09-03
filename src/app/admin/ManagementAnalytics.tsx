"use client";

import { useEffect, useMemo, useState } from "react";
import {
  analyticsTimezone,
  calculateManagementAnalytics,
  defaultManagementAnalyticsFilters,
  filtersToSearchParams,
  type ManagementAnalyticsDataset,
  type ManagementAnalyticsFilters,
  weekdayNames,
} from "@/lib/managementAnalytics";
import { getAdminAuthSession } from "@/lib/supabase/auth";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

const money = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });
const integer = new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 });
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: analyticsTimezone }).format(date);
}

function dateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function Metric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`border-l-2 px-4 py-3 ${emphasis ? "border-[#D8C36A] bg-[#D8C36A]/8" : "border-white/15"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${emphasis ? "text-[#F2D66C]" : "text-white"}`}>{value}</p>
    </div>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm font-medium normal-case tracking-normal text-white focus:border-[#D8C36A] focus:outline-none">
        {children}
      </select>
    </label>
  );
}

export default function ManagementAnalytics() {
  const [dataset, setDataset] = useState<ManagementAnalyticsDataset | null>(null);
  const [filters, setFilters] = useState<ManagementAnalyticsFilters>(defaultManagementAnalyticsFilters);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [sort, setSort] = useState<"date" | "guests" | "occupancy" | "bookingValue">("date");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const body = await fetchSupabaseApi<{ dataset: ManagementAnalyticsDataset }>("/api/admin/analytics/management");
      setDataset(body.dataset);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Management analytics could not be loaded.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    fetchSupabaseApi<{ dataset: ManagementAnalyticsDataset }>("/api/admin/analytics/management")
      .then((body) => {
        if (active) setDataset(body.dataset);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Management analytics could not be loaded.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const analytics = useMemo(() => dataset ? calculateManagementAnalytics(dataset, filters) : null, [dataset, filters]);
  const demandRows = useMemo(() => {
    if (!analytics) return [];
    return [...analytics.performanceDemand].sort((left, right) => sort === "date"
      ? `${left.date}${left.showTime}`.localeCompare(`${right.date}${right.showTime}`)
      : right[sort] - left[sort]);
  }, [analytics, sort]);
  const maxTrendGuests = Math.max(1, ...demandRows.map((row) => row.guests));
  const update = <Key extends keyof ManagementAnalyticsFilters>(key: Key, value: ManagementAnalyticsFilters[Key]) => setFilters((current) => ({ ...current, [key]: value }));
  const quickRange = (range: "today" | "yesterday" | "7" | "30" | "mtd") => {
    const today = dateOffset(0);
    const from = range === "today" ? today : range === "yesterday" ? dateOffset(-1) : range === "7" ? dateOffset(-6) : range === "30" ? dateOffset(-29) : `${today.slice(0, 7)}-01`;
    const to = range === "yesterday" ? from : today;
    setFilters((current) => ({ ...current, bookingCreatedFrom: from, bookingCreatedTo: to }));
  };
  const exportReport = async () => {
    if (exporting) return;
    setExporting(true); setError("");
    try {
      const auth = await getAdminAuthSession();
      if (!auth) throw new Error("Your Admin session has expired. Sign in again.");
      const response = await fetch(`/api/admin/analytics/management/export?${filtersToSearchParams(filters)}`, { headers: { Authorization: `Bearer ${auth.session.access_token}` } });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "Management analytics export could not be generated."); }
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "Zingara_Management_Analytics.xlsx";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
    } catch (exportError) { setError(exportError instanceof Error ? exportError.message : "Management analytics export could not be generated."); }
    finally { setExporting(false); }
  };

  if (loading) return <section className="mb-8 border-y border-[#D8C36A]/25 py-12 text-center text-zinc-400" aria-busy="true">Loading Management Analytics...</section>;
  if (error || !dataset || !analytics) return <section className="mb-8 border-y border-red-300/25 py-10 text-center"><p className="text-red-200">{error || "Management analytics could not be loaded."}</p><button type="button" onClick={() => void load()} className="mt-4 rounded-full border border-white/20 px-5 py-2 text-sm font-semibold">Retry</button></section>;

  const core = analytics.core;
  const showMonth = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="mb-10 space-y-9 text-white">
      <header className="border-b border-[#D8C36A]/30 pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#D8C36A]">Management Analytics</p><h2 className="zingara-heading mt-2 text-3xl font-bold">Sales & Performance Demand</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Booking activity measures genuine acquisition. Performance demand measures every legitimate active guest occupying a show, including imported legacy bookings.</p></div>
          <button type="button" onClick={() => void exportReport()} disabled={exporting} className="inline-flex h-11 items-center justify-center rounded-full border border-[#D8C36A]/60 px-5 text-sm font-bold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black disabled:cursor-wait disabled:opacity-60">{exporting ? "Generating..." : "Export Report"}</button>
        </div>
        <p className="mt-3 text-xs text-zinc-500">Authoritative cutoff {new Date(dataset.asOf).toLocaleString("en-ZA", { timeZone: analyticsTimezone })} SAST</p>
      </header>

      <section aria-labelledby="analytics-filters">
        <h3 id="analytics-filters" className="text-xs font-bold uppercase tracking-[0.18em] text-[#D8C36A]">Filters</h3>
        <div className="mt-3 flex flex-wrap gap-2">{[["Today", "today"], ["Yesterday", "yesterday"], ["Last 7 Days", "7"], ["Last 30 Days", "30"], ["Month To Date", "mtd"]].map(([label, value]) => <button key={value} type="button" onClick={() => quickRange(value as "today" | "yesterday" | "7" | "30" | "mtd")} className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase text-zinc-300 hover:border-[#D8C36A]/60 hover:text-white">{label}</button>)}<button type="button" onClick={() => setFilters(defaultManagementAnalyticsFilters)} className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase text-zinc-500 hover:text-white">Clear</button></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <FilterSelect label="Venue" value={filters.venue} onChange={(value) => update("venue", value as ManagementAnalyticsFilters["venue"])}><option value="all">All</option><option value="johannesburg">Johannesburg</option><option value="cape-town">Cape Town</option></FilterSelect>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Booking Created From<input type="date" value={filters.bookingCreatedFrom} onChange={(event) => update("bookingCreatedFrom", event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm text-white" /></label>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Booking Created To<input type="date" value={filters.bookingCreatedTo} onChange={(event) => update("bookingCreatedTo", event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm text-white" /></label>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Performance From<input type="date" value={filters.performanceFrom} onChange={(event) => update("performanceFrom", event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm text-white" /></label>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Performance To<input type="date" value={filters.performanceTo} onChange={(event) => update("performanceTo", event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm text-white" /></label>
          <FilterSelect label="Seating Zone" value={filters.seatingZone} onChange={(value) => update("seatingZone", value)}><option value="all">All</option>{["Golden Circle", "Middle Ring", "Private Booths", "Royal Balcony"].map((zone) => <option key={zone}>{zone}</option>)}</FilterSelect>
          <FilterSelect label="Booking Type" value={filters.bookingType} onChange={(value) => update("bookingType", value as ManagementAnalyticsFilters["bookingType"])}><option value="all">All</option><option value="standard">Standard</option><option value="corporate">Corporate</option></FilterSelect>
          <FilterSelect label="Booking Status" value={filters.bookingStatus} onChange={(value) => update("bookingStatus", value)}><option value="all">All</option><option value="confirmed">Confirmed</option><option value="pending_payment">Pending Payment</option><option value="cancelled">Cancelled</option></FilterSelect>
          <FilterSelect label="Payment Status" value={filters.paymentStatus} onChange={(value) => update("paymentStatus", value)}><option value="all">All</option><option value="fully_paid">Fully Paid</option><option value="deposit_paid">Deposit Paid</option><option value="pending_payment">Pending Payment</option><option value="comp_vip">Complimentary</option></FilterSelect>
          <FilterSelect label="Booking Source" value={filters.source} onChange={(value) => update("source", value as ManagementAnalyticsFilters["source"])}><option value="all">All Genuine Activity</option><option value="public">Public Online</option><option value="staff">Staff / Manual</option><option value="corporate">Corporate</option><option value="imported">Imported Legacy</option></FilterSelect>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Day of week filter">{weekdayOrder.map((day) => { const selected = filters.dayOfWeek.includes(day); return <button type="button" key={day} aria-pressed={selected} onClick={() => update("dayOfWeek", selected ? filters.dayOfWeek.filter((value) => value !== day) : [...filters.dayOfWeek, day])} className={`rounded-full border px-3 py-2 text-xs font-semibold ${selected ? "border-[#D8C36A] bg-[#D8C36A] text-black" : "border-white/15 text-zinc-400"}`}>{weekdayNames[day]}</button>; })}</div>
      </section>

      <section aria-labelledby="core-kpis"><h3 id="core-kpis" className="text-xs font-bold uppercase tracking-[0.18em] text-[#D8C36A]">Booking Activity</h3><div className="mt-3 grid grid-cols-2 gap-y-3 md:grid-cols-3 xl:grid-cols-6"><Metric label="Bookings" value={integer.format(core.bookings)} emphasis /><Metric label="Guests" value={integer.format(core.guests)} emphasis /><Metric label="Booking Value" value={money.format(core.bookingValue)} emphasis /><Metric label="Amount Paid" value={money.format(core.amountPaid)} /><Metric label="Outstanding" value={money.format(core.outstanding)} /><Metric label="Average Booking" value={money.format(core.averageBookingValue)} /><Metric label="Average Party" value={core.averagePartySize.toFixed(2)} /><Metric label="Confirmed" value={integer.format(core.confirmed)} /><Metric label="Pending Payment" value={integer.format(core.pendingPayment)} /><Metric label="Cancelled" value={integer.format(core.cancelled)} /><Metric label="Deposits" value={integer.format(analytics.payments.deposits)} /><Metric label="Full Payments" value={integer.format(analytics.payments.fullPayments)} /><Metric label="Complimentary" value={integer.format(core.complimentaryBookings)} /><Metric label="Corporate" value={integer.format(core.corporateBookings)} /><Metric label="New Customers" value={integer.format(core.newCustomers)} /><Metric label="Returning" value={integer.format(core.returningCustomers)} /></div></section>

      <section aria-labelledby="highlights"><h3 id="highlights" className="text-xs font-bold uppercase tracking-[0.18em] text-[#D8C36A]">Insights / Highlights</h3><div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Most Booked Day" value={analytics.highlights.mostBookedDayOfWeek?.day ?? "No data"} /><Metric label="Strongest Performance" value={analytics.highlights.strongestPerformance ? `${analytics.highlights.strongestPerformance.date} · ${analytics.highlights.strongestPerformance.guests} guests` : "No data"} /><Metric label="Highest Occupancy" value={analytics.highlights.highestOccupancy ? `${analytics.highlights.highestOccupancy.occupancy.toFixed(1)}%` : "No data"} /><Metric label="Popular Seating" value={analytics.highlights.mostPopularZone?.zone ?? "No data"} /><Metric label="Average Lead Time" value={`${analytics.leadTime.averageDaysAhead.toFixed(1)} days`} /></div></section>

      <section aria-labelledby="performance-demand"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 id="performance-demand" className="text-xs font-bold uppercase tracking-[0.18em] text-[#D8C36A]">Performance Demand</h3><p className="mt-2 text-sm text-zinc-400">Actual show-date demand, including legitimate active imported bookings.</p></div><label className="text-xs uppercase text-zinc-500">Sort by<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="ml-2 rounded-lg border border-white/15 bg-black px-3 py-2 text-white"><option value="date">Date</option><option value="guests">Guests</option><option value="occupancy">Occupancy</option><option value="bookingValue">Booking Value</option></select></label></div>
        <div className="mt-4 max-h-[32rem] overflow-auto rounded-lg border border-white/10"><table className="min-w-[980px] w-full text-left text-sm"><thead className="sticky top-0 bg-[#17140e] text-xs uppercase text-[#D8C36A]"><tr>{["Date", "Day", "Venue", "Time", "Bookings", "Guests", "Value", "Paid", "Outstanding", "Capacity", "Occupancy"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead><tbody>{demandRows.map((row) => <tr key={row.id} className="border-t border-white/8"><td className="px-3 py-3 font-semibold">{row.date}</td><td className="px-3 py-3">{row.dayOfWeek}</td><td className="px-3 py-3 capitalize">{row.venue.replace("-", " ")}</td><td className="px-3 py-3">{row.showTime}</td><td className="px-3 py-3">{row.bookings}</td><td className="px-3 py-3">{row.guests}</td><td className="px-3 py-3">{money.format(row.bookingValue)}</td><td className="px-3 py-3">{money.format(row.amountPaid)}</td><td className="px-3 py-3">{money.format(row.outstanding)}</td><td className="px-3 py-3">{row.capacity}</td><td className="px-3 py-3"><span className="font-semibold text-[#F2D66C]">{row.occupancy.toFixed(1)}%</span><span className="ml-2 text-xs text-zinc-500">{row.occupancyLabel}</span></td></tr>)}</tbody></table></div>
      </section>

      <section aria-labelledby="performance-trend"><h3 id="performance-trend" className="text-xs font-bold uppercase tracking-[0.18em] text-[#D8C36A]">Guests / Bookings by Performance Date</h3><div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-2">{demandRows.filter((row) => row.bookings > 0).map((row) => <div key={`trend-${row.id}`} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-xs"><span className="text-zinc-400">{row.date}</span><div className="h-3 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-[#D8C36A]" style={{ width: `${Math.max(2, row.guests / maxTrendGuests * 100)}%` }} /></div><span className="w-24 text-right font-semibold">{row.guests} guests · {row.bookings}</span></div>)}</div></section>

      <section className="grid gap-8 xl:grid-cols-2"><div><h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[#D8C36A]">Day of Week Performance</h3><div className="mt-4 overflow-x-auto"><table className="min-w-[700px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-500"><tr>{["Day", "Shows", "Bookings", "Guests", "Avg Guests/Show", "Avg Occupancy", "Value"].map((h) => <th className="pb-3" key={h}>{h}</th>)}</tr></thead><tbody>{weekdayOrder.map((index) => analytics.dayOfWeek.find((row) => row.dayIndex === index)!).map((row) => <tr key={row.day} className={`border-t ${row.day === "Tuesday" ? "border-[#D8C36A]/60 bg-[#D8C36A]/5" : "border-white/10"}`}><td className="py-3 font-semibold">{row.day}</td><td>{row.performances}</td><td>{row.bookings}</td><td>{row.guests}</td><td>{row.averageGuestsPerPerformance.toFixed(1)}</td><td>{row.averageOccupancy.toFixed(1)}%</td><td>{money.format(row.bookingValue)}</td></tr>)}</tbody></table></div></div>
        <div><h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[#D8C36A]">Midweek vs Weekend</h3><p className="mt-2 text-xs text-zinc-500">Midweek = Monday–Thursday · Weekend = Friday–Sunday</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{analytics.midweekVsWeekend.map((row) => <div key={row.label} className="border-t border-[#D8C36A]/35 py-4"><p className="zingara-heading text-xl font-bold">{row.label}</p><p className="mt-3 text-3xl font-bold text-[#F2D66C]">{row.guests} guests</p><p className="mt-2 text-sm text-zinc-400">{row.performances} performances · {row.bookings} bookings</p><p className="mt-1 text-sm text-zinc-400">{row.averageGuestsPerPerformance.toFixed(1)} guests/show · {row.averageOccupancy.toFixed(1)}% occupancy</p><p className="mt-1 font-semibold">{money.format(row.bookingValue)}</p></div>)}</div></div></section>

      <section aria-labelledby="month-demand"><h3 id="month-demand" className="text-xs font-bold uppercase tracking-[0.18em] text-[#D8C36A]">Performance Month Demand</h3><div className="mt-4 overflow-x-auto"><table className="min-w-[900px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-500"><tr>{["Month", "Inventory", "Shows", "Bookings", "Guests", "Value", "Paid", "Outstanding", "Avg Guests/Show", "Avg Occupancy"].map((h) => <th className="pb-3" key={h}>{h}</th>)}</tr></thead><tbody>{analytics.performanceMonths.map((row) => <tr key={row.month} className="border-t border-white/10"><td className="py-3 font-semibold">{showMonth(row.month)}</td><td className={row.inventoryState === "No Inventory Available" ? "text-amber-200" : "text-zinc-400"}>{row.inventoryState}</td><td>{row.performancesAvailable}</td><td>{row.bookings}</td><td>{row.guests}</td><td>{money.format(row.bookingValue)}</td><td>{money.format(row.amountPaid)}</td><td>{money.format(row.outstanding)}</td><td>{row.averageGuestsPerPerformance.toFixed(1)}</td><td>{row.averageOccupancy.toFixed(1)}%</td></tr>)}</tbody></table></div></section>

      <section className="grid gap-8 xl:grid-cols-3"><div><h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[#D8C36A]">Booking Lead Time</h3><div className="mt-4 grid grid-cols-2 gap-3"><Metric label="Average Days Ahead" value={analytics.leadTime.averageDaysAhead.toFixed(1)} /><Metric label="Median Days Ahead" value={analytics.leadTime.medianDaysAhead.toFixed(1)} /></div><div className="mt-4 space-y-2">{analytics.leadTime.buckets.map((row) => <div className="flex justify-between border-b border-white/10 py-2 text-sm" key={row.label}><span className="text-zinc-400">{row.label}</span><strong>{row.bookings}</strong></div>)}</div><p className="mt-3 text-xs text-zinc-500">Imported legacy rows are excluded from lead-time calculations.</p></div>
        <div><h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[#D8C36A]">Seating Demand</h3><div className="mt-4 space-y-3">{analytics.seatingDemand.map((row) => <div key={row.zone} className="border-b border-white/10 pb-3"><div className="flex justify-between"><strong>{row.zone}</strong><span className="text-[#F2D66C]">{(row.demandShare * 100).toFixed(1)}%</span></div><p className="mt-1 text-sm text-zinc-400">{row.bookings} bookings · {row.guests} guests · {money.format(row.bookingValue)}</p></div>)}</div></div>
        <div><h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[#D8C36A]">Payment Analytics</h3><div className="mt-4 grid grid-cols-2 gap-y-3"><Metric label="Successfully Paid" value={money.format(analytics.payments.successfullyPaid)} emphasis /><Metric label="Payment Count" value={integer.format(analytics.payments.successfulPaymentCount)} /><Metric label="Average Payment" value={money.format(analytics.payments.averageSuccessfulPayment)} /><Metric label="Full Payments" value={`${analytics.payments.fullPayments} · ${money.format(analytics.payments.fullPaymentValue)}`} /><Metric label="Deposits" value={`${analytics.payments.deposits} · ${money.format(analytics.payments.depositValue)}`} /><Metric label="Pending Checkouts" value={integer.format(analytics.payments.pendingCheckouts)} /></div><p className="mt-3 text-xs text-zinc-500">Ticket receipts remain separate from transaction fees, gratuity and bar tabs.</p></div></section>
    </div>
  );
}
