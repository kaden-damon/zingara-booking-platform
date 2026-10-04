import type { DemoBooking, GuestTicket } from "./zingaraDemo";

export type PersistedTicketStatus =
  | "cancelled"
  | "checked_in"
  | "expired"
  | "issued"
  | "refunded"
  | "valid"
  | "void";

export type PersistedTicketIdentity = {
  booking_id: string;
  id: string;
  issued_at: string | null;
  qr_payload: string | null;
  ticket_code: string;
  ticket_status: PersistedTicketStatus;
};

const downloadableStatuses = new Set<PersistedTicketStatus>([
  "checked_in",
  "issued",
  "valid",
]);

function normalizeFilePart(value: string) {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, "-");
}

export function getAllTicketsZipFilename(bookingReference: string) {
  return `${normalizeFilePart(bookingReference)}-All-Tickets.zip`;
}

export function getIndividualTicketPdfFilename(ticketCode: string) {
  return `${normalizeFilePart(ticketCode)}.pdf`;
}

export function hasIndividualTicketModel(booking: DemoBooking) {
  return Array.isArray(booking.guestTickets) && booking.guestTickets.length > 1;
}

export function resolveDownloadableTicketPopulation(
  booking: DemoBooking,
  persistedTickets: PersistedTicketIdentity[],
) {
  if (!hasIndividualTicketModel(booking)) {
    return [];
  }

  const rowsByCode = new Map(
    persistedTickets
      .filter((row) => downloadableStatuses.has(row.ticket_status))
      .map((row) => [row.ticket_code, row]),
  );
  const seenCodes = new Set<string>();

  return [...(booking.guestTickets ?? [])]
    .sort(
      (left, right) =>
        left.index - right.index || left.ticketCode.localeCompare(right.ticketCode),
    )
    .flatMap((ticket) => {
      const row = rowsByCode.get(ticket.ticketCode);

      if (!row || seenCodes.has(ticket.ticketCode)) {
        return [];
      }

      seenCodes.add(ticket.ticketCode);
      return [
        {
          row,
          ticket: {
            ...ticket,
            status:
              row.ticket_status === "checked_in" ? "checked-in" : "valid",
          } satisfies GuestTicket,
        },
      ];
    });
}
