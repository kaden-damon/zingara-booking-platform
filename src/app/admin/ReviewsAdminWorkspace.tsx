"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

type ReviewStatus = "needs_review" | "not_published" | "published";
type ReviewRow = {
  bookingReference: string;
  contactRequested: boolean;
  displayName: string;
  featured: boolean;
  guestCount: number | null;
  history: Array<{
    actor: string;
    at: string;
    fromStatus: string | null;
    note: string | null;
    toStatus: string | null;
    type: string;
  }>;
  id: string;
  moderationNote: string | null;
  performanceDate: string | null;
  performanceName: string;
  performanceTime: string | null;
  publicationConsent: boolean;
  rating: number;
  reviewText: string;
  revision: number;
  status: ReviewStatus;
  submittedAt: string;
  venue: string;
  verifiedGuest: boolean;
};

type ReviewPage = {
  page: number;
  pageSize: number;
  rows: ReviewRow[];
  total: number;
};

const statusOptions: Array<{ label: string; value: ReviewStatus }> = [
  { label: "Needs Review", value: "needs_review" },
  { label: "Published", value: "published" },
  { label: "Not Published", value: "not_published" },
];
const reviewAnalyticsTargetKey = "zingara-admin-review-analytics-target";

function venueLabel(value: string) {
  return value === "johannesburg" ? "Johannesburg" : "Cape Town";
}

