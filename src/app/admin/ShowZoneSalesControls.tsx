"use client";

import { useEffect, useState } from "react";

import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

type Control = {
  changedAt: string | null;
  publicSalesOpen: boolean;
  reason: string | null;
  updatedAt: string | null;
  zoneId: string;
  zoneTitle: string;
};

type Payload = {
  controls: Control[];
  remainingSeatsByZone: Record<string, number>;
};

export default function ShowZoneSalesControls({
  disabled,
  showReference,
}: {
  disabled: boolean;
  showReference: string;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [pendingZone, setPendingZone] = useState("");
  const [reasonByZone, setReasonByZone] = useState<Record<string, string>>({});

  async function load() {
    setError("");
    try {
      setPayload(await fetchSupabaseApi<Payload>(
        `/api/admin/show-zone-sales?showReference=${encodeURIComponent(showReference)}`,
        { cache: "no-store" },
      ));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Zone sales controls could not be loaded.");
    }
  }

  useEffect(() => {
    setPayload(null);
    void load();
  }, [showReference]);

  async function update(control: Control) {
    if (pendingZone) return;
    setPendingZone(control.zoneId);
    setError("");
    try {
      await fetchSupabaseApi("/api/admin/show-zone-sales", {
        body: {
          expectedUpdatedAt: control.updatedAt,
          publicSalesOpen: !control.publicSalesOpen,
          reason: reasonByZone[control.zoneId] ?? "",
          showReference,
          zoneId: control.zoneId,
        },
        method: "PUT",
      });
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Zone public-sales state could not be saved.");
    } finally {
      setPendingZone("");
    }
  }

  return (
    <section className="rounded-2xl border border-[#8D7A2F]/30 bg-black/35 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">Public Zone Sales</p>
      <p className="mt-2 text-sm leading-6 text-zinc-400">
        Stop or reopen public sales for one seating zone without changing capacity, existing bookings, or Floor operations.
      </p>
      {!payload && !error && <p className="mt-4 text-sm text-zinc-400">Loading zone sales controls...</p>}
      {payload && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {payload.controls.map((control) => {
            const remaining = payload.remainingSeatsByZone[control.zoneId] ?? 0;
            const capacityFull = remaining <= 0;
            const stateLabel = !control.publicSalesOpen
              ? "Sold Out - Manually Closed"
              : capacityFull
                ? "Sold Out - Capacity Full"
                : "Open for Sale";
            return (
              <article key={control.zoneId} className="rounded-xl border border-white/10 bg-zinc-950/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-white">{control.zoneTitle}</h4>
                    <p className="mt-1 text-xs text-zinc-400">Public Remaining {remaining}</p>
                  </div>
                  <span className={`rounded-md border px-2 py-1 text-[0.62rem] font-semibold uppercase ${
                    control.publicSalesOpen && !capacityFull
                      ? "border-emerald-300/35 text-emerald-200"
                      : "border-red-300/35 text-red-200"
                  }`}>{stateLabel}</span>
                </div>
                {!control.publicSalesOpen && control.changedAt && (
                  <p className="mt-2 text-xs text-zinc-500">
                    Manually closed {new Date(control.changedAt).toLocaleString("en-ZA")}.
                  </p>
                )}
                {control.publicSalesOpen && (
                  <input
                    value={reasonByZone[control.zoneId] ?? ""}
                    onChange={(event) => setReasonByZone((current) => ({ ...current, [control.zoneId]: event.target.value }))}
                    placeholder="Optional internal reason"
                    className="mt-3 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-sm text-white"
                  />
                )}
                <button
                  type="button"
                  disabled={disabled || Boolean(pendingZone)}
                  onClick={() => void update(control)}
                  className={`mt-3 min-h-10 w-full rounded-full border px-4 py-2 text-xs font-bold uppercase transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    control.publicSalesOpen
                      ? "border-red-300/35 text-red-100 hover:bg-red-300 hover:text-black"
                      : "border-[#D8C36A]/45 text-[#F2D66C] hover:bg-[#D8C36A] hover:text-black"
                  }`}
                >
                  {pendingZone === control.zoneId
                    ? "Saving..."
                    : control.publicSalesOpen
                      ? "Mark Sold Out"
                      : "Reopen Sales"}
                </button>
              </article>
            );
          })}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-200">{error}</p>}
    </section>
  );
}
