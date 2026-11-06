"use client";

import { useMemo, useState } from "react";

import type {
  CorporateBuyoutSummary,
} from "@/lib/corporateBuyouts";
import type { CorporateZoneEntitlement } from "@/lib/corporateZoneEntitlements";
import {
  getFullShowBuyoutZoneTables,
  getSelectedTableCapacity,
} from "@/lib/fullShowBuyoutSeating";
import { updateCorporateBuyoutAllocation } from "@/lib/supabase/corporateBuyouts";
import { assignFullShowBuyoutZoneTables } from "@/lib/supabase/floorPlans";
import {
  seatingZones,
  type DemoBooking,
  type DemoTable,
  type SeatingZoneId,
} from "@/lib/zingaraDemo";

import { CorporateZoneEntitlementEditor } from "./CorporateZoneEntitlementEditor";

const buyoutZoneIds = [
  "golden-circle",
  "middle-ring",
  "royal-booths",
  "royal-balcony",
] as const satisfies readonly SeatingZoneId[];

type Props = {
  booking: DemoBooking;
  buyout: CorporateBuyoutSummary;
  canManage: boolean;
  onChanged: () => Promise<void>;
  tables: DemoTable[];
  zoneCapacity: Array<{ remainingPax: number; zoneId: string }>;
};

function zoneTitle(zoneId: SeatingZoneId) {
  return seatingZones.find((zone) => zone.id === zoneId)?.title ?? zoneId;
}

export function FullShowBuyoutSeatingPlanner({
  booking,
  buyout,
  canManage,
  onChanged,
  tables,
  zoneCapacity,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedByZone, setSelectedByZone] = useState<Record<string, string[]>>(
    {},
  );
  const [savingZone, setSavingZone] = useState<string>("");
  const [message, setMessage] = useState("");
  const entitlements = booking.zoneEntitlements ?? [];
  const initialEntitlements = entitlements.length
    ? entitlements
    : buyoutZoneIds.map((zoneId) => ({ pax: 0, zoneId }));
  const assignedClaims = useMemo(
    () => booking.reservationTableClaims ?? [],
    [booking.reservationTableClaims],
  );
  const assignedTableIdsByZone = useMemo(
    () =>
      Object.fromEntries(
        buyoutZoneIds.map((zoneId) => [
          zoneId,
          assignedClaims
            .filter((claim) => claim.section === zoneId && claim.tableId)
            .map((claim) => claim.tableId as string),
        ]),
      ),
    [assignedClaims],
  );

  async function saveAllocation(next: CorporateZoneEntitlement[]) {
    setMessage("");
    await updateCorporateBuyoutAllocation({
      buyoutId: buyout.id,
      expectedRevision: buyout.revision,
      zoneAllocations: next,
    });
    await onChanged();
    setMessage("Section plan saved.");
  }

  async function saveZoneTables(zoneId: SeatingZoneId, tableIds: string[]) {
    setSavingZone(zoneId);
    setMessage("");
    try {
      await assignFullShowBuyoutZoneTables({
        bookingReference: booking.reference,
        expectedUpdatedAt: booking.updatedAt ?? "",
        tableIds,
        zoneId,
      });
      await onChanged();
      setMessage(`${zoneTitle(zoneId)} tables saved.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The table plan could not be saved.",
      );
    } finally {
      setSavingZone("");
    }
  }

  return (
    <div className="mt-4 border-t border-sky-200/15 pt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-10 items-center rounded-full border border-sky-200/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-sky-100 transition hover:bg-sky-100 hover:text-sky-950"
      >
        {open ? "Hide seating plan" : "Plan buyout seating"}
      </button>

      {open && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.5fr)]">
          <div>
            <CorporateZoneEntitlementEditor
              assignedClaims={assignedClaims.map((claim) => ({
                section: claim.section,
                tableCode: claim.tableCode,
              }))}
              bookingReference={booking.reference}
              disabled={!canManage}
              enabledZoneIds={[...buyoutZoneIds]}
              initialEntitlements={initialEntitlements}
              onSave={saveAllocation}
              totalPax={booking.partySize}
              zoneCapacity={zoneCapacity}
            />
          </div>

          <div className="space-y-3">
            {entitlements.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm text-zinc-300">
                Save the section guest totals first. Tables remain unchanged until
                Box Office assigns them manually.
              </p>
            ) : (
              entitlements.map((entitlement) => {
                const zoneTables = getFullShowBuyoutZoneTables({
                  bookingReference: booking.reference,
                  showId: booking.showId ?? "",
                  tables,
                  zoneId: entitlement.zoneId,
                });
                const initialIds = assignedTableIdsByZone[entitlement.zoneId] ?? [];
                const selectedIds =
                  selectedByZone[entitlement.zoneId] ?? initialIds;
                const selectedCapacity = getSelectedTableCapacity(
                  zoneTables,
                  selectedIds,
                );
                const changed =
                  [...selectedIds].sort().join("|") !==
                  [...initialIds].sort().join("|");

                return (
                  <details
                    key={entitlement.zoneId}
                    className="rounded-xl border border-white/10 bg-black/25 p-3"
                  >
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-white">
                          {zoneTitle(entitlement.zoneId)} · {entitlement.pax} guests
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            selectedCapacity >= entitlement.pax
                              ? "border-emerald-300/30 text-emerald-200"
                              : "border-amber-300/30 text-amber-100"
                          }`}
                        >
                          {selectedCapacity} table seats
                        </span>
                      </div>
                    </summary>

                    <div className="mt-3 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                      {zoneTables.map((table) => {
                        const tableId = table.authoritativeId ?? table.id;
                        const selected = selectedIds.includes(tableId);
                        return (
                          <label
                            key={tableId}
                            className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                              selected
                                ? "border-[#D8C36A]/60 bg-[#D8C36A]/10 text-white"
                                : "border-white/10 bg-zinc-950 text-zinc-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={!canManage || savingZone === entitlement.zoneId}
                              onChange={() =>
                                setSelectedByZone((current) => ({
                                  ...current,
                                  [entitlement.zoneId]: selected
                                    ? selectedIds.filter((id) => id !== tableId)
                                    : [...selectedIds, tableId],
                                }))
                              }
                              className="h-4 w-4 accent-[#D8C36A]"
                            />
                            <span>{table.tableNumber} · {table.seatCapacity}</span>
                          </label>
                        );
                      })}
                    </div>

                    {zoneTables.length === 0 && (
                      <p className="mt-3 text-xs text-amber-100">
                        No available operational tables in this section.
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-zinc-400">
                        {selectedCapacity >= entitlement.pax
                          ? `${entitlement.pax} guests fully covered.`
                          : `${entitlement.pax - selectedCapacity} guests still need table seats.`}
                      </p>
                      <button
                        type="button"
                        disabled={
                          !canManage ||
                          !changed ||
                          selectedIds.length === 0 ||
                          selectedCapacity < entitlement.pax ||
                          savingZone === entitlement.zoneId
                        }
                        onClick={() =>
                          void saveZoneTables(entitlement.zoneId, selectedIds)
                        }
                        className="min-h-10 rounded-full bg-[#D8C36A] px-4 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-black disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {savingZone === entitlement.zoneId
                          ? "Saving..."
                          : "Save tables"}
                      </button>
                    </div>
                  </details>
                );
              })
            )}
          </div>
        </div>
      )}

      {message && (
        <p role="status" className="mt-3 text-xs font-semibold text-sky-100">
          {message}
        </p>
      )}
    </div>
  );
}
