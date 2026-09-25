"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import type {
  DineplanReconciliationResult,
  DineplanClassification,
} from "@/lib/dineplanReconciliation";
import DineplanActionCentre from "./DineplanActionCentre";

type Snapshot = {
  compared_at: string | null;
  covers: number;
  id: string;
  original_filename: string;
  performance_date: string | null;
  performance_time: string | null;
  reconciliation_results?: Reconciliation | null;
  reservation_count: number;
  show_id: string | null;
  source_generated_at: string | null;
  status: "preview" | "reconciled" | "review_required";
  uploaded_at: string;
  venue: "cape-town" | "johannesburg" | null;
};

type CandidateShow = {
  date: string;
  id: string;
  status: string;
  time: string;
  venue: string;
};

type Reconciliation = {
  bridge: {
    difference: number;
    dineplanCovers: number;
    explainedByRows: Array<{
      bookingReference: string | null;
      classification: DineplanClassification;
      delta: number;
      guest: string;
    }>;
    zingaraEntitlement: number;
  };
  counts: Record<string, number>;
  quality?: {
    deterministicMatches: number;
    reasons: string[];
    status: "review_required" | "trusted";
    trusted: boolean;
  };
  results: DineplanReconciliationResult[];
};

const labels: Record<DineplanClassification, string> = {
  dineplan_newer: "Dineplan Newer",
  matched: "Matched",
  review: "Review",
  zingara_newer: "Zingara Newer",
};

function resultKey(result: DineplanReconciliationResult) {
  return `${result.dineplan?.rowNumber ?? "missing"}:${result.zingara?.id ?? "unmatched"}`;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Not detected";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function candidateShowLabel(show: CandidateShow) {
  const venue = show.venue === "johannesburg"
    ? "Johannesburg"
    : show.venue === "cape-town"
      ? "Cape Town"
      : show.venue;
  const date = new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "long",
    timeZone: "Africa/Johannesburg",
    year: "numeric",
  }).format(new Date(`${show.date}T12:00:00+02:00`));
  const status = show.status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return `${venue} · ${date} · ${show.time.slice(0, 5)} · ${status}`;
}

async function uploadSnapshot(file: File) {
  const supabase = getSupabaseClient();
  const session = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/admin/dineplan-reconciliation", {
    body: form,
    headers: session.data.session?.access_token
      ? { Authorization: `Bearer ${session.data.session.access_token}` }
      : {},
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "The Dineplan export could not be uploaded.");
  return payload as { duplicate: boolean; shows: CandidateShow[]; snapshot: Snapshot };
}

