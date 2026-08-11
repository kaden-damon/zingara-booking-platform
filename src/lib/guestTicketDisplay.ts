import type { DemoBooking, GuestTicket } from "./zingaraDemo";

function normalizeDisplayText(value: string | undefined) {
  return (value ?? "").trim();
}

export function canShowGuestVisibleTable(
  booking: Pick<DemoBooking, "status"> | null | undefined,
  ticket: Pick<GuestTicket, "status"> | null | undefined,
) {
  return ticket?.status === "checked-in" || booking?.status === "checked-in";
}

export function resolveGuestVisibleTable(
  booking: Pick<DemoBooking, "status" | "tableNumber"> | null | undefined,
  ticket: Pick<GuestTicket, "status"> | null | undefined,
) {
  if (!canShowGuestVisibleTable(booking, ticket)) {
    return "";
  }

  return normalizeDisplayText(booking?.tableNumber);
}
