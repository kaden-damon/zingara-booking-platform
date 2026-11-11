"use client";

import { useMemo, useState } from "react";

import {
  isTemporaryOperationalTable,
  isValidMergedOperationalParent,
} from "@/lib/bookingTableMoves";
import { reallocateBookingZoneTables } from "@/lib/supabase/bookings";
import {
  seatingZones,
  type DemoBooking,
  type DemoTable,
  type SeatingZoneId,
} from "@/lib/zingaraDemo";

const supportedZones = [
  "golden-circle",
  "middle-ring",
  "royal-booths",
  "royal-balcony",
] as const satisfies readonly SeatingZoneId[];

type Props = {
  booking: DemoBooking;
  canManage: boolean;
  onChanged: () => Promise<void>;
  tables: DemoTable[];
};

function getZoneTitle(zoneId: SeatingZoneId) {
  return seatingZones.find((zone) => zone.id === zoneId)?.title ?? zoneId;
}

function isAssignableOperationalUnit(table: DemoTable, tables: DemoTable[]) {
  return (
    (table.physicalTable === true && !table.mergedFrom?.length) ||
    isTemporaryOperationalTable(table) ||
    isValidMergedOperationalParent(table, tables)
  );
}

export function BookingTableSetTransfer({
  booking,
  canManage,
  onChanged,
  tables,
}: Props) {
  const [open, setOpen] = useState(false);
  const [targetZone, setTargetZone] = useState<SeatingZoneId>(booking.zoneId);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>(
    (booking.reservationTableClaims ?? [])
      .filter((claim) => claim.section === booking.zoneId && claim.tableId)
      .map((claim) => claim.tableId as string),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const currentTableIds = useMemo(
    () =>
      Array.from(
        new Set(
          (booking.reservationTableClaims ?? [])
            .map((claim) => claim.tableId)
            .filter((tableId): tableId is string => Boolean(tableId)),
        ),
      ),
    [booking.reservationTableClaims],
  );
  const eligibleTables = useMemo(
    () =>
      tables
        .filter(
          (table) =>
            table.showId === booking.showId &&
            table.zoneId === targetZone &&
            Boolean(table.authoritativeId) &&
            table.capacityConfigured !== false &&
            !table.mergedInto &&
            isAssignableOperationalUnit(table, tables) &&
            (table.status === "available" ||
              table.bookingReference === booking.reference),
        )
        .sort((left, right) =>
          left.tableNumber.localeCompare(right.tableNumber, "en", {
            numeric: true,
          }),
        ),
    [booking.reference, booking.showId, tables, targetZone],
  );
  const selectedCapacity = eligibleTables.reduce(
    (total, table) =>
      selectedTableIds.includes(table.authoritativeId ?? table.id)
        ? total + table.seatCapacity
        : total,
    0,
  );
  const changed =
    targetZone !== booking.zoneId ||
    [...selectedTableIds].sort().join("|") !==
      [...currentTableIds].sort().join("|");

  async function save() {
    if (
      !canManage ||
      saving ||
      !booking.updatedAt ||
      !changed ||
      selectedTableIds.length === 0 ||
      selectedCapacity < booking.partySize
    ) {
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      await reallocateBookingZoneTables({
        bookingReference: booking.reference,
        expectedTableIds: currentTableIds,
        expectedUpdatedAt: booking.updatedAt,
        targetTableIds: selectedTableIds,
        targetZone,
      });
      await onChanged();
      setMessage("Table assignment saved.");
      setOpen(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The table assignment could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4"
    >
      <summary className="cursor-pointer text-sm font-semibold text-zinc-200">
        Manual table set
      </summary>

      <div className="mt-4 border-t border-white/10 pt-4">
        <div className="flex flex-wrap gap-2">
          {supportedZones.map((zoneId) => (
            <button
              key={zoneId}
              type="button"
              onClick={() => {
                setTargetZone(zoneId);
                setSelectedTableIds(
                  zoneId === booking.zoneId ? currentTableIds : [],
                );
                setMessage("");
              }}
              className={`min-h-10 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.06em] transition ${
                targetZone === zoneId
                  ? "border-[#D8C36A] bg-[#D8C36A] text-black"
                  : "border-white/15 text-zinc-200 hover:border-[#D8C36A]/55"
              }`}
            >
              {getZoneTitle(zoneId)}
            </button>
          ))}
        </div>

        <div className="mt-3 grid max-h-56 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
          {eligibleTables.map((table) => {
            const tableId = table.authoritativeId ?? table.id;
            const selected = selectedTableIds.includes(tableId);

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
                  disabled={!canManage || saving}
                  onChange={() =>
                    setSelectedTableIds((current) =>
                      selected
                        ? current.filter((id) => id !== tableId)
                        : [...current, tableId],
                    )
                  }
                  className="h-4 w-4 accent-[#D8C36A]"
                />
                <span>
                  {table.tableNumber} · {table.seatCapacity}
                </span>
              </label>
            );
          })}
        </div>

        {eligibleTables.length === 0 && (
          <p className="mt-3 text-xs text-amber-100">
            No available operational tables in this section.
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-zinc-400">
            {selectedCapacity}/{booking.partySize} seats · Financials unchanged
          </p>
          <button
            type="button"
            disabled={
              !canManage ||
              !changed ||
              selectedTableIds.length === 0 ||
              selectedCapacity < booking.partySize ||
              saving
            }
            onClick={() => void save()}
            className="min-h-10 rounded-full bg-[#D8C36A] px-4 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save tables"}
          </button>
        </div>

        {message && (
          <p role="status" className="mt-3 text-xs font-semibold text-amber-100">
            {message}
          </p>
        )}
      </div>
    </details>
  );
}
