"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PublicReviewPayload,
  PublicReviewsResponse,
} from "@/lib/reviews/reviews";

type DisplayMode = "homepage" | "reviews";
type Fixture = "empty" | "error" | "wix";
type Venue = "all" | "cape-town" | "johannesburg";

const venueLabels: Record<Venue, string> = {
  all: "All venues",
  "cape-town": "Cape Town",
  johannesburg: "Johannesburg",
};

function reviewVenue(value: string) {
  return value === "johannesburg" ? "Johannesburg" : "Cape Town";
}

function ReviewStars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5 stars`} className="text-base text-[#D8C36A]">
      {"★".repeat(rating)}<span aria-hidden="true" className="opacity-25">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function ReviewCard({ review }: { review: PublicReviewPayload }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = review.reviewText.length > 260;

  return (
    <article className="flex min-h-[264px] flex-col rounded-lg border border-white/10 bg-white/[0.035] p-6 sm:p-7">
      <ReviewStars rating={review.rating} />
      <p className={`mt-5 text-[15px] leading-7 text-zinc-200 ${expanded ? "" : "line-clamp-5"}`}>
        &ldquo;{review.reviewText}&rdquo;
      </p>
      {isLong && (
        <button
          className="mt-2 self-start text-xs font-semibold text-[#D8C36A] hover:text-[#eadb93]"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
      <div className="mt-auto pt-6">
        <p className="font-semibold text-white">{review.displayName || "Zingara Guest"}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
          <span className={review.guestType === "verified" ? "text-emerald-300" : "text-sky-300"}>
            {review.guestType === "verified" ? "Verified Guest" : "Invited Guest"}
          </span>
          <span>{reviewVenue(review.venue)}</span>
        </div>
      </div>
    </article>
  );
}

export default function WixReviewsPreviewClient() {
  const [mode, setMode] = useState<DisplayMode>("homepage");
  const [venue, setVenue] = useState<Venue>("all");
  const [fixture, setFixture] = useState<Fixture>("wix");
  const [page, setPage] = useState(1);
  const [response, setResponse] = useState<PublicReviewsResponse | null>(null);
  const [reviews, setReviews] = useState<PublicReviewPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const limit = mode === "homepage" ? 3 : 2;
  const query = useMemo(() => {
    const params = new URLSearchParams({ fixture, limit: String(limit), page: String(page) });
    if (mode === "homepage") params.set("featured", "true");
    if (venue !== "all") params.set("venue", venue);
    return params.toString();
  }, [fixture, limit, mode, page, venue]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetch(`/api/reviews/public?${query}`, { cache: "no-store" });
      if (!result.ok) throw new Error("Guest reviews are temporarily unavailable.");
      const body = (await result.json()) as PublicReviewsResponse;
      if (body.contractVersion !== "1.0") throw new Error("Unsupported review feed version.");
      setResponse(body);
      setReviews((current) => (page === 1 ? body.reviews : [...current, ...body.reviews]));
    } catch (loadError) {
      setResponse(null);
      setReviews([]);
      setError(loadError instanceof Error ? loadError.message : "Guest reviews are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function reset(next: { fixture?: Fixture; mode?: DisplayMode; venue?: Venue }) {
    setPage(1);
    setReviews([]);
    if (next.fixture) setFixture(next.fixture);
    if (next.mode) setMode(next.mode);
    if (next.venue) setVenue(next.venue);
  }

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 border-b border-white/10 pb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">Local Wix consumer preview</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold sm:text-3xl">Approved review feed</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">This development-only page consumes the same public JSON contract prepared for the Wix website.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["homepage", "reviews"] as DisplayMode[]).map((value) => (
                <button
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${mode === value ? "bg-[#D8C36A] text-black" : "border border-white/15 text-zinc-300"}`}
                  key={value}
                  onClick={() => reset({ mode: value })}
                  type="button"
                >
                  {value === "homepage" ? "Homepage" : "Reviews page"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <section aria-label="Preview controls" className="mb-10 flex flex-col gap-3 border-y border-white/10 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(["all", "johannesburg", "cape-town"] as Venue[]).map((value) => (
              <button
                className={`rounded-full px-3 py-2 text-xs ${venue === value ? "bg-white text-black" : "border border-white/15 text-zinc-300"}`}
                key={value}
                onClick={() => reset({ venue: value })}
                type="button"
              >
                {venueLabels[value]}
              </button>
            ))}
          </div>
          <label className="relative flex items-center gap-2 text-xs text-zinc-400">
            Fixture
            <select
              className="appearance-none rounded-full border border-white/15 bg-black py-2 pl-3 pr-9 text-white outline-none"
              onChange={(event) => reset({ fixture: event.target.value as Fixture })}
              value={fixture}
            >
              <option value="wix">Published reviews</option>
              <option value="empty">Empty state</option>
              <option value="error">API error</option>
            </select>
          </label>
        </section>

        <section aria-live="polite">
          <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">What our guests say</p>
              <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Verified guest reviews</h2>
            </div>
            {response && response.aggregates.publishedCount > 0 && (
              <div className="sm:text-right">
                <p className="text-2xl font-semibold text-white">{response.aggregates.averageRating.toFixed(1)} / 5</p>
                <p className="mt-1 text-xs text-zinc-400">From {response.aggregates.publishedCount} published review{response.aggregates.publishedCount === 1 ? "" : "s"}</p>
              </div>
            )}
          </div>

          {loading && reviews.length === 0 ? (
            <div className="flex min-h-52 items-center justify-center border-y border-white/10 text-sm text-zinc-400">Loading guest reviews...</div>
          ) : error ? (
            <div className="flex min-h-52 flex-col items-center justify-center border-y border-white/10 px-4 text-center">
              <p className="text-sm text-zinc-300">{error}</p>
              <button className="mt-4 text-sm font-semibold text-[#D8C36A]" onClick={() => void load()} type="button">Try again</button>
            </div>
          ) : reviews.length === 0 ? (
            <div className="flex min-h-52 items-center justify-center border-y border-white/10 px-4 text-center text-sm text-zinc-400">No published guest reviews are available for this selection yet.</div>
          ) : (
            <>
              <div className={`grid gap-4 ${mode === "homepage" ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2"}`}>
                {reviews.map((review) => <ReviewCard key={review.publicReviewId} review={review} />)}
              </div>
              {mode === "reviews" && response?.pagination.hasMore && (
                <div className="mt-8 text-center">
                  <button className="rounded-full border border-[#D8C36A]/60 px-5 py-2.5 text-sm font-semibold text-[#D8C36A] disabled:opacity-50" disabled={loading} onClick={() => setPage((value) => value + 1)} type="button">{loading ? "Loading..." : "Load more"}</button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
