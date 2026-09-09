"use client";

import { useState } from "react";

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

const columns: Array<{ key?: CompactBookingSortKey; label: string }> = [
  { label: "Status" },
  { key: "name", label: "Customer" },
  { key: "pax", label: "Pax" },
  { key: "section", label: "Section" },
  { key: "table", label: "Table / Floor" },
  { key: "payment", label: "Payment" },
  { key: "amountPaid", label: "Amount Paid" },
  { key: "balance", label: "Balance" },
  { key: "source", label: "Source / Type" },
  { label: "Reference" },
];

const compactGridColumns =
  "xl:grid-cols-[minmax(88px,0.7fr)_minmax(150px,1.55fr)_42px_minmax(96px,0.9fr)_minmax(96px,0.9fr)_minmax(82px,0.75fr)_minmax(86px,0.8fr)_minmax(86px,0.8fr)_minmax(96px,0.9fr)_minmax(96px,0.9fr)]";

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
  const [visibleNoteReference, setVisibleNoteReference] = useState<string | null>(
    null,
  );

  return (
    <div className="overflow-visible rounded-lg border border-[#8D7A2F]/30 bg-zinc-950/95 shadow-xl shadow-black/15">
      <div
        className={`hidden min-h-9 items-center gap-2 border-b border-[#D8C36A]/25 bg-black/70 px-3 text-[0.6rem] font-semibold uppercase tracking-[0.06em] text-zinc-500 xl:grid ${compactGridColumns}`}
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
          const noteIsVisible = visibleNoteReference === row.reference;
          const noteId = `compact-booking-note-${row.reference}`;

          return (
            <div
              key={row.reference}
              role="listitem"
              className="group relative border-b border-white/[0.07] last:border-b-0"
            >
              <button
                type="button"
                aria-busy={isLoading}
                aria-label={`Open Booking Details for ${row.customerName}, ${row.pax} guests, ${row.reference}`}
                disabled={isLoading}
                onClick={() => onOpenBooking(row.reference)}
                className="absolute inset-0 z-0 w-full transition hover:bg-[#D8C36A]/[0.07] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D8C36A] disabled:cursor-wait disabled:opacity-70"
              />

              <div
                className={`pointer-events-none relative z-10 min-h-14 px-3 py-2 text-left xl:grid xl:min-h-11 xl:items-center xl:gap-2 xl:py-1.5 ${compactGridColumns}`}
              >
                <span className="hidden min-w-0 items-center gap-2 xl:flex">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 shrink-0 rounded-full ${statusDotClasses[row.statusTone]}`}
                  />
                  <span className="truncate text-[0.64rem] font-semibold uppercase text-zinc-300">
                    {row.statusLabel}
                  </span>
                </span>

                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 shrink-0 rounded-full xl:hidden ${statusDotClasses[row.statusTone]}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-white group-hover:text-[#F2D66C]">
                    {row.customerName}
                  </span>
                  {row.bookingNotes && (
                    <span
                      className="pointer-events-auto relative z-20 shrink-0"
                      onMouseEnter={() => setVisibleNoteReference(row.reference)}
                      onMouseLeave={() => setVisibleNoteReference(null)}
                    >
                      <button
                        type="button"
                        aria-controls={noteId}
                        aria-expanded={noteIsVisible}
                        aria-label={`Show booking notes for ${row.customerName}`}
                        onBlur={() => setVisibleNoteReference(null)}
                        onClick={() =>
                          setVisibleNoteReference((current) =>
                            current === row.reference ? null : row.reference,
                          )
                        }
                        onFocus={(event) => {
                          if (event.currentTarget.matches(":focus-visible")) {
                            setVisibleNoteReference(row.reference);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setVisibleNoteReference(null);
                          }
                        }}
                        className="grid h-7 w-7 place-items-center rounded-full text-[#D8C36A] transition hover:bg-[#D8C36A]/15 hover:text-[#F2D66C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8C36A]"
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                        >
                          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
                        </svg>
                      </button>
                      {noteIsVisible && (
                        <span
                          id={noteId}
                          role="tooltip"
                          className="absolute left-0 top-full z-[70] mt-2 block max-h-56 w-[min(20rem,calc(100vw-3rem))] overflow-y-auto whitespace-pre-wrap rounded-lg border border-[#D8C36A]/35 bg-zinc-950 p-3 text-left text-xs font-normal leading-5 text-zinc-100 shadow-2xl shadow-black/70"
                        >
                          {row.bookingNotes}
                        </span>
                      )}
                    </span>
                  )}
                  <span className="shrink-0 text-xs font-semibold text-zinc-300 xl:hidden">
                    {row.pax} pax · {row.section}
                  </span>
                </span>

                <span className="hidden text-sm font-bold text-white xl:block">{row.pax}</span>
                <span className="hidden truncate text-xs font-semibold text-zinc-300 xl:block">{row.section}</span>
                <span className="hidden truncate text-xs text-zinc-300 xl:block">{row.tableLabel}</span>
                <span className="hidden text-xs font-semibold text-zinc-300 xl:block">{row.paymentLabel}</span>
                <span className="hidden text-xs font-semibold text-zinc-200 xl:block">{row.amountPaidLabel}</span>
                <span
                  className={`hidden text-xs font-semibold xl:block ${
                    row.balanceDue > 0 ? "text-amber-200" : "text-zinc-400"
                  }`}
                >
                  {row.balanceLabel}
                </span>
                <span className="hidden truncate text-xs text-zinc-400 xl:block">{row.sourceLabel}</span>
                <span className="hidden truncate font-mono text-[0.66rem] text-zinc-500 xl:block">{row.reference}</span>

                <span className="mt-1 flex min-w-0 items-center justify-between gap-3 pl-4 text-[0.7rem] text-zinc-400 xl:hidden">
                  <span className="min-w-0 truncate">
                    {row.tableLabel} · {row.paymentLabel} · Paid {row.amountPaidLabel}
                    {row.balanceDue > 0 ? ` · ${row.balanceLabel}` : ""}
                  </span>
                  <span className="max-w-[42%] shrink-0 truncate font-mono text-zinc-500">
                    {row.sourceLabel} · {row.reference}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
