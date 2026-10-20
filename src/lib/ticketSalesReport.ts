export const ticketSalesTimezone = "Africa/Johannesburg";

export type TicketSalesVenue = "cape-town" | "johannesburg";
export type TicketSalesBookingType = "standard" | "corporate" | "buyout";
export type TicketSalesPaymentFilter = "all" | "paid" | "partially-paid" | "unpaid";

export type TicketSalesBooking = {
  amountPaid: number;
  archivedAt: string | null;
  balanceOutstanding: number;
  bookingOrigin: string | null;
  bookingReference: string;
  bookingSource: string;
  bookingStatus: string;
  companyName: string | null;
  corporateRequestId: string | null;
  createdAt: string;
  customerName: string;
  guestCount: number;
  id: string;
  paymentStatus: string;
  showDate: string;
  showId: string;
  showName: string;
  showTime: string;
  totalAmount: number;
  venue: TicketSalesVenue;
  zoneEntitlements: unknown;
};

export type TicketSalesBuyout = {
  bookingId: string;
  state: string;
  ticketEntitlementCount: number;
};

export type TicketSalesFilters = {
  bookingType: "all" | TicketSalesBookingType;
  from: string;
  paymentStatus: TicketSalesPaymentFilter;
  performanceId: string;
  to: string;
  venue: "all" | TicketSalesVenue;
};

export type TicketSalesRow = {
  amountPaid: number;
  bookingReference: string;
  bookingType: TicketSalesBookingType;
  bookingValue: number;
  customerName: string;
  outstanding: number;
  paymentStatus: string;
  performance: string;
  performanceDate: string;
  saleDate: string;
  saleTimestamp: string;
  showId: string;
  ticketEntitlements: number;
  venue: TicketSalesVenue;
};

export type TicketSalesSummary = {
  amountPaid: number;
  bookingValue: number;
  bookings: number;
  outstanding: number;
  ticketsSold: number;
};

export type TicketSalesReport = {
  daily: Array<TicketSalesSummary & { date: string }>;
  excluded: {
    complimentary: number;
    importedUnreliableSaleDate: number;
    inactiveLifecycle: number;
    unpaidTicketEntitlements: number;
  };
  filters: TicketSalesFilters;
  generatedAt: string;
  performances: Array<{ date: string; id: string; label: string; venue: TicketSalesVenue }>;
  rows: TicketSalesRow[];
  summary: TicketSalesSummary;
  timezone: typeof ticketSalesTimezone;
  venues: Array<TicketSalesSummary & { venue: TicketSalesVenue }>;
};

const excludedStatuses = new Set(["cancelled", "refunded", "waitlisted"]);
const buyoutActiveStates = new Set(["provisional", "awaiting_payment", "fully_paid", "confirmed"]);

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function positiveInteger(value: unknown) {
  const amount = Math.trunc(Number(value ?? 0));
  return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
}

