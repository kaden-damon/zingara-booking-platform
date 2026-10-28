"use client";

import { useEffect, useState } from "react";

import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

type AssignmentStatus = {
  adoptionStatus: string;
  assignmentState: string;
  availableSeatCapacity: number;
  availableTableUnits: number;
  awaitingAssignmentCount: number;
  awaitingAssignmentGuests: number;
  canManageGlobal: boolean;
  eligibility: {
    eligible: boolean;
    mismatchCount: number;
    reason: string;
    unsetPermanentCapacityCount: number;
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
  APPROVED_CAPACITY_CONFLICT: "Current guest groups exceed the seating available in this table setup.",
  APPROVED_LAYOUT_INCOMPLETE: "Some tables still need to be set up.",
  ASSIGNED_TABLE_CAPACITY_REVIEW_REQUIRED: "A table holding guests still needs its seating capacity confirmed.",
  CONFIGURED_CAPACITY_CONFLICT: "Some tables have a custom capacity that needs review.",
  OPERATIONAL_TABLES_DO_NOT_MATCH_APPROVED_LAYOUT: "Some tables still need their setup confirmed.",
  RECONCILIATION_REQUIRED: "Some tables still need review.",
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
  const stateLabel = !status?.globalEnabled
    ? "OFF"
    : status.assignmentState === "enabled"
      ? "ON"
      : status.assignmentState === "threshold_paused"
        ? `PAUSED AT ${status.pauseThresholdPercent}%`
        : status.assignmentState === "manual_paused"
          ? "MANUALLY PAUSED"
          : "WAITING FOR BOX OFFICE";

  return (
    <section className="mb-6 rounded-2xl border border-[#8D7A2F]/30 bg-black/35 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">Automatic Table Assignment</p>
          <p className="mt-2 text-sm text-zinc-300">
            {status
              ? `${status.occupancyGuests} of 415 guests booked (${Math.round(status.occupancyPercent)}%)`
              : "Loading assignment status..."}
          </p>
          {status && (
            <div className="mt-1 space-y-1 text-xs text-zinc-400">
              <p>
                {status.awaitingAssignmentCount === 0
                  ? "All bookings have tables."
                  : `${status.awaitingAssignmentCount} ${status.awaitingAssignmentCount === 1 ? "booking" : "bookings"} still ${status.awaitingAssignmentCount === 1 ? "needs" : "need"} tables (${status.awaitingAssignmentGuests} ${status.awaitingAssignmentGuests === 1 ? "guest" : "guests"})`}
              </p>
              <p>{status.availableTableUnits} tables available ({status.availableSeatCapacity} seats)</p>
            </div>
          )}
          {status?.assignmentState === "threshold_paused" && (
            <p className="mt-2 text-xs font-semibold text-amber-100">
              Waiting for Box Office to resume table assignment.
            </p>
          )}
          {status && status.eligibility.unsetPermanentCapacityCount > 0 && (
            <p className="mt-2 text-xs text-amber-100">
              Some tables still need their seating capacity confirmed.
            </p>
          )}
          {status && !eligible && !status.hybridAssignmentEnabled && (
            <p className="mt-2 text-xs leading-5 text-amber-100">
              {reasonLabels[status.eligibility.reason] ?? "Some table details need review before automatic assignment can continue."}
            </p>
          )}
          {status && <p className="mt-2 text-xs text-zinc-500">The limit pauses table assignment only. Ticket sales stay open.</p>}
        </div>
        {status && (
          <span className={`w-fit rounded-full border px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.1em] ${
            showActive && status.globalEnabled
              ? "border-emerald-300/35 text-emerald-200"
              : status.assignmentState.includes("paused")
                ? "border-amber-300/35 text-amber-100"
                : "border-white/15 text-zinc-300"
          }`}>
            {stateLabel}
          </span>
        )}
      </div>

      {status && (
        <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 lg:grid-cols-[minmax(150px,0.55fr)_1fr_auto] lg:items-end">
          <label className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400">
            Auto Assignment Limit
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
                {pending === "enable" ? "Turning on..." : "Turn On Auto Assignment"}
              </button>
            ) : status.assignmentState === "enabled" ? (
              <button
                type="button"
                disabled={disabled || !reason.trim() || Boolean(pending)}
                onClick={() => void update("pause")}
                className="min-h-10 rounded-full border border-amber-300/35 px-4 text-xs font-bold uppercase text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending === "pause" ? "Pausing..." : "Pause Auto Assignment"}
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
                {pending === "threshold" ? "Saving..." : "Save Limit"}
              </button>
            )}
          </div>
        </div>
      )}

      {status?.resumeJob && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-300">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold uppercase tracking-[0.08em] text-[#D8C36A]">
              {status.resumeJob.status === "completed" ? "Tables Assigned" : status.resumeJob.status === "failed" ? "Assignment Stopped" : "Assigning Tables"}
            </span>
            <span>{status.resumeJob.processedBookings} / {status.resumeJob.totalBookings}</span>
          </div>
          <p className="mt-1 text-zinc-400">
            {status.resumeJob.assignedBookings} assigned · {status.resumeJob.manualBookings} still need help · {status.resumeJob.skippedBookings} no longer waiting
          </p>
          {status.resumeJob.lastError && <p className="mt-1 text-red-200">{status.resumeJob.lastError}</p>}
          {["pending", "processing"].includes(status.resumeJob.status) && (
            <button
              type="button"
              disabled={Boolean(pending)}
              onClick={() => void refreshStatus()}
              className="mt-2 min-h-9 rounded-full border border-white/15 px-3 text-[0.65rem] font-bold uppercase text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending === "refresh" ? "Refreshing..." : "Refresh"}
            </button>
          )}
        </div>
      )}

      {status?.canManageGlobal && (
        <div className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <p className="pb-2 text-xs text-zinc-500">Venue default limit: {status.globalThresholdPercent}%.</p>
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
            {pending === "global" ? "Saving..." : status.globalEnabled ? "Turn Off for Venue" : "Turn On for Venue"}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-200">{error}</p>}
    </section>
  );
}
