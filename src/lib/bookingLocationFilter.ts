import {
  normalizeShowLocation,
  type EntryLocationKey,
} from "./zingaraDemo";

export type BookingLocationFilter = EntryLocationKey | "all";

export function bookingMatchesLocation(
  authoritativeLocation: string | null | undefined,
  filter: BookingLocationFilter,
) {
  return (
    filter === "all" || normalizeShowLocation(authoritativeLocation) === filter
  );
}
