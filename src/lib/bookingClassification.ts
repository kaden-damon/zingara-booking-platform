import type { BookingSource } from "@/lib/zingaraDemo";

export const corporatePartySizeThreshold = 20;

export function isCorporatePartySize(partySize: number) {
  return Number.isFinite(partySize) && partySize >= corporatePartySizeThreshold;
}

export function isCorporateBookingSource(
  source: string | null | undefined,
) {
  return source === "corporate-direct";
}

export function enforceCorporateBookingSource(
  partySize: number,
  source: BookingSource | undefined,
): BookingSource {
  return isCorporatePartySize(partySize)
    ? "corporate-direct"
    : source ?? "online";
}
