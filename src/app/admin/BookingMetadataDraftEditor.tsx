"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  createBookingMetadataDraft,
  isBookingMetadataDraftDirty,
} from "../../lib/bookingMetadataDraft";
import { saveBookingMetadata } from "../../lib/supabase/bookings";
import { fetchSupabaseApi } from "../../lib/supabase/apiClient";
import type { BookingAddon } from "../../lib/zingaraDemo";
import { calculateBookingAddonFinancialUpdate } from "../../lib/bookingAddons";
import InternalBookingAddonsEditor from "../components/InternalBookingAddonsEditor";
import AgeRestrictionNotice from "../components/AgeRestrictionNotice";

type SaveState = "idle" | "saved" | "saving";

export function BookingMetadataDraftEditor({
  bookingId,
  bookingReference,
  disabled,
  initialAddons,
  initialAddonsTotal,
  initialAmountPaid,
  initialNotes,
  initialPartySize,
  initialServiceFeeAmount,
  initialSubtotalPrice,
  initialTotalPrice,
  initialUpdatedAt,
  onDirtyChange,
  onSaved,
}: {
  bookingId?: string;
  bookingReference: string;
  disabled: boolean;
  initialAddons: BookingAddon[];
  initialAddonsTotal: number;
  initialAmountPaid: number;
  initialNotes?: string;
  initialPartySize: number;
  initialServiceFeeAmount: number;
  initialSubtotalPrice: number;
  initialTotalPrice: number;
  initialUpdatedAt?: string;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (result: {
    addons: BookingAddon[];
    addonsTotal: number;
    balanceDue: number;
    financialChanged: boolean;
    operationalNotes: string;
    paymentLinksInvalidated: number;
    serviceFeeAmount: number;
    subtotalPrice: number;
    totalPrice: number;
    updatedAt: string;
  }) => void;
}) {
  const initialDraft = useMemo(
    () => createBookingMetadataDraft(initialNotes, initialAddons),
    [initialAddons, initialNotes],
  );
  const [baseline, setBaseline] = useState(initialDraft);
  const [draft, setDraft] = useState(initialDraft);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [catalogue, setCatalogue] = useState<BookingAddon[]>([]);
  const [canCustomPrice, setCanCustomPrice] = useState(false);
  const inFlightRef = useRef(false);
  const dirty = isBookingMetadataDraftDirty(draft, baseline);
  const addonsDirty = JSON.stringify(draft.addons) !== JSON.stringify(baseline.addons);
  const preview = calculateBookingAddonFinancialUpdate({
    amountPaid: initialAmountPaid,
    currentServiceFee: initialServiceFeeAmount,
    currentTotalAmount: initialTotalPrice,
    newAddonsTotal: draft.addons.reduce((total, addon) => total + addon.price, 0),
    oldAddonsTotal: initialAddonsTotal,
    partySize: initialPartySize,
    subtotalAmount: initialSubtotalPrice,
  });

  useEffect(() => {
    let active = true;
    fetchSupabaseApi<{ canCustomPrice: boolean; catalogue: BookingAddon[] }>(
      `/api/admin/booking-addons?bookingReference=${encodeURIComponent(bookingReference)}`,
    )
      .then((payload) => {
        if (!active) return;
        setCatalogue(payload.catalogue ?? []);
        setCanCustomPrice(Boolean(payload.canCustomPrice));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [bookingReference]);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  async function saveDraft() {
    if (disabled || !dirty || inFlightRef.current) return;

    inFlightRef.current = true;
    setSaveState("saving");
    setError("");

    try {
      const result = await saveBookingMetadata({
        addons: draft.addons,
        bookingId,
        bookingReference,
        expectedUpdatedAt: initialUpdatedAt,
        operationalNotes: draft.operationalNotes,
      });
      const savedDraft = createBookingMetadataDraft(result.operationalNotes, result.addons);

      setBaseline(savedDraft);
      setDraft(savedDraft);
      setSaveState("saved");
      onSaved(result);
      window.setTimeout(() => setSaveState("idle"), 1800);
    } catch (saveError) {
      setSaveState("idle");
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Booking notes could not be saved.",
      );
    } finally {
      inFlightRef.current = false;
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-black/30 p-4 lg:col-span-3">
      <AgeRestrictionNotice className="mb-4" compact />
      <label>
        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Booking Notes / Dietary Requirements
        </span>
        <textarea
          value={draft.operationalNotes}
          onChange={(event) => {
            setDraft((current) => ({ ...current, operationalNotes: event.target.value }));
            setSaveState("idle");
            setError("");
          }}
          disabled={disabled || saveState === "saving"}
          rows={3}
          className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="Dietary requirements, celebration notes, access needs, seating preferences, or internal context."
        />
      </label>
      <div className="mt-4 border-t border-white/10 pt-4">
        <InternalBookingAddonsEditor
          canCustomPrice={canCustomPrice}
          catalogue={catalogue}
          disabled={disabled || saveState === "saving" || catalogue.length === 0}
          heading="Edit Add-Ons"
          onChange={(addons) => {
            setDraft((current) => ({ ...current, addons }));
            setSaveState("idle");
            setError("");
          }}
          value={draft.addons}
        />
        {addonsDirty && (
          <div className="mt-4">
            <div className={`mt-3 rounded-xl border p-3 text-sm ${preview.createsCredit ? "border-red-300/30 bg-red-950/20 text-red-100" : "border-amber-300/25 bg-amber-950/15 text-amber-100"}`}>
              <p>Add-ons total: {new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(draft.addons.reduce((total, addon) => total + addon.price, 0))}</p>
              <p className="mt-1">Booking obligation: {new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(initialTotalPrice)} to {new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(preview.totalAmount)}</p>
              <p className="mt-1">Paid: {new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(initialAmountPaid)}</p>
              <p className="mt-1">Outstanding: {new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(preview.balanceOutstanding)}</p>
              <p className="mt-1">No payment, refund, link or communication is created automatically.</p>
              {preview.createsCredit && <p className="mt-1 font-semibold">This change creates a credit condition and must be handled through financial reconciliation.</p>}
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className="min-h-5 text-sm">
          {error ? (
            <p className="text-red-200">{error}</p>
          ) : dirty ? (
            <p className="text-amber-200">Unsaved changes</p>
          ) : saveState === "saved" ? (
            <p className="text-emerald-200">Saved ✓</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void saveDraft()}
          disabled={disabled || !dirty || saveState === "saving"}
          className="min-h-11 rounded-full border border-[#D8C36A] bg-[#D8C36A] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-black transition hover:bg-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saveState === "saving"
            ? "Saving..."
            : saveState === "saved"
              ? "Saved ✓"
              : "Save Changes"}
        </button>
      </div>
    </section>
  );
}
