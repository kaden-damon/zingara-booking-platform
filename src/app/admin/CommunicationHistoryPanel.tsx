"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getAdminAuthSession } from "@/lib/supabase/auth";

type CommunicationRow = {
  bookingReference: string | null;
  channel: string;
  created_at: string;
  customerName: string | null;
  id: string;
  message: string;
  sent_at: string | null;
  status: string;
  subject: string | null;
  type: string;
};

type Payload = {
  page: number;
  pageSize: number;
  rows: CommunicationRow[];
  total: number;
};

function formatDateTime(value: string | null) {
  if (!value) return "Not sent";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function formatLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function CommunicationHistoryPanel({
  showId,
  showLabel,
}: {
  showId: string;
  showLabel: string;
}) {
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!showId) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError("");

    try {
      const auth = await getAdminAuthSession();
      if (!auth) throw new Error("Your Admin session has expired. Sign in again.");
      const query = new URLSearchParams({
        page: String(page),
        pageSize: "10",
        search,
        showId,
        status,
      });
      const response = await fetch(`/api/admin/communications?${query}`, {
        headers: { Authorization: `Bearer ${auth.session.access_token}` },
      });
      const next = (await response.json()) as Payload & { error?: string };
      if (!response.ok) {
        throw new Error(next.error ?? "Communication history couldn't be loaded.");
      }
      if (requestId === requestIdRef.current) setPayload(next);
    } catch (caught) {
      if (requestId === requestIdRef.current) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Communication history couldn't be loaded. Try again.",
        );
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [page, search, showId, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const totalPages = Math.max(1, Math.ceil((payload?.total ?? 0) / 10));

  return (
    <section className="rounded-lg border border-white/10 bg-black/30 p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">Communication History</p>
          <h3 className="mt-2 text-xl font-bold text-white">{showLabel}</h3>
          <p className="mt-1 text-sm text-zinc-500">{payload?.total ?? 0} matching record{payload?.total === 1 ? "" : "s"}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,18rem)_10rem]">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Search
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Subject or message" className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-black px-4 text-sm normal-case tracking-normal text-white" />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Status
            <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-black px-3 text-sm normal-case tracking-normal text-white">
              <option value="all">All</option><option value="sent">Sent</option><option value="failed">Failed</option><option value="suppressed">Suppressed</option>
            </select>
          </label>
        </div>
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-300/25 bg-red-950/20 p-3 text-sm text-red-200">{error}</p>}
      {loading && !payload && <p className="mt-4 text-sm text-zinc-500">Loading communication history...</p>}
      {!loading && payload?.rows.length === 0 && <p className="mt-4 rounded-lg border border-white/10 p-4 text-sm text-zinc-400">No communications match these filters.</p>}

      <div className="mt-4 space-y-3" aria-busy={loading}>
        {payload?.rows.map((row) => (
          <article key={row.id} className="rounded-lg border border-white/10 bg-zinc-950/75 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#D8C36A]">{formatLabel(row.type)} · {formatLabel(row.channel)}</p>
                <h4 className="mt-1 truncate font-semibold text-white">{row.subject || "Guest communication"}</h4>
                {(row.customerName || row.bookingReference) && <p className="mt-1 text-sm text-zinc-500">{row.customerName || "Guest"}{row.bookingReference ? ` · ${row.bookingReference}` : ""}</p>}
              </div>
              <div className="shrink-0 text-left sm:text-right"><span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300">{formatLabel(row.status)}</span><p className="mt-2 text-xs text-zinc-500">{formatDateTime(row.sent_at ?? row.created_at)}</p></div>
            </div>
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-400">{row.message}</p>
          </article>
        ))}
      </div>

      {payload && payload.total > 0 && (
        <nav aria-label="Communication history pages" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} className="min-h-11 rounded-full border border-white/15 px-4 text-sm font-semibold text-zinc-200 disabled:opacity-35">Previous</button>
          <span className="text-sm text-zinc-400">Page {page} of {totalPages}</span>
          <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="min-h-11 rounded-full border border-white/15 px-4 text-sm font-semibold text-zinc-200 disabled:opacity-35">Next</button>
        </nav>
      )}
    </section>
  );
}
