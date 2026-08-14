"use client";

import { useEffect, useState } from "react";

import ScannableQrCode from "../../components/ScannableQrCode";
import { registerZingaraPushSubscription } from "../../../lib/browserNotifications";
import {
  createDownloadableTicketPdf,
  resolveDownloadableTicketPdfInput,
  TicketPdfDataError,
} from "../../../lib/ticketPdf";
import { resolveGuestVisibleTable } from "../../../lib/guestTicketDisplay";
import {
  type DemoBooking,
  type DemoShow,
  type DemoVenueSettings,
  type GuestTicket,
  type PaymentStatus,
  type TicketState,
  defaultVenueSettings,
  getBookingTicketState,
  getCompactShowDateTime,
  getIncludedBookingFeeBreakdown,
  getShowLocationOption,
  getTicketStateClasses,
  normalizeShowLocation,
} from "../../../lib/zingaraDemo";

type LiveTicketClientProps = {
  reference: string;
};

type TicketPayload = {
  activeTicket: GuestTicket;
  booking: DemoBooking;
  show: DemoShow | null;
  tableColour: {
    background: string;
    border: string;
    label: string;
  };
  venueSettings: DemoVenueSettings;
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  "comp-vip": "Comp/VIP",
  "deposit-paid": "Deposit Paid",
  "fully-paid": "Fully Paid",
  "pending-payment": "Pending Payment",
  refunded: "Refunded",
};

function getPaymentStatus(booking: DemoBooking): PaymentStatus {
  if (booking.paymentStatus) {
    return booking.paymentStatus;
  }

  if (booking.status === "refunded") {
    return "refunded";
  }

  if ((booking.amountPaid ?? 0) >= booking.totalPrice) {
    return "fully-paid";
  }

  if ((booking.amountPaid ?? 0) > 0) {
    return "deposit-paid";
  }

  return "pending-payment";
}

function getTicketState(
  booking: DemoBooking | null,
  ticket: GuestTicket | null,
): TicketState | null {
  if (!booking || !ticket) {
    return null;
  }

  if (ticket.status === "checked-in") {
    return "Checked In";
  }

  return getBookingTicketState(booking);
}

function formatCurrency(amount: number) {
  return `R${amount.toLocaleString()}`;
}

