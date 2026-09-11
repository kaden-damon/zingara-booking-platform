import type { BookingOrigin } from "./zingaraDemo";

export const bookingCreatedTimezone = "Africa/Johannesburg";

export type BookingCreatedDateFilter =
  | "all"
  | "today"
  | "yesterday"
  | "specific"
  | "range";

export type BookingSalesSource =
  | "customer_public"
  | "staff_internal"
  | "data_import"
  | "corporate_conversion"
  | "legacy_unknown"
  | "other";

export type BookingSalesSourceFilter = BookingSalesSource | "all";

export const bookingSalesSourceLabels: Record<BookingSalesSource, string> = {
  customer_public: "Customer / Public",
  staff_internal: "Staff / Internal",
  data_import: "Data Import",
  corporate_conversion: "Corporate Conversion",
  legacy_unknown: "Legacy / Unknown",
  other: "Other",
};

export type BookingCreatedWindow = {
  endExclusiveMs: number | null;
  error: string | null;
  startMs: number | null;
};

type BookingProvenance = {
  bookingOrigin?: BookingOrigin | null;
  corporateRequestId?: string | null;
  createdByStaffId?: string | null;
};

const johannesburgDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: bookingCreatedTimezone,
  year: "numeric",
});

function getJohannesburgDateKey(value: Date) {
  const parts = Object.fromEntries(
    johannesburgDateFormatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));

  return shifted.toISOString().slice(0, 10);
}

function getJohannesburgDayStart(dateKey: string) {
  return Date.parse(`${dateKey}T00:00:00.000+02:00`);
}

export function resolveBookingCreatedWindow(input: {
  filter: BookingCreatedDateFilter;
  from?: string;
  now?: Date;
  specificDate?: string;
  to?: string;
}): BookingCreatedWindow {
  if (input.filter === "all") {
    return { endExclusiveMs: null, error: null, startMs: null };
  }

  const today = getJohannesburgDateKey(input.now ?? new Date());
  let from = "";
  let to = "";

  if (input.filter === "today") {
    from = today;
    to = today;
  } else if (input.filter === "yesterday") {
    from = shiftDateKey(today, -1);
    to = from;
  } else if (input.filter === "specific") {
    from = input.specificDate ?? "";
    to = from;

    if (!from) {
      return {
        endExclusiveMs: null,
        error: "Select the booking-created date.",
        startMs: null,
      };
    }
  } else {
    from = input.from ?? "";
    to = input.to ?? "";

    if (!from || !to) {
      return {
        endExclusiveMs: null,
        error: "Select both From and To dates.",
        startMs: null,
      };
    }

    if (from > to) {
      return {
        endExclusiveMs: null,
        error: "From date must not be later than To date.",
        startMs: null,
      };
    }
  }

  return {
    endExclusiveMs: getJohannesburgDayStart(shiftDateKey(to, 1)),
    error: null,
    startMs: getJohannesburgDayStart(from),
  };
}

export function bookingMatchesCreatedWindow(
  createdAt: string | null | undefined,
  window: BookingCreatedWindow,
) {
  if (window.error) {
    return false;
  }

  if (window.startMs === null || window.endExclusiveMs === null) {
    return true;
  }

  const createdAtMs = createdAt ? Date.parse(createdAt) : Number.NaN;

  return (
    Number.isFinite(createdAtMs) &&
    createdAtMs >= window.startMs &&
    createdAtMs < window.endExclusiveMs
  );
}

export function getBookingSalesSource(
  booking: BookingProvenance,
): BookingSalesSource {
  if (booking.bookingOrigin === "customer_public") {
    return "customer_public";
  }

  if (booking.bookingOrigin === "data_import") {
    return "data_import";
  }

  if (
    booking.bookingOrigin === "corporate" &&
    Boolean(booking.corporateRequestId)
  ) {
    return "corporate_conversion";
  }

  if (
    booking.bookingOrigin === "admin_staff" ||
    booking.bookingOrigin === "corporate"
  ) {
    return "staff_internal";
  }

  if (booking.bookingOrigin === "legacy_unknown" || !booking.bookingOrigin) {
    return "legacy_unknown";
  }

  return "other";
}

export function bookingMatchesSalesSource(
  booking: BookingProvenance,
  filter: BookingSalesSourceFilter,
) {
  return filter === "all" || getBookingSalesSource(booking) === filter;
}

export function bookingMatchesCreator(
  booking: BookingProvenance,
  createdByStaffId: string,
) {
  return (
    createdByStaffId === "all" ||
    booking.createdByStaffId === createdByStaffId
  );
}

