"use client";

import { useEffect, useState } from "react";

const approvalReason =
  "Management-approved transfer of existing deposit to replacement booking.";

export function NormanDepositTransferAction({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [completed, setCompleted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [approved, setApproved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let active = true;
    fetch("/api/admin/payments/norman-deposit-transfer", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("status");
        return (await response.json()) as { completed?: boolean };
      })
      .then((payload) => {
        if (active) setCompleted(Boolean(payload.completed));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function transferDeposit() {
    if (!approved || submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/payments/norman-deposit-transfer", {
        body: JSON.stringify({
          approvalReason,
          confirmed: true,
          idempotencyKey,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "The deposit could not be transferred.");
      setCompleted(true);
      setConfirming(false);
      setMessage("R4,400 transferred from ZNG-XD6ABJ.");
      onComplete();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The deposit could not be transferred.");
    } finally {
      setSubmitting(false);
    }
  }

  if (completed) {
    return (
      <p className="mt-3 rounded-xl border border-emerald-300/30 bg-emerald-950/20 px-3 py-2 text-xs font-semibold text-emerald-100">
        R4,400 deposit transferred from ZNG-XD6ABJ.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-[#D8C36A]/30 bg-[#D8C36A]/5 p-3">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-full border border-[#D8C36A]/45 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
      >
        Transfer R4,400 Deposit
      </button>
      {confirming && (
        <div className="mt-3 space-y-3 text-sm text-zinc-200">
          <p>
            Transfer PayFast transaction 335149581 from cancelled booking
            ZNG-XD6ABJ to this booking. No refund or new charge will be created.
          </p>
          <p className="text-xs text-zinc-400">{approvalReason}</p>
          <label className="flex items-start gap-2 text-xs font-semibold text-zinc-200">
            <input
              type="checkbox"
              checked={approved}
              onChange={(event) => setApproved(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#D8C36A]"
            />
            I approve this management exception and payment transfer.
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void transferDeposit()}
              disabled={!approved || submitting}
              className="rounded-full bg-[#D8C36A] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Transferring..." : "Confirm Transfer"}
            </button>
            <button
              type="button"
              onClick={() => {
                setApproved(false);
                setConfirming(false);
              }}
              disabled={submitting}
              className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className={`mt-3 text-xs font-semibold ${completed ? "text-emerald-200" : "text-red-200"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