export default function DineplanReconciliation() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [shows, setShows] = useState<CandidateShow[]>([]);
  const [showId, setShowId] = useState("");
  const [filter, setFilter] = useState<DineplanClassification | "all" | "critical">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<"loading" | "uploading" | "reconciling" | "">("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [nextThirty, setNextThirty] = useState<Snapshot[] | null>(null);
  const [actionRefreshKey, setActionRefreshKey] = useState(0);
  const candidateRequestRef = useRef(0);

  function candidateMessage(candidates: CandidateShow[]) {
    if (candidates.length === 0) {
      return "No authoritative performance matches this snapshot. Check the detected venue, date and time.";
    }
    if (candidates.length === 1) {
      return "One matching performance was found. Select it to confirm before running reconciliation.";
    }
    return `${candidates.length} matching performances were found. Select the correct performance before running reconciliation.`;
  }

  async function loadSnapshots() {
    setBusy("loading");
    setError("");
    try {
      const payload = await fetchSupabaseApi<{ snapshots: Snapshot[] }>(
        "/api/admin/dineplan-reconciliation",
        { cache: "no-store" },
      );
      setSnapshots(payload.snapshots);
      if (!snapshot && payload.snapshots[0]?.status === "reconciled") {
        setSnapshot(payload.snapshots[0]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Dineplan snapshots could not be loaded.");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => { void loadSnapshots(); }, []);

  async function onUpload(file: File | undefined) {
    if (!file) return;
    candidateRequestRef.current += 1;
    setBusy("uploading");
    setError("");
    setMessage("");
    setShows([]);
    setShowId("");
    try {
      const payload = await uploadSnapshot(file);
      setSnapshot(payload.snapshot);
      setShows(payload.shows);
      setShowId("");
      setMessage(`${payload.duplicate ? "This exact snapshot was already uploaded. Its existing evidence was reopened. " : "Snapshot parsed. "}${candidateMessage(payload.shows)}`);
      await loadSnapshots();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The export could not be uploaded.");
    } finally {
      setBusy("");
    }
  }

  async function runReconciliation() {
    if (!snapshot || !showId) return;
    setBusy("reconciling");
    setError("");
    try {
      const payload = await fetchSupabaseApi<{ actionSyncStatus: "ready" | "unavailable" | "withheld"; reconciliation: Reconciliation; snapshot: Snapshot }>(
        "/api/admin/dineplan-reconciliation",
        { body: { action: "reconcile", showId, snapshotId: snapshot.id }, method: "POST" },
      );
      setSnapshot({ ...payload.snapshot, reconciliation_results: payload.reconciliation });
      setMessage(payload.actionSyncStatus === "ready"
        ? "Reconciliation complete. Action Centre updated; no booking, payment, ticket, table or capacity data was changed."
        : payload.actionSyncStatus === "withheld"
          ? "Reconciliation needs review. No operational actions or reminders were generated."
          : "Reconciliation was saved, but the Action Centre could not update. No authoritative booking data was changed.");
      setActionRefreshKey((current) => current + 1);
      await loadSnapshots();
    } catch (reconciliationError) {
      setError(reconciliationError instanceof Error ? reconciliationError.message : "The reconciliation could not be completed.");
    } finally {
      setBusy("");
    }
  }

  async function review(result: DineplanReconciliationResult, disposition: string) {
    if (!snapshot) return;
    setError("");
    try {
      await fetchSupabaseApi("/api/admin/dineplan-reconciliation", {
        body: { disposition, resultKey: resultKey(result), snapshotId: snapshot.id },
        method: "PATCH",
      });
      setMessage("Review outcome saved. Authoritative booking data remains unchanged.");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "The review outcome could not be saved.");
    }
  }

  async function loadNextThirty() {
    setBusy("loading");
    setError("");
    try {
      const payload = await fetchSupabaseApi<{ snapshots: Snapshot[] }>(
        "/api/admin/dineplan-reconciliation?scope=next30",
        { cache: "no-store" },
      );
      setNextThirty(payload.snapshots);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Upcoming snapshots could not be loaded.");
    } finally {
      setBusy("");
    }
  }

  async function openSnapshot(snapshotId: string) {
    const requestId = candidateRequestRef.current + 1;
    candidateRequestRef.current = requestId;
    const selected = snapshots.find((item) => item.id === snapshotId) ?? null;
    setSnapshot(selected);
    setShows([]);
    setShowId("");
    setFilter("all");
    setSearch("");
    setPage(1);
    setError("");
    setMessage("");
    if (!selected || selected.status !== "preview") return;
    setBusy("loading");
    try {
      const payload = await fetchSupabaseApi<{ shows: CandidateShow[] }>(
        `/api/admin/dineplan-reconciliation?snapshotId=${encodeURIComponent(selected.id)}`,
        { cache: "no-store" },
      );
      if (candidateRequestRef.current !== requestId) return;
      setShows(payload.shows);
      setMessage(candidateMessage(payload.shows));
    } catch (candidateError) {
      if (candidateRequestRef.current !== requestId) return;
      setError(candidateError instanceof Error ? candidateError.message : "Matching performances could not be loaded.");
    } finally {
      if (candidateRequestRef.current === requestId) setBusy("");
    }
  }

  const reconciliation = snapshot?.reconciliation_results ?? null;
  const visibleResults = useMemo(() => {
    if (!reconciliation) return [];
    const query = search.trim().toLowerCase();
    return reconciliation.results.filter((result) => {
      const matchesFilter = filter === "all" ? true : filter === "critical" ? result.severity === "critical" : result.classification === filter;
      if (!matchesFilter || !query) return matchesFilter;
      return [result.dineplan?.guestName, result.dineplan?.company, result.dineplan?.mobile, result.zingara?.customerName, result.zingara?.company, result.zingara?.bookingReference]
        .filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }, [filter, reconciliation, search]);
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(visibleResults.length / pageSize));
  const pagedResults = visibleResults.slice((page - 1) * pageSize, page * pageSize);
  const nextThirtySummary = useMemo(() => {
    const rows = nextThirty ?? [];
    return rows.reduce(
      (summary, row) => {
        summary.shows += 1;
        summary.reservations += row.reservation_count;
        const counts = row.reconciliation_results?.counts ?? {};
        for (const key of ["matched", "zingara_newer", "dineplan_newer", "review", "critical"] as const) {
          summary[key] += counts[key] ?? 0;
        }
        summary.capacityAtRisk += row.reconciliation_results?.results
          .filter((result) => result.severity === "critical")
          .reduce((total, result) => total + result.capacityImpact, 0) ?? 0;
        return summary;
      },
      { capacityAtRisk: 0, critical: 0, dineplan_newer: 0, matched: 0, reservations: 0, review: 0, shows: 0, zingara_newer: 0 },
    );
  }, [nextThirty]);

  return (
    <section className="mb-10 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">System</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Dineplan Reconciliation</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Compare a private Dineplan export with authoritative Zingara evidence. Results are review-only and never update bookings.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {snapshots.length > 0 && (
            <label className="min-w-56 text-xs font-semibold uppercase text-zinc-400">
              Recent snapshot
              <select value={snapshot?.id ?? ""} onChange={(event) => { void openSnapshot(event.target.value); }} className="mt-2 w-full border border-zinc-700 bg-black px-3 py-2 text-sm normal-case text-white">
                <option value="">Select a snapshot</option>
                {snapshots.map((item) => <option key={item.id} value={item.id}>{item.performance_date ?? "Unconfirmed"} · {item.original_filename}</option>)}
              </select>
            </label>
          )}
          <label className="cursor-pointer rounded-lg bg-[#D8C36A] px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-black hover:bg-[#F2D66C]">
            {busy === "uploading" ? "Parsing..." : "Upload Dineplan Export"}
            <input id="dineplan-export-upload" className="sr-only" type="file" accept=".pdf,.csv,.xlsx,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={Boolean(busy)} onChange={(event) => { void onUpload(event.target.files?.[0]); event.target.value = ""; }} />
          </label>
          <button type="button" onClick={() => void loadNextThirty()} disabled={Boolean(busy)} className="rounded-lg border border-[#D8C36A]/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#F2D66C] disabled:opacity-50">
            Reconcile Next 30 Days
          </button>
        </div>
      </div>

      <div className="border-y border-white/10 py-4 text-sm text-zinc-300">
        Download the current Dineplan export, upload it here, confirm the detected performance, then review Critical and Dineplan Newer results first.
      </div>

      {error && <div role="alert" className="border border-red-300/30 bg-red-950/25 p-4 text-sm text-red-100">{error}</div>}
      {message && <div role="status" className="border border-emerald-300/25 bg-emerald-950/15 p-4 text-sm text-emerald-100">{message}</div>}

      <DineplanActionCentre refreshKey={actionRefreshKey} />

      {nextThirty && (
        <div className="border-y border-white/10 py-5">
          <p className="mb-4 text-xs text-zinc-500">Uploaded and reconciled snapshots only. No live Dineplan connection is used.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {Object.entries(nextThirtySummary).map(([key, value]) => (
              <div key={key}><p className="text-xs uppercase text-zinc-500">{key.replaceAll("_", " ")}</p><p className="mt-1 text-xl font-semibold text-white">{value}</p></div>
            ))}
          </div>
        </div>
      )}

      {snapshot && (
        <div className="space-y-5 border border-white/10 bg-zinc-950/60 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div><p className="text-xs uppercase text-zinc-500">File</p><p className="mt-1 break-words text-sm text-white">{snapshot.original_filename}</p></div>
            <div><p className="text-xs uppercase text-zinc-500">Dineplan show</p><p className="mt-1 text-sm text-white">{snapshot.performance_date ?? "Confirm manually"} {snapshot.performance_time ?? ""}</p></div>
            <div><p className="text-xs uppercase text-zinc-500">Generated</p><p className="mt-1 text-sm text-white">{formatTimestamp(snapshot.source_generated_at)}</p></div>
            <div><p className="text-xs uppercase text-zinc-500">Reservations</p><p className="mt-1 text-sm text-white">{snapshot.reservation_count}</p></div>
            <div><p className="text-xs uppercase text-zinc-500">Covers</p><p className="mt-1 text-sm text-white">{snapshot.covers}</p></div>
          </div>
          {snapshot.status === "preview" && (
            <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-end">
              <label className="flex-1 text-xs font-semibold uppercase text-zinc-400">Confirm performance
                <select value={showId} onChange={(event) => setShowId(event.target.value)} disabled={busy === "loading"} className="mt-2 w-full border border-zinc-700 bg-black px-3 py-3 text-sm normal-case text-white disabled:opacity-50">
                  <option value="">Select the detected Zingara performance</option>
                  {shows.map((show) => <option key={show.id} value={show.id}>{candidateShowLabel(show)}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => void runReconciliation()} disabled={!showId || Boolean(busy)} className="bg-[#D8C36A] px-5 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-black disabled:cursor-not-allowed disabled:opacity-40">
                {busy === "reconciling" ? "Comparing..." : "Run Reconciliation"}
              </button>
            </div>
          )}
        </div>
      )}

      {reconciliation && (
        <>
          {reconciliation.quality && !reconciliation.quality.trusted && <div role="alert" className="border border-amber-300/40 bg-amber-950/20 p-4 text-sm text-amber-100"><strong className="block uppercase">Reconciliation Needs Review</strong><span className="mt-1 block">The Dineplan source could not be reconciled with sufficient confidence. No operational actions or reminders were generated.</span>{reconciliation.quality.reasons.map((reason) => <span key={reason} className="mt-1 block text-xs text-amber-200/80">{reason}</span>)}</div>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Dineplan Reservations", snapshot?.reservation_count ?? 0],
              ["Dineplan Covers", reconciliation.bridge.dineplanCovers],
              ["Zingara Active Entitlement", reconciliation.bridge.zingaraEntitlement],
              ["Matched", reconciliation.counts.matched ?? 0],
              ["Differences", reconciliation.results.length - (reconciliation.counts.matched ?? 0)],
              ["Actions Required", reconciliation.counts.actions_required ?? 0],
            ].map(([label, value]) => <div key={label} className="border border-white/10 bg-black/30 p-3"><span className="block text-xs uppercase text-zinc-400">{label}</span><span className="mt-1 block text-2xl font-semibold text-white">{value}</span></div>)}
          </div>
          <div className="border-y border-white/10 py-4">
            <p className="text-sm text-white">Dineplan covers {reconciliation.bridge.dineplanCovers} · Zingara active entitlement {reconciliation.bridge.zingaraEntitlement} · Difference {reconciliation.bridge.difference > 0 ? "+" : ""}{reconciliation.bridge.difference}</p>
            {reconciliation.bridge.explainedByRows.map((row, index) => <p key={`${row.bookingReference}-${index}`} className="mt-1 text-xs text-zinc-400">{row.guest}: {row.delta > 0 ? "+" : ""}{row.delta} · {labels[row.classification]}</p>)}
          </div>
          <details className="border border-white/10 bg-black/20 p-4">
            <summary className="cursor-pointer text-sm font-semibold uppercase text-[#F2D66C]">View Full Reconciliation · {reconciliation.results.length} Comparison Rows</summary>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <label className="flex-1 text-xs font-semibold uppercase text-zinc-400">Search evidence<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Guest, company, mobile or booking reference" className="mt-2 w-full border border-zinc-700 bg-black px-3 py-2 text-sm normal-case text-white" /></label>
              <div className="flex flex-wrap gap-2">{(["all", "matched", "zingara_newer", "dineplan_newer", "review", "critical"] as const).map((key) => <button key={key} type="button" onClick={() => { setFilter(key); setPage(1); }} className={`border px-3 py-2 text-xs uppercase ${filter === key ? "border-[#D8C36A] text-[#F2D66C]" : "border-white/15 text-zinc-300"}`}>{key === "all" ? "All" : key === "critical" ? "Critical" : labels[key]}</button>)}</div>
            </div>
          <div className="mt-4 overflow-x-auto border border-white/10">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="bg-black text-xs uppercase text-zinc-400"><tr>{["Status", "Guest", "Dineplan", "Zingara", "Difference", "Capacity Impact", "Reason", "Review"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/10">
                {pagedResults.map((result) => (
                  <tr key={resultKey(result)} className="align-top">
                    <td className="px-3 py-3"><span className={result.severity === "critical" ? "text-red-300" : "text-[#F2D66C]"}>{labels[result.classification]}{result.severity === "critical" ? " · Critical" : ""}</span></td>
                    <td className="px-3 py-3 text-white">{result.dineplan?.guestName || result.zingara?.customerName || "Unmatched"}</td>
                    <td className="px-3 py-3 text-zinc-300">{result.dineplan ? `${result.dineplan.pax} pax · ${result.dineplan.seatingZone ?? "Zone not stated"} · ${result.dineplan.tables.join("+") || "Table not stated"}` : "Not in snapshot"}</td>
                    <td className="px-3 py-3 text-zinc-300">{result.zingara ? `${result.zingara.partySize} pax · ${result.zingara.seatingZone ?? "Zone not stated"} · ${result.zingara.tables.join("+") || "Unassigned"}` : "No authoritative match"}{result.zingara && <a className="mt-2 block text-[#F2D66C] underline" href={`/admin?section=bookings&booking=${encodeURIComponent(result.zingara.bookingReference)}`}>Open Booking</a>}</td>
                    <td className="px-3 py-3 text-zinc-300">{result.differences.join("; ") || "None"}</td>
                    <td className="px-3 py-3 text-zinc-300">{result.capacityImpact ? `${result.capacityImpact} pax currently consume authoritative Zingara entitlement` : !result.zingara && result.dineplan ? `Potential additional exposure: ${result.dineplan.pax} pax. Capacity impact not yet established.` : "No identified impact"}</td>
                    <td className="px-3 py-3 text-zinc-300">{result.reason}<span className="mt-1 block text-xs text-zinc-500">{result.matchReason}</span></td>
                    <td className="px-3 py-3"><select defaultValue="" onChange={(event) => { if (event.target.value) void review(result, event.target.value); }} className="w-40 border border-zinc-700 bg-black px-2 py-2 text-xs text-white"><option value="">Select outcome</option><option value="reviewed">Reviewed</option><option value="no_action">No action required</option><option value="box_office">Box Office correction</option><option value="management_review">Management review</option></select></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            <div className="mt-3 flex items-center justify-between text-xs text-zinc-400"><span>{visibleResults.length} matching comparison rows · Page {page} of {totalPages}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="border border-white/15 px-3 py-2 disabled:opacity-40">Previous</button><button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="border border-white/15 px-3 py-2 disabled:opacity-40">Next</button></div></div>
          </details>
        </>
      )}

      {!snapshot && snapshots.length > 0 && <p className="text-sm text-zinc-400">{snapshots.length} recent normalized snapshot{snapshots.length === 1 ? "" : "s"} available.</p>}
    </section>
  );
}
