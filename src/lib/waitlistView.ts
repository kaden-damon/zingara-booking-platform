import type {
  DemoWaitlistEntry,
  WaitlistStatus,
} from "@/lib/zingaraDemo";

export type WaitlistGuestCountFilter =
  | "all"
  | "1-2"
  | "3-4"
  | "5-6"
  | "7-plus";
export type WaitlistSource = "secret-guest-list" | "waitlist";
export type WaitlistSourceFilter = WaitlistSource | "all";

export type WaitlistFilters = {
  guestCount: WaitlistGuestCountFilter;
  search: string;
  source: WaitlistSourceFilter;
  status: WaitlistStatus | "all";
};

const secretGuestListNote = "submitted via the secret guest list.";

export function getWaitlistSource(entry: DemoWaitlistEntry): WaitlistSource {
  return entry.notes.trim().toLowerCase().startsWith(secretGuestListNote)
    ? "secret-guest-list"
    : "waitlist";
}

function matchesGuestCount(
  partySize: number,
  filter: WaitlistGuestCountFilter,
) {
  if (filter === "all") return true;
  if (filter === "1-2") return partySize >= 1 && partySize <= 2;
  if (filter === "3-4") return partySize >= 3 && partySize <= 4;
  if (filter === "5-6") return partySize >= 5 && partySize <= 6;
  return partySize >= 7;
}

export function filterWaitlistEntries(
  entries: DemoWaitlistEntry[],
  filters: WaitlistFilters,
  performanceSearchText = "",
) {
  const search = filters.search.trim().toLowerCase();

  return entries.filter((entry) => {
    if (filters.status !== "all" && entry.status !== filters.status) {
      return false;
    }
    if (!matchesGuestCount(entry.partySize, filters.guestCount)) {
      return false;
    }
    if (
      filters.source !== "all" &&
      getWaitlistSource(entry) !== filters.source
    ) {
      return false;
    }
    if (!search) return true;

    return [
      entry.id,
      entry.bookingReference ?? "",
      entry.customer.name,
      entry.customer.email,
      entry.customer.phone,
      entry.desiredZoneTitle ?? "",
      entry.status,
      entry.notes,
      performanceSearchText,
    ]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
}

export function summarizeWaitlistEntries(entries: DemoWaitlistEntry[]) {
  return entries.reduce(
    (report, entry) => {
      report[entry.status] += 1;
      if (entry.status === "waiting" || entry.status === "promoted") {
        report.activeGuests += entry.partySize;
      }
      return report;
    },
    {
      activeGuests: 0,
      converted: 0,
      promoted: 0,
      removed: 0,
      waiting: 0,
    } satisfies Record<WaitlistStatus, number> & { activeGuests: number },
  );
}
