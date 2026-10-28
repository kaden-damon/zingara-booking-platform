"use client";

import { useEffect, useState } from "react";

import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

type AssignmentStatus = {
  adoptionStatus: string;
  assignmentState: string;
  availableSeatCapacity: number;
  availableTableUnits: number;
  awaitingAssignmentCount: number;
  canManageGlobal: boolean;
  eligibility: {
    eligible: boolean;
    mismatchCount: number;
    reason: string;
  };
  globalEnabled: boolean;
  globalThresholdPercent: number;
  hybridAssignmentEnabled: boolean;
  occupancyGuests: number;
  occupancyPercent: number;
  pauseThresholdPercent: number;
  reviewReminderDays: number;
  resumeJob: {
    assignedBookings: number;
    completedAt: string | null;
    createdAt: string;
    id: string;
    lastError: string | null;
    manualBookings: number;
    processedBookings: number;
    skippedBookings: number;
    status: "pending" | "processing" | "completed" | "failed";
    totalBookings: number;
  } | null;
  showEnabled: boolean;
  thresholdOverrideActive: boolean;
  venue: string;
};

const reasonLabels: Record<string, string> = {
  APPROVED_CAPACITY_CONFLICT: "Current guest allocations exceed the approved physical layout.",
  APPROVED_LAYOUT_INCOMPLETE: "The approved physical layout is incomplete.",
  ASSIGNED_TABLE_CAPACITY_REVIEW_REQUIRED: "An assigned permanent table has no safe configured capacity.",
  CONFIGURED_CAPACITY_CONFLICT: "A permanent table has a performance-specific capacity that differs from the approved layout.",
  OPERATIONAL_TABLES_DO_NOT_MATCH_APPROVED_LAYOUT: "This performance still requires table-by-table reconciliation.",
  RECONCILIATION_REQUIRED: "This performance has unresolved seating reconciliation items.",
};

