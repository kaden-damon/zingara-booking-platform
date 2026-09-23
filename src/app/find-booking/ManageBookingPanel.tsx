"use client";

import { useState } from "react";
import InternationalPhoneInput from "../components/InternationalPhoneInput";

type CancellationPreview = {
  cutoffAt: string;
  depositAmount: number | null;
  forfeitedAmount: number;
  fullRefundWindow: boolean;
  manualRefundRequired: boolean;
  paidAmount: number;
  performance: { date: string; name: string; time: string; venue: string };
  policySummary: string;
  refundableAmount: number;
  refundState: string;
  stateFingerprint: string;
  updatedAt: string;
};

type MoveOption = {
  currentValue: number;
  date: string;
  difference: number;
  id: string;
  name: string;
  newValue: number;
  partySize: number;
  seatingZone: string;
  time: string;
  venue: string;
};

function money(value: number) {
  return `R${value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(
    new Date(`${value}T12:00:00+02:00`),
  );
}

export default function ManageBookingPanel(props: {
  bookingReference: string;
  initialMobile: string;
  onChanged: (message: string) => void;
}) {
  const [mode, setMode] = useState<"cancel" | "move" | null>(null);
  const [mobile, setMobile] = useState(props.initialMobile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cancellation, setCancellation] = useState<CancellationPreview | null>(null);
  const [reason, setReason] = useState("");
  const [moveOptions, setMoveOptions] = useState<MoveOption[]>([]);
  const [selectedShowId, setSelectedShowId] = useState("");
  const [stateFingerprint, setStateFingerprint] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  async function request(payload: Record<string, unknown>) {
    const response = await fetch("/api/find-booking/manage", {
      body: JSON.stringify({
        bookingReference: props.bookingReference,
        mobileNumber: mobile,
        ...payload,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const result = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(result.error ?? "This booking action could not be completed."));
    return result;
  }

  async function openCancellation() {
    if (!mobile.trim()) {
      setError("Enter the mobile number used for this booking.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await request({ action: "cancellation-preview" });
      setCancellation(result.preview as CancellationPreview);
      setMode("cancel");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cancellation could not be previewed.");
    } finally {
      setBusy(false);
    }
  }

  async function openMove() {
    if (!mobile.trim()) {
      setError("Enter the mobile number used for this booking.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await request({ action: "move-options" });
      setMoveOptions(result.options as MoveOption[]);
      setStateFingerprint(String(result.stateFingerprint));
      setUpdatedAt(String(result.updatedAt));
      setMode("move");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Move options could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancellation() {
    if (!cancellation || reason.trim().length < 3 || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await request({
        action: "cancel",
        expectedUpdatedAt: cancellation.updatedAt,
        reason,
        stateFingerprint: cancellation.stateFingerprint,
      });
      props.onChanged(String(result.message ?? "Booking cancelled."));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cancellation could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmMove() {
    if (!selectedShowId || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await request({
        action: "move-confirm",
        destinationShowId: selectedShowId,
        expectedUpdatedAt: updatedAt,
        stateFingerprint,
      });
      props.onChanged(String(result.message ?? "Booking moved successfully."));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The booking could not be moved.");
    } finally {
      setBusy(false);
    }
  }

  const selected = moveOptions.find((option) => option.id === selectedShowId);

  return (
    <section className="mt-5 border-t border-white/10 pt-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">Manage Booking</p>
      <p className="mt-2 text-sm text-zinc-400">Confirm the mobile number used for this booking before making a change.</p>
      <InternationalPhoneInput value={mobile} onChange={setMobile} className="mt-3" />

      {!mode && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button type="button" disabled={busy} onClick={() => void openMove()} className="min-h-11 rounded-full border border-[#D8C36A]/50 px-4 text-xs font-bold uppercase tracking-[0.1em] text-[#F2D66C] disabled:opacity-50">
            {busy ? "Checking..." : "Move Booking"}
          </button>
          <button type="button" disabled={busy} onClick={() => void openCancellation()} className="min-h-11 rounded-full border border-red-300/45 px-4 text-xs font-bold uppercase tracking-[0.1em] text-red-200 disabled:opacity-50">
            {busy ? "Checking..." : "Cancel Booking"}
          </button>
        </div>
      )}

      {mode === "cancel" && cancellation && (
        <div className="mt-4 rounded-lg border border-red-300/25 bg-red-950/15 p-4">
          <h4 className="font-semibold text-white">Review Cancellation</h4>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{cancellation.policySummary}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs uppercase text-zinc-500">Paid</dt><dd className="mt-1 font-semibold">{money(cancellation.paidAmount)}</dd></div>
            <div><dt className="text-xs uppercase text-zinc-500">Refundable</dt><dd className="mt-1 font-semibold">{money(cancellation.refundableAmount)}</dd></div>
            <div><dt className="text-xs uppercase text-zinc-500">Forfeited</dt><dd className="mt-1 font-semibold">{money(cancellation.forfeitedAmount)}</dd></div>
            <div><dt className="text-xs uppercase text-zinc-500">Refund Handling</dt><dd className="mt-1 font-semibold">{cancellation.manualRefundRequired ? "Accounts review" : cancellation.refundState.replaceAll("-", " ")}</dd></div>
          </dl>
          {!cancellation.fullRefundWindow && (
            <button type="button" onClick={() => void openMove()} className="mt-4 text-sm font-semibold text-[#F2D66C] underline underline-offset-4">Move to another date</button>
          )}
          <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
            Cancellation reason
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={255} className="mt-2 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-sm normal-case tracking-normal text-white" />
          </label>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" disabled={busy} onClick={() => setMode(null)} className="min-h-11 rounded-full border border-white/20 text-sm">Keep Booking</button>
            <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void confirmCancellation()} className="min-h-11 rounded-full bg-red-300 text-sm font-bold text-black disabled:opacity-50">{busy ? "Cancelling..." : "Confirm Cancellation"}</button>
          </div>
        </div>
      )}

      {mode === "move" && (
        <div className="mt-4 rounded-lg border border-[#D8C36A]/25 bg-[#D8C36A]/5 p-4">
          <h4 className="font-semibold text-white">Move Booking</h4>
          {moveOptions.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-300">No publicly available performance currently has enough capacity for this booking in the same seating zone.</p>
          ) : (
            <>
              <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
                New Performance
                <select value={selectedShowId} onChange={(event) => setSelectedShowId(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-black px-3 text-sm normal-case tracking-normal text-white">
                  <option value="">Select a date</option>
                  {moveOptions.map((option) => <option key={option.id} value={option.id}>{date(option.date)} · {option.time} · {option.venue}</option>)}
                </select>
              </label>
              {selected && (
                <div className="mt-3 text-sm text-zinc-300">
                  <p>{selected.partySize} guests · {selected.seatingZone}</p>
                  <p className="mt-1">Current value {money(selected.currentValue)} · New value {money(selected.newValue)} · Difference {money(selected.difference)}</p>
                </div>
              )}
            </>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" disabled={busy} onClick={() => setMode(null)} className="min-h-11 rounded-full border border-white/20 text-sm">Back</button>
            <button type="button" disabled={busy || !selectedShowId} onClick={() => void confirmMove()} className="min-h-11 rounded-full bg-[#D8C36A] text-sm font-bold text-black disabled:opacity-50">{busy ? "Moving..." : "Confirm Move"}</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-lg border border-red-300/25 bg-red-950/20 p-3 text-sm text-red-100">{error}</p>}
    </section>
  );
}
