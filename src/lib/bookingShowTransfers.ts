import type { BookingStatus, DemoShow } from "./zingaraDemo";

const transferableStatuses = new Set<BookingStatus>([
  "new",
  "confirmed",
  "pending",
  "pending-payment",
]);

export function isBookingEligibleForShowTransfer(status?: BookingStatus) {
  return status ? transferableStatuses.has(status) : true;
}

export function getEligibleBookingTransferShows(
  shows: DemoShow[],
  currentShowId?: string | null,
) {
  return shows
    .filter(
      (show) =>
        show.operationalStatus === "active" &&
        !show.archivedAt &&
        show.id !== currentShowId &&
        show.supabaseId !== currentShowId,
    )
    .sort((left, right) =>
      `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`),
    );
}

export function buildBookingShowTransferConfirmation(input: {
  bookingReference: string;
  currentShow: string;
  destinationShow: string;
  guestName: string;
  pax: number;
  zone: string;
}) {
  return [
    "MOVE BOOKING TO ANOTHER SHOW?",
    "",
    `${input.guestName} · ${input.bookingReference}`,
    `${input.pax} guests · ${input.zone}`,
    "",
    `Current: ${input.currentShow}`,
    `New: ${input.destinationShow}`,
    "",
    "The booking reference, ticket identity, QR code, payment history, and original pricing will be preserved. The current table will be released; a destination table is assigned only when an exact safe match is available.",
  ].join("\n");
}
