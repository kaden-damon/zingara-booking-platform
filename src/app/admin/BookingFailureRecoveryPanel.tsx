"use client";

import { useEffect, useState } from "react";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import {
  bookingFailureReasonLabels,
  type BookingFailureRecoveryReport,
} from "@/lib/bookingFailureRecovery";

const integer = new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat("en-ZA", {
  currency: "ZAR",
  maximumFractionDigits: 0,
  style: "currency",
});

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

function dateOffset(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

function sast(value: string) {
  return new Date(value).toLocaleString("en-ZA", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Africa/Johannesburg",
  });
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-[#D8C36A]/30 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
    </div>
  );
}

type Filters = {
  from: string;
  performanceDate: string;
  reason: string;
  to: string;
  venue: string;
  zone: string;
};

const initialFilters: Filters = {
  from: dateOffset(-29),
  performanceDate: "",
  reason: "all",
  to: dateOffset(0),
  venue: "all",
  zone: "all",
};

export default function BookingFailureRecoveryPanel() {
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(0);
  const [report, setReport] = useState<BookingFailureRecoveryReport | null>(null);
  const [expandedJourney, setExpandedJourney] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const search = new URLSearchParams({
      from: filters.from,
      page: String(page),
      reason: filters.reason,
      to: filters.to,
      venue: filters.venue,
      zone: filters.zone,
    });
    if (filters.performanceDate) search.set("performanceDate", filters.performanceDate);

    void fetchSupabaseApi<{ report: BookingFailureRecoveryReport }>(
      `/api/admin/analytics/booking-failures?${search.toString()}`,
      { cache: "no-store" },
    )
      .then((body) => { if (active) setReport(body.report); })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error
          ? loadError.message
          : "Booking failure reporting could not be loaded.");
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [filters, page]);

  const summary = report?.summary;
  const hasNextPage = Boolean(report && (page + 1) * report.pageSize < (summary?.failed_journeys ?? 0));

  return (
    <div className="space-y-5">
      <form
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault();
          setLoading(true);
          setError("");
          setPage(0);
          setFilters(draft);
        }}
      >
        <label className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">From<input type="date" value={draft.from} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black px-3 text-sm normal-case text-white" /></label>
        <label className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">To<input type="date" value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black px-3 text-sm normal-case text-white" /></label>
        <label className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">Venue<select value={draft.venue} onChange={(event) => setDraft((current) => ({ ...current, venue: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black px-3 text-sm normal-case text-white"><option value="all">All venues</option><option value="cape-town">Cape Town</option><option value="johannesburg">Johannesburg</option></select></label>
        <label className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">Performance Date<input type="date" value={draft.performanceDate} onChange={(event) => setDraft((current) => ({ ...current, performanceDate: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black px-3 text-sm normal-case text-white" /></label>
        <label className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">Seating Zone<select value={draft.zone} onChange={(event) => setDraft((current) => ({ ...current, zone: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black px-3 text-sm normal-case text-white"><option value="all">All zones</option><option>Golden Circle</option><option>Middle Ring</option><option>Private Booths</option><option>Royal Balcony</option></select></label>
        <label className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">Failure Reason<select value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black px-3 text-sm normal-case text-white"><option value="all">All reasons</option>{Object.entries(bookingFailureReasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button type="submit" className="min-h-10 rounded-full bg-[#D8C36A] px-5 text-xs font-bold uppercase tracking-[0.1em] text-black hover:bg-[#F2D66C] sm:col-span-2 xl:col-span-1">Apply Filters</button>
      </form>

      {loading ? <p className="py-5 text-sm text-zinc-400">Loading booking failures...</p> : null}
      {error ? <p className="py-5 text-sm text-red-200">{error}</p> : null}

      {!loading && !error && report && summary ? (
        <>
          <div className="grid grid-cols-2 gap-x-5 lg:grid-cols-4">
            <Metric label="Failed Journeys" value={integer.format(summary.failed_journeys)} />
            <Metric label="Total Attempts" value={integer.format(summary.total_attempts)} />
            <Metric label="Recovered" value={integer.format(summary.recovered_journeys)} />
            <Metric label="Abandoned" value={integer.format(summary.abandoned_journeys)} />
            <Metric label="Unresolved" value={integer.format(summary.unresolved_journeys)} />
            <Metric label="Requested Guests" value={integer.format(summary.requested_guests)} />
            <Metric label="Potential Value" value={money.format(summary.potential_value)} />
          </div>

          <p className="text-xs leading-5 text-zinc-500">
            Potential value is the latest quoted value per blocked journey. It is not revenue or a confirmed lost sale.
          </p>

          <div className="overflow-x-auto border-t border-white/10 pt-4">
            <table className="min-w-[980px] w-full text-left text-xs">
              <thead className="uppercase text-zinc-500"><tr>{["Last Failure", "Venue / Performance", "Zone", "Reason", "Attempts", "Guests", "Potential", "Outcome", "Booking"].map((heading) => <th className="pb-2 pr-3" key={heading}>{heading}</th>)}</tr></thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr className="border-t border-white/8 align-top" key={row.journeyId}>
                    <td className="py-3 pr-3"><button type="button" onClick={() => setExpandedJourney((current) => current === row.journeyId ? "" : row.journeyId)} className="text-left font-semibold text-[#D8C36A] hover:text-[#F2D66C]">{sast(row.lastFailedAt)}</button>{expandedJourney === row.journeyId ? <div className="mt-3 min-w-[22rem] space-y-2 text-zinc-400">{row.timeline.map((entry, index) => <p key={`${entry.at}-${index}`}>{sast(entry.at)} · {bookingFailureReasonLabels[entry.failureReason] ?? entry.failureReason} · {entry.seatingZone || "Zone unavailable"} · {entry.requestedGuests} guests · {money.format(entry.quotedValue)}</p>)}</div> : null}</td>
                    <td className="py-3 pr-3">{row.venue === "johannesburg" ? "JHB" : row.venue === "cape-town" ? "CPT" : "—"}<br />{row.performanceDate || "—"}</td>
                    <td className="py-3 pr-3">{row.seatingZone || "—"}</td>
                    <td className="py-3 pr-3">{bookingFailureReasonLabels[row.latestFailureReason] ?? row.latestFailureReason}</td>
                    <td className="py-3 pr-3">{row.failedAttempts}</td>
                    <td className="py-3 pr-3">{row.requestedGuests}</td>
                    <td className="py-3 pr-3">{money.format(row.potentialValue)}</td>
                    <td className="py-3 pr-3 capitalize">{row.outcome}</td>
                    <td className="py-3">{row.successfulBookingReference || "—"}{row.paymentStatus ? <><br /><span className="text-zinc-500">{row.paymentStatus.replaceAll("_", " ")} · {money.format(row.amountPaid)}</span></> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.rows.length === 0 ? <p className="py-8 text-center text-sm text-zinc-500">No tracked failures match these filters.</p> : null}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 pt-4">
            <button type="button" disabled={page === 0} onClick={() => { setLoading(true); setError(""); setPage((current) => Math.max(0, current - 1)); }} className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase text-zinc-300 disabled:opacity-35">Previous</button>
            <span className="text-xs text-zinc-500">Page {page + 1}</span>
            <button type="button" disabled={!hasNextPage} onClick={() => { setLoading(true); setError(""); setPage((current) => current + 1); }} className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase text-zinc-300 disabled:opacity-35">Next</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
