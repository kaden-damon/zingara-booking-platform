"use client";

import { useCallback, useEffect, useState } from "react";

import { getAdminAuthSession } from "@/lib/supabase/auth";

type Configuration = {
  activatedAt: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  scheduledTime: string;
  subject: string;
};

type PreviewRow = {
  attentionCount: number;
  bookingCount: number;
  cc: string;
  email: string;
  guestCount: number;
  staffId: string;
  staffName: string;
};

type Payload = {
  configuration: Configuration;
  example: { html: string; subject: string } | null;
  rows: PreviewRow[];
};

async function authorisedRequest(path: string, init?: RequestInit) {
  const auth = await getAdminAuthSession();
  if (!auth) throw new Error("Your Admin session has expired. Sign in again.");
  return fetch(path, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${auth.session.access_token}`,
      "Content-Type": "application/json",
    },
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

export function DailyBookingReviewWorkflowCard({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Configuration | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<390 | 620>(620);
  const [expanded, setExpanded] = useState(false);

  const loadPreview = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setError("");
    try {
      const response = await authorisedRequest("/api/admin/workflows/daily-booking-review");
      const next = (await response.json()) as Payload & { error?: string };
      if (!response.ok) throw new Error(next.error ?? "Preview could not be loaded.");
      setPayload(next);
      setDraft(next.configuration);
      setStatus("Recipient preview refreshed. No email was sent.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preview could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  const loadSummary = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const response = await authorisedRequest("/api/admin/workflows/daily-booking-review?summary=true");
      const next = (await response.json()) as { configuration?: Configuration; error?: string };
      if (!response.ok || !next.configuration) throw new Error(next.error ?? "Workflow summary could not be loaded.");
      setDraft(next.configuration);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Workflow summary could not be loaded.");
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSummary(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSummary]);

  useEffect(() => {
    if (!expanded) return;
    const timer = window.setTimeout(() => void loadPreview(), 0);
    return () => window.clearTimeout(timer);
  }, [expanded, loadPreview]);

  async function save() {
    if (!draft) return;
    setLoading(true);
    setError("");
    setStatus("");
    try {
      const response = await authorisedRequest("/api/admin/workflows/daily-booking-review", {
        body: JSON.stringify({ enabled: draft.enabled, scheduledTime: draft.scheduledTime, subject: draft.subject }),
        method: "PUT",
      });
      const result = (await response.json()) as { configuration?: Configuration; error?: string };
      if (!response.ok || !result.configuration) throw new Error(result.error ?? "Workflow could not be saved.");
      setDraft(result.configuration);
      setPayload((current) => current ? { ...current, configuration: result.configuration! } : current);
      setStatus(result.configuration.enabled
        ? `Enabled prospectively. The next report is ${formatDateTime(result.configuration.nextRunAt)}.`
        : "Daily Booking Review is disabled.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Workflow could not be saved.");
    } finally {
      setLoading(false);
    }
  }

  if (!isSuperAdmin) return null;

  const sendRows = payload?.rows.filter((row) => row.bookingCount > 0) ?? [];
  const skippedRows = payload?.rows.filter((row) => row.bookingCount === 0) ?? [];

  return (
    <article className="mt-5 rounded-lg border border-[#D8C36A]/30 bg-zinc-950/80 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">Staff Operations</p>
          <h3 className="mt-2 text-xl font-bold">Daily Booking Review</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Each staff member receives the current payment, table and booking state for the bookings they created. Empty reports are skipped.
          </p>
          <p className="mt-2 text-xs text-zinc-500">Recipients: each eligible staff creator · Management CC: Kaden · Schedule: {draft?.scheduledTime ?? "08:00"} SAST</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] ${draft?.enabled ? "border-emerald-300/40 text-emerald-200" : "border-white/10 text-zinc-500"}`}>{draft ? (draft.enabled ? "Enabled" : "Disabled") : "Scheduled daily"}</span>
          <button type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} className="min-h-10 rounded-full border border-[#D8C36A]/35 px-4 text-xs font-bold uppercase tracking-[0.08em] text-[#F2D66C]">{expanded ? "Close" : "Edit Settings"}</button>
        </div>
      </div>

      {expanded && (
      <>
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[180px_1fr]">
        <label className="text-sm text-zinc-400">
          Time (SAST)
          <input type="time" value={draft?.scheduledTime ?? "08:00"} onChange={(event) => setDraft((current) => current ? { ...current, scheduledTime: event.target.value } : current)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white" />
        </label>
        <label className="text-sm text-zinc-400">
          Subject
          <input value={draft?.subject ?? ""} onChange={(event) => setDraft((current) => current ? { ...current, subject: event.target.value } : current)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white" />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-black/35 p-3"><span className="block text-xs uppercase tracking-[0.12em] text-zinc-500">Next run</span><strong className="mt-1 block text-zinc-200">{formatDateTime(draft?.nextRunAt ?? null)}</strong></div>
        <div className="rounded-lg border border-white/10 bg-black/35 p-3"><span className="block text-xs uppercase tracking-[0.12em] text-zinc-500">Last run</span><strong className="mt-1 block text-zinc-200">{formatDateTime(draft?.lastRunAt ?? null)}</strong></div>
        <div className="rounded-lg border border-white/10 bg-black/35 p-3"><span className="block text-xs uppercase tracking-[0.12em] text-zinc-500">Management copy</span><strong className="mt-1 block break-all text-zinc-200">kaden@kaden.co.za</strong></div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={() => setDraft((current) => current ? { ...current, enabled: !current.enabled } : current)} disabled={!draft || loading} className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-200 disabled:opacity-40">{draft?.enabled ? "Disable" : "Enable"}</button>
        <button type="button" onClick={() => void loadPreview()} disabled={loading} className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-200 transition hover:bg-white hover:text-black disabled:opacity-40">{loading ? "Loading..." : "Preview Recipients"}</button>
        <button type="button" onClick={() => setShowPreview(true)} disabled={!payload?.example} className="rounded-full border border-[#D8C36A]/40 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black disabled:opacity-40">Preview Email</button>
        <button type="button" onClick={() => void save()} disabled={!draft || loading} className="rounded-full bg-[#D8C36A] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-black transition hover:bg-[#F2D66C] disabled:opacity-40">Save Workflow</button>
      </div>

      {status && <p className="mt-4 rounded-lg border border-emerald-300/25 bg-emerald-950/20 p-3 text-sm text-emerald-200">{status}</p>}
      {error && <p className="mt-4 rounded-lg border border-red-300/25 bg-red-950/20 p-3 text-sm text-red-200">{error}</p>}

      {payload && (
        <div className="mt-5 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-black text-xs uppercase tracking-[0.12em] text-zinc-500"><tr><th className="px-4 py-3">Staff recipient</th><th className="px-4 py-3">Staff email</th><th className="px-4 py-3">Bookings</th><th className="px-4 py-3">Needs attention</th><th className="px-4 py-3">CC</th></tr></thead>
            <tbody>
              {[...sendRows, ...skippedRows].map((row) => <tr key={row.staffId} className="border-t border-white/10"><td className="px-4 py-3 text-white">{row.staffName}{row.bookingCount === 0 && <span className="ml-2 text-xs text-zinc-500">Skipped</span>}</td><td className="px-4 py-3 text-zinc-300">{row.email}</td><td className="px-4 py-3 text-zinc-300">{row.bookingCount}</td><td className="px-4 py-3 text-zinc-300">{row.attentionCount}</td><td className="px-4 py-3 text-zinc-300">{row.bookingCount > 0 ? row.cc : "No email"}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}

      {showPreview && payload?.example && (
        <div role="dialog" aria-modal="true" aria-label="Daily Booking Review email preview" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-lg border border-[#D8C36A]/35 bg-zinc-950 p-4 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.14em] text-zinc-500">No-send preview</p><h4 className="font-bold text-white">{payload.example.subject}</h4></div><div className="flex gap-2"><button type="button" onClick={() => setPreviewWidth(620)} className="rounded-full border border-white/15 px-3 py-2 text-xs text-zinc-200">Desktop</button><button type="button" onClick={() => setPreviewWidth(390)} className="rounded-full border border-white/15 px-3 py-2 text-xs text-zinc-200">Mobile</button><button type="button" onClick={() => setShowPreview(false)} className="rounded-full bg-[#D8C36A] px-4 py-2 text-xs font-bold text-black">Close</button></div></div>
            <div className="mt-4 overflow-auto bg-zinc-900 p-3"><iframe title="Daily Booking Review preview" srcDoc={payload.example.html} style={{ height: "68vh", width: previewWidth }} className="mx-auto max-w-full border-0 bg-white" /></div>
          </div>
        </div>
      )}
      </>
      )}
    </article>
  );
}
