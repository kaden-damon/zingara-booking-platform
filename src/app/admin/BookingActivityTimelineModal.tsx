"use client";

import { useEffect, useState } from "react";

import type { BookingActivityEntry } from "@/lib/bookingActivityTimeline";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

type TimelineResponse = {
  events: BookingActivityEntry[];
  hasMore: boolean;
  historyNotice: string;
  page: number;
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.replaceAll("_", " ");
  return JSON.stringify(value);
}

export default function BookingActivityTimelineModal({
  bookingReference,
  onClose,
}: {
  bookingReference: string;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<BookingActivityEntry[]>([]);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [historyNotice, setHistoryNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  async function load(nextPage: number) {
    setLoading(true);
    setError("");
    try {
      const result = await fetchSupabaseApi<TimelineResponse>(
        `/api/admin/bookings/${encodeURIComponent(bookingReference)}/activity-timeline?page=${nextPage}`,
        { cache: "no-store" },
      );
      setEvents((current) =>
        nextPage === 1
          ? result.events
          : [...current, ...result.events.filter((event) => !current.some((item) => item.id === event.id))],
      );
      setHasMore(result.hasMore);
      setHistoryNotice(result.historyNotice);
      setPage(result.page);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Activity could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    fetchSupabaseApi<TimelineResponse>(
      `/api/admin/bookings/${encodeURIComponent(bookingReference)}/activity-timeline?page=1`,
      { cache: "no-store" },
    )
      .then((result) => {
        if (!active) return;
        setEvents(result.events);
        setHasMore(result.hasMore);
        setHistoryNotice(result.historyNotice);
        setPage(result.page);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Activity could not be loaded.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [bookingReference]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-0 backdrop-blur-sm sm:p-4">
      <button type="button" aria-label="Close activity timeline" className="absolute inset-0 cursor-default" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-activity-title"
        className="relative z-10 flex h-full w-full max-w-3xl flex-col overflow-hidden border border-[#D8C36A]/25 bg-zinc-950 text-white shadow-2xl sm:h-[min(88vh,820px)] sm:rounded-[2rem]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-4 sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">Booking Details</p>
            <h2 id="booking-activity-title" className="mt-1 text-xl font-bold sm:text-2xl">Activity Timeline</h2>
            <p className="mt-1 text-sm text-zinc-400">{bookingReference}</p>
          </div>
          <button type="button" onClick={onClose} className="min-h-10 rounded-full border border-white/15 px-4 text-xs font-semibold text-zinc-200 transition hover:bg-white hover:text-black">Close</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {historyNotice && <p className="mb-4 rounded-xl border border-amber-300/20 bg-amber-950/15 p-3 text-xs leading-5 text-amber-100/80">{historyNotice}</p>}
          {error && <p role="alert" className="mb-4 rounded-xl border border-red-300/30 bg-red-950/20 p-3 text-sm text-red-100">{error}</p>}
          {loading && events.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-400">Loading activity…</p>
          ) : events.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-400">No recorded activity is available for this booking.</p>
          ) : (
            <ol className="space-y-0">
              {events.map((event, index) => (
                <li key={event.id} className="relative grid grid-cols-[18px_minmax(0,1fr)] gap-3 pb-5">
                  {index < events.length - 1 && <span aria-hidden="true" className="absolute left-[8px] top-5 h-[calc(100%-0.5rem)] w-px bg-[#D8C36A]/25" />}
                  <span aria-hidden="true" className={`mt-1.5 h-[17px] w-[17px] rounded-full border-2 ${event.outcome === "success" ? "border-[#D8C36A] bg-[#D8C36A]/20" : event.outcome === "blocked" ? "border-amber-300 bg-amber-300/15" : "border-red-300 bg-red-300/15"}`} />
                  <article className="min-w-0 rounded-xl border border-white/10 bg-black/25 p-3 sm:p-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white">{event.action}</h3>
                        <p className="mt-1 text-xs text-zinc-400">{event.actor} · {event.source}</p>
                      </div>
                      <time className="shrink-0 text-xs font-medium text-[#F2D66C]" dateTime={event.occurredAt}>{formatTimestamp(event.occurredAt)} SAST</time>
                    </div>
                    {event.reason && <p className="mt-3 text-sm leading-6 text-zinc-300">{event.reason}</p>}
                    {event.changes.length > 0 && (
                      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                        {event.changes.map((change) => (
                          <div key={`${event.id}:${change.field}`} className="min-w-0 rounded-lg bg-white/[0.035] px-3 py-2">
                            <dt className="font-semibold text-zinc-300">{change.field}</dt>
                            <dd className="mt-1 break-words text-zinc-400">
                              {change.before !== undefined && <><span className="line-through opacity-70">{displayValue(change.before)}</span><span aria-hidden="true"> → </span></>}
                              <span className="text-zinc-200">{displayValue(change.after)}</span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </article>
                </li>
              ))}
            </ol>
          )}
          {hasMore && (
            <div className="flex justify-center pt-1">
              <button type="button" disabled={loading} onClick={() => void load(page + 1)} className="min-h-10 rounded-full border border-[#D8C36A]/40 px-5 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black disabled:cursor-wait disabled:opacity-50">
                {loading ? "Loading…" : "Load More"}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
