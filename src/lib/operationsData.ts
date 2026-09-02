import type { DemoBooking, DemoShow } from "./zingaraDemo";

const nonOperationalStatuses = new Set([
  "cancelled",
  "refunded",
  "completed",
  "no-show",
  "waitlisted",
]);

function isOperationalBooking(
  booking: Pick<DemoBooking, "archivedAt" | "status">,
) {
  return (
    !booking.archivedAt &&
    !nonOperationalStatuses.has(booking.status ?? "confirmed")
  );
}

export function getSouthAfricaOperationalDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Johannesburg",
    year: "numeric",
  }).format(now);
}

export function getOperationalShowIdentityValues(show?: DemoShow | null) {
  return [show?.id, show?.supabaseId].filter(
    (id): id is string => Boolean(id),
  );
}

export function bookingBelongsToOperationalShow(
  booking: Pick<DemoBooking, "showId">,
  show?: DemoShow | null,
) {
  return Boolean(
    booking.showId &&
      show &&
      getOperationalShowIdentityValues(show).includes(booking.showId),
  );
}

export function getOperationalShowBookings(
  bookings: DemoBooking[],
  show?: DemoShow | null,
) {
  return bookings.filter(
    (booking) =>
      isOperationalBooking(booking) &&
      bookingBelongsToOperationalShow(booking, show),
  );
}

export function getArrivedGuestCount(booking: DemoBooking) {
  if ((booking.status ?? "confirmed") === "checked-in") {
    return booking.partySize;
  }

  const checkedInTickets = (booking.guestTickets ?? []).filter(
    (ticket) => ticket.status === "checked-in",
  ).length;

  return Math.min(checkedInTickets, booking.partySize);
}

export function getOperationalDashboardMetrics(bookings: DemoBooking[]) {
  return bookings.reduce(
    (metrics, booking) => {
      const paid = Math.max(booking.amountPaid ?? 0, 0);
      const outstanding = Math.max(
        booking.balanceDue ?? booking.totalPrice - paid,
        0,
      );

      return {
        arrivedGuests: metrics.arrivedGuests + getArrivedGuestCount(booking),
        bookingValue: metrics.bookingValue + Math.max(booking.totalPrice, 0),
        bookings: metrics.bookings + 1,
        complimentaryBookings:
          metrics.complimentaryBookings +
          (booking.paymentStatus === "comp-vip" || booking.totalPrice === 0
            ? 1
            : 0),
        corporateBookings:
          metrics.corporateBookings +
          ((booking.source ?? "").toLowerCase().includes("corporate") ? 1 : 0),
        depositsReceived:
          metrics.depositsReceived +
          (booking.paymentStatus === "deposit-paid" ? paid : 0),
        guests: metrics.guests + booking.partySize,
        outstanding: metrics.outstanding + outstanding,
        paid: metrics.paid + paid,
      };
    },
    {
      arrivedGuests: 0,
      bookingValue: 0,
      bookings: 0,
      complimentaryBookings: 0,
      corporateBookings: 0,
      depositsReceived: 0,
      guests: 0,
      outstanding: 0,
      paid: 0,
    },
  );
}

export function getDefaultOperationalShow(
  shows: DemoShow[],
  southAfricaToday: string,
) {
  const activeShows = [...shows]
    .filter(
      (show) =>
        !show.archivedAt &&
        (show.operationalStatus ?? "active") === "active",
    )
    .sort((left, right) =>
      `${left.date}T${left.time || "00:00"}`.localeCompare(
        `${right.date}T${right.time || "00:00"}`,
      ),
    );

  return (
    activeShows.find((show) => show.date === southAfricaToday) ??
    activeShows.find((show) => show.date > southAfricaToday) ??
    activeShows[0]
  );
}
