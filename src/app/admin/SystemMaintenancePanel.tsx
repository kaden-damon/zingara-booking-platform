"use client";

import { useEffect, useMemo, useState } from "react";
import {
  defaultPlatformMaintenanceConfig,
  normalizePlatformMaintenanceConfig,
  type MaintenanceEnquiryStatus,
  type PlatformMaintenanceConfig,
  type PublicMaintenanceScope,
} from "@/lib/platformMaintenance";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

type EnquiryRow = {
  email: string;
  full_name: string;
  id: string;
  mobile: string;
  notes: string | null;
  pax: number;
  preferred_city: string;
  preferred_show_date: string | null;
  reference: string;
  seating_preference: string | null;
  status: MaintenanceEnquiryStatus;
  submitted_at: string;
  updated_at: string;
};

type SaveState = "error" | "idle" | "saved" | "saving";

function sameConfig(a: PlatformMaintenanceConfig, b: PlatformMaintenanceConfig) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function statusLabel(status: MaintenanceEnquiryStatus) {
  return status === "new" ? "New" : status === "contacted" ? "Contacted" : "Resolved";
}

export default function SystemMaintenancePanel({
  onStateChange,
}: {
  onStateChange?: (config: PlatformMaintenanceConfig) => void;
}) {
  const [saved, setSaved] = useState(defaultPlatformMaintenanceConfig);
  const [draft, setDraft] = useState(defaultPlatformMaintenanceConfig);
  const [revision, setRevision] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [enquiries, setEnquiries] = useState<EnquiryRow[]>([]);
  const [queueError, setQueueError] = useState("");
  const isDirty = useMemo(() => !sameConfig(saved, draft), [draft, saved]);

  useEffect(() => {
    let active = true;

    Promise.all([
      fetchSupabaseApi<{ config: unknown; revision: number }>(
        "/api/admin/system-maintenance",
      ),
      fetchSupabaseApi<{ enquiries: EnquiryRow[] }>(
        "/api/admin/maintenance-booking-enquiries",
      ),
    ])
      .then(([maintenancePayload, enquiryPayload]) => {
        if (!active) return;
        const config = normalizePlatformMaintenanceConfig(
          maintenancePayload.config,
        );
        setSaved(config);
        setDraft(config);
        setRevision(maintenancePayload.revision ?? 0);
        setEnquiries(enquiryPayload.enquiries ?? []);
        onStateChange?.(config);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Maintenance controls could not be loaded.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [onStateChange]);

  function updateStaff<Key extends keyof PlatformMaintenanceConfig["staff"]>(
    key: Key,
    value: PlatformMaintenanceConfig["staff"][Key],
  ) {
    setDraft((current) => ({
      ...current,
      staff: { ...current.staff, [key]: value },
    }));
    setSaveState("idle");
    setError("");
  }

  function updatePublic<Key extends keyof PlatformMaintenanceConfig["public"]>(
    key: Key,
    value: PlatformMaintenanceConfig["public"][Key],
  ) {
    setDraft((current) => ({
      ...current,
      public: { ...current.public, [key]: value },
    }));
    setSaveState("idle");
    setError("");
  }

  async function saveMaintenance() {
    if (!isDirty || saveState === "saving") return;

    const confirmations: string[] = [];

    if (saved.staff.enabled !== draft.staff.enabled) {
      confirmations.push(
        draft.staff.enabled
          ? "Enable Staff Maintenance? Normal staff will immediately lose access to operational Admin functions."
          : "Disable Staff Maintenance and restore normal staff operations?",
      );
    }
    if (saved.public.enabled !== draft.public.enabled) {
      confirmations.push(
        draft.public.enabled
          ? "Enable Public Maintenance? Customers will be prevented from completing the selected booking or payment actions."
          : "Disable Public Maintenance and restore the selected public actions?",
      );
    }

    if (confirmations.some((message) => !window.confirm(message))) return;

    setSaveState("saving");
    setError("");

    try {
      const payload = await fetchSupabaseApi<{
        config: unknown;
        revision: number;
      }>("/api/admin/system-maintenance", {
        body: { confirmed: true, config: draft, revision },
        method: "PUT",
      });
      const config = normalizePlatformMaintenanceConfig(payload.config);
      setSaved(config);
      setDraft(config);
      setRevision(payload.revision);
      setSaveState("saved");
      onStateChange?.(config);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Maintenance configuration could not be saved.");
      setSaveState("error");
    }
  }

  async function updateEnquiryStatus(id: string, status: MaintenanceEnquiryStatus) {
    setQueueError("");

    try {
      const payload = await fetchSupabaseApi<{ enquiry: EnquiryRow }>(
        "/api/admin/maintenance-booking-enquiries",
        { body: { id, status }, method: "PATCH" },
      );
      setEnquiries((current) => current.map((row) => row.id === id ? payload.enquiry : row));
    } catch (updateError) {
      setQueueError(updateError instanceof Error ? updateError.message : "Enquiry status could not be updated.");
    }
  }

  if (isLoading) {
    return <section className="rounded-lg border border-white/10 bg-zinc-950 p-5 text-sm text-zinc-400">Loading maintenance controls...</section>;
  }

  return (
    <section className="space-y-5 rounded-lg border border-[#D8C36A]/30 bg-zinc-950 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">Emergency Controls</p>
          <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">System Maintenance</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Server-enforced operational controls. Changes take effect for the next protected request.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span role="status" aria-live="polite" className={saveState === "error" ? "text-sm text-red-300" : saveState === "saved" ? "text-sm text-emerald-300" : "text-sm text-zinc-400"}>
            {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : isDirty ? "Unsaved changes" : "Saved"}
          </span>
          <button type="button" onClick={() => void saveMaintenance()} disabled={!isDirty || saveState === "saving"} className="min-h-11 rounded-lg bg-[#D8C36A] px-4 py-2 text-sm font-bold text-black transition hover:bg-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-45">Save Maintenance</button>
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-300/30 bg-red-950/20 p-4 text-sm text-red-100">{error}</p>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-white/10 bg-black/35 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-white">Staff Maintenance</h3>
              <p className="mt-1 text-sm text-zinc-500">Normal staff mutations are blocked. Super Admin access remains available.</p>
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-white">
              <input type="checkbox" checked={draft.staff.enabled} onChange={(event) => updateStaff("enabled", event.target.checked)} className="h-5 w-5 accent-[#D8C36A]" />
              {draft.staff.enabled ? "Enabled" : "Disabled"}
            </label>
          </div>
          <label className="mt-5 block text-sm font-semibold text-zinc-300">Message / reason
            <textarea rows={4} value={draft.staff.message} onChange={(event) => updateStaff("message", event.target.value)} className="mt-2 w-full rounded-lg border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A]" />
          </label>
          {saved.staff.enabled && <p className="mt-3 text-xs text-amber-200">Enabled by {saved.staff.enabledBy ?? "Super Admin"} · {saved.staff.enabledAt ? new Date(saved.staff.enabledAt).toLocaleString("en-ZA") : "time unavailable"}</p>}
        </section>

        <section className="rounded-lg border border-white/10 bg-black/35 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-white">Public Maintenance</h3>
              <p className="mt-1 text-sm text-zinc-500">Independently block new bookings, payment starts, or both.</p>
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-white">
              <input type="checkbox" checked={draft.public.enabled} onChange={(event) => updatePublic("enabled", event.target.checked)} className="h-5 w-5 accent-[#D8C36A]" />
              {draft.public.enabled ? "Enabled" : "Disabled"}
            </label>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-zinc-300">Scope
              <select value={draft.public.scope} onChange={(event) => updatePublic("scope", event.target.value as PublicMaintenanceScope)} className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-white">
                <option value="bookings">Bookings</option>
                <option value="payments">Payments</option>
                <option value="full">Full Booking Journey</option>
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-3 self-end text-sm font-semibold text-zinc-300">
              <input type="checkbox" checked={draft.public.enquiryFormEnabled} onChange={(event) => updatePublic("enquiryFormEnabled", event.target.checked)} className="h-5 w-5 accent-[#D8C36A]" /> Booking Enquiry Form
            </label>
            <label className="text-sm font-semibold text-zinc-300 sm:col-span-2">Heading
              <input value={draft.public.heading} onChange={(event) => updatePublic("heading", event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A]" />
            </label>
            <label className="text-sm font-semibold text-zinc-300 sm:col-span-2">Message
              <textarea rows={4} value={draft.public.message} onChange={(event) => updatePublic("message", event.target.value)} className="mt-2 w-full rounded-lg border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A]" />
            </label>
            <label className="text-sm font-semibold text-zinc-300 sm:col-span-2">Public contact
              <input type="email" value={draft.public.contactEmail} onChange={(event) => updatePublic("contactEmail", event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-black px-4 py-3 text-white outline-none focus:border-[#D8C36A]" />
            </label>
          </div>
          {saved.public.enabled && <p className="mt-3 text-xs text-amber-200">Enabled by {saved.public.enabledBy ?? "Super Admin"} · {saved.public.enabledAt ? new Date(saved.public.enabledAt).toLocaleString("en-ZA") : "time unavailable"}</p>}
        </section>
      </div>

      <section className="rounded-lg border border-white/10 bg-black/35 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">Maintenance Booking Enquiries</h3>
            <p className="mt-1 text-sm text-zinc-500">Operational enquiries only. These are not bookings and do not create payments or tickets.</p>
          </div>
          <span className="text-sm text-zinc-400">{enquiries.length} enquiries</span>
        </div>
        {queueError && <p className="mt-4 text-sm text-red-300">{queueError}</p>}
        <div className="mt-4 space-y-3">
          {enquiries.length === 0 ? (
            <p className="rounded-lg border border-white/10 p-4 text-sm text-zinc-400">No maintenance enquiries.</p>
          ) : enquiries.map((row) => (
            <article key={row.id} className="rounded-lg border border-white/10 bg-zinc-950 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1 text-sm text-zinc-300">
                  <p className="font-semibold text-white">{row.full_name} · {row.reference}</p>
                  <p className="break-words">{row.email} · {row.mobile}</p>
                  <p>{row.preferred_city} · {row.preferred_show_date ?? "Date not specified"} · {row.pax} pax</p>
                  <p>{row.seating_preference ?? "No seating preference"}</p>
                  {row.notes && <p className="pt-1 text-zinc-400">{row.notes}</p>}
                  <p className="pt-1 text-xs text-zinc-500">Submitted {new Date(row.submitted_at).toLocaleString("en-ZA")}</p>
                </div>
                <label className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400">Status
                  <select value={row.status} onChange={(event) => void updateEnquiryStatus(row.id, event.target.value as MaintenanceEnquiryStatus)} className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-sm normal-case tracking-normal text-white lg:w-40">
                    {(["new", "contacted", "resolved"] as const).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                  </select>
                </label>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
