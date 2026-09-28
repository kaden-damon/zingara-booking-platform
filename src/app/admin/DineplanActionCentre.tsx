"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import type {
  DineplanActionRecord,
  DineplanActionSettings,
  DineplanDigest,
} from "@/lib/dineplanActions";
import {
  formatDineplanStaffState,
  getDineplanStaffActionCopy,
} from "@/lib/dineplanPresentation";

type StaffOption = { email: string; id: string; name: string };

type SelectedSnapshot = {
  id: string;
  performance_date: string | null;
  performance_time: string | null;
  source_generated_at: string | null;
  status: "preview" | "reconciled" | "review_required";
  venue: "cape-town" | "johannesburg" | null;
};

type ActionCentrePayload = {
  actions: DineplanActionRecord[];
  canConfigure: boolean;
  latestSource: string | null;
  preview: DineplanDigest | null;
  previews: Array<{ audience: "corporate" | "general"; cc: string[]; digest: DineplanDigest; to: string[] }>;
  scheduleStatus: {
    lastResult: string | null;
    lastScheduledCheckAt: string | null;
    lastSuccessfulDeliveryAt: string | null;
    lastSuccessfulDeliveryKind: string | null;
  };
  settings: DineplanActionSettings;
  snapshotStale: boolean;
  staffOptions: StaffOption[];
};

