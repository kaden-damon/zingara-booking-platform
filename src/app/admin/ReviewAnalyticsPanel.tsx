"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ManagementAnalyticsFilters } from "@/lib/managementAnalytics";
import type {
  RatingDistributionRow,
  ReviewAnalyticsFeedbackRow,
  ReviewAnalyticsReport,
} from "@/lib/reviews/reviewAnalytics";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

const integer = new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("en-ZA", {
  maximumFractionDigits: 1,
  style: "percent",
});

function rating(value: number | null) {
  return value === null ? "—" : value.toFixed(1) + " / 5";
}

function rate(value: number | null) {
  return value === null ? "—" : percent.format(value);
}

function venueLabel(value: string) {
  return value === "johannesburg" ? "Johannesburg" : "Cape Town";
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Kpi({
  helper,
  label,
  value,
}: {
  helper?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 border-l-2 border-white/15 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
      {helper ? <p className="mt-1 text-xs leading-5 text-zinc-500">{helper}</p> : null}
    </div>
  );
}

function Distribution({
  rows,
  title,
}: {
  rows: RatingDistributionRow[];
  title: string;
}) {
  const hasData = rows.some((row) => row.count > 0);
  return (
    <div>
      <h4 className="text-xs font-bold uppercase text-zinc-400">{title}</h4>
      {!hasData ? (
        <p className="mt-4 border-l-2 border-white/10 pl-3 text-sm text-zinc-500">
          No ratings are available for this selection.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <div className="grid grid-cols-[2.5rem_1fr_5.5rem] items-center gap-3 text-sm" key={row.rating}>
              <span className="font-semibold text-[#F2D66C]">{row.rating} ★</span>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#D8C36A]"
                  style={{ width: String(row.percentage * 100) + "%" }}
                />
              </div>
              <span className="text-right text-zinc-400">
                {row.count} · {percent.format(row.percentage)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackList({
  onOpenReview,
  rows,
  title,
}: {
  onOpenReview?: (reviewId: string, status: string) => void;
  rows: ReviewAnalyticsFeedbackRow[];
  title: string;
}) {
  return (
    <div>
      <h4 className="text-xs font-bold uppercase text-zinc-400">{title}</h4>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No feedback is available for this selection.</p>
      ) : (
        <div className="mt-3 divide-y divide-white/10 border-y border-white/10">
          {rows.map((row) => (
            <article className="py-4" key={row.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">
                    {row.rating} ★ · {row.displayName}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {venueLabel(row.venue)} · {row.performanceDate || "Performance unavailable"} ·{" "}
                    {statusLabel(row.status)}
                  </p>
                </div>
                {onOpenReview ? (
                  <button
                    className="rounded-full border border-[#D8C36A]/45 px-3 py-1.5 text-xs font-semibold uppercase text-[#F2D66C] hover:border-[#F2D66C]"
                    onClick={() => onOpenReview(row.id, row.status)}
                    type="button"
                  >
                    Open Review
                  </button>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                {row.preview || "Review preview unavailable."}
              </p>
              {row.contactRequested ? (
                <p className="mt-2 text-xs font-semibold uppercase text-amber-200">Contact requested</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReviewAnalyticsPanel({
  filters,
  onOpenReview,
}: {
  filters: ManagementAnalyticsFilters;
  onOpenReview?: (reviewId: string, status: string) => void;
}) {
  const [report, setReport] = useState<ReviewAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPublicDistribution, setShowPublicDistribution] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.venue !== "all") params.set("venue", filters.venue);
    if (filters.performanceId) params.set("performanceId", filters.performanceId);
    if (filters.performanceFrom) params.set("performanceFrom", filters.performanceFrom);
    if (filters.performanceTo) params.set("performanceTo", filters.performanceTo);
    if (filters.reviewSubmittedFrom) params.set("submittedFrom", filters.reviewSubmittedFrom);
    if (filters.reviewSubmittedTo) params.set("submittedTo", filters.reviewSubmittedTo);
    return params.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const endpoint = "/api/admin/analytics/reviews" + (query ? "?" + query : "");
      const body = await fetchSupabaseApi<{ report: ReviewAnalyticsReport }>(
        endpoint,
        { cache: "no-store" },
      );
      setReport(body.report);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Guest review analytics could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (loading) {
    return <p aria-busy="true" className="py-8 text-sm text-zinc-500">Loading Guest Reviews & Experience...</p>;
  }
  if (error || !report) {
    return (
      <div className="py-6">
        <p className="text-sm text-red-200" role="alert">{error || "Guest review analytics could not be loaded."}</p>
        <button className="mt-4 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold" onClick={() => void load()} type="button">Retry</button>
      </div>
    );
  }

  const noReviews = report.kpis.reviewsReceived === 0;
  const maxTrendCount = Math.max(1, ...report.trend.map((row) => row.reviewsReceived));

  return (
    <div className="space-y-7">
      <div className={"border-l-2 px-4 py-3 " + (report.workflow.enabled ? "border-emerald-300 bg-emerald-300/[0.04]" : "border-amber-200 bg-amber-200/[0.04]")}>
        <p className="text-sm font-semibold text-white">
          {report.workflow.enabled ? "Review requests are active." : "Review requests are currently off."}
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-400">
          {report.workflow.enabled
            ? "Requests are scheduled " + report.workflow.timingOffsetDays + " day after an attended performance."
            : "Zero invitations are not treated as a failed campaign while the workflow is disabled."}
        </p>
      </div>

      <p className="text-xs leading-5 text-zinc-500">
        Review Submitted uses its own submitted-date range. Performance reporting uses the Performance date range and selected performance. All dates use Africa/Johannesburg.
      </p>

      <div className="grid grid-cols-2 gap-y-4 md:grid-cols-4 xl:grid-cols-7">
        <Kpi helper="All verified submissions" label="Guest Rating" value={rating(report.kpis.guestRating)} />
        <Kpi label="Reviews Received" value={integer.format(report.kpis.reviewsReceived)} />
        <Kpi helper="Submitted ÷ mailer accepted" label="Response Rate" value={rate(report.kpis.responseRate)} />
        <Kpi helper="Published + consented" label="Public Rating" value={rating(report.kpis.publicRating)} />
        <Kpi label="Published Reviews" value={integer.format(report.kpis.publishedReviews)} />
        <Kpi label="Needs Review" value={integer.format(report.kpis.needsReview)} />
        <Kpi label="Contact Requested" value={integer.format(report.kpis.contactRequested)} />
      </div>

      {noReviews ? (
        <div className="border-y border-white/10 py-8 text-center">
          <p className="text-base font-semibold text-white">No guest reviews yet</p>
          <p className="mt-2 text-sm text-zinc-500">
            Ratings and experience trends will begin with real verified submissions.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-7 lg:grid-cols-2">
            <Distribution rows={report.ratingDistribution} title="Guest Rating Distribution" />
            <div>
              <div className="flex items-center justify-between gap-4">
                <h4 className="text-xs font-bold uppercase text-zinc-400">Public Rating Distribution</h4>
                <button
                  aria-expanded={showPublicDistribution}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-300"
                  onClick={() => setShowPublicDistribution((current) => !current)}
                  type="button"
                >
                  {showPublicDistribution ? "Hide" : "Show"}
                </button>
              </div>
              {showPublicDistribution ? (
                <div className="mt-4">
                  <Distribution rows={report.publicDistribution} title="Published + Consented Only" />
                </div>
              ) : (
                <p className="mt-4 text-sm text-zinc-500">Secondary public-only distribution is collapsed.</p>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase text-zinc-400">
              Reviews Received & Guest Rating · {statusLabel(report.trendGrain)}
            </h4>
            <div className="mt-4 space-y-3">
              {report.trend.map((row) => (
                <div className="grid grid-cols-[6rem_1fr_auto] items-center gap-3 text-xs sm:grid-cols-[8rem_1fr_9rem]" key={row.period}>
                  <span className="text-zinc-400">{row.period}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-[#D8C36A]" style={{ width: String(Math.max(3, row.reviewsReceived / maxTrendCount * 100)) + "%" }} />
                  </div>
                  <span className="text-right font-semibold">{row.reviewsReceived} · {rating(row.guestRating)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div>
        <h4 className="text-xs font-bold uppercase text-zinc-400">Review Journey</h4>
        <div className="mt-3 grid grid-cols-2 gap-y-3 md:grid-cols-5">
          <Kpi helper="Persisted check-in evidence" label="Attended" value={integer.format(report.funnel.attended)} />
          <Kpi label="Invitation Created" value={integer.format(report.funnel.invitationCreated)} />
          <Kpi helper="Accepted by mail infrastructure" label="Mailer Accepted" value={integer.format(report.funnel.mailerAccepted)} />
          <Kpi label="Submitted" value={integer.format(report.funnel.submitted)} />
          <Kpi label="Published" value={integer.format(report.funnel.published)} />
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          Response Rate = submitted reviews from accepted invitations ÷ accepted invitations. Publication Rate {rate(report.kpis.publicationRate)} · Public Consent Rate {rate(report.kpis.consentRate)}. Zingara does not claim email opens, clicks or inbox delivery.
        </p>
      </div>

      <div className="overflow-x-auto">
        <h4 className="text-xs font-bold uppercase text-zinc-400">Venue Comparison</h4>
        <table className="mt-3 min-w-[760px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-zinc-500">
            <tr>{["Venue", "Reviews", "Guest Rating", "Public Rating", "Response", "Published", "Contact Requested"].map((heading) => <th className="pb-3" key={heading}>{heading}</th>)}</tr>
          </thead>
          <tbody>
            {report.venueComparison.map((row) => (
              <tr className="border-t border-white/10" key={row.venue}>
                <td className="py-3 font-semibold">{venueLabel(row.venue)}</td>
                <td>{row.reviewsReceived}</td>
                <td>{rating(row.guestRating)}</td>
                <td>{rating(row.publicRating)}</td>
                <td>{rate(row.responseRate)}</td>
                <td>{row.published}</td>
                <td>{row.contactRequested}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <h4 className="text-xs font-bold uppercase text-zinc-400">Performance Experience</h4>
        {report.performance.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No reviewed performances match this selection.</p>
        ) : (
          <table className="mt-3 min-w-[760px] w-full text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>{["Date", "Venue", "Time", "Reviews", "Guest Rating", "Response", "Contact Requested"].map((heading) => <th className="pb-3" key={heading}>{heading}</th>)}</tr>
            </thead>
            <tbody>{report.performance.map((row) => (
              <tr className="border-t border-white/10" key={row.id}>
                <td className="py-3 font-semibold">{row.date}</td><td>{venueLabel(row.venue)}</td><td>{row.time}</td><td>{row.reviewsReceived}</td><td>{rating(row.guestRating)}</td><td>{rate(row.responseRate)}</td><td>{row.contactRequested}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      <div className="grid gap-7 xl:grid-cols-2">
        <FeedbackList onOpenReview={onOpenReview} rows={report.lowRatings} title="1–2 Star Visibility" />
        <FeedbackList onOpenReview={onOpenReview} rows={report.recentFeedback} title="Recent Feedback" />
      </div>

      <div className="grid grid-cols-2 gap-y-3 md:grid-cols-5">
        <Kpi label="Needs Review" value={integer.format(report.moderation.needsReview)} />
        <Kpi label="Published" value={integer.format(report.moderation.published)} />
        <Kpi label="Not Published" value={integer.format(report.moderation.notPublished)} />
        <Kpi label="Previously Unpublished" value={integer.format(report.moderation.unpublished)} />
        <Kpi label="Featured" value={integer.format(report.kpis.featured)} />
      </div>
    </div>
  );
}
