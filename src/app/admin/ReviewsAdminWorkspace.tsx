"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import PlatformFeedbackAdminWorkspace from "./PlatformFeedbackAdminWorkspace";

type ReviewStatus = "needs_review" | "not_published" | "published";
type ContactFilter = "all" | "contact_requested" | "contacted" | "not_contacted";
type PrivacyFilter = "all" | "private" | "public";
type ReplyFilter = "all" | "replied" | "not_replied";
type VenueFilter = "all" | "cape-town" | "johannesburg";
type ReviewRow = {
  anonymousPublicationAllowed: boolean;
  anonymousIdentityWarnings: string[];
  bookingReference: string;
  categoryRatings: { ambience: number | null; food: number | null; service: number | null; value: number | null };
  contact: { email: string | null; mobile: string | null } | null;
  contactRequested: boolean;
  contactedAt: string | null;
  contactedBy: string | null;
  contactMethod: "manual_follow_up" | "zingara_email" | null;
  contactState: "contact_requested" | "contacted" | "not_contacted";
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
  latestReply: { actor_name: string; sent_at: string } | null;
  moderationNote: string | null;
  performanceDate: string | null;
  performanceName: string;
  performanceTime: string | null;
  publicationConsent: boolean;
  publicationConsentMode: "anonymous" | "private" | "public";
  publicationMode: "anonymous" | "named" | null;
  publicationPolicyVersion: string | null;
  privacyRequested: boolean | null;
  rating: number;
  reviewText: string;
  replies: Array<{ actor_email: string; actor_name: string; id: string; message: string; sent_at: string }>;
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

type BulkPreview = { anonymous: number; eligible: number; excluded: number; named: number };

const statusOptions: Array<{ label: string; value: ReviewStatus }> = [
  { label: "Needs Review", value: "needs_review" },
  { label: "Published", value: "published" },
  { label: "Not Published", value: "not_published" },
];
const reviewAnalyticsTargetKey = "zingara-admin-review-analytics-target";
const reviewFollowUpSubject = "Your Zingara Experience – Review Follow-Up";

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

function ActionIcon({ name }: { name: "check" | "copy" | "email" | "filter" | "history" | "phone" | "publish" | "reply" | "reset" | "search" }) {
  const paths = {
    check: <path d="m5 12 4 4L19 6" />,
    copy: <><rect height="13" rx="2" width="13" x="8" y="8" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    email: <><rect height="16" rx="2" width="20" x="2" y="4" /><path d="m3 6 9 7 9-7" /></>,
    filter: <path d="M4 5h16M7 12h10m-7 7h4" />,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5m4-1v5l3 2" /></>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7A2 2 0 0 1 22 16.9Z" />,
    publish: <><path d="M12 3v12m0-12 4 4m-4-4L8 7" /><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></>,
    reply: <path d="m9 17-5-5 5-5v3h4a7 7 0 0 1 7 7v2a8 8 0 0 0-7-5H9v3Z" />,
    reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  };
  return <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">{paths[name]}</svg>;
}

function FilterSelect({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: Array<[string, string]>; value: string }) {
  return (
    <label className="min-w-0">
      <span className="sr-only">{label}</span>
      <select aria-label={label} className="min-h-10 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 text-xs font-semibold text-zinc-200 outline-none focus:border-amber-300" onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select>
    </label>
  );
}

export default function ReviewsAdminWorkspace() {
  const [feedbackType, setFeedbackType] = useState<"platform" | "show">("show");
  const [status, setStatus] = useState<ReviewStatus>("needs_review");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [ratingFilter, updateRatingFilter] = useState("all");
  const [venueFilter, setVenueFilter] = useState<VenueFilter>("all");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");
  const [replyFilter, setReplyFilter] = useState<ReplyFilter>("all");
  const [privacyFilter, setPrivacyFilter] = useState<PrivacyFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [result, setResult] = useState<ReviewPage>({ page: 1, pageSize: 10, rows: [], total: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ReviewRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [targetReviewId, setTargetReviewId] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [replyKey, setReplyKey] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyStatus, setReplyStatus] = useState("");
  const [detailVersion, setDetailVersion] = useState(0);
  const [copied, setCopied] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactStatus, setContactStatus] = useState("");
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState("");
  const bulkCancelRef = useRef<HTMLButtonElement>(null);
  const bulkConfirmRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), search.trim() ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!bulkOpen) return;
    bulkCancelRef.current?.focus();
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !bulkBusy) {
        setBulkOpen(false);
        setBulkPreview(null);
        return;
      }
      if (event.key !== "Tab") return;
      if (event.shiftKey && document.activeElement === bulkCancelRef.current) {
        event.preventDefault();
        bulkConfirmRef.current?.focus();
      } else if (!event.shiftKey && document.activeElement === bulkConfirmRef.current) {
        event.preventDefault();
        bulkCancelRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKeys);
    return () => window.removeEventListener("keydown", handleDialogKeys);
  }, [bulkBusy, bulkOpen]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "10", status });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (targetReviewId) params.set("reviewId", targetReviewId);
      params.set("rating", ratingFilter);
      params.set("venue", venueFilter);
      params.set("contact", contactFilter);
      params.set("reply", replyFilter);
      params.set("privacy", privacyFilter);
      const data = await fetchSupabaseApi<ReviewPage>(`/api/admin/reviews?${params.toString()}`, {
        cache: "no-store",
        signal,
      });
      setResult(data);
      setSelectedId((current) => current ?? data.rows[0]?.id ?? null);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "The review queue could not be loaded.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [contactFilter, debouncedSearch, page, privacyFilter, ratingFilter, replyFilter, status, targetReviewId, venueFilter]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!selectedId) return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      details: "true",
      page: "1",
      pageSize: "10",
      reviewId: selectedId,
      status,
    });
    const timer = window.setTimeout(() => {
      setDetailLoading(true);
      void fetchSupabaseApi<ReviewPage>(`/api/admin/reviews?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((data) => {
          const detail = data.rows[0] ?? null;
          setSelectedDetail(detail);
          setNote(detail?.moderationNote ?? "");
        })
        .catch((detailError) => {
          if (detailError instanceof DOMException && detailError.name === "AbortError") return;
          setError(detailError instanceof Error ? detailError.message : "Review details could not be loaded.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setDetailLoading(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [detailVersion, selectedId, status]);

  const listSelected = result.rows.find((row) => row.id === selectedId) ?? null;
  const selected = selectedDetail?.id === selectedId ? selectedDetail : listSelected;
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const activeFilterCount = [ratingFilter, venueFilter, contactFilter, replyFilter, privacyFilter]
    .filter((value) => value !== "all").length;

  function resetFilters() {
    updateRatingFilter("all");
    setVenueFilter("all");
    setContactFilter("all");
    setReplyFilter("all");
    setPrivacyFilter("all");
    setSearch("");
    setTargetReviewId("");
    setSelectedId(null);
    setPage(1);
  }

  function changeFilter(update: () => void) {
    update();
    setTargetReviewId("");
    setSelectedId(null);
    setPage(1);
  }

  async function moderate(
    action: "do_not_publish" | "feature" | "publish" | "publish_anonymous" | "unfeature" | "unpublish",
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
      setSelectedDetail(null);
      setSelectedId(null);
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

  async function sendReply() {
    if (!selected || !replyMessage.trim()) return;
    setReplyBusy(true);
    setError("");
    setReplyStatus("");
    try {
      const idempotencyKey = replyKey || crypto.randomUUID();
      setReplyKey(idempotencyKey);
      await fetchSupabaseApi("/api/admin/reviews/reply", {
        body: { idempotencyKey, message: replyMessage.trim(), reviewId: selected.id },
        method: "POST",
      });
      setReplyMessage("");
      setReplyKey("");
      setReplyStatus("Reply sent.");
      setSelectedDetail(null);
      setDetailVersion((value) => value + 1);
      await load();
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : "The reply couldn't be sent. Try again.");
    } finally {
      setReplyBusy(false);
    }
  }

  async function updateContact(action: "mark" | "undo") {
    if (!selected) return;
    setContactBusy(true);
    setError("");
    setContactStatus("");
    try {
      await fetchSupabaseApi("/api/admin/reviews/contact", {
        body: { action, reviewId: selected.id, revision: selected.revision },
        method: "POST",
      });
      setContactStatus(action === "mark" ? "Marked contacted." : "Contact mark removed.");
      setSelectedDetail(null);
      setDetailVersion((value) => value + 1);
      await load();
    } catch (contactError) {
      setError(contactError instanceof Error ? contactError.message : "The contact status couldn't be updated.");
    } finally {
      setContactBusy(false);
    }
  }

  async function copyMobile() {
    if (!selected?.contact?.mobile) return;
    await navigator.clipboard.writeText(selected.contact.mobile);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function openBulkPreview() {
    setBulkBusy(true);
    setError("");
    setBulkResult("");
    try {
      const preview = await fetchSupabaseApi<BulkPreview>(`/api/admin/reviews/bulk-publish?venue=${encodeURIComponent(venueFilter)}`, { cache: "no-store" });
      setBulkPreview(preview);
      setBulkOpen(true);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Eligible reviews couldn't be checked.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function publishBulkReviews() {
    if (!bulkPreview || bulkPreview.eligible === 0) return;
    setBulkBusy(true);
    setError("");
    let published = 0;
    let concurrentSkips = 0;
    try {
      for (let batch = 0; batch < 20; batch += 1) {
        const result = await fetchSupabaseApi<{ published: number; remaining: number; skipped: number }>("/api/admin/reviews/bulk-publish", {
          body: { venue: venueFilter },
          method: "POST",
        });
        published += result.published;
        concurrentSkips += result.skipped;
        if (result.remaining === 0 || result.published === 0) break;
      }
      const skipped = bulkPreview.excluded + concurrentSkips;
      setBulkResult(`${published} published · ${skipped} skipped`);
      setBulkOpen(false);
      setBulkPreview(null);
      setSelectedDetail(null);
      setSelectedId(null);
      await load();
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Eligible reviews couldn't be published.");
    } finally {
      setBulkBusy(false);
    }
  }

  if (feedbackType === "platform") {
    return <PlatformFeedbackAdminWorkspace onShowReviews={() => setFeedbackType("show")} />;
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300">Guest feedback</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Guest Reviews</h2>
        </div>
        <button className="min-h-10 rounded-full border border-white/15 px-4 text-xs font-semibold text-zinc-200 hover:border-amber-300/50" onClick={() => setFeedbackType("platform")} type="button">
          Platform Feedback
        </button>
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
                setSelectedId(null);
                setPage(1);
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 lg:w-72 lg:flex-none">
            <span className="sr-only">Search reviews</span>
            <span className="text-zinc-500"><ActionIcon name="search" /></span>
            <input
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
              onChange={(event) => {
                setTargetReviewId("");
                setSelectedId(null);
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search reviews"
              type="search"
              value={search}
            />
          </label>
          <button aria-expanded={filtersOpen} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-zinc-200 hover:border-amber-300/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" onClick={() => setFiltersOpen((value) => !value)} title="Review filters" type="button">
            <ActionIcon name="filter" /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </button>
          {status === "needs_review" ? (
            <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-300 px-3 text-xs font-bold text-black hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 disabled:opacity-40" disabled={bulkBusy} onClick={() => void openBulkPreview()} title="Publish eligible four and five star reviews" type="button">
              <ActionIcon name="publish" /> {bulkBusy ? "Checking..." : "Publish 4–5★"}
            </button>
          ) : null}
        </div>
      </div>

      {filtersOpen ? (
        <div className="grid gap-2 border-b border-white/10 pb-4 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
          <FilterSelect label="Overall rating" onChange={(value) => changeFilter(() => updateRatingFilter(value))} options={[["all", "All ratings"], ["1", "1★"], ["2", "2★"], ["3", "3★"], ["4", "4★"], ["5", "5★"]]} value={ratingFilter} />
          <FilterSelect label="Venue" onChange={(value) => changeFilter(() => setVenueFilter(value as VenueFilter))} options={[["all", "All venues"], ["cape-town", "Cape Town"], ["johannesburg", "Johannesburg"]]} value={venueFilter} />
          <FilterSelect label="Contact" onChange={(value) => changeFilter(() => setContactFilter(value as ContactFilter))} options={[["all", "All contact"], ["contact_requested", "Contact requested"], ["contacted", "Contacted"], ["not_contacted", "Not contacted"]]} value={contactFilter} />
          <FilterSelect label="Reply" onChange={(value) => changeFilter(() => setReplyFilter(value as ReplyFilter))} options={[["all", "All replies"], ["replied", "Replied"], ["not_replied", "Not replied"]]} value={replyFilter} />
          <FilterSelect label="Privacy" onChange={(value) => changeFilter(() => setPrivacyFilter(value as PrivacyFilter))} options={[["all", "All privacy"], ["public", "Public"], ["private", "Private requested"]]} value={privacyFilter} />
          <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-zinc-300 hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" onClick={resetFilters} title="Reset review filters" type="button"><ActionIcon name="reset" /> Reset</button>
        </div>
      ) : null}

      {bulkResult ? <p className="text-sm text-emerald-300" role="status">{bulkResult}</p> : null}

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
                  setCopied(false);
                  setContactStatus("");
                  setReplyStatus("");
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
                  {review.contactState === "contacted" ? <span className="rounded-full border border-emerald-400/30 px-2 py-1 text-emerald-300">Contacted</span> : null}
                  {review.contactState === "contact_requested" ? <span className="rounded-full border border-sky-400/30 px-2 py-1 text-sky-300">Contact requested</span> : null}
                  {review.latestReply && <span className="rounded-full border border-emerald-400/30 px-2 py-1 text-emerald-300">Replied · {review.latestReply.actor_name}</span>}
                  {review.privacyRequested === true && <span className="rounded-full border border-white/15 px-2 py-1 text-zinc-300">Private requested</span>}
                  {review.status === "published" && <span className="rounded-full border border-amber-300/30 px-2 py-1 text-amber-200">Published</span>}
                </div>
              </button>
            ))
          )}

          <div className="flex flex-col gap-2 pt-3 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
            <span aria-live="polite">{result.total} matching review{result.total === 1 ? "" : "s"}</span>
            <nav aria-label="Reviews pagination" className="flex items-center gap-2">
              <button
                aria-label="Previous page"
                className="min-h-10 rounded-lg border border-white/10 px-3 font-semibold text-white transition hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-30"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                title="Previous page"
                type="button"
              >
                Previous
              </button>
              <span className="whitespace-nowrap" aria-current="page">Page {page} of {pageCount}</span>
              <button
                aria-label="Next page"
                className="min-h-10 rounded-lg border border-white/10 px-3 font-semibold text-white transition hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-30"
                disabled={page >= pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                title="Next page"
                type="button"
              >
                Next
              </button>
            </nav>
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
                  {selected.contact ? (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                      {selected.contact.email ? (
                        <a aria-label={`Email ${selected.contact.email}`} className="inline-flex items-center gap-2 text-amber-300 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" href={`mailto:${selected.contact.email}?subject=${encodeURIComponent(reviewFollowUpSubject)}`} title="Email guest">
                          <ActionIcon name="email" /> {selected.contact.email}
                        </a>
                      ) : <span className="text-zinc-500">No email</span>}
                      {selected.contact.mobile ? (
                        <button aria-label={`Copy mobile number ${selected.contact.mobile}`} className="inline-flex items-center gap-2 text-amber-300 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" onClick={() => void copyMobile()} title="Copy mobile number" type="button">
                          <ActionIcon name="phone" /> {selected.contact.mobile} <ActionIcon name="copy" />
                        </button>
                      ) : <span className="text-zinc-500">No phone</span>}
                      {copied ? <span className="text-xs text-emerald-300" role="status">Copied!</span> : null}
                    </div>
                  ) : null}
                </div>
                <span className="self-start rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold uppercase text-zinc-300">{statusLabel(selected.status)}</span>
              </div>

              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs uppercase text-zinc-500">Performance</dt><dd className="mt-1 text-zinc-200">{selected.performanceName}</dd></div>
                <div><dt className="text-xs uppercase text-zinc-500">Venue / date</dt><dd className="mt-1 text-zinc-200">{venueLabel(selected.venue)} · {dateLabel(selected.performanceDate)} · {selected.performanceTime ?? "-"}</dd></div>
                <div><dt className="text-xs uppercase text-zinc-500">Submitted</dt><dd className="mt-1 text-zinc-200">{new Date(selected.submittedAt).toLocaleString("en-ZA")}</dd></div>
                <div><dt className="text-xs uppercase text-zinc-500">Publication choice</dt><dd className="mt-1 text-zinc-200">{selected.privacyRequested === true ? "Private requested · Anonymous only" : selected.privacyRequested === false ? "Normal publication" : selected.publicationConsentMode === "public" ? `Publish as ${selected.displayName}` : selected.publicationConsentMode === "anonymous" ? "Publish as Anonymous" : "Private Only"}</dd></div>
              </dl>

              <div>
                <p className="text-2xl text-amber-300" aria-label={`${selected.rating} stars`}>{"★".repeat(selected.rating)}{"☆".repeat(5 - selected.rating)}</p>
                {Object.values(selected.categoryRatings).some((value) => value !== null) ? (
                  <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-sm sm:grid-cols-4">
                    {Object.entries(selected.categoryRatings).map(([label, value]) => <p className="capitalize text-zinc-400" key={label}>{label} <strong className="text-amber-200">{value ?? "—"} / 5</strong></p>)}
                  </div>
                ) : <p className="mt-2 text-xs text-zinc-500">Category ratings were not collected for this historical review.</p>}
                <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-zinc-200">{selected.reviewText}</p>
              </div>

              <div className="border-t border-white/10 pt-5">
                <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500" htmlFor="review-reply"><ActionIcon name="reply" /> Reply to Guest</label>
                <textarea className="mt-2 min-h-24 w-full rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-white outline-none focus:border-amber-300" id="review-reply" maxLength={4000} onChange={(event) => { setReplyMessage(event.target.value); setReplyKey(""); }} placeholder="Write a short reply to the guest." value={replyMessage} />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button className="inline-flex min-h-10 items-center gap-2 rounded-full bg-amber-300 px-4 text-sm font-semibold text-black disabled:opacity-40" disabled={replyBusy || !replyMessage.trim() || !selected.contact?.email} onClick={() => void sendReply()} type="button"><ActionIcon name="reply" /> {replyBusy ? "Sending..." : "Reply"}</button>
                  {!selected.contact?.email ? <span className="text-xs text-zinc-500">No guest email is available.</span> : null}
                  {replyStatus ? <span className="text-xs text-emerald-300" role="status">{replyStatus}</span> : null}
                </div>
                {selected.replies.length ? <div className="mt-4 space-y-3">{selected.replies.map((reply) => <div className="border-l-2 border-emerald-300/40 pl-3 text-sm" key={reply.id}><p className="text-zinc-200">{reply.message}</p><p className="mt-1 text-xs text-zinc-500">{reply.actor_name} · {reply.actor_email} · {new Date(reply.sent_at).toLocaleString("en-ZA")}</p></div>)}</div> : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {selected.contactState === "contacted" ? "Contacted" : selected.contactState === "contact_requested" ? "Contact requested" : "Not contacted"}
                  </p>
                  {selected.contactedAt ? <p className="mt-1 text-xs text-zinc-500">{selected.contactedBy ?? "Staff member"} · {new Date(selected.contactedAt).toLocaleString("en-ZA")}</p> : null}
                </div>
                {selected.contactState !== "contacted" ? (
                  <button className="inline-flex min-h-10 items-center gap-2 rounded-full border border-emerald-300/35 px-4 text-sm font-semibold text-emerald-200 hover:bg-emerald-300 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-40" disabled={contactBusy} onClick={() => void updateContact("mark")} type="button"><ActionIcon name="check" /> Mark Contacted</button>
                ) : selected.contactMethod === "manual_follow_up" ? (
                  <button className="min-h-10 rounded-full border border-white/15 px-4 text-sm font-semibold text-zinc-300 hover:border-white/35 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-40" disabled={contactBusy} onClick={() => void updateContact("undo")} type="button">Undo</button>
                ) : null}
                {contactStatus ? <span className="w-full text-xs text-emerald-300" role="status">{contactStatus}</span> : null}
              </div>

              {selected.anonymousPublicationAllowed && selected.anonymousIdentityWarnings.length > 0 ? (
                <p className="rounded-xl border border-amber-300/30 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100" role="alert">
                  Check the review text before publishing anonymously. It may contain: {selected.anonymousIdentityWarnings.join(", ")}.
                </p>
              ) : null}

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
                {selected.status !== "published" && selected.publicationConsentMode === "public" && (
                  <button
                    className="rounded-full bg-amber-300 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
                    disabled={busy || selected.publicationConsentMode !== "public"}
                    onClick={() => void moderate("publish")}
                    title={selected.publicationConsentMode === "public" ? "Publish review" : "Guest publication consent is required"}
                    type="button"
                  >
                    <span className="inline-flex items-center gap-2"><ActionIcon name="publish" /> Publish</span>
                  </button>
                )}
                {selected.status !== "published" && selected.anonymousPublicationAllowed ? (
                  <button
                    className="rounded-full bg-amber-300 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
                    disabled={busy || selected.anonymousIdentityWarnings.length > 0}
                    onClick={() => void moderate("publish_anonymous")}
                    title={selected.anonymousIdentityWarnings.length > 0 ? "Check identifying details first" : "Publish Anonymously"}
                    type="button"
                  >
                    <span className="inline-flex items-center gap-2"><ActionIcon name="publish" /> Publish Anonymously</span>
                  </button>
                ) : null}
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
                <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-white"><ActionIcon name="history" /> History</h3>
                <div className="mt-3 space-y-3">
                  {detailLoading ? <p className="text-xs text-zinc-500">Loading review history...</p> : selected.history.map((event, index) => (
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

      {bulkOpen && bulkPreview ? (
        <div aria-labelledby="bulk-publish-title" aria-modal="true" className="fixed inset-0 z-[180] grid place-items-center bg-black/80 p-4" role="dialog">
          <div className="w-full max-w-md rounded-xl border border-amber-300/35 bg-zinc-950 p-5 shadow-2xl sm:p-6">
            <h3 className="text-lg font-semibold text-white" id="bulk-publish-title">Publish eligible reviews?</h3>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-zinc-500">Eligible</dt><dd className="mt-1 text-xl text-white">{bulkPreview.eligible}</dd></div>
              <div><dt className="text-zinc-500">Named</dt><dd className="mt-1 text-xl text-white">{bulkPreview.named}</dd></div>
              <div><dt className="text-zinc-500">Anonymous</dt><dd className="mt-1 text-xl text-white">{bulkPreview.anonymous}</dd></div>
              <div><dt className="text-zinc-500">Excluded</dt><dd className="mt-1 text-xl text-white">{bulkPreview.excluded}</dd></div>
            </dl>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="min-h-11 rounded-full border border-white/15 px-5 text-sm font-semibold text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" disabled={bulkBusy} onClick={() => { setBulkOpen(false); setBulkPreview(null); }} ref={bulkCancelRef} type="button">Cancel</button>
              <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-amber-300 px-5 text-sm font-bold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 disabled:opacity-40" disabled={bulkBusy || bulkPreview.eligible === 0} onClick={() => void publishBulkReviews()} ref={bulkConfirmRef} type="button"><ActionIcon name="publish" /> {bulkBusy ? "Publishing..." : `Publish ${bulkPreview.eligible} Reviews`}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