export function getSastDateKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: ticketSalesTimezone,
    year: "numeric",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function getTicketSalesDateRange(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new Error("Select a valid reporting date range.");
  }
  const end = new Date(`${to}T00:00:00+02:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    endExclusive: end.toISOString(),
    start: new Date(`${from}T00:00:00+02:00`).toISOString(),
  };
}

export function getTicketSalesBookingType(
  booking: Pick<TicketSalesBooking, "bookingOrigin" | "bookingSource" | "corporateRequestId">,
  buyout?: TicketSalesBuyout,
): TicketSalesBookingType {
  if (buyout) return "buyout";
  return booking.bookingOrigin === "corporate" ||
    booking.bookingSource.toLowerCase().includes("corporate") ||
    Boolean(booking.corporateRequestId)
    ? "corporate"
    : "standard";
}

function zoneEntitlementCount(value: unknown) {
  if (!Array.isArray(value)) return 0;
  return value.reduce((sum, item) => {
    if (!item || typeof item !== "object") return sum;
    return sum + positiveInteger((item as { pax?: unknown }).pax);
  }, 0);
}

export function getSoldTicketEntitlements(
  booking: Pick<TicketSalesBooking, "guestCount" | "paymentStatus" | "zoneEntitlements">,
  buyout?: TicketSalesBuyout,
) {
  if (!["deposit_paid", "fully_paid"].includes(booking.paymentStatus)) return 0;
  if (buyout) {
    return buyoutActiveStates.has(buyout.state)
      ? positiveInteger(buyout.ticketEntitlementCount)
      : 0;
  }
  const allocated = zoneEntitlementCount(booking.zoneEntitlements);
  return allocated > 0 ? allocated : positiveInteger(booking.guestCount);
}

function matchesPaymentFilter(status: string, filter: TicketSalesPaymentFilter) {
  if (filter === "all") return true;
  if (filter === "paid") return status === "fully_paid";
  if (filter === "partially-paid") return status === "deposit_paid";
  return status === "pending_payment";
}

function emptySummary(): TicketSalesSummary {
  return { amountPaid: 0, bookingValue: 0, bookings: 0, outstanding: 0, ticketsSold: 0 };
}

function addSummary(summary: TicketSalesSummary, row: TicketSalesRow) {
  summary.amountPaid = money(summary.amountPaid + row.amountPaid);
  summary.bookingValue = money(summary.bookingValue + row.bookingValue);
  summary.bookings += 1;
  summary.outstanding = money(summary.outstanding + row.outstanding);
  summary.ticketsSold += row.ticketEntitlements;
}

export function buildTicketSalesReport(input: {
  bookings: TicketSalesBooking[];
  buyouts: TicketSalesBuyout[];
  filters: TicketSalesFilters;
  generatedAt?: string;
}): TicketSalesReport {
  const buyoutByBooking = new Map(input.buyouts.map((row) => [row.bookingId, row]));
  const excluded = {
    complimentary: 0,
    importedUnreliableSaleDate: 0,
    inactiveLifecycle: 0,
    unpaidTicketEntitlements: 0,
  };
  const rows: TicketSalesRow[] = [];
  const performanceMap = new Map<string, TicketSalesReport["performances"][number]>();

  for (const booking of input.bookings) {
    if (input.filters.venue !== "all" && booking.venue !== input.filters.venue) continue;
    if (booking.bookingOrigin === "data_import") {
      excluded.importedUnreliableSaleDate += 1;
      continue;
    }
    if (booking.archivedAt || excludedStatuses.has(booking.bookingStatus)) {
      excluded.inactiveLifecycle += 1;
      continue;
    }
    if (booking.paymentStatus === "comp_vip") {
      excluded.complimentary += 1;
      continue;
    }
    const buyout = buyoutByBooking.get(booking.id);
    const bookingType = getTicketSalesBookingType(booking, buyout);
    performanceMap.set(booking.showId, {
      date: booking.showDate,
      id: booking.showId,
      label: `${booking.showDate} · ${booking.venue === "cape-town" ? "Cape Town" : "Johannesburg"} · ${booking.showTime.slice(0, 5)}`,
      venue: booking.venue,
    });
    if (input.filters.bookingType !== "all" && bookingType !== input.filters.bookingType) continue;
    if (input.filters.performanceId && booking.showId !== input.filters.performanceId) continue;
    if (!matchesPaymentFilter(booking.paymentStatus, input.filters.paymentStatus)) continue;

    const tickets = getSoldTicketEntitlements(booking, buyout);
    if (booking.paymentStatus === "pending_payment") {
      excluded.unpaidTicketEntitlements += positiveInteger(booking.guestCount);
    }
    const saleDate = getSastDateKey(booking.createdAt);
    rows.push({
      amountPaid: money(booking.amountPaid),
      bookingReference: booking.bookingReference,
      bookingType,
      bookingValue: money(booking.totalAmount),
      customerName: booking.companyName?.trim() || booking.customerName,
      outstanding: money(Math.max(booking.balanceOutstanding, 0)),
      paymentStatus: booking.paymentStatus,
      performance: `${booking.showName} · ${booking.showTime.slice(0, 5)}`,
      performanceDate: booking.showDate,
      saleDate,
      saleTimestamp: booking.createdAt,
      showId: booking.showId,
      ticketEntitlements: tickets,
      venue: booking.venue,
    });
  }

  rows.sort((left, right) =>
    right.saleTimestamp.localeCompare(left.saleTimestamp) ||
    left.bookingReference.localeCompare(right.bookingReference));
  const summary = emptySummary();
  const dailyMap = new Map<string, TicketSalesSummary>();
  const venueMap = new Map<TicketSalesVenue, TicketSalesSummary>([
    ["cape-town", emptySummary()],
    ["johannesburg", emptySummary()],
  ]);
  for (const row of rows) {
    addSummary(summary, row);
    const daily = dailyMap.get(row.saleDate) ?? emptySummary();
    addSummary(daily, row);
    dailyMap.set(row.saleDate, daily);
    addSummary(venueMap.get(row.venue)!, row);
  }

  return {
    daily: [...dailyMap.entries()].map(([date, values]) => ({ date, ...values })).sort((a, b) => a.date.localeCompare(b.date)),
    excluded,
    filters: input.filters,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    performances: [...performanceMap.values()].sort((a, b) => `${b.date}${b.label}`.localeCompare(`${a.date}${a.label}`)),
    rows,
    summary,
    timezone: ticketSalesTimezone,
    venues: (["cape-town", "johannesburg"] as const).map((venue) => ({ venue, ...venueMap.get(venue)! })),
  };
}
