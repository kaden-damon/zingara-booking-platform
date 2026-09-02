import type { DemoBooking, GuestTicket } from "./zingaraDemo";

export function canShowGuestVisibleTable(
  booking: Pick<DemoBooking, "status"> | null | undefined,
  ticket: Pick<GuestTicket, "status"> | null | undefined,
) {
  return Boolean(booking && ticket);
}

export function resolveGuestVisibleTable(
  booking: Pick<DemoBooking, "status" | "tableNumber"> | null | undefined,
  ticket: Pick<GuestTicket, "status"> | null | undefined,
) {
  if (!canShowGuestVisibleTable(booking, ticket)) {
    return "";
  }

  return "TBC";
}
