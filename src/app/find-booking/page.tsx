"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type PayFastCheckoutResponse = {
  actionUrl?: string;
  error?: string;
  fields?: Record<string, boolean | number | string | null | undefined>;
  mode?: "live" | "sandbox";
};

type FoundTicket = {
  email?: string;
  fullName: string;
  index: number;
  mobile?: string;
  status: "checked-in" | "valid" | "void";
  ticketCode: string;
  total: number;
};

type FoundBooking = {
  balanceDue: number;
  bookingReference: string;
  bookingStatus: string;
  customer: {
    email: string;
    name: string;
    phone: string;
  };
  date: string;
  partySize: number;
  paymentStatus: string;
  paymentStatusLabel: string;
  seatingZone: string;
  show: string;
  table: string;
  ticketStatus: string;
  time: string;
  totalAmount: number;
  venue: string;
};

type LookupResult = {
  booking: FoundBooking;
  tickets: FoundTicket[];
};

type EntryLocationKey = "cape-town" | "johannesburg";

function normalizeEntryLocation(
  value: string | null | undefined,
): EntryLocationKey | null {
  const normalisedValue = value?.trim().toLowerCase();

  if (
    normalisedValue === "johannesburg" ||
    normalisedValue === "joburg"
  ) {
    return "johannesburg";
  }

  if (normalisedValue === "cape-town" || normalisedValue === "cape town") {
    return "cape-town";
  }

  return null;
}

function getEntryLocationLabel(location: EntryLocationKey | null) {
  return location === "johannesburg" ? "Johannesburg" : "Cape Town";
}

