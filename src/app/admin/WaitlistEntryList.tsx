"use client";

import type { WaitlistStatus } from "@/lib/zingaraDemo";

export type WaitlistDisplayEntry = {
  availabilityLabel: string;
  bookingReference?: string;
  canConvert: boolean;
  contactLabel: string;
  convertedAt?: string;
  createdAt: string;
  guestName: string;
  hasAvailableSeating: boolean;
  id: string;
  notes: string;
  partySize: number;
  performanceLabel: string;
  promotedAt?: string;
  sourceLabel: string;
  status: WaitlistStatus;
  zoneLabel: string;
};

type WaitlistEntryListProps = {
  entries: WaitlistDisplayEntry[];
  expandedEntryId: string;
  mode: "compact" | "expanded";
  onConvert: (entryId: string) => void;
  onPromote: (entryId: string) => void;
  onRemove: (entryId: string) => void;
  onToggleEntry: (entryId: string) => void;
};

const statusLabels: Record<WaitlistStatus, string> = {
  converted: "Converted",
  promoted: "Promoted",
  removed: "Removed",
  waiting: "Waiting",
};

const statusClasses: Record<WaitlistStatus, string> = {
  converted: "border-emerald-400/40 bg-emerald-950/30 text-emerald-300",
  promoted: "border-sky-300/40 bg-sky-950/30 text-sky-200",
  removed: "border-red-400/40 bg-red-950/30 text-red-300",
  waiting: "border-amber-300/40 bg-amber-950/30 text-amber-200",
};

function EntryDetails({
  entry,
  onConvert,
  onPromote,
  onRemove,
}: {
  entry: WaitlistDisplayEntry;
  onConvert: (entryId: string) => void;
  onPromote: (entryId: string) => void;
  onRemove: (entryId: string) => void;
}) {
  return (
    <div className="grid gap-4 border-t border-white/10 bg-black/25 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.38fr)]">
      <div className="min-w-0">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Performance</dt>
            <dd className="mt-1 text-zinc-200">{entry.performanceLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Seating</dt>
            <dd className="mt-1 text-zinc-200">{entry.partySize} guests · {entry.zoneLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Contact</dt>
            <dd className="mt-1 break-words text-zinc-200">{entry.contactLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Enquiry Source</dt>
            <dd className="mt-1 text-zinc-200">{entry.sourceLabel}</dd>
          </div>
        </dl>
        {entry.notes && (
          <p className="mt-4 rounded-lg border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">{entry.notes}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs uppercase tracking-[0.1em] text-zinc-500">
          <span>Joined {entry.createdAt}</span>
          {entry.promotedAt && <span>Promoted {entry.promotedAt}</span>}
          {entry.convertedAt && <span>Converted {entry.convertedAt}</span>}
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-zinc-950 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Available Seating</p>
        <p className={`mt-2 text-sm ${entry.hasAvailableSeating ? "text-emerald-300" : "text-amber-200"}`}>
          {entry.availabilityLabel}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <button type="button" disabled={entry.status !== "waiting"} onClick={() => onPromote(entry.id)} className="min-h-11 rounded-full border border-sky-300/40 px-4 py-2 text-sm font-semibold text-sky-200 transition hover:bg-sky-300 hover:text-black disabled:cursor-not-allowed disabled:opacity-35">Promote</button>
          <button type="button" disabled={!entry.canConvert} onClick={() => onConvert(entry.id)} className="min-h-11 rounded-full border border-emerald-300/50 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-300 hover:text-black disabled:cursor-not-allowed disabled:opacity-35">Convert To Booking</button>
          <button type="button" disabled={entry.status === "converted" || entry.status === "removed"} onClick={() => onRemove(entry.id)} className="min-h-11 rounded-full border border-red-300/40 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-300 hover:text-black disabled:cursor-not-allowed disabled:opacity-35">Remove</button>
        </div>
      </div>
    </div>
  );
}

export function WaitlistEntryList({
  entries,
  expandedEntryId,
  mode,
  onConvert,
  onPromote,
  onRemove,
  onToggleEntry,
}: WaitlistEntryListProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
      {mode === "compact" && (
        <div className="hidden grid-cols-[minmax(150px,1.1fr)_minmax(180px,1.5fr)_70px_minmax(150px,1fr)_minmax(145px,1fr)_110px_44px] gap-3 border-b border-white/10 bg-black/55 px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-zinc-500 xl:grid">
          <span>Guest</span><span>Performance</span><span>Guests</span><span>Contact</span><span>Available Seating</span><span>Status</span><span className="sr-only">Details</span>
        </div>
      )}
      <div className="divide-y divide-white/10">
        {entries.map((entry) => {
          const isExpanded = mode === "expanded" || expandedEntryId === entry.id;
          return (
            <article key={entry.id} className="bg-black/10">
              <button
                type="button"
                aria-expanded={isExpanded}
                disabled={mode === "expanded"}
                onClick={() => onToggleEntry(entry.id)}
                className={`relative w-full pr-12 text-left transition hover:bg-white/[0.035] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#D8C36A]/60 disabled:cursor-default disabled:hover:bg-transparent xl:pr-4 ${mode === "compact" ? "py-3 pl-4" : "py-4 pl-4"}`}
              >
                <div className="grid min-w-0 gap-2 xl:grid-cols-[minmax(150px,1.1fr)_minmax(180px,1.5fr)_70px_minmax(150px,1fr)_minmax(145px,1fr)_110px_44px] xl:items-center xl:gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-white">{entry.guestName}</span>
                      {entry.bookingReference && <span className="shrink-0 text-[0.68rem] font-semibold text-emerald-300">{entry.bookingReference}</span>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[#D8C36A]">{entry.id}</p>
                  </div>
                  <p className="truncate text-sm text-zinc-300">{entry.performanceLabel}</p>
                  <p className="text-sm font-semibold text-white"><span className="xl:hidden">Guests: </span>{entry.partySize}</p>
                  <p className="truncate text-sm text-zinc-400">{entry.contactLabel}</p>
                  <p className={`truncate text-sm ${entry.hasAvailableSeating ? "text-emerald-300" : "text-amber-200"}`}>{entry.availabilityLabel}</p>
                  <span className={`w-fit rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] ${statusClasses[entry.status]}`}>{statusLabels[entry.status]}</span>
                  {mode === "compact" && <span aria-hidden="true" className="absolute right-4 top-4 text-sm text-zinc-400 xl:static xl:text-center">{isExpanded ? "−" : "+"}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500 xl:hidden">
                  <span>{entry.zoneLabel}</span><span>{entry.sourceLabel}</span>
                </div>
              </button>
              {isExpanded && <EntryDetails entry={entry} onConvert={onConvert} onPromote={onPromote} onRemove={onRemove} />}
            </article>
          );
        })}
      </div>
    </div>
  );
}
