"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  createBookingMetadataDraft,
  isBookingMetadataDraftDirty,
} from "../../lib/bookingMetadataDraft";
import { saveBookingMetadata } from "../../lib/supabase/bookings";

type SaveState = "idle" | "saved" | "saving";

export function BookingMetadataDraftEditor({
  bookingReference,
  disabled,
  initialNotes,
  initialUpdatedAt,
  onDirtyChange,
  onSaved,
}: {
  bookingReference: string;
  disabled: boolean;
  initialNotes?: string;
  initialUpdatedAt?: string;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (result: { operationalNotes: string; updatedAt: string }) => void;
}) {
  const initialDraft = useMemo(
    () => createBookingMetadataDraft(initialNotes),
    [initialNotes],
  );
  const [baseline, setBaseline] = useState(initialDraft);
  const [draft, setDraft] = useState(initialDraft);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const inFlightRef = useRef(false);
  const dirty = isBookingMetadataDraftDirty(draft, baseline);

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
        bookingReference,
        expectedUpdatedAt: initialUpdatedAt,
        operationalNotes: draft.operationalNotes,
      });
      const savedDraft = createBookingMetadataDraft(result.operationalNotes);

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
      <label>
        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Booking Notes / Dietary Requirements
        </span>
        <textarea
          value={draft.operationalNotes}
          onChange={(event) => {
            setDraft({ operationalNotes: event.target.value });
            setSaveState("idle");
            setError("");
          }}
          disabled={disabled || saveState === "saving"}
          rows={3}
          className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="Dietary requirements, celebration notes, access needs, seating preferences, or internal context."
        />
      </label>
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
