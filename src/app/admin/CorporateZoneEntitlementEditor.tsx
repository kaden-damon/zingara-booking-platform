"use client";

import { useMemo, useRef, useState } from "react";

import {
  normalizeCorporateZoneEntitlementEditDraft,
  parseCorporateZoneEntitlementEdit,
  validateCorporateZoneEntitlements,
  type CorporateZoneEntitlement,
  type CorporateZoneEntitlementDraft,
} from "../../lib/corporateZoneEntitlements";
import { seatingZones } from "../../lib/zingaraDemo";

type ZoneCapacity = {
  remainingPax: number;
  zoneId: string;
};

type Props = {
  assignedClaims: Array<{ section: string; tableCode: string }>;
  bookingReference: string;
  disabled: boolean;
  initialEntitlements: CorporateZoneEntitlement[];
  onSave: (entitlements: CorporateZoneEntitlement[]) => Promise<void>;
  totalPax: number;
  zoneCapacity: ZoneCapacity[];
};

function asDraft(entitlements: CorporateZoneEntitlement[]) {
  return entitlements.map((entitlement) => ({
    pax: String(entitlement.pax),
    zoneId: entitlement.zoneId,
  }));
}

function allocationKey(entitlements: CorporateZoneEntitlementDraft[]) {
  return JSON.stringify(
    normalizeCorporateZoneEntitlementEditDraft(entitlements).map((entitlement) => ({
      pax: Number(entitlement.pax),
      zoneId: entitlement.zoneId,
    })),
  );
}

export function CorporateZoneEntitlementEditor({
  assignedClaims,
  bookingReference,
  disabled,
  initialEntitlements,
  onSave,
  totalPax,
  zoneCapacity,
}: Props) {
  const initialDraft = useMemo(() => asDraft(initialEntitlements), [initialEntitlements]);
  const [draft, setDraft] = useState<CorporateZoneEntitlementDraft[]>(initialDraft);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [serverError, setServerError] = useState("");
  const inFlightRef = useRef(false);
  const editableZones = seatingZones.filter((zone) => zone.id !== "elevated-stage");
  const normalizedDraft = normalizeCorporateZoneEntitlementEditDraft(draft);
  const allocatedPax = normalizedDraft.reduce(
    (sum, entitlement) => sum + (Number(entitlement.pax) || 0),
    0,
  );
  const validationError = validateCorporateZoneEntitlements(normalizedDraft, totalPax);
  const dirty = allocationKey(draft) !== allocationKey(initialDraft);

  function updateDraft(next: CorporateZoneEntitlementDraft[]) {
    setDraft(next);
    setStatus("idle");
    setServerError("");
  }

  async function save() {
    if (disabled || !dirty || validationError || inFlightRef.current) return;
    const parsed = parseCorporateZoneEntitlementEdit(draft, totalPax);
    if (!parsed) return;

    inFlightRef.current = true;
    setStatus("saving");
    setServerError("");
    try {
      await onSave(parsed);
      setDraft(asDraft(parsed));
      setStatus("saved");
    } catch (error) {
      setStatus("idle");
      setServerError(
        error instanceof Error ? error.message : "The seating allocation could not be saved.",
      );
    } finally {
      inFlightRef.current = false;
    }
  }

  return (
    <div className="rounded-xl border border-[#D8C36A]/25 bg-black/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
          Seating Zones
        </p>
        <button
          type="button"
          disabled={disabled || draft.length >= editableZones.length}
          onClick={() => updateDraft([...draft, { pax: "", zoneId: "" }])}
          className="min-h-9 text-xs font-semibold uppercase text-[#D8C36A] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add Seating Zone
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {draft.map((entitlement, index) => {
          const capacity = zoneCapacity.find((item) => item.zoneId === entitlement.zoneId);
          return (
            <div key={`${bookingReference}-${index}`} className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] gap-2">
              <select
                aria-label={`Seating zone ${index + 1}`}
                disabled={disabled}
                value={entitlement.zoneId}
                onChange={(event) =>
                  updateDraft(
                    draft.map((row, rowIndex) =>
                      rowIndex === index ? { ...row, zoneId: event.target.value } : row,
                    ),
                  )
                }
                className="min-w-0 rounded-lg border border-white/15 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#D8C36A] disabled:opacity-50"
              >
                <option value="">Select zone</option>
                {editableZones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.title}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Zone guests ${index + 1}`}
                disabled={disabled}
                min="0"
                step="1"
                type="number"
                value={entitlement.pax}
                onChange={(event) =>
                  updateDraft(
                    draft.map((row, rowIndex) =>
                      rowIndex === index ? { ...row, pax: event.target.value } : row,
                    ),
                  )
                }
                className="min-w-0 rounded-lg border border-white/15 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#D8C36A] disabled:opacity-50"
              />
              <button
                type="button"
                aria-label={`Remove seating zone ${index + 1}`}
                disabled={disabled || draft.length === 1}
                onClick={() => updateDraft(draft.filter((_, rowIndex) => rowIndex !== index))}
                className="min-h-10 min-w-10 text-zinc-400 transition hover:text-white disabled:opacity-30"
              >
                ×
              </button>
              {capacity && (
                <p className="col-span-3 text-xs text-zinc-500">
                  {capacity.remainingPax} operational seats available excluding this booking.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-white/10 pt-3 text-xs font-semibold uppercase tracking-[0.08em]">
        <span>Allocated {allocatedPax} / {totalPax}</span>
        <span className={allocatedPax === totalPax ? "text-emerald-300" : "text-amber-300"}>
          Remaining {totalPax - allocatedPax}
        </span>
      </div>

      {validationError && (
        <p className="mt-2 text-xs leading-5 text-amber-200">
          {allocatedPax !== totalPax
            ? `This booking has ${totalPax} guests. Allocate all ${totalPax} guests across the selected seating zones before saving.`
            : validationError}
        </p>
      )}
      {assignedClaims.length > 0 && (
        <p className="mt-2 text-xs leading-5 text-zinc-400">
          Existing tables: {assignedClaims.map((claim) => claim.tableCode).join(" + ")}. A zone with assigned tables cannot be removed until those assignments are released.
        </p>
      )}
      {serverError && <p role="alert" className="mt-2 text-xs leading-5 text-red-300">{serverError}</p>}

      <button
        type="button"
        disabled={disabled || !dirty || Boolean(validationError) || status === "saving"}
        onClick={() => void save()}
        className="mt-3 min-h-10 w-full rounded-xl border border-[#D8C36A]/45 px-3 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
      >
        {status === "saving" ? "SAVING..." : status === "saved" ? "SAVED ✓" : "SAVE SEATING ALLOCATION"}
      </button>
    </div>
  );
}
