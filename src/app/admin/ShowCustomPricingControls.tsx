"use client";

import { useMemo, useState } from "react";
import type { DemoShow, SeatingZoneId } from "@/lib/zingaraDemo";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import {
  normalizeShowCustomPricing,
  type ShowCustomPricing,
} from "@/lib/showSpecificPricing";

const pricingZones: Array<{ id: SeatingZoneId; label: string }> = [
  { id: "royal-balcony", label: "Royal Balcony" },
  { id: "middle-ring", label: "Middle Ring" },
  { id: "royal-booths", label: "Private Booths" },
  { id: "golden-circle", label: "Golden Circle" },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    currency: "ZAR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export default function ShowCustomPricingControls({
  defaultPrices,
  disabled,
  onSaved,
  show,
}: {
  defaultPrices: Record<SeatingZoneId, number>;
  disabled: boolean;
  onSaved: (customPricing: ShowCustomPricing) => void;
  show: DemoShow;
}) {
  const initialPricing = normalizeShowCustomPricing(show.customPricing);
  const [enabled, setEnabled] = useState(initialPricing.enabled);
  const [drafts, setDrafts] = useState<Record<SeatingZoneId, string>>(() =>
    Object.fromEntries(
      pricingZones.map(({ id }) => [
        id,
        initialPricing.zonePrices[id]?.toString() ?? "",
      ]),
    ) as Record<SeatingZoneId, string>,
  );
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");

  const zonePrices = useMemo(
    () =>
      Object.fromEntries(
        pricingZones.flatMap(({ id }) => {
          const rawValue = drafts[id].trim();
          const price = Number(rawValue);
          return rawValue && Number.isFinite(price) && price > 0
            ? [[id, Math.round(price * 100) / 100]]
            : [];
        }),
      ) as ShowCustomPricing["zonePrices"],
    [drafts],
  );
  const hasInvalidPrice = pricingZones.some(({ id }) => {
    const rawValue = drafts[id].trim();
    if (!rawValue) return false;
    const price = Number(rawValue);
    return !Number.isFinite(price) || price <= 0 || price > 1_000_000;
  });
  const canSave =
    !disabled &&
    !isSaving &&
    !hasInvalidPrice &&
    (!enabled || Object.keys(zonePrices).length > 0);

  async function saveCustomPricing() {
    if (!canSave) return;
    setIsSaving(true);
    setStatus("");

    try {
      const payload = await fetchSupabaseApi<{
        customPricing: ShowCustomPricing;
      }>("/api/admin/shows/custom-pricing", {
        body: {
          enabled,
          expectedUpdatedAt: show.customPricing?.updatedAt ?? null,
          showId: show.supabaseId ?? show.id,
          zonePrices,
        },
        method: "POST",
      });
      onSaved(payload.customPricing);
      setIsConfirming(false);
      setStatus(enabled ? "Custom pricing saved." : "Normal pricing restored for new bookings.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Custom pricing could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#D8C36A]/25 bg-[#D8C36A]/[0.04] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-[#F2D66C]">
            Custom Pricing
          </h4>
          <p className="mt-1 text-sm text-zinc-400">
            Set different prices for this performance only.
          </p>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold text-white">
          <input
            checked={enabled}
            disabled={disabled || isSaving}
            onChange={(event) => {
              setEnabled(event.target.checked);
              setIsConfirming(false);
              setStatus("");
            }}
            type="checkbox"
            className="h-5 w-5 accent-[#D8C36A]"
          />
          Use custom pricing for this show
        </label>
      </div>

      {enabled && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {pricingZones.map(({ id, label }) => (
            <label
              key={id}
              className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-zinc-300"
            >
              <span className="font-semibold text-white">{label}</span>
              <span className="mt-1 block text-xs text-zinc-500">
                Normal: {formatCurrency(defaultPrices[id])}
              </span>
              <span className="mt-3 block text-xs font-semibold uppercase tracking-[0.08em] text-zinc-400">
                Custom price
              </span>
              <span className="mt-1 flex items-center rounded-lg border border-white/15 bg-black px-3 focus-within:border-[#D8C36A]/60">
                <span className="text-zinc-500">R</span>
                <input
                  aria-label={`${label} custom price`}
                  disabled={disabled || isSaving}
                  inputMode="decimal"
                  min="0.01"
                  onChange={(event) => {
                    setDrafts((current) => ({
                      ...current,
                      [id]: event.target.value,
                    }));
                    setIsConfirming(false);
                    setStatus("");
                  }}
                  placeholder="Uses normal price when blank"
                  step="0.01"
                  type="number"
                  value={drafts[id]}
                  className="min-h-11 w-full bg-transparent px-2 py-2 text-white outline-none"
                />
              </span>
            </label>
          ))}
        </div>
      )}

      {hasInvalidPrice && (
        <p className="mt-3 text-sm font-semibold text-red-200">
          Enter a positive valid amount, or leave the zone blank to use its normal price.
        </p>
      )}
      {enabled && Object.keys(zonePrices).length === 0 && !hasInvalidPrice && (
        <p className="mt-3 text-sm font-semibold text-amber-100">
          Enter at least one custom price.
        </p>
      )}

      {isConfirming && (
        <div className="mt-5 rounded-xl border border-amber-300/30 bg-amber-950/20 p-4">
          <p className="font-semibold text-amber-50">
            Apply custom pricing to this performance?
          </p>
          <p className="mt-1 text-sm text-amber-100/80">
            {show.venueName ?? show.location} · {show.date} · {show.time}
          </p>
          <div className="mt-3 space-y-1 text-sm text-zinc-200">
            {pricingZones.map(({ id, label }) => (
              <p key={id}>
                {label}: {formatCurrency(zonePrices[id] ?? defaultPrices[id])} pp
                {!zonePrices[id] && " · normal price"}
              </p>
            ))}
          </div>
          <p className="mt-3 text-sm text-amber-100">
            Existing bookings will keep the prices they were booked at.
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {isConfirming ? (
          <>
            <button
              type="button"
              onClick={() => void saveCustomPricing()}
              disabled={!canSave}
              className="min-h-11 rounded-full bg-[#D8C36A] px-5 py-2 text-sm font-bold text-black disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Confirm Pricing"}
            </button>
            <button
              type="button"
              onClick={() => setIsConfirming(false)}
              disabled={isSaving}
              className="min-h-11 rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-zinc-300"
            >
              Back
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setIsConfirming(true)}
            disabled={!canSave}
            className="min-h-11 rounded-full border border-[#D8C36A]/45 px-5 py-2 text-sm font-semibold text-[#F2D66C] disabled:opacity-50"
          >
            Review Pricing
          </button>
        )}
      </div>

      {status && (
        <p className="mt-3 text-sm font-semibold text-zinc-200" role="status" aria-live="polite">
          {status}
        </p>
      )}
      <p className="mt-4 text-xs leading-5 text-zinc-500">
        Normal pricing remains unchanged for other shows. Turning this off restores normal pricing for new bookings only.
      </p>
    </section>
  );
}
