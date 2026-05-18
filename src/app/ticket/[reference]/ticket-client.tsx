"use client";

import { useEffect, useState } from "react";

import {
  type DemoBooking,
  type DemoShow,
  type DemoVenueSettings,
  type DemoWaitlistEntry,
  type TicketState,
  createTicketCode,
  defaultVenueSettings,
  defaultShows,
  getBookingTicketState,
  getShowLabel,
  getStoredDemoBookings,
  getStoredDemoShows,
  getStoredVenueSettings,
  getStoredDemoWaitlist,
  getTicketStateClasses,
} from "../../../lib/zingaraDemo";

type LiveTicketClientProps = {
  reference: string;
};

function getQrCell(code: string, index: number) {
  const charCode = code.charCodeAt(index % code.length) + index * 29;

  return charCode % 4 !== 0;
}

function getTicketState(
  booking: DemoBooking | null,
  waitlistEntry: DemoWaitlistEntry | null,
): TicketState | null {
  if (waitlistEntry && !booking) {
    return "Waitlist";
  }

  return booking ? getBookingTicketState(booking) : null;
}

export default function LiveTicketClient({
  reference,
}: LiveTicketClientProps) {
  const [bookings, setBookings] = useState<DemoBooking[]>([]);
  const [shows, setShows] = useState<DemoShow[]>(defaultShows);
  const [venueSettings, setVenueSettings] =
    useState<DemoVenueSettings>(defaultVenueSettings);
  const [waitlist, setWaitlist] = useState<DemoWaitlistEntry[]>([]);
  const venueConfig = venueSettings;

  useEffect(() => {
    function loadTicketData() {
      const nextBookings = getStoredDemoBookings();
      const nextShows = getStoredDemoShows();
      const nextVenueSettings = getStoredVenueSettings();
      const nextWaitlist = getStoredDemoWaitlist();

      setBookings(nextBookings);
      setShows(nextShows);
      setVenueSettings(nextVenueSettings);
      setWaitlist(nextWaitlist);
    }

    const refreshSeconds =
      getStoredVenueSettings().operationalSettings.ticketRefreshSeconds;
    const hydrationTimer = window.setTimeout(loadTicketData, 0);
    const refreshTimer = window.setInterval(
      loadTicketData,
      refreshSeconds * 1000,
    );

    window.addEventListener("storage", loadTicketData);
    window.addEventListener(
      "zingara-demo-bookings-updated",
      loadTicketData,
    );
    window.addEventListener(
      "zingara-demo-shows-updated",
      loadTicketData,
    );
    window.addEventListener(
      "zingara-demo-waitlist-updated",
      loadTicketData,
    );
    window.addEventListener(
      "zingara-demo-venue-settings-updated",
      loadTicketData,
    );

    return () => {
      window.clearTimeout(hydrationTimer);
      window.clearInterval(refreshTimer);
      window.removeEventListener("storage", loadTicketData);
      window.removeEventListener(
        "zingara-demo-bookings-updated",
        loadTicketData,
      );
      window.removeEventListener(
        "zingara-demo-shows-updated",
        loadTicketData,
      );
      window.removeEventListener(
        "zingara-demo-waitlist-updated",
        loadTicketData,
      );
      window.removeEventListener(
        "zingara-demo-venue-settings-updated",
        loadTicketData,
      );
    };
  }, []);

  const booking =
    bookings.find(
      (currentBooking) =>
        currentBooking.reference === reference ||
        currentBooking.ticketCode === reference,
    ) ?? null;
  const waitlistEntry =
    waitlist.find(
      (entry) =>
        entry.id === reference ||
        createTicketCode(entry.id) === reference ||
        entry.bookingReference === reference,
    ) ?? null;
  const show = shows.find(
    (currentShow) => currentShow.id === booking?.showId,
  );
  const ticketState = getTicketState(booking, waitlistEntry);
  const ticketCode = booking
    ? booking.ticketCode ?? createTicketCode(booking.reference)
    : waitlistEntry
      ? createTicketCode(waitlistEntry.id)
      : createTicketCode(reference);

  return (
    <main className="min-h-screen bg-black px-5 py-10 text-white">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-[2rem] border border-[#D8C36A]/40 bg-[radial-gradient(circle_at_top,#2B1D0B_0%,#101010_48%,#050505_100%)] shadow-2xl shadow-[#8D7A2F]/15">
        <div className="border-b border-[#D8C36A]/25 px-6 py-6 sm:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#D8C36A]">
            {venueConfig.ticketBranding.accentText ||
              venueConfig.venueName}
          </p>
          <h1 className="mt-2 text-4xl font-bold sm:text-5xl">
            Live Digital Ticket
          </h1>
          <p className="mt-3 text-zinc-400">
            This ticket reflects the latest booking state from the
            {venueConfig.brandTitle} box office.
          </p>
        </div>

        {!ticketState ? (
          <div className="p-8">
            <div className="rounded-2xl border border-red-400/30 bg-red-950/20 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-300">
                Ticket Not Found
              </p>
              <p className="mt-3 text-zinc-300">
                No booking or waitlist record matches this live ticket
                reference.
              </p>
              <p className="mt-4 font-mono text-sm text-zinc-500">
                {reference}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_260px]">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${getTicketStateClasses(ticketState)}`}
                >
                  {ticketState}
                </span>
                <span className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">
                  Live
                </span>
              </div>

              <h2 className="mt-6 text-3xl font-bold">
                {booking?.customer.name ??
                  waitlistEntry?.customer.name ??
                  "Guest"}
              </h2>
              <p className="mt-2 text-zinc-400">
                {booking?.customer.email ??
                  waitlistEntry?.customer.email ??
                  "No email"}{" "}
                ·{" "}
                {booking?.customer.phone ??
                  waitlistEntry?.customer.phone ??
                  "No phone"}
              </p>

              <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Reference
                  </p>
                  <p className="mt-2 font-mono text-sm text-[#D8C36A]">
                    {booking?.reference ?? waitlistEntry?.id}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Show
                  </p>
                  <p className="mt-2 font-semibold">
                    {booking
                      ? getShowLabel(show)
                      : waitlistEntry
                        ? waitlistEntry.showId
                        : "Unassigned show"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Seating
                  </p>
                  <p className="mt-2 font-semibold">
                    {booking?.zoneTitle ??
                      waitlistEntry?.desiredZoneTitle ??
                      "Waitlist"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Table
                  </p>
                  <p className="mt-2 font-semibold">
                    {booking?.tableNumber ?? "Pending allocation"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Party Size
                  </p>
                  <p className="mt-2 font-semibold">
                    {booking?.partySize ?? waitlistEntry?.partySize} guests
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Arrival
                  </p>
                  <p className="mt-2 font-semibold">
                    {booking?.arrivalTime
                      ? new Date(booking.arrivalTime).toLocaleString()
                      : "Awaiting check-in"}
                  </p>
                </div>
              </div>

              {booking && (
                <div className="mt-6 rounded-2xl border border-[#D8C36A]/25 bg-black/35 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
                    Payment & Wallet Sync Foundation
                  </p>
                  <p className="mt-2 text-sm text-zinc-400">
                    Paid R{(booking.amountPaid ?? 0).toLocaleString()} ·
                    Balance R{(booking.balanceDue ?? 0).toLocaleString()}
                  </p>
                  <p className="mt-3 text-xs text-zinc-500">
                    {venueConfig.ticketBranding.footerNote}
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-[1.5rem] border border-[#D8C36A]/45 bg-white p-4 shadow-[0_0_50px_rgba(216,195,106,0.2)]">
              <div className="grid grid-cols-11 gap-1">
                {Array.from({ length: 121 }).map((_, index) => (
                  <span
                    key={index}
                    className={`h-4 w-4 ${
                      getQrCell(ticketCode, index)
                        ? "bg-black"
                        : "bg-white"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-4 break-all text-center font-mono text-xs text-black">
                {ticketCode}
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
