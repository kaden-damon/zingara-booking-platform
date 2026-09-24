"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import type {
  DineplanActionRecord,
  DineplanActionSettings,
  DineplanDigest,
} from "@/lib/dineplanActions";

type ActionFilter = "acknowledged" | "all" | "critical" | "no_action" | "resolved" | "unacknowledged";

type StaffOption = { email: string; id: string; name: string };

type ActionCentrePayload = {
  actions: DineplanActionRecord[];
  canConfigure: boolean;
  latestSource: string | null;
  preview: DineplanDigest | null;
  previews: Array<{ audience: "corporate" | "general"; cc: string[]; digest: DineplanDigest; to: string[] }>;
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

function dataAge(value: string | null) {
  if (!value) return "Unknown";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 120) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function statusLabel(action: DineplanActionRecord) {
  if (action.status === "acknowledged") return `Being handled${action.acknowledgedByName ? ` by ${action.acknowledgedByName}` : ""}`;
  if (action.status === "no_action") return "No Action Required";
  if (action.status === "resolved") return "Resolved by Reconciliation";
  return "Unacknowledged";
}

export default function DineplanActionCentre({ refreshKey }: { refreshKey: number }) {
  const [payload, setPayload] = useState<ActionCentrePayload | null>(null);
  const [filter, setFilter] = useState<ActionFilter>("all");
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

  const counts = useMemo(() => {
    const actions = payload?.actions ?? [];
    return {
      acknowledged: actions.filter((action) => action.status === "acknowledged").length,
      critical: actions.filter((action) => action.severity === "critical" && ["acknowledged", "unacknowledged"].includes(action.status)).length,
      no_action: actions.filter((action) => action.status === "no_action").length,
      resolved: actions.filter((action) => action.status === "resolved").length,
      unacknowledged: actions.filter((action) => action.status === "unacknowledged").length,
    };
  }, [payload]);
  const visible = useMemo(() => {
    const actions = payload?.actions ?? [];
    return actions
      .filter((action) => filter === "all" ? true : filter === "critical" ? action.severity === "critical" && ["acknowledged", "unacknowledged"].includes(action.status) : action.status === filter)
      .sort((left, right) => {
        const leftOpen = ["acknowledged", "unacknowledged"].includes(left.status) ? 0 : 1;
        const rightOpen = ["acknowledged", "unacknowledged"].includes(right.status) ? 0 : 1;
        return leftOpen - rightOpen || (left.severity === "critical" ? -1 : 1) - (right.severity === "critical" ? -1 : 1) || Date.parse(right.lastDetectedAt) - Date.parse(left.lastDetectedAt);
      });
  }, [filter, payload]);

  async function updateAction(actionId: string, action: "acknowledge" | "no_action") {
    setBusy(actionId);
    setError("");
    try {
      await fetchSupabaseApi("/api/admin/dineplan-reconciliation/actions", {
        body: { action, actionId, note: notes[actionId] ?? "" },
        method: "PATCH",
      });
      setMessage(action === "acknowledge" ? "Action acknowledged. It remains unresolved until a later snapshot verifies the correction." : "No Action Required recorded with an immutable reason.");
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
      setMessage("Action recipients and reminder policy saved. Existing actions were not changed.");
      await load();
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "Action settings could not be saved.");
    } finally {
      setBusy("");
    }
  }

  if (!payload && !error) return <div className="border-y border-white/10 py-5 text-sm text-zinc-400">Loading Action Centre...</div>;

  return (
    <section className="space-y-5 border-y border-[#D8C36A]/25 py-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">Action Centre</p>
          <h3 className="mt-1 text-xl font-semibold text-white">Box Office Action Digest</h3>
          <p className="mt-1 text-sm text-zinc-400">Last Dineplan snapshot: {formatTimestamp(payload?.latestSource ?? null)} · Data age: {dataAge(payload?.latestSource ?? null)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => document.getElementById("dineplan-export-upload")?.click()} className="border border-[#D8C36A]/40 px-3 py-2 text-xs font-semibold uppercase text-[#F2D66C]">Upload Fresh Snapshot</button>
          <button type="button" onClick={() => void loadPreview()} disabled={busy === "preview"} className="border border-white/20 px-3 py-2 text-xs font-semibold uppercase text-white disabled:opacity-50">{busy === "preview" ? "Preparing..." : "Preview Action Digest"}</button>
        </div>
      </div>

      {payload?.snapshotStale && <div role="alert" className="border border-amber-300/30 bg-amber-950/20 p-4 text-sm text-amber-100"><strong>Dineplan snapshot may be out of date.</strong> Upload a fresh export before making a source-dependent correction.</div>}
      {error && <div role="alert" className="border border-red-300/30 bg-red-950/25 p-4 text-sm text-red-100">{error}</div>}
      {message && <div role="status" className="border border-emerald-300/25 bg-emerald-950/15 p-4 text-sm text-emerald-100">{message}</div>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {([
          ["all", "All", payload?.actions.length ?? 0],
          ["critical", "Critical", counts.critical],
          ["unacknowledged", "Need Attention", counts.unacknowledged],
          ["acknowledged", "Being Handled", counts.acknowledged],
          ["resolved", "Resolved Since Snapshot", counts.resolved],
          ["no_action", "No Action", counts.no_action],
        ] as Array<[ActionFilter, string, number]>).map(([key, label, count]) => (
          <button key={key} type="button" onClick={() => setFilter(key)} className={`border p-3 text-left ${filter === key ? "border-[#D8C36A] bg-[#D8C36A]/10" : "border-white/10 bg-black/30"}`}><span className="block text-xs uppercase text-zinc-400">{label}</span><span className="mt-1 block text-2xl font-semibold text-white">{count}</span></button>
        ))}
      </div>

      <div className="space-y-3">
        {visible.map((action) => (
          <article key={action.id} className={`border p-4 ${action.severity === "critical" && ["acknowledged", "unacknowledged"].includes(action.status) ? "border-red-300/30 bg-red-950/10" : "border-white/10 bg-black/20"}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:justify-between">
              <div className="min-w-0">
                <p className={`text-xs font-semibold uppercase ${action.severity === "critical" ? "text-red-300" : "text-[#F2D66C]"}`}>{action.severity} · {action.bookingKind === "corporate" ? "Corporate · " : ""}{statusLabel(action)}</p>
                <h4 className="mt-1 break-words font-semibold text-white">{action.guestLabel} · {action.pax} pax</h4>
                <p className="mt-1 text-sm text-zinc-400">{action.venue === "cape-town" ? "Cape Town" : "Johannesburg"} · {action.performanceDate} · {action.zone ?? "Zone not stated"}</p>
              </div>
              {action.bookingReference && <a href={`/admin?section=bookings&booking=${encodeURIComponent(action.bookingReference)}`} className="shrink-0 text-sm font-semibold text-[#F2D66C] underline">Open Booking</a>}
            </div>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <div><p className="text-xs uppercase text-zinc-500">Dineplan</p><p className="mt-1 text-zinc-200">{action.dineplanState}</p></div>
              <div><p className="text-xs uppercase text-zinc-500">Zingara</p><p className="mt-1 text-zinc-200">{action.zingaraState}</p></div>
            </div>
            {action.capacityImpact > 0 && <p className="mt-3 text-sm font-semibold text-red-200">Capacity impact: {action.capacityImpact} pax currently consuming Zingara capacity</p>}
            <p className="mt-3 text-sm text-white"><strong>Manual action:</strong> {action.manualAction}</p>
            {["acknowledged", "unacknowledged"].includes(action.status) && (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input value={notes[action.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [action.id]: event.target.value }))} placeholder="Optional acknowledgement note; reason required for No Action" className="min-w-0 flex-1 border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
                <button type="button" onClick={() => void updateAction(action.id, "acknowledge")} disabled={busy === action.id} className="bg-[#D8C36A] px-3 py-2 text-xs font-semibold uppercase text-black disabled:opacity-50">Acknowledge</button>
                <button type="button" onClick={() => void updateAction(action.id, "no_action")} disabled={busy === action.id || !(notes[action.id] ?? "").trim()} className="border border-white/20 px-3 py-2 text-xs font-semibold uppercase text-white disabled:opacity-40">No Action Required</button>
              </div>
            )}
            {action.status === "no_action" && action.noActionReason && <p className="mt-3 text-xs text-zinc-400">Reason: {action.noActionReason}</p>}
          </article>
        ))}
        {!visible.length && <p className="py-4 text-sm text-zinc-400">No actions match this filter.</p>}
      </div>

      {previews.map((preview, index) => <div key={`${preview.audience}-${index}`} className="border border-white/10 bg-black/40 p-4"><p className="text-xs font-semibold uppercase text-[#D8C36A]">{preview.audience === "corporate" ? "Corporate-only" : "General + Management"} Email Preview · Not Sent</p><p className="mt-2 text-xs text-zinc-400">To: {preview.to.join(", ") || "No configured recipients"}{preview.cc.length ? ` · CC: ${preview.cc.join(", ")}` : ""}</p><p className="mt-2 font-semibold text-white">{preview.digest.subject}</p><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-zinc-300">{preview.digest.message}</pre></div>)}

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
  return (
    <details className="border border-white/10 p-4">
      <summary className="cursor-pointer text-sm font-semibold uppercase text-[#F2D66C]">Recipient & Reminder Settings</summary>
      <div className="mt-4 grid gap-5 lg:grid-cols-3">
        <div><p className="text-xs font-semibold uppercase text-zinc-400">Box Office · General</p><div className="mt-2 space-y-2">{staffOptions.map((staff) => <label key={`to-${staff.id}`} className="flex gap-2 text-sm text-zinc-200"><input type="checkbox" checked={draft.actionRecipientStaffIds.includes(staff.id)} onChange={() => toggleBoxOffice("actionRecipientStaffIds", staff.id)} /><span>{staff.name} · {staff.email}</span></label>)}</div></div>
        <div><p className="text-xs font-semibold uppercase text-zinc-400">Box Office · Corporate Only</p><div className="mt-2 space-y-2">{staffOptions.map((staff) => <label key={`corporate-${staff.id}`} className="flex gap-2 text-sm text-zinc-200"><input type="checkbox" checked={draft.corporateRecipientStaffIds.includes(staff.id)} onChange={() => toggleBoxOffice("corporateRecipientStaffIds", staff.id)} /><span>{staff.name} · {staff.email}</span></label>)}</div></div>
        <div><p className="text-xs font-semibold uppercase text-zinc-400">Management CC</p><div className="mt-2 space-y-2">{staffOptions.map((staff) => <label key={`cc-${staff.id}`} className="flex gap-2 text-sm text-zinc-200"><input type="checkbox" checked={draft.managementCcStaffIds.includes(staff.id)} onChange={() => toggle("managementCcStaffIds", staff.id)} /><span>{staff.name} · {staff.email}</span></label>)}</div></div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs uppercase text-zinc-400"><span className="flex items-center gap-2 normal-case text-zinc-200"><input type="checkbox" checked={draft.hourlyRemindersEnabled} onChange={(event) => setDraft((current) => ({ ...current, hourlyRemindersEnabled: event.target.checked }))} />Hourly reminders enabled</span></label>
        <label className="text-xs uppercase text-zinc-400">Acknowledged cadence hours<input type="number" min="1" max="24" value={draft.normalAcknowledgedCadenceHours} onChange={(event) => setDraft((current) => ({ ...current, normalAcknowledgedCadenceHours: Number(event.target.value) }))} className="mt-1 w-full border border-zinc-700 bg-black px-3 py-2 text-white" /></label>
        <label className="text-xs uppercase text-zinc-400">Pre-show escalation hours<input type="number" min="1" max="24" value={draft.preShowEscalationHours} onChange={(event) => setDraft((current) => ({ ...current, preShowEscalationHours: Number(event.target.value) }))} className="mt-1 w-full border border-zinc-700 bg-black px-3 py-2 text-white" /></label>
        <label className="text-xs uppercase text-zinc-400">Snapshot stale hours<input type="number" min="1" max="168" value={draft.snapshotStaleHours} onChange={(event) => setDraft((current) => ({ ...current, snapshotStaleHours: Number(event.target.value) }))} className="mt-1 w-full border border-zinc-700 bg-black px-3 py-2 text-white" /></label>
      </div>
      <button type="button" onClick={() => void onSave(draft)} disabled={busy} className="mt-5 bg-[#D8C36A] px-4 py-2 text-xs font-semibold uppercase text-black disabled:opacity-50">{busy ? "Saving..." : "Save Action Settings"}</button>
    </details>
  );
}
