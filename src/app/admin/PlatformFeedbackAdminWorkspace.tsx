"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

type Row = {
  bookingReference: string;
  comment: string | null;
  contact: { email: string | null; mobile: string | null } | null;
  contactedAt: string | null;
  contactedBy: string | null;
  contactMethod: string | null;
  contactRequested: boolean;
  deviceCategory: string | null;
  displayName: string;
  history: Array<{ event_type: string; occurred_at: string }>;
  id: string;
  performanceDate: string | null;
  performanceName: string;
  rating: number;
  repliedAt: string | null;
  repliedBy: string | null;
  replies: Array<{ actor_email: string; actor_name: string; id: string; message: string; sent_at: string }>;
  revision: number;
  status: "resolved" | "submitted";
  submittedAt: string;
  venue: string;
};

type Page = { page: number; pageSize: number; rows: Row[]; total: number };

function Select({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: Array<[string, string]>; value: string }) {
  return (
    <label className="min-w-0">
      <span className="sr-only">{label}</span>
      <select aria-label={label} className="min-h-10 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 text-xs font-semibold text-zinc-200 outline-none focus:border-amber-300" onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
    </label>
  );
}

export default function PlatformFeedbackAdminWorkspace({ onShowReviews }: { onShowReviews: () => void }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page>({ page: 1, pageSize: 10, rows: [], total: 0 });
  const [venue, setVenue] = useState("all");
  const [rating, setRating] = useState("all");
  const [contact, setContact] = useState("all");
  const [reply, setReply] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<Row | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [replyKey, setReplyKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ contact, page: String(page), pageSize: "10", rating, reply, status, venue });
      const next = await fetchSupabaseApi<Page>(`/api/admin/platform-feedback?${params}`, { cache: "no-store" });
      setResult(next);
      if (selectedId && !next.rows.some((row) => row.id === selectedId)) setSelectedId(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Platform feedback could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [contact, page, rating, reply, selectedId, status, venue]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    const params = new URLSearchParams({ details: "true", feedbackId: selectedId, page: "1", pageSize: "10" });
    fetchSupabaseApi<Page>(`/api/admin/platform-feedback?${params}`, { cache: "no-store" })
      .then((detail) => setSelectedDetail(detail.rows[0] ?? null))
      .catch((detailError) => setError(detailError instanceof Error ? detailError.message : "Feedback details could not be loaded."));
  }, [selectedId]);

  const selected = selectedId
    ? selectedDetail ?? result.rows.find((row) => row.id === selectedId) ?? null
    : null;
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const resetPage = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
    setSelectedId(null);
    setSelectedDetail(null);
  };

  async function updateContact(action: "mark" | "undo") {
    if (!selected) return;
    setBusy(true);
    try {
      await fetchSupabaseApi("/api/admin/platform-feedback/contact", {
        body: { action, feedbackId: selected.id, revision: selected.revision },
        method: "POST",
      });
      setSelectedDetail(null);
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Contact status could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!selected || !replyMessage.trim()) return;
    setBusy(true);
    const key = replyKey || crypto.randomUUID();
    setReplyKey(key);
    try {
      await fetchSupabaseApi("/api/admin/platform-feedback/reply", {
        body: { feedbackId: selected.id, idempotencyKey: key, message: replyMessage },
        method: "POST",
      });
      setReplyMessage("");
      setReplyKey("");
      setSelectedDetail(null);
      await load();
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : "The reply could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300">Guest feedback</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">Platform Feedback</h2>
          <p className="mt-1 text-xs text-zinc-500">Internal booking-experience feedback. Never published publicly.</p>
        </div>
        <button className="min-h-10 rounded-full border border-white/15 px-4 text-xs font-semibold text-zinc-200 hover:border-amber-300/50" onClick={onShowReviews} type="button">Show Reviews</button>
      </div>

      <div className="grid gap-2 border-y border-white/10 py-4 sm:grid-cols-2 lg:grid-cols-5">
        <Select label="Venue" onChange={resetPage(setVenue)} options={[["all", "All venues"], ["cape-town", "Cape Town"], ["johannesburg", "Johannesburg"]]} value={venue} />
        <Select label="Rating" onChange={resetPage(setRating)} options={[["all", "All ratings"], ["1", "1 star"], ["2", "2 stars"], ["3", "3 stars"], ["4", "4 stars"], ["5", "5 stars"]]} value={rating} />
        <Select label="Contact" onChange={resetPage(setContact)} options={[["all", "All contact states"], ["requested", "Contact requested"], ["contacted", "Contacted"], ["not_contacted", "Not contacted"]]} value={contact} />
        <Select label="Reply" onChange={resetPage(setReply)} options={[["all", "All replies"], ["replied", "Replied"], ["not_replied", "Not replied"]]} value={reply} />
        <Select label="Submission status" onChange={resetPage(setStatus)} options={[["all", "All submissions"], ["submitted", "Submitted"], ["resolved", "Resolved"]]} value={status} />
      </div>

      {error ? <p className="rounded-xl border border-red-400/25 bg-red-400/[0.06] px-4 py-3 text-sm text-red-200" role="alert">{error}</p> : null}
      <p className="text-xs text-zinc-500">{result.total} matching platform feedback submission{result.total === 1 ? "" : "s"}</p>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
        <div className="min-w-0 space-y-3">
          {loading ? <p className="py-10 text-center text-sm text-zinc-500">Loading platform feedback...</p> : null}
          {!loading && !result.rows.length ? <p className="rounded-xl border border-white/10 p-5 text-sm text-zinc-500">No platform feedback matches these filters.</p> : null}
          {result.rows.map((row) => (
            <button className={`block w-full rounded-xl border p-4 text-left transition ${selectedId === row.id ? "border-amber-300 bg-amber-300/[0.06]" : "border-white/10 hover:border-white/25"}`} key={row.id} onClick={() => { setSelectedDetail(null); setSelectedId(row.id); }} type="button">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-semibold text-white">{row.displayName}</p><p className="mt-1 text-xs text-zinc-500">{row.bookingReference} · {row.venue === "cape-town" ? "Cape Town" : "Johannesburg"}</p></div>
                <span className="text-amber-300">{"★".repeat(row.rating)}</span>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-zinc-300">{row.comment || "No written feedback supplied."}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                {row.contactRequested ? <span className="text-amber-200">Contact requested</span> : null}
                {row.repliedAt ? <span className="text-emerald-300">Replied · {row.repliedBy}</span> : null}
              </div>
            </button>
          ))}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button className="min-h-10 rounded-full border border-white/15 px-4 text-xs font-semibold text-white disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">Previous</button>
            <span className="text-xs text-zinc-500">Page {page} of {totalPages}</span>
            <button className="min-h-10 rounded-full border border-white/15 px-4 text-xs font-semibold text-white disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} type="button">Next</button>
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-white/10 p-5 sm:p-6">
          {!selected ? <p className="py-12 text-center text-sm text-zinc-500">Select platform feedback to view the details.</p> : (
            <div className="space-y-5">
              <div><h3 className="text-xl font-semibold text-white">{selected.displayName}</h3><p className="mt-1 text-sm text-zinc-500">{selected.bookingReference} · {selected.performanceName}</p></div>
              <p className="text-2xl text-amber-300" aria-label={selected.rating + " stars"}>{"★".repeat(selected.rating)}{"☆".repeat(5 - selected.rating)}</p>
              <p className="whitespace-pre-wrap text-base leading-7 text-zinc-200">{selected.comment || "No written feedback supplied."}</p>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs uppercase text-zinc-500">Submitted</dt><dd className="mt-1 text-zinc-200">{new Date(selected.submittedAt).toLocaleString("en-ZA")}</dd></div>
                <div><dt className="text-xs uppercase text-zinc-500">Device</dt><dd className="mt-1 capitalize text-zinc-200">{selected.deviceCategory || "Not recorded"}</dd></div>
                <div><dt className="text-xs uppercase text-zinc-500">Email</dt><dd className="mt-1 break-all text-zinc-200">{selected.contact?.email || "Unavailable"}</dd></div>
                <div><dt className="text-xs uppercase text-zinc-500">Phone</dt><dd className="mt-1 text-zinc-200">{selected.contact?.mobile || "Unavailable"}</dd></div>
              </dl>
              <div className="border-t border-white/10 pt-5">
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500" htmlFor="platform-feedback-reply">Reply to Guest</label>
                <textarea className="mt-2 min-h-24 w-full rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-white outline-none focus:border-amber-300" id="platform-feedback-reply" maxLength={4000} onChange={(event) => { setReplyMessage(event.target.value); setReplyKey(""); }} placeholder="Write a short reply to the guest." value={replyMessage} />
                <button className="mt-3 min-h-10 rounded-full bg-amber-300 px-4 text-sm font-semibold text-black disabled:opacity-40" disabled={busy || !replyMessage.trim() || !selected.contact?.email} onClick={() => void sendReply()} type="button">{busy ? "Sending..." : "Reply"}</button>
                {selected.replies.length ? <div className="mt-4 space-y-3">{selected.replies.map((item) => <div className="border-l-2 border-emerald-300/40 pl-3 text-sm" key={item.id}><p className="text-zinc-200">{item.message}</p><p className="mt-1 text-xs text-zinc-500">{item.actor_name} · {new Date(item.sent_at).toLocaleString("en-ZA")}</p></div>)}</div> : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div><p className="text-sm font-semibold text-white">{selected.contactedAt ? "Contacted" : selected.contactRequested ? "Contact requested" : "Not contacted"}</p>{selected.contactedAt ? <p className="mt-1 text-xs text-zinc-500">{selected.contactedBy} · {new Date(selected.contactedAt).toLocaleString("en-ZA")}</p> : null}</div>
                {!selected.contactedAt ? <button className="min-h-10 rounded-full border border-emerald-300/35 px-4 text-sm font-semibold text-emerald-200 disabled:opacity-40" disabled={busy} onClick={() => void updateContact("mark")} type="button">Mark Contacted</button> : selected.contactMethod === "manual_follow_up" ? <button className="min-h-10 rounded-full border border-white/15 px-4 text-sm font-semibold text-zinc-300 disabled:opacity-40" disabled={busy} onClick={() => void updateContact("undo")} type="button">Undo</button> : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
