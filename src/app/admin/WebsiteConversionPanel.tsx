"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import {
  percentage,
  type WebsiteConversionReport,
} from "@/lib/websiteConversionAnalytics";

const integer = new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat("en-ZA", {
  currency: "ZAR",
  maximumFractionDigits: 0,
  style: "currency",
});

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-[#D8C36A]/35 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
    </div>
  );
}

function dateOnly(value: string | null) {
  return value ? value.slice(0, 10) : null;
}

export default function WebsiteConversionPanel({
  from,
  to,
  venue,
}: {
  from: string;
  to: string;
  venue: "all" | "cape-town" | "johannesburg";
}) {
  const [report, setReport] = useState<WebsiteConversionReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const search = new URLSearchParams();
    if (from) search.set("from", from);
    if (to) search.set("to", to);
    search.set("venue", venue);

    fetchSupabaseApi<{ report: WebsiteConversionReport }>(
      `/api/admin/analytics/website-conversion?${search.toString()}`,
    )
      .then((body) => {
        if (active) setReport(body.report);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error
            ? loadError.message
            : "Website conversion analytics could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [from, to, venue]);

  const rates = useMemo(() => {
    if (!report) return null;
    const visitorStart = dateOnly(report.visitorTrackingAvailableFrom);
    const sessionStart = dateOnly(report.sessionTrackingAvailableFrom);
    const visitorRate = visitorStart && report.from >= visitorStart
      ? percentage(report.totals.visitor_completed_bookings, report.totals.visitors)
      : null;
    const sessionRate = sessionStart && report.from >= sessionStart
      ? percentage(report.totals.session_completed_bookings, report.totals.sessions)
      : null;
    return { sessionRate, visitorRate };
  }, [report]);

  if (loading) return <p className="py-4 text-sm text-zinc-400">Loading website conversion...</p>;
  if (error || !report || !rates) {
    return <p className="py-4 text-sm text-red-200">{error || "Website conversion data is unavailable."}</p>;
  }

  const trackingStart = dateOnly(report.visitorTrackingAvailableFrom);
  const holdDenominator = report.totals.completed_bookings
    + report.totals.active_incomplete_bookings
    + report.totals.abandoned_holds;
  const holdAbandonment = percentage(report.totals.abandoned_holds, holdDenominator);
  const journeyRate = percentage(
    report.totals.completed_bookings,
    report.totals.recorded_journey_starts,
  );
  const paymentCompletionRate = percentage(
    report.totals.payment_completed,
    report.totals.payment_started,
  );

  return (
    <div className="space-y-6">
      <div className="border-l-2 border-[#D8C36A] pl-4 text-sm leading-6 text-zinc-300">
        {trackingStart
          ? `Accurate anonymous visitor and 30-minute session measurement starts ${trackingStart}. Earlier funnel events are diagnostic event volumes, not historical visitors or sessions.`
          : "Zingara has not historically recorded unique website visitors or true sessions. Visitor-to-booking conversion is unavailable until the new anonymous measurement records Production traffic."}
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-1 lg:grid-cols-4">
        <Metric label="Consented Anonymous Visitors" value={trackingStart ? integer.format(report.totals.visitors) : "Not historically available"} />
        <Metric label="Consented 30-minute Sessions" value={trackingStart ? integer.format(report.totals.sessions) : "Not historically available"} />
        <Metric label="Completed Online Bookings" value={integer.format(report.totals.completed_bookings)} />
        <Metric label="Guests Booked" value={integer.format(report.totals.completed_guests)} />
        <Metric label="Booking Value" value={money.format(report.totals.completed_booking_value)} />
        <Metric label="Consented Visitor Conversion" value={rates.visitorRate === null ? "Not available" : `${rates.visitorRate.toFixed(2)}%`} />
        <Metric label="Consented Session Conversion" value={rates.sessionRate === null ? "Not available" : `${rates.sessionRate.toFixed(2)}%`} />
        <Metric label="Lower-funnel Hold Abandonment" value={holdAbandonment === null ? "Not available" : `${holdAbandonment.toFixed(2)}%`} />
      </div>
      <p className="text-xs leading-5 text-zinc-500">
        {rates.visitorRate === null
          ? "Visitor conversion is unavailable for this range."
          : `Consented visitor conversion = ${integer.format(report.totals.visitor_completed_bookings)} attributed completed bookings / ${integer.format(report.totals.visitors)} consented anonymous visitors.`}
        {" "}
        {rates.sessionRate === null
          ? "Session conversion is unavailable for this range."
          : `Consented session conversion = ${integer.format(report.totals.session_completed_bookings)} attributed completed bookings / ${integer.format(report.totals.sessions)} consented 30-minute sessions.`}
        {" "}
        {holdAbandonment === null
          ? "Lower-funnel hold abandonment is unavailable."
          : `Lower-funnel hold abandonment = ${integer.format(report.totals.abandoned_holds)} abandoned holds / ${integer.format(holdDenominator)} completed, active incomplete, or abandoned public checkout holds.`}
      </p>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-[#D8C36A]">Recorded Booking Funnel</h4>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          Historical counts before visitor tracking are real events, but cannot be treated as people or sessions. Recorded start-to-booking ratio: {journeyRate === null ? "not available" : `${journeyRate.toFixed(2)}%`} ({integer.format(report.totals.completed_bookings)} completed bookings / {integer.format(report.totals.recorded_journey_starts)} recorded starts).
        </p>
        <div className="mt-3 grid grid-cols-2 gap-x-5 md:grid-cols-5">
          <Metric label="Booking Starts" value={integer.format(report.totals.recorded_journey_starts)} />
          <Metric label="Performance Selected" value={integer.format(report.totals.performance_selected)} />
          <Metric label="Seating Selected" value={integer.format(report.totals.seating_selected)} />
          <Metric label="Guest Details" value={integer.format(report.totals.guest_details_reached)} />
          <Metric label="Payment Started" value={integer.format(report.totals.payment_started)} />
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          Payment-start completion: {paymentCompletionRate === null ? "not available" : `${paymentCompletionRate.toFixed(2)}%`} ({integer.format(report.totals.payment_completed)} completed public bookings / {integer.format(report.totals.payment_started)} public payment starts). Historical checkout-to-paid conversion is unavailable because the checkout event did not carry a stable booking reference.
        </p>
      </div>

      <div className="overflow-x-auto border-t border-white/10 pt-4">
        <table className="min-w-[760px] w-full text-left text-xs">
          <thead className="uppercase text-zinc-500">
            <tr>{["Date", "Visitors", "Sessions", "Starts", "Bookings", "Guests", "Value"].map((heading) => <th className="pb-2" key={heading}>{heading}</th>)}</tr>
          </thead>
          <tbody>
            {report.daily.map((row) => (
              <tr className="border-t border-white/8" key={row.report_date}>
                <td className="py-2 font-semibold">{row.report_date}</td>
                <td>{trackingStart && row.report_date >= trackingStart ? row.visitors : "—"}</td>
                <td>{trackingStart && row.report_date >= trackingStart ? row.sessions : "—"}</td>
                <td>{row.recorded_journey_starts}</td>
                <td>{row.completed_bookings}</td>
                <td>{row.completed_guests}</td>
                <td>{money.format(row.completed_booking_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.devices.length > 0 || report.sources.length > 0 ? (
        <div className="grid gap-6 border-t border-white/10 pt-4 md:grid-cols-2">
          <div><h4 className="text-xs font-bold uppercase text-zinc-500">Devices</h4><p className="mt-2 text-sm text-zinc-300">{report.devices.map((row) => `${row.label}: ${row.value}`).join(" · ") || "Not available"}</p></div>
          <div><h4 className="text-xs font-bold uppercase text-zinc-500">Traffic Sources</h4><p className="mt-2 text-sm text-zinc-300">{report.sources.map((row) => `${row.label}: ${row.value}`).join(" · ") || "Not available"}</p></div>
        </div>
      ) : null}

      <p className="text-xs leading-5 text-zinc-500">
        Traffic figures cover visitors who explicitly opted into Analytics. Public website bookings are limited to customer-public / online records. Synthetic QA customers and superseded checkout holds are excluded. An abandoned hold is a public checkout that created a hold but remained unpaid and was later cancelled or archived; it is not total website abandonment.
        {report.venue === "all" ? "" : " Venue traffic includes only visits and funnel events that can be attributed to the selected venue."}
      </p>
    </div>
  );
}
