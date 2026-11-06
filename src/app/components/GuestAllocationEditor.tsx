"use client";

import {
  getGuestAllocationTotals,
  validateBookingGuestAllocations,
  type BookingGuestAllocationDraft,
} from "@/lib/bookingGuestAllocations";
import type { SeatingZone } from "@/lib/zingaraDemo";

type Props = {
  disabled?: boolean;
  onChange: (value: BookingGuestAllocationDraft[]) => void;
  totalPax: number;
  value: BookingGuestAllocationDraft[];
  zones: SeatingZone[];
};

export default function GuestAllocationEditor({
  disabled = false,
  onChange,
  totalPax,
  value,
  zones,
}: Props) {
  const numericAllocations = value.map((allocation) => ({
    complimentaryPax: Number(allocation.complimentaryPax) || 0,
    paidPax: Number(allocation.paidPax) || 0,
  }));
  const totals = getGuestAllocationTotals(numericAllocations);
  const validationError = validateBookingGuestAllocations(value, totalPax);

  function updateRow(
    index: number,
    changes: Partial<BookingGuestAllocationDraft>,
  ) {
    onChange(
      value.map((allocation, rowIndex) =>
        rowIndex === index ? { ...allocation, ...changes } : allocation,
      ),
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-[#D8C36A]/30 bg-black/35 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#F2D66C]">
            Guest Allocation
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Allocate every guest once. Tables remain a separate Box Office step.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled || value.length >= zones.length}
          onClick={() =>
            onChange([
              ...value,
              {
                complimentaryCategory: "standard",
                complimentaryPax: "0",
                paidPax: "0",
                zoneId: "",
              },
            ])
          }
          className="min-h-9 rounded-full border border-[#D8C36A]/40 px-3 py-1.5 text-xs font-semibold uppercase text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add Zone
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {value.map((allocation, index) => (
          <div
            key={`${allocation.zoneId || "zone"}-${index}`}
            className="grid gap-2 border-t border-white/10 pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[minmax(150px,1fr)_6rem_6rem_minmax(120px,0.8fr)_2.5rem] sm:items-end"
          >
            <label>
              <span className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                Seating Zone
              </span>
              <select
                aria-label={`Allocation seating zone ${index + 1}`}
                disabled={disabled}
                value={allocation.zoneId}
                onChange={(event) =>
                  updateRow(index, { zoneId: event.target.value })
                }
                className="min-h-10 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#D8C36A] disabled:opacity-50"
              >
                <option value="">Select zone</option>
                {zones.map((zone) => (
                  <option
                    key={zone.id}
                    value={zone.id}
                    disabled={value.some(
                      (candidate, candidateIndex) =>
                        candidateIndex !== index && candidate.zoneId === zone.id,
                    )}
                  >
                    {zone.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                Paid
              </span>
              <input
                aria-label={`Paid guests ${index + 1}`}
                disabled={disabled}
                min="0"
                step="1"
                type="number"
                value={allocation.paidPax}
                onChange={(event) =>
                  updateRow(index, { paidPax: event.target.value })
                }
                className="min-h-10 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#D8C36A] disabled:opacity-50"
              />
            </label>
            <label>
              <span className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                COMP
              </span>
              <input
                aria-label={`Complimentary guests ${index + 1}`}
                disabled={disabled}
                min="0"
                step="1"
                type="number"
                value={allocation.complimentaryPax}
                onChange={(event) =>
                  updateRow(index, { complimentaryPax: event.target.value })
                }
                className="min-h-10 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#D8C36A] disabled:opacity-50"
              />
            </label>
            <label>
              <span className="mb-1 block text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                COMP Type
              </span>
              <select
                aria-label={`Complimentary category ${index + 1}`}
                disabled={disabled || Number(allocation.complimentaryPax) <= 0}
                value={allocation.complimentaryCategory}
                onChange={(event) =>
                  updateRow(index, {
                    complimentaryCategory: event.target
                      .value as BookingGuestAllocationDraft["complimentaryCategory"],
                  })
                }
                className="min-h-10 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#D8C36A] disabled:opacity-50"
              >
                <option value="standard">Standard COMP</option>
                <option value="media">Media</option>
                <option value="tradex">Tradex</option>
              </select>
            </label>
            <button
              type="button"
              aria-label={`Remove guest allocation ${index + 1}`}
              disabled={disabled || value.length === 1}
              onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}
              className="min-h-10 rounded-full text-lg text-zinc-400 transition hover:text-white disabled:opacity-30"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center text-xs">
        <p><span className="block text-zinc-500">Paid</span><strong>{totals.paidPax}</strong></p>
        <p><span className="block text-zinc-500">COMP</span><strong>{totals.complimentaryPax}</strong></p>
        <p><span className="block text-zinc-500">Allocated</span><strong>{totals.allocatedPax}/{totalPax}</strong></p>
      </div>
      {validationError && (
        <p role="alert" className="mt-2 text-xs leading-5 text-amber-200">
          {validationError}
        </p>
      )}
    </div>
  );
}
