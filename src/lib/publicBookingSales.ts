import type {
  DemoVenueSettings,
  EntryLocationKey,
} from "@/lib/zingaraDemo";

export const publicBookingTimezone = "Africa/Johannesburg";

export type PublicBookingSalesStatus =
  | { state: "disabled" }
  | { opensAt: string; state: "scheduled" }
  | { state: "open" };

export function getPublicBookingSalesStatus(
  settings: DemoVenueSettings,
  location: EntryLocationKey,
  now = new Date(),
): PublicBookingSalesStatus {
  const configuration = settings.operationalSettings.publicBookings[location];

  if (!configuration?.enabled) {
    return { state: "disabled" };
  }

  if (!configuration.opensAt) {
    return { state: "open" };
  }

  const opensAt = Date.parse(configuration.opensAt);

  if (!Number.isFinite(opensAt)) {
    return { state: "disabled" };
  }

  return now.getTime() >= opensAt
    ? { state: "open" }
    : { opensAt: configuration.opensAt, state: "scheduled" };
}

export function isPublicBookingOpen(
  settings: DemoVenueSettings,
  location: EntryLocationKey,
  now = new Date(),
) {
  return getPublicBookingSalesStatus(settings, location, now).state === "open";
}

export function formatPublicBookingOpeningDate(opensAt: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "long",
    timeZone: publicBookingTimezone,
  }).format(new Date(opensAt));
}

export function formatPublicBookingOpeningDateTime(opensAt: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone: publicBookingTimezone,
    year: "numeric",
  }).format(new Date(opensAt));
}

export function toJohannesburgDateTimeInput(opensAt: string | null) {
  if (!opensAt || !Number.isFinite(Date.parse(opensAt))) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: publicBookingTimezone,
    year: "numeric",
  }).formatToParts(new Date(opensAt));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

export function parseJohannesburgDateTimeInput(value: string) {
  if (!value.trim()) {
    return null;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);

  if (!match) {
    return undefined;
  }

  const [, year, month, day, hour, minute] = match;
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 2,
    Number(minute),
  );
  const result = new Date(timestamp);
  const roundTrip = toJohannesburgDateTimeInput(result.toISOString());

  return roundTrip === value ? result.toISOString() : undefined;
}
