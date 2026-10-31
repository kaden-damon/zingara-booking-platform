import type {
  DemoWaitlistEntry,
  WaitlistStatus,
} from "@/lib/zingaraDemo";
import { escapeReportHtml } from "./operationsReports.ts";

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

export type WaitlistPrintEntry = {
  availabilityLabel: string;
  bookingReference?: string;
  contactLabel: string;
  guestName: string;
  id: string;
  partySize: number;
  performanceLabel: string;
  sourceLabel: string;
  status: WaitlistStatus;
};

export type WaitlistPrintInput = {
  entries: WaitlistPrintEntry[];
  filterSummary: string;
  performanceLabel: string;
  printedAt: string;
};

const secretGuestListNote = "submitted via the secret guest list.";

export function formatWaitlistTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Johannesburg",
    year: "numeric",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("day")}/${part("month")}/${part("year")} ${part("hour")}:${part("minute")}`;
}

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

const waitlistStatusLabels: Record<WaitlistStatus, string> = {
  converted: "Converted",
  promoted: "Promoted",
  removed: "Removed",
  waiting: "Waiting",
};

export function buildWaitlistPrintHtml(input: WaitlistPrintInput) {
  const totalGuests = input.entries.reduce(
    (total, entry) => total + entry.partySize,
    0,
  );
  const rows = input.entries
    .map(
      (entry) => `<tr>
        <td><strong>${escapeReportHtml(entry.guestName)}</strong><span>${escapeReportHtml(entry.id)}</span>${entry.bookingReference ? `<span>${escapeReportHtml(entry.bookingReference)}</span>` : ""}</td>
        <td>${escapeReportHtml(entry.performanceLabel)}</td>
        <td class="number">${entry.partySize}</td>
        <td>${escapeReportHtml(entry.contactLabel)}</td>
        <td>${escapeReportHtml(waitlistStatusLabels[entry.status])}</td>
        <td>${escapeReportHtml(entry.availabilityLabel)}</td>
        <td>${escapeReportHtml(entry.sourceLabel)}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Zingara Waitlist</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #171717; font-family: Arial, Helvetica, sans-serif; font-size: 10px; }
      header { border-bottom: 2px solid #8d7a2f; margin-bottom: 12px; padding-bottom: 10px; }
      .brand { color: #8d7a2f; font-size: 10px; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase; }
      h1 { font-size: 22px; margin: 4px 0 5px; }
      .performance { font-size: 13px; font-weight: 700; margin: 0; }
      .meta { color: #525252; display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 7px; }
      .filters { color: #404040; margin: 7px 0 0; }
      table { border-collapse: collapse; table-layout: fixed; width: 100%; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      th { background: #eee8cf; border: 1px solid #b8aa70; color: #292524; font-size: 8px; letter-spacing: .5px; padding: 6px; text-align: left; text-transform: uppercase; }
      td { border: 1px solid #d4d4d4; overflow-wrap: anywhere; padding: 6px; vertical-align: top; }
      td span { color: #525252; display: block; font-size: 8px; margin-top: 2px; }
      td.number { font-size: 12px; font-weight: 700; text-align: center; }
      th:nth-child(1) { width: 15%; }
      th:nth-child(2) { width: 19%; }
      th:nth-child(3) { width: 6%; }
      th:nth-child(4) { width: 18%; }
      th:nth-child(5) { width: 9%; }
      th:nth-child(6) { width: 20%; }
      th:nth-child(7) { width: 13%; }
      .empty { border: 1px solid #d4d4d4; color: #525252; padding: 18px; text-align: center; }
      @media screen { body { margin: 24px; max-width: 1100px; } }
    </style>
  </head>
  <body>
    <header>
      <div class="brand">Zingara Floor &amp; Arrivals</div>
      <h1>Waitlist</h1>
      <p class="performance">${escapeReportHtml(input.performanceLabel)}</p>
      <div class="meta"><span>Printed ${escapeReportHtml(input.printedAt)} SAST</span><span>${input.entries.length} matching ${input.entries.length === 1 ? "enquiry" : "enquiries"}</span><span>${totalGuests} ${totalGuests === 1 ? "guest" : "guests"}</span></div>
      <p class="filters">${escapeReportHtml(input.filterSummary)}</p>
    </header>
    ${input.entries.length > 0 ? `<table>
      <thead><tr><th>Guest &amp; Reference</th><th>Performance</th><th>Guests</th><th>Contact</th><th>Status</th><th>Available Seating</th><th>Source</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : '<div class="empty">No waitlist entries match the current search and filters.</div>'}
  </body>
</html>`;
}
