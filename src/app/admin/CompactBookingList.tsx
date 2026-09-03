"use client";

import type {
  CompactBookingRow,
  CompactBookingSortDirection,
  CompactBookingSortKey,
} from "../../lib/compactBookingView";

type CompactBookingListProps = {
  direction: CompactBookingSortDirection;
  loadingReference?: string;
  onOpenBooking: (reference: string) => void;
  onSortChange: (key: CompactBookingSortKey) => void;
  rows: CompactBookingRow[];
  sortKey: CompactBookingSortKey;
};

const columns: Array<{
  key?: CompactBookingSortKey;
  label: string;
}> = [
  { label: "Status" },
  { key: "name", label: "Customer" },
  { key: "pax", label: "Pax" },
  { key: "section", label: "Section" },
  { key: "table", label: "Table / Floor" },
  { key: "payment", label: "Payment" },
  { key: "balance", label: "Balance" },
  { key: "source", label: "Source / Type" },
  { label: "Reference" },
];

const statusDotClasses: Record<CompactBookingRow["statusTone"], string> = {
  amber: "bg-amber-300",
  green: "bg-emerald-300",
  purple: "bg-purple-300",
  red: "bg-red-300",
  sky: "bg-sky-300",
  zinc: "bg-zinc-400",
};

export function CompactBookingList({
  direction,
  loadingReference,
  onOpenBooking,
  onSortChange,
  rows,
  sortKey,
}: CompactBookingListProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#8D7A2F]/30 bg-zinc-950/95 shadow-xl shadow-black/15">
      <div
        className="hidden min-h-9 grid-cols-[minmax(106px,0.75fr)_minmax(180px,1.65fr)_54px_minmax(110px,1fr)_minmax(118px,1fr)_minmax(92px,0.8fr)_minmax(100px,0.9fr)_minmax(112px,1fr)_minmax(114px,1fr)] items-center gap-3 border-b border-[#D8C36A]/25 bg-black/70 px-3 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-zinc-500 lg:grid"
        role="row"
      >
        {columns.map((column) =>
          column.key ? (
            <button
              key={column.label}
              type="button"
              onClick={() => onSortChange(column.key!)}
              className="flex min-h-9 min-w-0 items-center gap-1 text-left transition hover:text-[#F2D66C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8C36A]"
              aria-label={`Sort by ${column.label}${sortKey === column.key ? `, currently ${direction === "asc" ? "ascending" : "descending"}` : ""}`}
            >
              <span className="truncate">{column.label}</span>
              {sortKey === column.key && (
                <span aria-hidden="true" className="text-[#F2D66C]">
                  {direction === "asc" ? "↑" : "↓"}
                </span>
              )}
            </button>
          ) : (
            <span key={column.label} className="truncate">
              {column.label}
            </span>
          ),
        )}
      </div>

      <div role="list" aria-label="Compact bookings">
        {rows.map((row) => {
          const isLoading = loadingReference === row.reference;

          return (
            <div
              key={row.reference}
              role="listitem"
              className="border-b border-white/[0.07] last:border-b-0"
            >
              <button
                type="button"
                aria-busy={isLoading}
                aria-label={`Open Booking Details for ${row.customerName}, ${row.pax} guests, ${row.reference}`}
                disabled={isLoading}
                onClick={() => onOpenBooking(row.reference)}
                className="group block min-h-14 w-full px-3 py-2 text-left transition hover:bg-[#D8C36A]/[0.07] focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D8C36A] disabled:cursor-wait disabled:opacity-70 lg:grid lg:min-h-11 lg:grid-cols-[minmax(106px,0.75fr)_minmax(180px,1.65fr)_54px_minmax(110px,1fr)_minmax(118px,1fr)_minmax(92px,0.8fr)_minmax(100px,0.9fr)_minmax(112px,1fr)_minmax(114px,1fr)] lg:items-center lg:gap-3 lg:py-1.5"
              >
              <span className="hidden min-w-0 items-center gap-2 lg:flex">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${statusDotClasses[row.statusTone]}`}
                />
                <span className="truncate text-[0.66rem] font-semibold uppercase text-zinc-300">
                  {row.statusLabel}
                </span>
              </span>

              <span className="flex min-w-0 items-center gap-2 lg:block">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full lg:hidden ${statusDotClasses[row.statusTone]}`}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-white group-hover:text-[#F2D66C]">
                  {row.customerName}
                </span>
                <span className="shrink-0 text-xs font-semibold text-zinc-300 lg:hidden">
                  {row.pax} pax · {row.section}
                </span>
              </span>

              <span className="hidden text-sm font-bold text-white lg:block">
                {row.pax}
              </span>
              <span className="hidden truncate text-xs font-semibold text-zinc-300 lg:block">
                {row.section}
              </span>
              <span className="hidden truncate text-xs text-zinc-300 lg:block">
                {row.tableLabel}
              </span>
              <span className="hidden text-xs font-semibold text-zinc-300 lg:block">
                {row.paymentLabel}
              </span>
              <span
                className={`hidden text-xs font-semibold lg:block ${
                  row.balanceDue > 0 ? "text-amber-200" : "text-zinc-400"
                }`}
              >
                {row.balanceLabel}
              </span>
              <span className="hidden truncate text-xs text-zinc-400 lg:block">
                {row.sourceLabel}
              </span>
              <span className="hidden truncate font-mono text-[0.68rem] text-zinc-500 lg:block">
                {row.reference}
              </span>

              <span className="mt-1 flex min-w-0 items-center justify-between gap-3 pl-4 text-[0.7rem] text-zinc-400 lg:hidden">
                <span className="min-w-0 truncate">
                  {row.tableLabel} · {row.paymentLabel}
                  {row.balanceDue > 0 ? ` · ${row.balanceLabel}` : ""}
                </span>
                <span className="max-w-[46%] shrink-0 truncate font-mono text-zinc-500">
                  {row.sourceLabel} · {row.reference}
                </span>
              </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