export default function AutomaticTableAssignmentPanel({
  disabled,
  showId,
}: {
  disabled: boolean;
  showId: string;
}) {
  const [status, setStatus] = useState<AssignmentStatus | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [reason, setReason] = useState("");
  const [reminderDays, setReminderDays] = useState("10");
  const [threshold, setThreshold] = useState("70");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const next = await fetchSupabaseApi<AssignmentStatus>(
          `/api/admin/automatic-table-assignment?showId=${encodeURIComponent(showId)}`,
          { cache: "no-store" },
        );
        if (!active) return;
        setStatus(next);
        setReminderDays(String(next.reviewReminderDays));
        setThreshold(String(next.pauseThresholdPercent));
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Automatic assignment status could not be loaded.");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [showId]);

  async function refreshStatus() {
    if (pending) return;
    setPending("refresh");
    setError("");
    try {
      const next = await fetchSupabaseApi<AssignmentStatus>(
        `/api/admin/automatic-table-assignment?showId=${encodeURIComponent(showId)}`,
        { cache: "no-store" },
      );
      setStatus(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Assignment progress could not be loaded.");
    } finally {
      setPending("");
    }
  }

  async function update(action: string, global = false) {
    if (!status || pending) return;
    setPending(action);
    setError("");
    try {
      const next = await fetchSupabaseApi<AssignmentStatus>("/api/admin/automatic-table-assignment", {
        body: global
          ? {
              action: "global",
              enabled: !status.globalEnabled,
              reason,
              reviewReminderDays: Number(reminderDays),
              showId,
              thresholdPercent: Number(threshold),
            }
          : {
              action,
              reason,
              showId,
              thresholdPercent: Number(threshold),
            },
        method: "PUT",
      });
      setStatus(next);
      setReminderDays(String(next.reviewReminderDays));
      setThreshold(String(next.pauseThresholdPercent));
      setReason("");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Automatic assignment could not be updated.");
    } finally {
      setPending("");
    }
  }

  const eligible = Boolean(status?.eligibility.eligible);
  const controlsAvailable = Boolean(eligible || status?.hybridAssignmentEnabled);
  const showActive = Boolean(status?.showEnabled && status.assignmentState === "enabled");
  const requiresReason = status?.assignmentState === "threshold_paused" || status?.assignmentState === "manual_paused";

  return (
    <section className="mb-6 rounded-2xl border border-[#8D7A2F]/30 bg-black/35 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">Automatic Assignment</p>
          <p className="mt-2 text-sm text-zinc-300">
            {status
              ? `${status.occupancyGuests} guests · ${status.occupancyPercent}% of the approved physical layout`
              : "Loading assignment status..."}
          </p>
          {status && (
            <p className="mt-1 text-xs text-zinc-400">
              {status.availableTableUnits} available table units · {status.availableSeatCapacity} physical seats · {status.awaitingAssignmentCount} awaiting assignment
            </p>
          )}
          {status?.assignmentState === "threshold_paused" && (
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-amber-100">
              Paused at {status.pauseThresholdPercent}% — Box Office approval required
            </p>
          )}
          {status && !eligible && !status.hybridAssignmentEnabled && (
            <p className="mt-2 text-xs leading-5 text-amber-100">
              Manual assignment remains active. {reasonLabels[status.eligibility.reason] ?? "This performance is not eligible for automatic assignment."}
              {status.eligibility.mismatchCount > 0 ? ` ${status.eligibility.mismatchCount} approved table records need reconciliation.` : ""}
            </p>
          )}
          {status?.hybridAssignmentEnabled && !eligible && (
            <p className="mt-2 text-xs leading-5 text-zinc-400">
              Existing seating is preserved. Automatic assignment uses only independently verified available tables.
            </p>
          )}
        </div>
        {status && (
          <span className={`w-fit rounded-full border px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.1em] ${
            showActive && status.globalEnabled
              ? "border-emerald-300/35 text-emerald-200"
              : status.assignmentState.includes("paused")
                ? "border-amber-300/35 text-amber-100"
                : "border-white/15 text-zinc-300"
          }`}>
            {!status.globalEnabled ? "Globally Disabled" : showActive ? "Enabled" : status.assignmentState.replaceAll("_", " ")}
          </span>
        )}
      </div>

      {status && (
        <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 lg:grid-cols-[minmax(150px,0.55fr)_1fr_auto] lg:items-end">
          <label className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400">
            Pause threshold
            <div className="mt-2 flex items-center rounded-xl border border-white/15 bg-black px-3">
              <input
                type="number"
                min={50}
                max={100}
                step={1}
                value={threshold}
                disabled={disabled || !controlsAvailable || Boolean(pending)}
                onChange={(event) => setThreshold(event.target.value)}
                className="min-h-10 w-full bg-transparent text-sm text-white outline-none disabled:opacity-50"
              />
              <span className="text-zinc-500">%</span>
            </div>
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400">
            Reason {requiresReason ? "(required)" : ""}
            <input
              value={reason}
              disabled={disabled || !controlsAvailable || Boolean(pending)}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Operational reason"
              className="mt-2 min-h-10 w-full rounded-xl border border-white/15 bg-black px-3 text-sm font-normal normal-case tracking-normal text-white disabled:opacity-50"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {!status.hybridAssignmentEnabled && (status.adoptionStatus !== "adopted" || !status.showEnabled) ? (
              <button
                type="button"
                disabled={disabled || !eligible || !status.globalEnabled || Boolean(pending)}
                onClick={() => void update("enable")}
                className="min-h-10 rounded-full border border-[#D8C36A]/45 px-4 text-xs font-bold uppercase text-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending === "enable" ? "Enabling..." : "Enable"}
              </button>
            ) : status.assignmentState === "enabled" ? (
              <button
                type="button"
                disabled={disabled || !reason.trim() || Boolean(pending)}
                onClick={() => void update("pause")}
                className="min-h-10 rounded-full border border-amber-300/35 px-4 text-xs font-bold uppercase text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending === "pause" ? "Pausing..." : "Pause"}
              </button>
            ) : (
              <button
                type="button"
                disabled={disabled || !reason.trim() || Boolean(pending)}
                onClick={() => void update("resume")}
                className="min-h-10 rounded-full border border-[#D8C36A]/45 px-4 text-xs font-bold uppercase text-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending === "resume" ? "Resuming..." : "Resume Auto Assignment"}
              </button>
            )}
            {(status.adoptionStatus === "adopted" || status.hybridAssignmentEnabled) && (
              <button
                type="button"
                disabled={disabled || !controlsAvailable || Boolean(pending)}
                onClick={() => void update("threshold")}
                className="min-h-10 rounded-full border border-white/15 px-4 text-xs font-bold uppercase text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending === "threshold" ? "Saving..." : "Save Threshold"}
              </button>
            )}
          </div>
        </div>
      )}

      {status?.resumeJob && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-300">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold uppercase tracking-[0.08em] text-[#D8C36A]">
              {status.resumeJob.status === "completed" ? "Assignment Complete" : status.resumeJob.status === "failed" ? "Assignment Stopped" : "Assigning Tables"}
            </span>
            <span>{status.resumeJob.processedBookings} / {status.resumeJob.totalBookings}</span>
          </div>
          <p className="mt-1 text-zinc-400">
            {status.resumeJob.assignedBookings} assigned · {status.resumeJob.manualBookings} need manual review · {status.resumeJob.skippedBookings} skipped
          </p>
          {status.resumeJob.lastError && <p className="mt-1 text-red-200">{status.resumeJob.lastError}</p>}
          {["pending", "processing"].includes(status.resumeJob.status) && (
            <button
              type="button"
              disabled={Boolean(pending)}
              onClick={() => void refreshStatus()}
              className="mt-2 min-h-9 rounded-full border border-white/15 px-3 text-[0.65rem] font-bold uppercase text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending === "refresh" ? "Refreshing..." : "Refresh Progress"}
            </button>
          )}
        </div>
      )}

      {status?.canManageGlobal && (
        <div className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <p className="pb-2 text-xs text-zinc-500">Venue default: {status.globalThresholdPercent}%.</p>
            <label className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-zinc-500">
              Review reminder
              <div className="mt-1 flex items-center rounded-xl border border-white/15 bg-black px-3">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={reminderDays}
                  disabled={disabled || Boolean(pending)}
                  onChange={(event) => setReminderDays(event.target.value)}
                  className="min-h-9 w-14 bg-transparent text-sm text-white outline-none"
                />
                <span className="text-xs text-zinc-500">days</span>
              </div>
            </label>
          </div>
          <button
            type="button"
            disabled={disabled || !reason.trim() || Boolean(pending)}
            onClick={() => void update("global", true)}
            className="min-h-9 rounded-full border border-white/15 px-3 text-[0.65rem] font-bold uppercase text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending === "global" ? "Saving..." : status.globalEnabled ? "Disable Venue Default" : "Enable Venue Default"}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-200">{error}</p>}
    </section>
  );
}