export default function LiveTicketClient({
  reference,
}: LiveTicketClientProps) {
  const [payload, setPayload] = useState<TicketPayload | null>(null);
  const [returnTo, setReturnTo] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCustomising, setIsCustomising] = useState(false);
  const [openTicketCode, setOpenTicketCode] = useState<string | null>(
    null,
  );
  const [ticketForms, setTicketForms] = useState<
    Record<string, { email: string; fullName: string; mobile: string }>
  >({});
  const [ticketActionStatus, setTicketActionStatus] =
    useState<Record<string, string>>({});
  const [hasAutoDownloaded, setHasAutoDownloaded] = useState(false);
  const [bookingUpdatesStatus, setBookingUpdatesStatus] = useState("");
  const venueConfig = payload?.venueSettings ?? defaultVenueSettings;
  const booking = payload?.booking ?? null;
  const activeTicket = payload?.activeTicket ?? null;
  const tableColour = payload?.tableColour ?? {
    background: "#111111",
    border: "#D8C36A",
    label: "Zingara Gold",
  };
  const show = payload?.show ?? null;
  const guestTickets = booking?.guestTickets ?? [];
  const ticketState = getTicketState(booking, activeTicket);
  const guestVisibleTable =
    booking && activeTicket
      ? resolveGuestVisibleTable(booking, activeTicket)
      : "";
  const includedBookingFeeBreakdown = booking
    ? getIncludedBookingFeeBreakdown(
        Math.max(
          (booking.subtotalPrice ?? booking.totalPrice) -
            (booking.addonsTotal ?? 0),
          0,
        ),
      )
    : null;
  const paymentStatus = booking ? getPaymentStatus(booking) : undefined;
  const showLocation = normalizeShowLocation(
    show?.location ?? show?.venueName,
  );
  const ticketLocationOption = showLocation
    ? getShowLocationOption(showLocation)
    : null;

  function isTicketActionBusy(ticketCode: string) {
    const status = ticketActionStatus[ticketCode] ?? "";

    return (
      status === "Saving..." ||
      status === "Preparing PDF..." ||
      status === "Regenerating..." ||
      status === "Sending..."
    );
  }

  async function loadTicketData(nextReference = reference) {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/tickets/${encodeURIComponent(nextReference)}`,
        { cache: "no-store" },
      );
      const nextPayload = (await response.json()) as
        | TicketPayload
        | { error?: string };

      if (!response.ok || "error" in nextPayload) {
        throw new Error(
          "error" in nextPayload
            ? nextPayload.error ?? "Ticket could not be loaded."
            : "Ticket could not be loaded.",
        );
      }

      const ticketPayload = nextPayload as TicketPayload;

      setPayload(ticketPayload);
      setTicketForms(
        Object.fromEntries(
          (ticketPayload.booking.guestTickets ?? []).map((ticket) => [
            ticket.ticketCode,
            {
              email: ticket.email ?? "",
              fullName: ticket.fullName,
              mobile: ticket.mobile ?? "",
            },
          ]),
        ),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Ticket could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const nextReturnTo = new URLSearchParams(window.location.search).get(
      "returnTo",
    );
    const shouldCustomise =
      new URLSearchParams(window.location.search).get("customise") === "1";

    setReturnTo(nextReturnTo ?? "");
    setIsCustomising(shouldCustomise);
    void loadTicketData();
    // Ticket payload is keyed by the route reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  useEffect(() => {
    const shouldDownload =
      new URLSearchParams(window.location.search).get("download") === "1";

    if (!shouldDownload || hasAutoDownloaded || !activeTicket) {
      return;
    }

    setHasAutoDownloaded(true);
    void downloadTicket(activeTicket, window);
    // Downloading is intentionally triggered only by the explicit URL flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicket?.ticketCode, hasAutoDownloaded]);

  const handleTicketExit = () => {
    const safeReturnTo =
      returnTo.startsWith("/admin") && !returnTo.startsWith("//")
        ? returnTo
        : "";

    if (safeReturnTo) {
      window.location.assign(safeReturnTo);
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.assign("/admin");
  };

  async function enableBookingUpdates() {
    if (!booking) {
      return;
    }

    setBookingUpdatesStatus("Preparing booking updates...");

    const result = await registerZingaraPushSubscription({
      bookingReference: booking.reference,
      customerEmail: booking.customer.email,
      customerName: booking.customer.name,
    });

    setBookingUpdatesStatus(
      result.ok
        ? "Booking updates enabled on this device."
        : result.reason ??
            "Booking updates could not be enabled on this device.",
    );
  }

  async function saveTicket(ticket: GuestTicket) {
    const form = ticketForms[ticket.ticketCode];

    if (!form) {
      return;
    }

    setTicketActionStatus((current) => ({
      ...current,
      [ticket.ticketCode]: "Saving...",
    }));

    const response = await fetch(
      `/api/tickets/${encodeURIComponent(ticket.ticketCode)}`,
      {
        body: JSON.stringify({
          email: form.email,
          fullName: form.fullName,
          mobile: form.mobile,
          ticketCode: ticket.ticketCode,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      },
    );

    if (response.ok) {
      setTicketActionStatus((current) => ({
        ...current,
        [ticket.ticketCode]: "✓ Ticket Updated",
      }));
      window.setTimeout(() => {
        setTicketActionStatus((current) => {
          const nextStatus = { ...current };

          delete nextStatus[ticket.ticketCode];
          return nextStatus;
        });
      }, 3200);
      await loadTicketData(ticket.ticketCode);
      return;
    }

    setTicketActionStatus((current) => ({
      ...current,
      [ticket.ticketCode]: "Could not save.",
    }));
  }

  async function runTicketAction(
    ticket: GuestTicket,
    action: "email" | "regenerate" | "resend",
  ) {
    setTicketActionStatus((current) => ({
      ...current,
      [ticket.ticketCode]:
        action === "regenerate" ? "Regenerating..." : "Sending...",
    }));

    const response = await fetch(
      `/api/tickets/${encodeURIComponent(ticket.ticketCode)}`,
      {
        body: JSON.stringify({
          action,
          ticketCode: ticket.ticketCode,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );

    if (response.ok) {
      setTicketActionStatus((current) => ({
        ...current,
        [ticket.ticketCode]:
          action === "regenerate"
            ? "Ticket regenerated."
            : "Ticket sent.",
      }));
      await loadTicketData(ticket.ticketCode);
      return;
    }

    setTicketActionStatus((current) => ({
      ...current,
      [ticket.ticketCode]: "Action failed.",
    }));
  }

  async function downloadTicket(
    ticket: GuestTicket,
    targetWindow?: Window | null,
  ) {
    if (!booking) {
      return;
    }

    const ticketWindow = targetWindow ?? window.open("", "_blank");

    if (!ticketWindow) {
      setTicketActionStatus((current) => ({
        ...current,
        [ticket.ticketCode]: "Please allow pop-ups to open ticket.",
      }));
      return;
    }

    ticketWindow.opener = null;
    setTicketActionStatus((current) => ({
      ...current,
      [ticket.ticketCode]: "Preparing PDF...",
    }));

    try {
      const pdfInput = resolveDownloadableTicketPdfInput({
        booking,
        tableColour,
        ticket,
        show,
        venueSettings: venueConfig,
      });
      const pdfBlob = await createDownloadableTicketPdf(pdfInput);
      const pdfUrl = URL.createObjectURL(pdfBlob);

      ticketWindow.location.href = pdfUrl;
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 30000);
      setTicketActionStatus((current) => ({
        ...current,
        [ticket.ticketCode]: "PDF opened.",
      }));
    } catch (error) {
      ticketWindow.close();
      if (error instanceof TicketPdfDataError) {
        console.error("[Zingara ticket PDF] Missing ticket data", {
          bookingReference: booking.reference,
          missingFields: error.missingFields,
          ticketCode: ticket.ticketCode,
        });
      } else {
        console.error("[Zingara ticket PDF] Ticket PDF generation failed", {
          bookingReference: booking.reference,
          error,
          ticketCode: ticket.ticketCode,
        });
      }
      setTicketActionStatus((current) => ({
        ...current,
        [ticket.ticketCode]:
          "Ticket PDF could not be prepared. Please contact Guest Services.",
      }));
    }
  }

  return (
    <main className="min-h-screen bg-black px-5 py-10 text-white">
      <header className="mx-auto mb-6 flex max-w-4xl justify-start">
        <nav
          aria-label="Live ticket navigation"
          className="flex items-center"
        >
          <button
            type="button"
            onClick={handleTicketExit}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#D8C36A]/40 bg-[#D8C36A]/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#F3E5A0] transition hover:border-[#F3E5A0] hover:bg-[#D8C36A]/20"
          >
            Back
          </button>
        </nav>
      </header>
      <section className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-[#D8C36A]/40 bg-[radial-gradient(circle_at_top,#2B1D0B_0%,#101010_48%,#050505_100%)] shadow-2xl shadow-[#8D7A2F]/15">
        <div className="border-b border-[#D8C36A]/25 px-6 py-6 sm:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#D8C36A]">
            {venueConfig.ticketBranding.accentText ||
              venueConfig.venueName}
          </p>
          <div
            aria-label={venueConfig.brandTitle}
            className="mb-4 h-16 w-44 bg-contain bg-left bg-no-repeat"
            style={{
              backgroundImage: `url("${venueConfig.ticketBranding.ticketLogoUrl || venueConfig.logoUrl}")`,
            }}
          />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="mt-2 text-4xl font-bold sm:text-5xl">
                Live Digital Ticket
              </h1>
              <p className="mt-3 text-zinc-400">
                Individual guest tickets for attendance and check-in.
              </p>
            </div>
            {booking && booking.partySize > 1 && (
              <button
                type="button"
                onClick={() => setIsCustomising((current) => !current)}
                className="rounded-full border border-[#D8C36A]/40 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
              >
                Customise Tickets
              </button>
            )}
            {booking && (
              <button
                type="button"
                onClick={() => void enableBookingUpdates()}
                className="rounded-full border border-[#D8C36A]/40 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
              >
                Get Booking Updates
              </button>
            )}
          </div>
          {bookingUpdatesStatus && (
            <p className="mt-4 text-sm font-semibold text-emerald-300">
              {bookingUpdatesStatus}
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="p-8">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-zinc-300">
              Loading ticket...
            </div>
          </div>
        ) : error || !ticketState || !booking || !activeTicket ? (
          <div className="p-8">
            <div className="rounded-2xl border border-red-400/30 bg-red-950/20 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-300">
                Ticket Not Found
              </p>
              <p className="mt-3 text-zinc-300">
                {error ||
                  "No booking or ticket record matches this reference."}
              </p>
              <p className="mt-4 font-mono text-sm text-zinc-500">
                {reference}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_280px]">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${getTicketStateClasses(ticketState)}`}
                >
                  {ticketState}
                </span>
                <span className="rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">
                  Ticket {activeTicket.index} of {activeTicket.total}
                </span>
              </div>

              <h2 className="mt-6 text-3xl font-bold">
                {activeTicket.fullName || booking.customer.name || "Guest"}
              </h2>
              <p className="mt-2 text-zinc-400">
                {activeTicket.email || booking.customer.email || "No email"} ·{" "}
                {activeTicket.mobile || booking.customer.phone || "No phone"}
              </p>

              <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Booking Reference
                  </p>
                  <p className="mt-2 font-mono text-sm text-[#D8C36A]">
                    {booking.reference}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Show
                  </p>
                  <p className="mt-2 font-semibold">
                    {getCompactShowDateTime(show ?? undefined)}
                  </p>
                </div>
                {ticketLocationOption && (
                  <>
                    <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        Location
                      </p>
                      <p className="mt-2 font-semibold">
                        {ticketLocationOption.city}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        Court
                      </p>
                      <p className="mt-2 font-semibold">
                        {ticketLocationOption.courtName}
                      </p>
                    </div>
                  </>
                )}
                <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Seating
                  </p>
                  <p className="mt-2 font-semibold">
                    {booking.zoneTitle}
                  </p>
                </div>
                {guestVisibleTable && (
                  <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Table
                    </p>
                    <p className="mt-2 font-semibold">
                      {guestVisibleTable}
                    </p>
                  </div>
                )}
                <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Table Colour
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <span
                      className="h-5 w-5 rounded-full border"
                      style={{
                        backgroundColor: tableColour.background,
                        borderColor: tableColour.border,
                      }}
                    />
                    <span className="font-semibold">
                      {tableColour.label}
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-5 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Payment Status
                  </p>
                  <p className="mt-2 font-semibold">
                    {paymentStatus
                      ? paymentStatusLabels[paymentStatus]
                      : "Pending Payment"}
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-[#D8C36A]/25 bg-black/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
                  Payment Summary
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  {includedBookingFeeBreakdown && (
                    <>
                      Ticket{" "}
                      {formatCurrency(
                        includedBookingFeeBreakdown.ticketAmount,
                      )}{" "}
                      · Booking Fee{" "}
                      {formatCurrency(
                        includedBookingFeeBreakdown.bookingFee,
                      )}{" "}
                      ·{" "}
                    </>
                  )}
                  Paid {formatCurrency(booking.amountPaid ?? 0)} · Balance{" "}
                  {formatCurrency(booking.balanceDue ?? 0)}
                </p>
                <p className="mt-3 text-xs text-zinc-500">
                  {venueConfig.ticketBranding.footerNote}
                </p>
              </div>

              {isCustomising && (
                <div className="mt-6 rounded-2xl border border-[#D8C36A]/25 bg-black/35 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#F2D66C]">
                    Customise Tickets
                  </p>
                  <div className="mt-4 space-y-4">
                    {guestTickets.map((ticket) => {
                      const isReadOnly = ticket.status === "checked-in";
                      const isOpen = openTicketCode === ticket.ticketCode;
                      const form = ticketForms[ticket.ticketCode] ?? {
                        email: ticket.email ?? "",
                        fullName: ticket.fullName,
                        mobile: ticket.mobile ?? "",
                      };

                      return (
                        <div
                          key={ticket.ticketCode}
                          className="overflow-hidden rounded-2xl border border-white/10 bg-black/30"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setOpenTicketCode((currentCode) =>
                                currentCode === ticket.ticketCode
                                  ? null
                                  : ticket.ticketCode,
                              )
                            }
                            className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-white/5"
                            aria-expanded={isOpen}
                          >
                            <span>
                              <span className="block font-semibold text-white">
                                Ticket {ticket.index} of {ticket.total}
                              </span>
                              <span className="mt-1 block text-xs text-zinc-400">
                                {ticket.fullName} · {ticket.ticketCode}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.12em] text-zinc-300">
                                {isReadOnly ? "Checked In" : "Editable"}
                              </span>
                              <span className="text-lg text-[#F2D66C]">
                                {isOpen ? "−" : "+"}
                              </span>
                            </span>
                          </button>

                          {isOpen && (
                            <div className="border-t border-white/10 p-4">
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <input
                                  value={form.fullName}
                                  readOnly={isReadOnly}
                                  onChange={(event) =>
                                    setTicketForms((current) => ({
                                      ...current,
                                      [ticket.ticketCode]: {
                                        ...form,
                                        fullName: event.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="Full Name"
                                  className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm read-only:opacity-60"
                                />
                                <input
                                  value={form.email}
                                  readOnly={isReadOnly}
                                  onChange={(event) =>
                                    setTicketForms((current) => ({
                                      ...current,
                                      [ticket.ticketCode]: {
                                        ...form,
                                        email: event.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="Email Address"
                                  className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm read-only:opacity-60"
                                />
                                <input
                                  value={form.mobile}
                                  readOnly={isReadOnly}
                                  onChange={(event) =>
                                    setTicketForms((current) => ({
                                      ...current,
                                      [ticket.ticketCode]: {
                                        ...form,
                                        mobile: event.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="Mobile Number"
                                  className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm read-only:opacity-60"
                                />
                              </div>

                              <div className="mt-4 space-y-3">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={
                                      isReadOnly ||
                                      isTicketActionBusy(ticket.ticketCode)
                                    }
                                    onClick={() => void saveTicket(ticket)}
                                    className="rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-black transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {ticketActionStatus[ticket.ticketCode] ===
                                    "Saving..."
                                      ? "Saving..."
                                      : "Save"}
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={isTicketActionBusy(
                                      ticket.ticketCode,
                                    )}
                                    onClick={() => void downloadTicket(ticket)}
                                    className="rounded-full border border-[#D8C36A]/40 px-4 py-2 text-xs font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black disabled:cursor-wait disabled:opacity-50"
                                  >
                                    {ticketActionStatus[ticket.ticketCode] ===
                                    "Preparing PDF..."
                                      ? "Preparing..."
                                      : "Download Ticket"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isTicketActionBusy(
                                      ticket.ticketCode,
                                    )}
                                    onClick={() =>
                                      void runTicketAction(ticket, "email")
                                    }
                                    className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white hover:text-black disabled:cursor-wait disabled:opacity-50"
                                  >
                                    {ticketActionStatus[ticket.ticketCode] ===
                                    "Sending..."
                                      ? "Sending..."
                                      : "Email Ticket"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isTicketActionBusy(
                                      ticket.ticketCode,
                                    )}
                                    onClick={() =>
                                      void runTicketAction(ticket, "resend")
                                    }
                                    className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white hover:text-black disabled:cursor-wait disabled:opacity-50"
                                  >
                                    {ticketActionStatus[ticket.ticketCode] ===
                                    "Sending..."
                                      ? "Sending..."
                                      : "Resend Ticket"}
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={
                                      isReadOnly ||
                                      isTicketActionBusy(ticket.ticketCode)
                                    }
                                    onClick={() =>
                                      void runTicketAction(
                                        ticket,
                                        "regenerate",
                                      )
                                    }
                                    className="rounded-full border border-amber-300/35 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-200 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    Regenerate
                                  </button>
                                </div>
                              </div>

                              {ticketActionStatus[ticket.ticketCode] && (
                                <p className="mt-3 text-sm font-semibold text-emerald-300 transition-opacity">
                                  {ticketActionStatus[ticket.ticketCode]}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col items-center">
              <ScannableQrCode
                value={activeTicket.ticketCode}
                label="Scannable individual ticket QR code"
                logoUrl={venueConfig.faviconUrl}
              />
              <p className="mt-4 text-center text-sm font-semibold text-white">
                Ticket {activeTicket.index} of {activeTicket.total}
              </p>
              <p className="mt-2 break-all text-center font-mono text-xs text-zinc-400">
                {activeTicket.ticketCode}
              </p>
              <button
                type="button"
                onClick={() => void downloadTicket(activeTicket)}
                className="mt-5 rounded-full bg-[#D8C36A] px-5 py-3 text-xs font-bold text-black transition hover:bg-[#F2D66C]"
              >
                Download Ticket
              </button>
              {ticketActionStatus[activeTicket.ticketCode] && (
                <p className="mt-3 text-center text-sm font-semibold text-emerald-300">
                  {ticketActionStatus[activeTicket.ticketCode]}
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