function dateLabel(value: string | null) {
  if (!value) return "Date unavailable";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function ReviewsAdminWorkspace() {
  const [status, setStatus] = useState<ReviewStatus>("needs_review");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<ReviewPage>({ page: 1, pageSize: 20, rows: [], total: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [targetReviewId, setTargetReviewId] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const query = new URLSearchParams(window.location.search);
        const queryReviewId = query.get("reviewId");
        const queryStatus = query.get("reviewStatus") as ReviewStatus | null;
        if (queryReviewId && queryStatus && statusOptions.some((option) => option.value === queryStatus)) {
          setStatus(queryStatus);
          setPage(1);
          setSearch("");
          setTargetReviewId(queryReviewId);
          return;
        }
        const stored = sessionStorage.getItem(reviewAnalyticsTargetKey);
        if (!stored) return;
        const target = JSON.parse(stored) as { reviewId?: string; status?: ReviewStatus };
        if (!target.reviewId || !statusOptions.some((option) => option.value === target.status)) return;
        setStatus(target.status!);
        setPage(1);
        setSearch("");
        setTargetReviewId(target.reviewId);
        sessionStorage.removeItem(reviewAnalyticsTargetKey);
      } catch {
        sessionStorage.removeItem(reviewAnalyticsTargetKey);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20", status });
      if (search.trim()) params.set("search", search.trim());
      if (targetReviewId) params.set("reviewId", targetReviewId);
      const data = await fetchSupabaseApi<ReviewPage>(`/api/admin/reviews?${params.toString()}`, {
        cache: "no-store",
      });
      setResult(data);
      setSelectedId((current) =>
        current && data.rows.some((row) => row.id === current) ? current : data.rows[0]?.id ?? null,
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The review queue could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [page, search, status, targetReviewId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = result.rows.find((row) => row.id === selectedId) ?? null;
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));

  async function moderate(
    action: "do_not_publish" | "feature" | "publish" | "unfeature" | "unpublish",
  ) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await fetchSupabaseApi("/api/admin/reviews", {
        body: { action, note, reviewId: selected.id, revision: selected.revision },
        method: "PATCH",
      });
      setNote("");
      await load();
    } catch (moderationError) {
      setError(
        moderationError instanceof Error
          ? moderationError.message
          : "The review could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300">Guest feedback</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">Guest Reviews</h2>
      </div>

      <div className="flex flex-col gap-3 border-y border-white/10 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex overflow-x-auto rounded-xl border border-white/10 p-1">
          {statusOptions.map((option) => (
            <button
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] ${status === option.value ? "bg-amber-300 text-black" : "text-zinc-400 hover:text-white"}`}
              key={option.value}
              onClick={() => {
                setTargetReviewId("");
                setStatus(option.value);
                setPage(1);
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 lg:w-80">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">Search</span>
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
            onChange={(event) => {
              setTargetReviewId("");
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Name or review text"
            value={search}
          />
        </label>
      </div>

      {targetReviewId ? (
        <button
          className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-300 hover:text-amber-200"
          onClick={() => setTargetReviewId("")}
          type="button"
        >
          Back to review queue
        </button>
      ) : null}

      {error && <p className="border-l-2 border-red-400 pl-3 text-sm text-red-200" role="alert">{error}</p>}

      <div className="grid min-h-[520px] gap-5 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-2">
          {loading ? (
            <p className="py-10 text-sm text-zinc-500">Loading verified reviews...</p>
          ) : result.rows.length === 0 ? (
            <p className="py-10 text-sm text-zinc-500">No reviews are waiting.</p>
          ) : (
            result.rows.map((review) => (
              <button
                className={`w-full rounded-xl border p-4 text-left transition ${selectedId === review.id ? "border-amber-300/70 bg-amber-300/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/25"}`}
                key={review.id}
                onClick={() => {
                  setSelectedId(review.id);
                  setNote(review.moderationNote ?? "");
                }}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{review.displayName}</p>
                    <p className="mt-1 text-xs text-zinc-500">{venueLabel(review.venue)} · {dateLabel(review.performanceDate)}</p>
                  </div>
                  <span className="whitespace-nowrap text-sm text-amber-300" aria-label={`${review.rating} stars`}>
                    {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                  </span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-5 text-zinc-400">{review.reviewText}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
                  <span className={`rounded-full border px-2 py-1 ${review.verifiedGuest ? "border-emerald-400/30 text-emerald-300" : "border-sky-400/30 text-sky-300"}`}>
                    {review.verifiedGuest ? "Verified guest" : "Invited guest"}
                  </span>
                  {review.featured && <span className="rounded-full border border-amber-300/30 px-2 py-1 text-amber-200">Featured</span>}
                  {review.contactRequested && <span className="rounded-full border border-sky-400/30 px-2 py-1 text-sky-300">Contact requested</span>}
                  {!review.publicationConsent && <span className="rounded-full border border-white/15 px-2 py-1 text-zinc-400">Private only</span>}
                </div>
              </button>
            ))
          )}

          <div className="flex items-center justify-between pt-3 text-xs text-zinc-500">
            <span>{result.total} review{result.total === 1 ? "" : "s"}</span>
            <div className="flex items-center gap-2">
              <button
                aria-label="Previous page"
                className="h-8 w-8 rounded-full border border-white/10 text-white disabled:opacity-30"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                title="Previous page"
                type="button"
              >
                ←
              </button>
              <span>{page} / {pageCount}</span>
              <button
                aria-label="Next page"
                className="h-8 w-8 rounded-full border border-white/10 text-white disabled:opacity-30"
                disabled={page >= pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                title="Next page"
                type="button"
              >
                →
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-5 sm:p-6">
          {!selected ? (
            <p className="text-sm text-zinc-500">Select a review to inspect it.</p>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xl font-semibold text-white">{selected.displayName}</p>
                  <p className="mt-1 text-sm text-zinc-400">{selected.bookingReference} · {selected.guestCount ?? "-"} guests · {selected.verifiedGuest ? "Verified Guest" : "Invited Guest"}</p>
                </div>
                <span className="self-start rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold uppercase text-zinc-300">{statusLabel(selected.status)}</span>
              </div>

              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs uppercase text-zinc-500">Performance</dt><dd className="mt-1 text-zinc-200">{selected.performanceName}</dd></div>
                <div><dt className="text-xs uppercase text-zinc-500">Venue / date</dt><dd className="mt-1 text-zinc-200">{venueLabel(selected.venue)} · {dateLabel(selected.performanceDate)} · {selected.performanceTime ?? "-"}</dd></div>
                <div><dt className="text-xs uppercase text-zinc-500">Submitted</dt><dd className="mt-1 text-zinc-200">{new Date(selected.submittedAt).toLocaleString("en-ZA")}</dd></div>
                <div><dt className="text-xs uppercase text-zinc-500">Publication consent</dt><dd className="mt-1 text-zinc-200">{selected.publicationConsent ? "Yes" : "No"}</dd></div>
              </dl>

              <div>
                <p className="text-2xl text-amber-300" aria-label={`${selected.rating} stars`}>{"★".repeat(selected.rating)}{"☆".repeat(5 - selected.rating)}</p>
                <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-zinc-200">{selected.reviewText}</p>
              </div>

              {selected.contactRequested && (
                <p className="rounded-xl border border-sky-400/25 bg-sky-400/[0.06] px-4 py-3 text-sm text-sky-100">This guest asked to be contacted. Use the linked booking to follow up through the normal customer workflow.</p>
              )}

              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500" htmlFor="moderation-note">Internal moderation note</label>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-white outline-none focus:border-amber-300"
                  id="moderation-note"
                  maxLength={1000}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Optional. This is never shown publicly."
                  value={note}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                {selected.status !== "published" && (
                  <button
                    className="rounded-full bg-amber-300 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
                    disabled={busy || !selected.publicationConsent}
                    onClick={() => void moderate("publish")}
                    title={selected.publicationConsent ? "Publish review" : "Guest publication consent is required"}
                    type="button"
                  >
                    Publish
                  </button>
                )}
                {selected.status === "published" && (
                  <button className="rounded-full border border-white/20 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40" disabled={busy} onClick={() => void moderate("unpublish")} type="button">Unpublish</button>
                )}
                {selected.status === "published" && (
                  <button
                    className="rounded-full border border-amber-300/35 px-4 py-2.5 text-sm font-semibold text-amber-200 disabled:opacity-40"
                    disabled={busy}
                    onClick={() => void moderate(selected.featured ? "unfeature" : "feature")}
                    type="button"
                  >
                    {selected.featured ? "Remove featured" : "Mark featured"}
                  </button>
                )}
                {selected.status !== "not_published" && (
                  <button className="rounded-full border border-red-400/30 px-4 py-2.5 text-sm font-semibold text-red-200 disabled:opacity-40" disabled={busy} onClick={() => void moderate("do_not_publish")} type="button">Do not publish</button>
                )}
              </div>

              <div className="border-t border-white/10 pt-5">
                <h3 className="text-sm font-semibold text-white">History</h3>
                <div className="mt-3 space-y-3">
                  {selected.history.map((event, index) => (
                    <div className="grid gap-1 text-xs sm:grid-cols-[140px_1fr]" key={`${event.at}-${index}`}>
                      <span className="text-zinc-500">{new Date(event.at).toLocaleString("en-ZA")}</span>
                      <span className="text-zinc-300">{statusLabel(event.type)} · {event.actor}{event.note ? ` · ${event.note}` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