function formatTimestamp(value: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function formatPerformanceDate(value: string | null) {
  if (!value) return "Unconfirmed performance";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "long",
    timeZone: "Africa/Johannesburg",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00+02:00`));
}

function venueLabel(value: string | null) {
  if (value === "johannesburg") return "Johannesburg";
  if (value === "cape-town") return "Cape Town";
  return "Venue not detected";
}

function dataAge(value: string | null) {
  if (!value) return "Unknown";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 120) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export default function DineplanActionCentre({
  refreshKey,
  selectedSnapshot,
}: {
  refreshKey: number;
  selectedSnapshot: SelectedSnapshot | null;
}) {
  const [payload, setPayload] = useState<ActionCentrePayload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<ActionCentrePayload["previews"]>([]);

  async function load() {
    setError("");
    try {
      const next = await fetchSupabaseApi<ActionCentrePayload>("/api/admin/dineplan-reconciliation/actions", { cache: "no-store" });
      setPayload(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The Action Centre could not be loaded.");
    }
  }

  useEffect(() => { void load(); }, [refreshKey]);

  const currentActions = useMemo(() => (payload?.actions ?? [])
    .filter((action) => ["acknowledged", "unacknowledged"].includes(action.status))
    .sort((left, right) => (left.severity === "critical" ? -1 : 1) - (right.severity === "critical" ? -1 : 1) || Date.parse(right.lastDetectedAt) - Date.parse(left.lastDetectedAt)), [payload]);
  const pastActions = useMemo(() => (payload?.actions ?? [])
    .filter((action) => ["no_action", "resolved"].includes(action.status))
    .sort((left, right) => Date.parse(right.lastDetectedAt) - Date.parse(left.lastDetectedAt)), [payload]);
  const actionSources = useMemo(() => {
    const sources = new Map<string, DineplanActionRecord>();
    for (const action of payload?.actions ?? []) {
      if (!["acknowledged", "unacknowledged"].includes(action.status)) continue;
      const prior = sources.get(action.snapshotId);
      if (!prior || Date.parse(action.lastDetectedAt) > Date.parse(prior.lastDetectedAt)) {
        sources.set(action.snapshotId, action);
      }
    }
    return [...sources.values()].sort((left, right) => Date.parse(right.lastDetectedAt) - Date.parse(left.lastDetectedAt));
  }, [payload]);
  const selectedSnapshotDrivesActions = Boolean(
    selectedSnapshot && actionSources.some((source) => source.snapshotId === selectedSnapshot.id),
  );

  async function recordNoAction(actionId: string) {
    setBusy(actionId);
    setError("");
    try {
      await fetchSupabaseApi("/api/admin/dineplan-reconciliation/actions", {
        body: { action: "no_action", actionId, note: notes[actionId] ?? "" },
        method: "PATCH",
      });
      setMessage("No action required was recorded with the reason supplied.");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The action could not be updated.");
    } finally {
      setBusy("");
    }
  }

  async function loadPreview() {
    setBusy("preview");
    setError("");
    try {
      const next = await fetchSupabaseApi<ActionCentrePayload>("/api/admin/dineplan-reconciliation/actions?preview=1", { cache: "no-store" });
      setPreviews(next.previews ?? (next.preview ? [{ audience: "general", cc: [], digest: next.preview, to: [] }] : []));
      setMessage(next.preview ? "Preview generated. No email was sent." : "There are no unresolved actionable items, so no digest would be sent.");
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "The digest preview could not be generated.");
    } finally {
      setBusy("");
    }
  }

  async function saveSettings(settings: DineplanActionSettings) {
    setBusy("settings");
    setError("");
    try {
      await fetchSupabaseApi("/api/admin/dineplan-reconciliation/actions", {
        body: { action: "update_settings", ...settings },
        method: "PATCH",
      });
      setMessage("Action recipients and scheduled email checkpoints saved. Existing actions were not changed.");
      await load();
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "Action settings could not be saved.");
    } finally {
      setBusy("");
    }
  }

  if (!payload && !error) return <div className="rounded-xl border border-white/10 bg-black/25 p-5 text-sm text-zinc-400">Loading bookings that need attention...</div>;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">Bookings that need attention</p>
          <h3 className="mt-1 text-xl font-semibold text-white">{currentActions.length ? `${currentActions.length} booking${currentActions.length === 1 ? " needs" : "s need"} attention` : "Everything matches"}</h3>
          {actionSources.length ? actionSources.map((source) => (
            <p key={source.snapshotId} className="mt-1 text-sm text-zinc-300">
              {venueLabel(source.venue)} · {formatPerformanceDate(source.performanceDate)} · {source.performanceTime?.slice(0, 5) ?? "Time not available"} · Dineplan updated {formatTimestamp(source.sourceGeneratedAt)}
            </p>
          )) : <p className="mt-1 text-sm text-zinc-400">Upload the latest Dineplan PDF to check this performance.</p>}
          {payload?.latestSource && <p className="mt-1 text-xs text-zinc-500">File age: {dataAge(payload.latestSource)}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => document.getElementById("dineplan-export-upload")?.click()} className="min-h-11 rounded-full bg-[#D8C36A] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.08em] text-black transition hover:bg-[#F2D66C]">Upload new file</button>
          <button type="button" onClick={() => void loadPreview()} disabled={busy === "preview"} className="min-h-11 rounded-full border border-white/15 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-white transition hover:border-[#D8C36A]/60 disabled:opacity-50">{busy === "preview" ? "Preparing..." : "Preview email"}</button>
        </div>
      </div>

      {selectedSnapshot?.status === "review_required" && !selectedSnapshotDrivesActions && (
        <div role="alert" className="rounded-xl border border-amber-300/30 bg-amber-950/20 p-4 text-sm text-amber-100">
          <strong className="block">We couldn't safely compare this file</strong>
          <span className="mt-1 block">Review the {formatPerformanceDate(selectedSnapshot.performance_date)} file or upload a new one. No booking actions were created from it.</span>
          {actionSources.length > 0 && (
            <>
              <strong className="mt-3 block text-xs uppercase text-[#F2D66C]">Earlier bookings that still need attention</strong>
              <span className="mt-1 block text-zinc-200">The bookings below come from the last file that could be safely compared.</span>
            </>
          )}
        </div>
      )}

      {payload?.snapshotStale && <div role="alert" className="rounded-xl border border-amber-300/30 bg-amber-950/20 p-4 text-sm text-amber-100"><strong>Dineplan file may be out of date.</strong> Upload a new file before making changes based on it.</div>}
      {error && <div role="alert" className="rounded-xl border border-red-300/30 bg-red-950/25 p-4 text-sm text-red-100">{error}</div>}
      {message && <div role="status" className="rounded-xl border border-emerald-300/25 bg-emerald-950/15 p-4 text-sm text-emerald-100">{message}</div>}

      <div className="space-y-3">
        {currentActions.map((action) => {
          const openUrl = action.bookingReference ? `/admin?section=bookings&booking=${encodeURIComponent(action.bookingReference)}` : `/admin?section=platform-operations&system=dineplan&action=${action.id}`;
          return (
          <article id={`dineplan-action-${action.id}`} key={action.id} className={`rounded-xl border p-4 sm:p-5 ${action.severity === "critical" ? "border-red-300/30 bg-red-950/10" : "border-white/10 bg-black/25"}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className={`flex items-center gap-2 text-xs font-semibold uppercase ${action.severity === "critical" ? "text-red-300" : "text-[#F2D66C]"}`}><span className={`h-2 w-2 rounded-full ${action.severity === "critical" ? "bg-red-300" : "bg-[#D8C36A]"}`} />{action.severity === "critical" ? "Urgent" : "Needs attention"}{action.bookingKind === "corporate" ? " · Corporate" : ""}</p>
                <h4 className="mt-2 break-words text-base font-semibold text-white">{action.guestLabel} · {action.pax} guests</h4>
                <p className="mt-1 text-sm text-zinc-400">{action.zone ?? "Section not stated"}</p>
                <p className="mt-3 text-sm leading-6 text-zinc-100">{getDineplanStaffActionCopy(action)}</p>
              </div>
              <a href={openUrl} className="inline-flex min-h-11 shrink-0 items-center justify-center self-start rounded-full bg-[#D8C36A] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.08em] text-black transition hover:bg-[#F2D66C]">Open</a>
            </div>
            <details className="mt-3 border-t border-white/10 pt-3">
              <summary className="cursor-pointer text-sm font-semibold text-[#F2D66C]">View details</summary>
              <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                <div><p className="text-xs uppercase text-zinc-500">Dineplan</p><p className="mt-1 text-zinc-200">{formatDineplanStaffState(action.dineplanState)}</p></div>
                <div><p className="text-xs uppercase text-zinc-500">Zingara</p><p className="mt-1 text-zinc-200">{formatDineplanStaffState(action.zingaraState)}</p></div>
              </div>
              {action.capacityImpact > 0 ? <p className="mt-3 text-sm font-semibold text-red-200">{action.capacityImpact} guests are currently booked in Zingara.</p> : /No authoritative match|No booking found/i.test(action.zingaraState) ? <p className="mt-3 text-sm text-amber-100">This may add {action.pax} guests if the booking is created.</p> : null}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input value={notes[action.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [action.id]: event.target.value }))} placeholder="Reason required for No action" className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
                <button type="button" onClick={() => void recordNoAction(action.id)} disabled={busy === action.id || !(notes[action.id] ?? "").trim()} className="min-h-11 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase text-white disabled:opacity-40">No action required</button>
              </div>
            </details>
          </article>
        );})}
        {!currentActions.length && <div className="rounded-xl border border-emerald-300/20 bg-emerald-950/10 p-4 text-sm text-emerald-100">There are no current bookings that need attention.</div>}
      </div>

      {pastActions.length > 0 && <details className="rounded-xl border border-white/10 bg-black/20 p-4"><summary className="cursor-pointer text-sm font-semibold text-zinc-300">Past outcomes · {pastActions.length}</summary><div className="mt-3 divide-y divide-white/10">{pastActions.map((action) => <div key={action.id} className="py-3 text-sm"><p className="font-medium text-white">{action.guestLabel} · {action.pax} guests</p><p className="mt-1 text-zinc-400">{action.status === "resolved" ? "Resolved after a later comparison" : "No action required"}{action.noActionReason ? ` · ${action.noActionReason}` : ""}</p></div>)}</div></details>}

      {previews.length > 0 && <details className="rounded-xl border border-white/10 bg-black/20 p-4"><summary className="cursor-pointer text-sm font-semibold text-[#F2D66C]">Email preview · not sent</summary><div className="mt-4 space-y-4">{previews.map((preview, index) => <div key={`${preview.audience}-${index}`} className="rounded-lg border border-white/10 bg-black/40 p-4"><p className="text-xs font-semibold uppercase text-[#D8C36A]">{preview.audience === "corporate" ? "Corporate only" : "General and management"}</p><p className="mt-2 text-xs text-zinc-400">To: {preview.to.join(", ") || "No configured recipients"}{preview.cc.length ? ` · CC: ${preview.cc.join(", ")}` : ""}</p><p className="mt-2 font-semibold text-white">{preview.digest.subject}</p><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-zinc-300">{preview.digest.message}</pre></div>)}</div></details>}

      {payload?.canConfigure && <ActionSettings settings={payload.settings} staffOptions={payload.staffOptions} busy={busy === "settings"} onSave={saveSettings} />}
    </section>
  );
}

function ActionSettings({ settings, staffOptions, busy, onSave }: { settings: DineplanActionSettings; staffOptions: StaffOption[]; busy: boolean; onSave: (settings: DineplanActionSettings) => Promise<void> }) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const toggle = (field: "managementCcStaffIds", id: string) => setDraft((current) => ({
    ...current,
    [field]: current[field].includes(id) ? current[field].filter((value) => value !== id) : [...current[field], id],
  }));
  const toggleBoxOffice = (field: "actionRecipientStaffIds" | "corporateRecipientStaffIds", id: string) => setDraft((current) => {
    const other = field === "actionRecipientStaffIds" ? "corporateRecipientStaffIds" : "actionRecipientStaffIds";
    const enabled = current[field].includes(id);
    return {
      ...current,
      [field]: enabled ? current[field].filter((value) => value !== id) : [...current[field], id],
      [other]: enabled ? current[other] : current[other].filter((value) => value !== id),
    };
  });
  const scheduleTimes = [draft.morningEmailTime, draft.middayEmailTime, draft.finalEmailTime];
  const scheduleIsValid = scheduleTimes.every((time) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) &&
    new Set(scheduleTimes).size === scheduleTimes.length &&
    draft.morningEmailTime < draft.middayEmailTime &&
    draft.middayEmailTime < draft.finalEmailTime;
  return (
    <details className="rounded-xl border border-white/10 bg-black/20 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-[#F2D66C]">Email & reminder settings</summary>
      <div className="mt-4 grid gap-5 lg:grid-cols-3">
        <div><p className="text-xs font-semibold uppercase text-zinc-400">Box Office · General</p><div className="mt-2 space-y-2">{staffOptions.map((staff) => <label key={`to-${staff.id}`} className="flex gap-2 text-sm text-zinc-200"><input type="checkbox" checked={draft.actionRecipientStaffIds.includes(staff.id)} onChange={() => toggleBoxOffice("actionRecipientStaffIds", staff.id)} /><span>{staff.name} · {staff.email}</span></label>)}</div></div>
        <div><p className="text-xs font-semibold uppercase text-zinc-400">Box Office · Corporate Only</p><div className="mt-2 space-y-2">{staffOptions.map((staff) => <label key={`corporate-${staff.id}`} className="flex gap-2 text-sm text-zinc-200"><input type="checkbox" checked={draft.corporateRecipientStaffIds.includes(staff.id)} onChange={() => toggleBoxOffice("corporateRecipientStaffIds", staff.id)} /><span>{staff.name} · {staff.email}</span></label>)}</div></div>
        <div><p className="text-xs font-semibold uppercase text-zinc-400">Management CC</p><div className="mt-2 space-y-2">{staffOptions.map((staff) => <label key={`cc-${staff.id}`} className="flex gap-2 text-sm text-zinc-200"><input type="checkbox" checked={draft.managementCcStaffIds.includes(staff.id)} onChange={() => toggle("managementCcStaffIds", staff.id)} /><span>{staff.name} · {staff.email}</span></label>)}</div></div>
      </div>
      <div className="mt-5 border-t border-white/10 pt-5">
        <p className="text-xs font-semibold uppercase text-zinc-400">Dineplan email schedule</p>
        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-200"><input type="checkbox" checked={draft.scheduledEmailsEnabled} onChange={(event) => setDraft((current) => ({ ...current, scheduledEmailsEnabled: event.target.checked }))} />Scheduled emails enabled</label>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-xs uppercase text-zinc-400">Morning<input type="time" required={draft.scheduledEmailsEnabled} value={draft.morningEmailTime} onChange={(event) => setDraft((current) => ({ ...current, morningEmailTime: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white" /></label>
          <label className="text-xs uppercase text-zinc-400">Midday<input type="time" required={draft.scheduledEmailsEnabled} value={draft.middayEmailTime} onChange={(event) => setDraft((current) => ({ ...current, middayEmailTime: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white" /></label>
          <label className="text-xs uppercase text-zinc-400">Final<input type="time" required={draft.scheduledEmailsEnabled} value={draft.finalEmailTime} onChange={(event) => setDraft((current) => ({ ...current, finalEmailTime: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white" /></label>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Timezone: SAST · Morning must be before Midday, and Midday before Final.</p>
        {!scheduleIsValid && <p className="mt-2 text-xs text-red-300">Enter three different times in chronological order.</p>}
      </div>
      <details className="mt-5 rounded-lg border border-white/10 bg-black/30 p-4">
        <summary className="cursor-pointer text-sm font-medium text-zinc-300">Advanced settings</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-zinc-400">Follow-up interval after staff review<input type="number" min="1" max="24" value={draft.normalAcknowledgedCadenceHours} onChange={(event) => setDraft((current) => ({ ...current, normalAcknowledgedCadenceHours: Number(event.target.value) }))} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white" /></label>
          <label className="text-xs text-zinc-400">Urgent window before show<input type="number" min="1" max="24" value={draft.preShowEscalationHours} onChange={(event) => setDraft((current) => ({ ...current, preShowEscalationHours: Number(event.target.value) }))} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white" /></label>
          <label className="text-xs text-zinc-400">File considered old after<input type="number" min="1" max="168" value={draft.snapshotStaleHours} onChange={(event) => setDraft((current) => ({ ...current, snapshotStaleHours: Number(event.target.value) }))} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white" /></label>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Values are in hours.</p>
      </details>
      <button type="button" onClick={() => void onSave(draft)} disabled={busy || !scheduleIsValid} className="mt-5 min-h-11 rounded-full bg-[#D8C36A] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.08em] text-black transition hover:bg-[#F2D66C] disabled:opacity-50">{busy ? "Saving..." : "Save settings"}</button>
    </details>
  );
}