function submitPayFastCheckoutForm(
  actionUrl: string,
  fields: NonNullable<PayFastCheckoutResponse["fields"]>,
) {
  const form = document.createElement("form");

  form.action = actionUrl;
  form.method = "POST";
  form.style.display = "none";

  for (const [name, value] of Object.entries(fields)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    const input = document.createElement("input");

    input.name = name;
    input.type = "hidden";
    input.value = String(value);
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

function formatCurrency(amount: number) {
  return `R${Math.max(0, amount).toLocaleString()}`;
}

function formatDate(date: string) {
  if (!date) {
    return "To be confirmed";
  }

  const parsedDate = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return parsedDate.toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function getTicketUrl(
  ticketCode: string,
  location: EntryLocationKey | null,
  action?: "download",
) {
  const returnTo = location
    ? `/find-booking?location=${location}`
    : "/find-booking";
  const params = new URLSearchParams({
    returnTo,
  });

  if (action === "download") {
    params.set("download", "1");
  }

  return `/ticket/${encodeURIComponent(ticketCode)}?${params.toString()}`;
}

export default function FindBookingPage() {
  const [bookingReference, setBookingReference] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [verificationType, setVerificationType] = useState<"email" | "mobile">(
    "email",
  );
  const [isSearching, setIsSearching] = useState(false);
  const [isContinuingPayment, setIsContinuingPayment] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [lookupMessage, setLookupMessage] = useState("");
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});
  const [selectedEntryLocation, setSelectedEntryLocation] =
    useState<EntryLocationKey | null>(null);

  const hasPendingPayment =
    result?.booking.bookingStatus === "pending-payment" ||
    result?.booking.paymentStatus === "pending-payment";

  function isTicketActionBusy(ticketCode: string) {
    const status = actionStatus[ticketCode] ?? "";

    return (
      status.endsWith("...") ||
      status === "Emailing ticket..." ||
      status === "Resending ticket..."
    );
  }

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const locationFromQuery = normalizeEntryLocation(
      searchParams.get("location"),
    );
    const locationFromStorage = normalizeEntryLocation(
      window.localStorage.getItem("zingara-selected-location"),
    );
    const nextLocation = locationFromQuery ?? locationFromStorage;

    if (nextLocation) {
      setSelectedEntryLocation(nextLocation);
      window.localStorage.setItem(
        "zingara-selected-location",
        nextLocation,
      );
    }
  }, []);

  async function findBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSearching(true);
    setLookupMessage("");
    setResult(null);

    try {
      const response = await fetch("/api/find-booking", {
        body: JSON.stringify({
          bookingReference,
          emailAddress: verificationType === "email" ? emailAddress : undefined,
          location: selectedEntryLocation,
          mobileNumber: verificationType === "mobile" ? mobileNumber : undefined,
          verificationType,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json()) as
        | LookupResult
        | { error?: string };

      if (!response.ok || "error" in payload || !("booking" in payload)) {
        setLookupMessage(
          "We couldn't locate a booking matching those details.",
        );
        return;
      }

      setResult(payload as LookupResult);
    } catch {
      setLookupMessage(
        "We couldn't locate a booking matching those details.",
      );
    } finally {
      setIsSearching(false);
    }
  }

  async function sendTicketAction(ticket: FoundTicket, action: "email" | "resend") {
    setActionStatus((current) => ({
      ...current,
      [ticket.ticketCode]: action === "email" ? "Emailing ticket..." : "Resending ticket...",
    }));

    try {
      const response = await fetch(
        `/api/tickets/${encodeURIComponent(ticket.ticketCode)}`,
        {
          body: JSON.stringify({
            action,
            ticketCode: ticket.ticketCode,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error("Ticket could not be sent.");
      }

      setActionStatus((current) => ({
        ...current,
        [ticket.ticketCode]:
          action === "email" ? "Ticket emailed." : "Ticket resent.",
      }));
    } catch {
      setActionStatus((current) => ({
        ...current,
        [ticket.ticketCode]: "Ticket could not be sent.",
      }));
    }
  }

  async function continuePayment() {
    if (!result || result.booking.balanceDue <= 0) {
      return;
    }

    setIsContinuingPayment(true);

    try {
      const response = await fetch("/api/payfast/checkout", {
        body: JSON.stringify({
          amount: result.booking.balanceDue,
          bookingReference: result.booking.bookingReference,
          customer: {
            email: result.booking.customer.email,
            name: result.booking.customer.name,
            phone: result.booking.customer.phone,
          },
          itemDescription: `${result.booking.show} · ${result.booking.seatingZone} · ${result.booking.partySize} guests`,
          itemName: "The Royal Countess Zingara Booking",
          section: result.booking.seatingZone,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const checkout = (await response.json()) as PayFastCheckoutResponse;

      if (!response.ok || !checkout.actionUrl || !checkout.fields) {
        throw new Error(
          checkout.error ?? "Payment could not be continued.",
        );
      }

      submitPayFastCheckoutForm(checkout.actionUrl, checkout.fields);
    } catch (error) {
      setLookupMessage(
        error instanceof Error
          ? error.message
          : "Payment could not be continued.",
      );
      setIsContinuingPayment(false);
    }
  }

  return (
    <main className="min-h-screen bg-black px-5 py-10 text-white sm:px-8">
      <section className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#D8C36A]">
            Guest Services
          </p>
          <h1 className="mt-4 font-serif text-4xl font-semibold text-white sm:text-6xl">
            Find My Booking
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
            Securely locate your booking using your booking reference and the
            contact detail used when booking.
          </p>
          {selectedEntryLocation && (
            <div className="mt-5 flex justify-center">
              <span className="inline-flex rounded-full border border-[#D8C36A]/35 bg-[#D8C36A]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#F2D66C]">
                {getEntryLocationLabel(selectedEntryLocation)}
              </span>
            </div>
          )}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <form
            onSubmit={findBooking}
            className="rounded-[1.5rem] border border-[#D8C36A]/25 bg-[#080808] p-5 shadow-2xl shadow-[#8D7A2F]/10 sm:p-7"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Verify Your Booking</h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Both fields must match your booking record.
                </p>
              </div>
              <span className="rounded-full border border-[#D8C36A]/30 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[#F2D66C]">
                Secure
              </span>
            </div>

            <label className="mt-6 block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Booking Reference
              <input
                required
                value={bookingReference}
                onChange={(event) => setBookingReference(event.target.value)}
                placeholder="ZNG-..."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-[#D8C36A]"
              />
            </label>

            <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/45 p-1">
              {[
                ["email", "Email Address"],
                ["mobile", "Mobile Number"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setVerificationType(value as "email" | "mobile")}
                  className={`rounded-xl px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                    verificationType === value
                      ? "bg-[#D8C36A] text-black"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {verificationType === "email" ? (
              <label className="mt-5 block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Email Address
                <input
                  required
                  type="email"
                  value={emailAddress}
                  onChange={(event) => setEmailAddress(event.target.value)}
                  placeholder="you@example.com"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-[#D8C36A]"
                />
              </label>
            ) : (
              <label className="mt-5 block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Mobile Number
                <input
                  required
                  inputMode="tel"
                  value={mobileNumber}
                  onChange={(event) => setMobileNumber(event.target.value)}
                  placeholder="+27..."
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-[#D8C36A]"
                />
              </label>
            )}

            <button
              type="submit"
              disabled={isSearching}
              className="mt-6 flex min-h-12 w-full items-center justify-center rounded-full bg-[#D8C36A] px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-black transition hover:bg-[#F2D66C] disabled:cursor-wait disabled:opacity-60"
            >
              {isSearching ? "Searching..." : "Find Booking"}
            </button>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/35 p-4 text-sm leading-6 text-zinc-400">
              Your booking reference and contact detail must both match before
              any booking information is shown.
            </div>
          </form>

          <section className="rounded-[1.5rem] border border-[#D8C36A]/25 bg-[radial-gradient(circle_at_top,#201405_0%,#080808_52%,#020202_100%)] p-5 shadow-2xl shadow-[#8D7A2F]/10 sm:p-7">
            {!result ? (
              <div className="flex min-h-[32rem] flex-col items-center justify-center text-center">
                <div className="grid h-16 w-16 place-items-center rounded-full border border-[#D8C36A]/35 bg-[#D8C36A]/10 text-2xl text-[#F2D66C]">
                  ?
                </div>
                <h2 className="mt-5 text-2xl font-semibold">
                  Your booking will appear here.
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-zinc-400">
                  Enter your verified booking details to view tickets, payment
                  status and booking information.
                </p>
                {lookupMessage && (
                  <div className="mt-6 rounded-2xl border border-red-400/25 bg-red-950/20 px-5 py-4 text-sm text-red-100">
                    {lookupMessage}
                  </div>
                )}
                <Link
                  href={
                    selectedEntryLocation
                      ? `/book?location=${selectedEntryLocation}`
                      : "/book"
                  }
                  className="mt-6 rounded-full border border-[#D8C36A]/40 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                >
                  Book Your Experience
                </Link>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#D8C36A]">
                      Booking Found
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold">
                      {result.booking.customer.name}
                    </h2>
                    <p className="mt-2 font-mono text-sm text-[#F2D66C]">
                      {result.booking.bookingReference}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/15 bg-black/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-200">
                    {result.booking.paymentStatusLabel}
                  </span>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    ["Show", result.booking.show],
                    ["Venue", result.booking.venue],
                    ["Date", formatDate(result.booking.date)],
                    ["Time", result.booking.time || "To be confirmed"],
                    ["Seating Zone", result.booking.seatingZone],
                    ["Table", result.booking.table],
                    ["Party Size", `${result.booking.partySize} guests`],
                    ["Ticket Status", result.booking.ticketStatus],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-white/10 bg-black/35 p-4"
                    >
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        {label}
                      </p>
                      <p className="mt-2 font-semibold text-white">{value}</p>
                    </div>
                  ))}
                </div>

                {hasPendingPayment && (
                  <div className="mt-5 rounded-2xl border border-[#D8C36A]/35 bg-[#D8C36A]/10 p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#F2D66C]">
                          Pending Payment
                        </p>
                        <p className="mt-2 text-sm text-zinc-300">
                          Outstanding balance:{" "}
                          {formatCurrency(result.booking.balanceDue)}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Secure online payment. Tickets are issued after
                          PayFast confirms payment.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isContinuingPayment}
                        onClick={() => void continuePayment()}
                        className="rounded-full bg-[#D8C36A] px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-black transition hover:bg-[#F2D66C] disabled:cursor-wait disabled:opacity-60"
                      >
                        {isContinuingPayment
                          ? "Opening PayFast..."
                          : "Continue Payment"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-7">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">
                    Guest Tickets
                  </h3>
                  {result.tickets.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-5 text-sm text-zinc-400">
                      Tickets will become available once payment has been
                      confirmed.
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {result.tickets.map((ticket) => (
                        <article
                          key={ticket.ticketCode}
                          className="rounded-2xl border border-white/10 bg-black/35 p-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-semibold text-white">
                                Ticket {ticket.index} of {ticket.total}
                              </p>
                              <p className="mt-1 text-sm text-zinc-400">
                                {ticket.fullName}
                              </p>
                              <p className="mt-2 break-all font-mono text-xs text-zinc-500">
                                {ticket.ticketCode}
                              </p>
                            </div>
                            <span className="w-fit rounded-full border border-white/15 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-300">
                              {ticket.status === "checked-in"
                                ? "Checked In"
                                : ticket.status === "void"
                                  ? "Reissued"
                                  : "Valid"}
                            </span>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {(() => {
                              const isBusy = isTicketActionBusy(
                                ticket.ticketCode,
                              );

                              return (
                                <>
                            <Link
                              href={getTicketUrl(
                                ticket.ticketCode,
                                selectedEntryLocation,
                              )}
                              target="_blank"
                              className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-zinc-300"
                            >
                              Open Live Ticket
                            </Link>
                            <Link
                              href={getTicketUrl(
                                ticket.ticketCode,
                                selectedEntryLocation,
                                "download",
                              )}
                              target="_blank"
                              className="rounded-full border border-[#D8C36A]/40 px-4 py-2 text-xs font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                            >
                              Download Ticket
                            </Link>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void sendTicketAction(ticket, "resend")}
                              className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white hover:text-black disabled:cursor-wait disabled:opacity-50"
                            >
                              {actionStatus[ticket.ticketCode] ===
                              "Resending ticket..."
                                ? "Resending..."
                                : "Resend Ticket"}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void sendTicketAction(ticket, "email")}
                              className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white hover:text-black disabled:cursor-wait disabled:opacity-50"
                            >
                              {actionStatus[ticket.ticketCode] ===
                              "Emailing ticket..."
                                ? "Emailing..."
                                : "Email Ticket Again"}
                            </button>
                                </>
                              );
                            })()}
                          </div>
                          {actionStatus[ticket.ticketCode] && (
                            <p className="mt-3 text-sm text-emerald-300">
                              {actionStatus[ticket.ticketCode]}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
