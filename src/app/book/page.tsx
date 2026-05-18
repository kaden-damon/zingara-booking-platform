"use client";

import { useEffect, useState } from "react";

import {
  type BookingAddon,
  type CommunicationRecord,
  type CustomerInfo,
  type DemoTable,
  type DemoWaitlistEntry,
  type PaymentOption,
  type PromoDiscountType,
  type DemoShow,
  type SeatingZone,
  createCommunicationRecord,
  createTablesForShow,
  createTicketCode,
  defaultVenueSettings,
  defaultShows,
  findBestAvailableTable,
  getConfiguredZoneDepositPercentage,
  getConfiguredZonePrice,
  getCommunicationTemplate,
  getShowLabel,
  getStoredCommunicationTemplates,
  getStoredDemoBookings,
  getStoredDemoShows,
  getStoredDemoTables,
  getStoredDemoWaitlist,
  getStoredVenueSettings,
  getTicketUrl,
  renderCommunicationTemplate,
  seatingZones,
  storeDemoBookings,
  storeDemoTables,
  storeDemoWaitlist,
} from "../../lib/zingaraDemo";

type SeatingOption = SeatingZone;
type PromoCode = {
  code: string;
  description: string;
  discountType: PromoDiscountType;
  value: number;
};

const calendarWeekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const calendarMonths = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const guestOptions = Array.from({ length: 21 }, (_, index) => index + 1);

const bookingAddons: BookingAddon[] = [
  {
    id: "vip-champagne",
    name: "VIP Champagne Package",
    price: 1250,
  },
  {
    id: "premium-wine",
    name: "Premium Wine Pairing",
    price: 890,
  },
  {
    id: "birthday-celebration",
    name: "Birthday Celebration Package",
    price: 750,
  },
  {
    id: "backstage-experience",
    name: "Backstage Experience",
    price: 1500,
  },
];

const promoCodes: PromoCode[] = [
  {
    code: "COUNTESS10",
    description: "10% Royal Countess guest saving",
    discountType: "percentage",
    value: 10,
  },
  {
    code: "ROYAL500",
    description: "R500 private table credit",
    discountType: "fixed",
    value: 500,
  },
  {
    code: "STAGE15",
    description: "15% elevated stage celebration rate",
    discountType: "percentage",
    value: 15,
  },
];

function isAvailableForParty(
  option: SeatingOption,
  guests: number,
) {
  return guests >= option.minGuests && guests <= option.maxGuests;
}

function getRemainingSeats(
  option: SeatingOption,
  selectedShowId: string,
  tables: DemoTable[],
) {
  return tables
    .filter(
      (table) =>
        table.showId === selectedShowId &&
        table.zoneId === option.id &&
        table.status === "available",
    )
    .reduce(
      (remainingSeats, table) =>
        remainingSeats + table.seatCapacity,
      0,
    );
}

function isAvailableForBooking(
  option: SeatingOption,
  guests: number,
  selectedShowId: string,
  tables: DemoTable[],
) {
  return (
    isAvailableForParty(option, guests) &&
    Boolean(
      findBestAvailableTable(
        tables,
        selectedShowId,
        option.id,
        guests,
      ),
    )
  );
}

function getAvailabilityMessage(
  isGroupSizeAvailable: boolean,
  hasEnoughInventory: boolean,
) {
  if (!isGroupSizeAvailable) {
    return "Not Available For This Group Size";
  }

  if (!hasEnoughInventory) {
    return "Not Enough Seats Remaining";
  }

  return "Available";
}

function createBookingReference() {
  return `ZNG-${Date.now().toString(36).toUpperCase()}-${Math.floor(
    Math.random() * 900 + 100,
  )}`;
}

function createWaitlistReference() {
  return `WLT-${Date.now().toString(36).toUpperCase()}-${Math.floor(
    Math.random() * 900 + 100,
  )}`;
}

function getQrCell(reference: string, index: number) {
  const charCode =
    reference.charCodeAt(index % reference.length) + index * 17;

  return charCode % 3 !== 0;
}

function formatCurrency(amount: number) {
  return `R${amount.toLocaleString()}`;
}

function getDynamicPriceMultiplier(
  selectedZone: SeatingOption | null,
  selectedShowId: string,
  tables: DemoTable[],
  partySize: number,
) {
  if (!selectedZone || !selectedShowId) {
    return 1;
  }

  const remainingSeats = getRemainingSeats(
    selectedZone,
    selectedShowId,
    tables,
  );

  if (remainingSeats > 0 && remainingSeats <= partySize * 2) {
    return 1.12;
  }

  if (partySize >= 8) {
    return 0.95;
  }

  return 1;
}

function getPromoCode(code: string) {
  const normalizedCode = code.trim().toUpperCase();

  return promoCodes.find((promo) => promo.code === normalizedCode);
}

function getDiscountAmount(
  promoCode: PromoCode | undefined,
  subtotal: number,
) {
  if (!promoCode) {
    return 0;
  }

  if (promoCode.discountType === "percentage") {
    return Math.round(subtotal * (promoCode.value / 100));
  }

  return Math.min(promoCode.value, subtotal);
}

function getMonthKey(dateValue: string) {
  const [year = "2026", month = "01"] = dateValue.split("-");

  return `${year}-${month.padStart(2, "0")}`;
}

function getMonthParts(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);

  return {
    monthIndex: month - 1,
    year,
  };
}

function getCalendarMonthLabel(monthKey: string) {
  const { monthIndex, year } = getMonthParts(monthKey);

  return `${calendarMonths[monthIndex] ?? "Show Month"} ${year}`;
}

function shiftMonth(monthKey: string, offset: number) {
  const { monthIndex, year } = getMonthParts(monthKey);
  const date = new Date(Date.UTC(year, monthIndex + offset, 1));

  return `${date.getUTCFullYear()}-${String(
    date.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

function getCalendarDays(monthKey: string) {
  const { monthIndex, year } = getMonthParts(monthKey);
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const daysInMonth = new Date(
    Date.UTC(year, monthIndex + 1, 0),
  ).getUTCDate();
  const leadingBlankDays = firstDay.getUTCDay();

  return [
    ...Array.from({ length: leadingBlankDays }, () => ""),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;

      return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(
        day,
      ).padStart(2, "0")}`;
    }),
  ];
}

function getDateDisplay(dateValue: string) {
  if (!dateValue) {
    return "Select a show date";
  }

  const [year, month, day] = dateValue.split("-");
  const monthName = calendarMonths[Number(month) - 1] ?? month;

  return `${monthName} ${Number(day)}, ${year}`;
}

export default function BookingPage() {
  const [shows, setShows] = useState<DemoShow[]>(defaultShows);
  const [venueSettings, setVenueSettings] = useState(
    defaultVenueSettings,
  );
  const [selectedShowId, setSelectedShowId] = useState("");
  const [selectedShowDate, setSelectedShowDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(
    getMonthKey(defaultShows[0]?.date ?? "2026-06-01"),
  );
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [partySize, setPartySize] = useState(2);
  const [selectedZone, setSelectedZone] =
    useState<SeatingOption | null>(null);
  const [isConfirmationOpen, setIsConfirmationOpen] =
    useState(false);
  const [customerInfo, setCustomerInfo] =
    useState<CustomerInfo>({
      name: "",
      email: "",
      phone: "",
    });
  const [waitlistInfo, setWaitlistInfo] =
    useState<CustomerInfo>({
      name: "",
      email: "",
      phone: "",
    });
  const [waitlistZoneId, setWaitlistZoneId] = useState("");
  const [waitlistNotes, setWaitlistNotes] = useState("");
  const [waitlistReference, setWaitlistReference] =
    useState<string | null>(null);
  const [bookingReference, setBookingReference] =
    useState<string | null>(null);
  const [allocatedTableNumber, setAllocatedTableNumber] =
    useState<string | null>(null);
  const [paymentOption, setPaymentOption] =
    useState<PaymentOption>("full");
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>(
    [],
  );
  const [tables, setTables] = useState<DemoTable[]>(() =>
    defaultShows.flatMap((show) => createTablesForShow(show.id)),
  );
  const venueConfig = venueSettings;

  const dynamicPriceMultiplier = getDynamicPriceMultiplier(
    selectedZone,
    selectedShowId,
    tables,
    partySize,
  );
  const configuredZonePrice = selectedZone
    ? getConfiguredZonePrice(venueConfig, selectedZone)
    : 0;
  const dynamicPricePerPerson = selectedZone
    ? Math.round(configuredZonePrice * dynamicPriceMultiplier)
    : 0;
  const selectedAddons = bookingAddons.filter((addon) =>
    selectedAddonIds.includes(addon.id),
  );
  const addonsTotal = selectedAddons.reduce(
    (sum, addon) => sum + addon.price,
    0,
  );
  const seatingSubtotal =
    selectedZone ? dynamicPricePerPerson * partySize : 0;
  const subtotal = seatingSubtotal + addonsTotal;
  const appliedPromoCode = getPromoCode(promoCodeInput);
  const discountAmount = getDiscountAmount(
    appliedPromoCode,
    subtotal,
  );
  const total = Math.max(subtotal - discountAmount, 0);
  const depositPercentage = selectedZone
    ? getConfiguredZoneDepositPercentage(
        venueConfig,
        selectedZone,
      )
    : venueConfig.operationalSettings.defaultDepositPercentage;
  const depositAmount = Math.ceil(
    total * (depositPercentage / 100),
  );
  const amountDueNow =
    paymentOption === "deposit" ? depositAmount : total;
  const balanceDue = Math.max(total - amountDueNow, 0);
  const selectedShow = shows.find(
    (show) => show.id === selectedShowId,
  );
  const showDateSet = new Set(shows.map((show) => show.date));
  const calendarDays = getCalendarDays(calendarMonth);
  const selectedDateShows = shows.filter(
    (show) => show.date === selectedShowDate,
  );
  const hasBookableSeatingOption =
    selectedShowId &&
    seatingZones.some((zone) =>
      isAvailableForBooking(
        zone,
        partySize,
        selectedShowId,
        tables,
      ),
    );
  const canJoinWaitlist =
    Boolean(selectedShowId) && !hasBookableSeatingOption;

  function resetBookingProgress() {
    setSelectedZone(null);
    setIsConfirmationOpen(false);
    setBookingReference(null);
    setAllocatedTableNumber(null);
    setWaitlistReference(null);
  }

  function selectShowDate(dateValue: string) {
    if (!showDateSet.has(dateValue)) {
      return;
    }

    setSelectedShowDate(dateValue);
    setSelectedShowId("");
    setIsCalendarOpen(false);
    resetBookingProgress();
  }

  function selectShowTime(showId: string) {
    setSelectedShowId(showId);
    resetBookingProgress();
  }

  function selectPartySize(nextPartySize: number) {
    setPartySize(nextPartySize);
    setIsConfirmationOpen(false);
    setBookingReference(null);
    setAllocatedTableNumber(null);
    setWaitlistReference(null);
    setSelectedZone((currentZone) =>
      currentZone &&
      !isAvailableForBooking(
        currentZone,
        nextPartySize,
        selectedShowId,
        tables,
      )
        ? null
        : currentZone,
    );
  }

  useEffect(() => {
    function loadShowInventory() {
      const nextShows = getStoredDemoShows();
      const nextTables = getStoredDemoTables();
      const nextVenueSettings = getStoredVenueSettings();

      setShows(nextShows);
      setTables(nextTables);
      setVenueSettings(nextVenueSettings);
      setCalendarMonth((currentMonth) =>
        nextShows.some((show) => getMonthKey(show.date) === currentMonth)
          ? currentMonth
          : getMonthKey(nextShows[0]?.date ?? defaultShows[0].date),
      );
    }

    const hydrationTimer = window.setTimeout(loadShowInventory, 0);

    window.addEventListener("storage", loadShowInventory);
    window.addEventListener(
      "zingara-demo-shows-updated",
      loadShowInventory,
    );
    window.addEventListener(
      "zingara-demo-tables-updated",
      loadShowInventory,
    );
    window.addEventListener(
      "zingara-demo-venue-settings-updated",
      loadShowInventory,
    );

    return () => {
      window.removeEventListener("storage", loadShowInventory);
      window.removeEventListener(
        "zingara-demo-shows-updated",
        loadShowInventory,
      );
      window.removeEventListener(
        "zingara-demo-tables-updated",
        loadShowInventory,
      );
      window.removeEventListener(
        "zingara-demo-venue-settings-updated",
        loadShowInventory,
      );
      window.clearTimeout(hydrationTimer);
    };
  }, []);

  function handleContinueBooking() {
    if (
      !selectedZone ||
      !selectedShowId ||
      !isAvailableForBooking(
        selectedZone,
        partySize,
        selectedShowId,
        tables,
      )
    ) {
      return;
    }

    setBookingReference(null);
    setAllocatedTableNumber(null);
    setIsConfirmationOpen(true);
  }

  function toggleAddon(addonId: string) {
    setSelectedAddonIds((currentAddonIds) =>
      currentAddonIds.includes(addonId)
        ? currentAddonIds.filter((currentId) => currentId !== addonId)
        : [...currentAddonIds, addonId],
    );
    setBookingReference(null);
    setAllocatedTableNumber(null);
  }

  function handleJoinWaitlist() {
    if (!selectedShowId || !selectedShow) {
      return;
    }

    const desiredZone = seatingZones.find(
      (zone) => zone.id === waitlistZoneId,
    );
    const reference = createWaitlistReference();
    const entry: DemoWaitlistEntry = {
      id: reference,
      showId: selectedShowId,
      desiredZoneId: desiredZone?.id,
      desiredZoneTitle: desiredZone?.title,
      partySize,
      customer: waitlistInfo,
      notes: waitlistNotes,
      status: "waiting",
      createdAt: new Date().toISOString(),
    };

    const nextWaitlist = [entry, ...getStoredDemoWaitlist()];

    storeDemoWaitlist(nextWaitlist);
    setWaitlistReference(reference);
  }

  function handleFakePayment() {
    if (
      !selectedZone ||
      !selectedShow ||
      !isAvailableForBooking(
        selectedZone,
        partySize,
        selectedShow.id,
        tables,
      )
    ) {
      return;
    }

    const allocatedTable = findBestAvailableTable(
      tables,
      selectedShow.id,
      selectedZone.id,
      partySize,
    );

    if (!allocatedTable) {
      return;
    }

    const reference = createBookingReference();
    const createdAt = new Date().toISOString();
    const booking = {
      reference,
      showId: selectedShow.id,
      zoneId: selectedZone.id,
      zoneTitle: selectedZone.title,
      tableId: allocatedTable.id,
      tableNumber: allocatedTable.tableNumber,
      partySize,
      bookingDate: `${selectedShow.date} ${selectedShow.time}`,
      addons: selectedAddons,
      addonsTotal,
      subtotalPrice: subtotal,
      discountAmount,
      totalPrice: total,
      pricePerPerson: dynamicPricePerPerson,
      paymentOption,
      depositPercentage,
      amountPaid: amountDueNow,
      balanceDue,
      promoCode: appliedPromoCode?.code,
      promoLabel: appliedPromoCode?.description,
      source: "online" as const,
      ticketCode: createTicketCode(reference),
      ticketIssuedAt: createdAt,
      customer: customerInfo,
      status: "confirmed" as const,
      communicationHistory: [],
      createdAt,
    };
    const communicationTemplates = getStoredCommunicationTemplates();
    const bookingConfirmationTemplate = getCommunicationTemplate(
      communicationTemplates,
      "booking-confirmation",
      "email",
    );
    const paymentConfirmationTemplate = getCommunicationTemplate(
      communicationTemplates,
      "payment-confirmation",
      "email",
    );
    const communicationHistory: CommunicationRecord[] = [
      bookingConfirmationTemplate
        ? createCommunicationRecord({
            booking,
            channel: bookingConfirmationTemplate.channel,
            message: renderCommunicationTemplate(
              bookingConfirmationTemplate.body,
              booking,
              selectedShow,
            ),
            sentAt: createdAt,
            subject: renderCommunicationTemplate(
              bookingConfirmationTemplate.subject,
              booking,
              selectedShow,
            ),
            templateId: bookingConfirmationTemplate.id,
            trigger: "booking-confirmation",
          })
        : undefined,
      paymentConfirmationTemplate
        ? createCommunicationRecord({
            booking,
            channel: paymentConfirmationTemplate.channel,
            message: renderCommunicationTemplate(
              paymentConfirmationTemplate.body,
              booking,
              selectedShow,
            ),
            sentAt: createdAt,
            subject: renderCommunicationTemplate(
              paymentConfirmationTemplate.subject,
              booking,
              selectedShow,
            ),
            templateId: paymentConfirmationTemplate.id,
            trigger: "payment-confirmation",
          })
        : undefined,
    ].filter(
      (record): record is CommunicationRecord =>
        record !== undefined,
    );
    const nextBookings = [
      {
        ...booking,
        communicationHistory,
      },
      ...getStoredDemoBookings(),
    ];
    const nextTables = tables.map((table) =>
      table.id === allocatedTable.id
        ? {
            ...table,
            status: "booked" as const,
            bookingReference: reference,
            guestNotes:
              customerInfo.name || table.guestNotes
                ? `${customerInfo.name} ${table.guestNotes}`.trim()
                : table.guestNotes,
          }
        : table,
    );

    storeDemoBookings(nextBookings);
    storeDemoTables(nextTables);
    setTables(nextTables);
    setAllocatedTableNumber(allocatedTable.tableNumber);
    setBookingReference(reference);
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-16">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-6xl font-bold mb-2">
          Book Your Experience
        </h1>

        <p className="text-zinc-400 text-2xl mb-14">
          {venueConfig.subtitle}
        </p>

        <div className="space-y-10">
          <div className="relative">
            <p className="mb-3 text-lg text-zinc-300">
              Select Show Date
            </p>

            <button
              type="button"
              onClick={() =>
                setIsCalendarOpen((currentValue) => !currentValue)
              }
              className="flex w-full flex-col rounded-2xl border border-[#8D7A2F]/45 bg-zinc-950 px-5 py-4 text-left shadow-2xl shadow-black/20 transition hover:border-[#D8C36A]/70 sm:flex-row sm:items-center sm:justify-between"
            >
              <span>
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">
                  Date
                </span>
                <span className="mt-1 block text-2xl font-bold text-white">
                  {getDateDisplay(selectedShowDate)}
                </span>
              </span>
              <span className="mt-4 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300 sm:mt-0">
                {isCalendarOpen ? "Close Calendar" : "Open Calendar"}
              </span>
            </button>

            {isCalendarOpen && (
              <div className="absolute left-0 right-0 z-40 mt-4 max-w-xl rounded-[2rem] border border-[#D8C36A]/35 bg-[#070505] p-5 shadow-2xl shadow-[#8D7A2F]/25">
                <div className="mb-5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      setCalendarMonth((currentMonth) =>
                        shiftMonth(currentMonth, -1),
                      )
                    }
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-xl text-zinc-300 transition hover:border-[#D8C36A] hover:text-[#F2D66C]"
                    aria-label="Previous month"
                  >
                    ‹
                  </button>
                  <p className="text-xl font-bold text-white">
                    {getCalendarMonthLabel(calendarMonth)}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setCalendarMonth((currentMonth) =>
                        shiftMonth(currentMonth, 1),
                      )
                    }
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-xl text-zinc-300 transition hover:border-[#D8C36A] hover:text-[#F2D66C]"
                    aria-label="Next month"
                  >
                    ›
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {calendarWeekdays.map((weekday) => (
                    <p
                      key={weekday}
                      className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500"
                    >
                      {weekday}
                    </p>
                  ))}

                  {calendarDays.map((dateValue, index) => {
                    if (!dateValue) {
                      return (
                        <span
                          key={`blank-${index}`}
                          className="aspect-square rounded-2xl"
                        />
                      );
                    }

                    const day = Number(dateValue.split("-")[2]);
                    const isAvailableDate = showDateSet.has(dateValue);
                    const isSelectedDate =
                      selectedShowDate === dateValue;

                    return (
                      <button
                        key={dateValue}
                        type="button"
                        disabled={!isAvailableDate}
                        onClick={() => selectShowDate(dateValue)}
                        className={`aspect-square rounded-2xl border text-lg font-semibold transition ${
                          isSelectedDate
                            ? "border-white bg-[#D8C36A] text-black shadow-[0_0_28px_rgba(216,195,106,0.35)]"
                            : isAvailableDate
                            ? "border-[#D8C36A]/45 bg-[#1A1208] text-[#F2D66C] hover:scale-[1.03] hover:border-[#F2D66C]"
                            : "cursor-not-allowed border-white/5 bg-zinc-900/60 text-zinc-700"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#D8C36A]" />
                    Available
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                    Unavailable
                  </span>
                </div>
              </div>
            )}
          </div>

          {selectedShowDate && (
            <div>
              <p className="mb-3 text-lg text-zinc-300">
                Available Show Times
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {selectedDateShows.map((show) => {
                  const isSelectedTime = selectedShowId === show.id;

                  return (
                    <button
                      key={show.id}
                      type="button"
                      onClick={() => selectShowTime(show.id)}
                      className={`rounded-2xl border p-5 text-left transition ${
                        isSelectedTime
                          ? "border-white bg-[#D8C36A] text-black shadow-[0_0_28px_rgba(216,195,106,0.25)]"
                          : "border-[#8D7A2F]/35 bg-zinc-950 text-white hover:border-[#D8C36A] hover:bg-[#171006]"
                      }`}
                    >
                      <span className="block text-3xl font-bold">
                        {show.time}
                      </span>
                      <span className="mt-2 block text-sm font-semibold uppercase tracking-[0.13em] opacity-75">
                        {show.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedShowId && (
            <>

          <div>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-lg text-zinc-300">
                  Party Size
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  Choose 1 to 21 guests. Seating rules update instantly.
                </p>
              </div>

              <div className="inline-flex items-center rounded-full border border-[#8D7A2F]/35 bg-zinc-950 p-1">
                <button
                  type="button"
                  onClick={() => selectPartySize(Math.max(1, partySize - 1))}
                  className="grid h-10 w-10 place-items-center rounded-full text-xl text-zinc-300 transition hover:bg-white hover:text-black"
                  aria-label="Decrease guests"
                >
                  −
                </button>
                <span className="min-w-24 px-4 text-center text-xl font-bold text-[#F2D66C]">
                  {partySize} {partySize === 1 ? "Guest" : "Guests"}
                </span>
                <button
                  type="button"
                  onClick={() => selectPartySize(Math.min(21, partySize + 1))}
                  className="grid h-10 w-10 place-items-center rounded-full text-xl text-zinc-300 transition hover:bg-white hover:text-black"
                  aria-label="Increase guests"
                >
                  +
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2 rounded-[2rem] border border-white/10 bg-zinc-950 p-3 sm:grid-cols-11">
              {guestOptions.map((guestCount) => (
                <button
                  key={guestCount}
                  type="button"
                  onClick={() => selectPartySize(guestCount)}
                  className={`aspect-square rounded-2xl border text-sm font-bold transition sm:text-base ${
                    partySize === guestCount
                      ? "border-white bg-[#D8C36A] text-black shadow-[0_0_24px_rgba(216,195,106,0.24)]"
                      : "border-white/10 bg-black text-zinc-300 hover:border-[#D8C36A]/70 hover:text-white"
                  }`}
                >
                  {guestCount}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block mb-6 text-zinc-300 text-lg">
              Seating Experience
            </label>

            <div className="relative overflow-hidden rounded-[2rem] border border-[#8D7A2F]/40 bg-[radial-gradient(circle_at_center,#23170F_0%,#0A0506_58%,#000_100%)] p-4 shadow-2xl shadow-[#8D7A2F]/10 sm:p-8">
              <div className="absolute inset-x-12 top-8 h-px bg-gradient-to-r from-transparent via-[#D8C36A]/50 to-transparent" />
              <div className="absolute inset-y-10 left-8 w-px bg-gradient-to-b from-transparent via-[#D8C36A]/35 to-transparent" />
              <div className="absolute inset-y-10 right-8 w-px bg-gradient-to-b from-transparent via-[#D8C36A]/35 to-transparent" />

              <div className="relative mx-auto aspect-[1/1.12] max-w-[760px] rounded-[50%] border border-[#D8C36A]/30 bg-black/35 shadow-inner shadow-black">
                <div className="absolute inset-[8%] rounded-[50%] border border-dashed border-[#D8C36A]/20" />
                <div className="absolute inset-[18%] rounded-[50%] border border-dashed border-white/10" />

                <div className="absolute bottom-[7%] left-1/2 w-[54%] -translate-x-1/2 rounded-t-[999px] border border-[#D8C36A]/45 bg-gradient-to-t from-[#6E141F] to-[#1B070A] px-6 py-5 text-center shadow-[0_0_45px_rgba(216,195,106,0.18)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#D8C36A]">
                    Main Stage
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {venueConfig.brandTitle}
                  </p>
                </div>

                {seatingZones.map((option) => {
                  const remainingSeats = getRemainingSeats(
                    option,
                    selectedShowId,
                    tables,
                  );
                  const isGroupSizeAvailable =
                    isAvailableForParty(option, partySize);
                  const hasEnoughInventory = Boolean(
                    findBestAvailableTable(
                      tables,
                      selectedShowId,
                      option.id,
                      partySize,
                    ),
                  );
                  const isAvailable =
                    isGroupSizeAvailable && hasEnoughInventory;
                  const availabilityMessage =
                    getAvailabilityMessage(
                      isGroupSizeAvailable,
                      hasEnoughInventory,
                    );
                  const isSelected =
                    selectedZone?.id === option.id;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={!isAvailable}
                      onPointerDown={() => {
                        setSelectedZone(option);
                        setIsConfirmationOpen(false);
                        setBookingReference(null);
                        setAllocatedTableNumber(null);
                      }}
                      onClick={() => {
                        setSelectedZone(option);
                        setIsConfirmationOpen(false);
                        setBookingReference(null);
                        setAllocatedTableNumber(null);
                      }}
                      className={`
                        absolute
                        ${option.mapClass}
                        ${option.colour}
                        border
                        p-3
                        text-center
                        shadow-2xl
                        ${option.glowClass}
                        transition
                        focus:outline-none
                        focus-visible:ring-4
                        focus-visible:ring-white
                        sm:p-5
                        ${
                          isAvailable
                            ? "cursor-pointer hover:z-20 hover:scale-[1.035] hover:brightness-125"
                            : "cursor-not-allowed grayscale opacity-45"
                        }
                        ${
                          isSelected
                            ? "z-30 scale-[1.035] ring-4 ring-white brightness-125"
                            : ""
                        }
                      `}
                    >
                      <span
                        className={`mx-auto mb-2 block h-2.5 w-2.5 rounded-full ${
                          isAvailable
                            ? "bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.95)]"
                            : "bg-zinc-400"
                        }`}
                      />

                      <span className="block text-base font-bold leading-tight sm:text-2xl">
                        {option.title}
                      </span>

                      <span className="mt-1 block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-zinc-200 sm:text-xs">
                        {remainingSeats} seats
                      </span>

                      <span className="mt-2 block text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-300 sm:text-xs">
                        {availabilityMessage}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6">
              {seatingZones.map((option) => {
                const remainingSeats = getRemainingSeats(
                  option,
                  selectedShowId,
                  tables,
                );
                const isGroupSizeAvailable = isAvailableForParty(
                  option,
                  partySize,
                );
                const hasEnoughInventory = Boolean(
                  findBestAvailableTable(
                    tables,
                    selectedShowId,
                    option.id,
                    partySize,
                  ),
                );
                const isAvailable =
                  isGroupSizeAvailable && hasEnoughInventory;
                const availabilityMessage =
                  getAvailabilityMessage(
                    isGroupSizeAvailable,
                    hasEnoughInventory,
                  );
                  const configuredPrice = getConfiguredZonePrice(
                    venueConfig,
                  option,
                );

                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => {
                      setSelectedZone(option);
                      setIsConfirmationOpen(false);
                      setBookingReference(null);
                      setAllocatedTableNumber(null);
                    }}
                    className={`
                      ${option.colour}
                      border
                      rounded-2xl
                      p-6
                      text-left
                      transition
                      ${
                        isAvailable
                          ? "hover:scale-[1.01] cursor-pointer"
                          : "grayscale opacity-45 cursor-not-allowed"
                      }

                      ${
                        selectedZone?.id === option.id
                          ? "ring-4 ring-white"
                          : ""
                      }
                    `}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className="text-3xl font-semibold mb-2">
                          {option.title}
                        </h2>

                        <p className="text-zinc-200 mb-4">
                          {option.subtitle}
                        </p>
                      </div>

                      {!isAvailable && (
                        <p className="rounded-full border border-zinc-500 bg-black/40 px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-200">
                          {availabilityMessage}
                        </p>
                      )}
                    </div>

                    <p className="text-zinc-300 mb-6">
                      {option.description}
                    </p>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <p className="text-2xl font-bold">
                        R{configuredPrice.toLocaleString()} pp
                      </p>

                      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-200">
                        {remainingSeats} Seats Remaining
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
            </>
          )}

          {!selectedShowId && (
            <div className="rounded-2xl border border-[#8D7A2F]/35 bg-zinc-950 p-8 text-zinc-400">
              Choose a show date and time to view live seating
              availability.
            </div>
          )}

          {canJoinWaitlist && (
            <section className="rounded-[2rem] border border-[#D8C36A]/40 bg-[radial-gradient(circle_at_top,#24180D_0%,#111_48%,#050505_100%)] p-8 shadow-2xl shadow-[#8D7A2F]/10">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                Waitlist
              </p>
              <h2 className="text-3xl font-bold">
                Join The Waitlist
              </h2>
              <p className="mt-3 text-zinc-400">
                No valid tables are currently available for this
                show and party size. Leave your details and the box
                office can promote or convert your request when a
                table opens.
              </p>

              <form
                className="mt-6 grid grid-cols-1 gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleJoinWaitlist();
                }}
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label>
                    <span className="mb-2 block text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
                      Full Name
                    </span>
                    <input
                      required
                      value={waitlistInfo.name}
                      onChange={(event) =>
                        setWaitlistInfo((currentInfo) => ({
                          ...currentInfo,
                          name: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-lg"
                    />
                  </label>

                  <label>
                    <span className="mb-2 block text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
                      Email
                    </span>
                    <input
                      required
                      type="email"
                      value={waitlistInfo.email}
                      onChange={(event) =>
                        setWaitlistInfo((currentInfo) => ({
                          ...currentInfo,
                          email: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-lg"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label>
                    <span className="mb-2 block text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
                      Phone
                    </span>
                    <input
                      required
                      type="tel"
                      value={waitlistInfo.phone}
                      onChange={(event) =>
                        setWaitlistInfo((currentInfo) => ({
                          ...currentInfo,
                          phone: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-lg"
                    />
                  </label>

                  <label>
                    <span className="mb-2 block text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
                      Preferred Seating
                    </span>
                    <select
                      value={waitlistZoneId}
                      onChange={(event) =>
                        setWaitlistZoneId(event.target.value)
                      }
                      className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-lg"
                    >
                      <option value="">Any available zone</option>
                      {seatingZones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label>
                  <span className="mb-2 block text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
                    Guest Notes
                  </span>
                  <textarea
                    value={waitlistNotes}
                    onChange={(event) =>
                      setWaitlistNotes(event.target.value)
                    }
                    className="min-h-28 w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-lg"
                  />
                </label>

                {waitlistReference && (
                  <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/30 p-5">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">
                      Waitlist Request Saved
                    </p>
                    <p className="mt-2 text-2xl font-bold">
                      Reference: {waitlistReference}
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={Boolean(waitlistReference)}
                  className="rounded-full bg-white px-8 py-4 text-xl font-semibold text-black transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {waitlistReference
                    ? "Waitlist Request Stored"
                    : "Join Waitlist"}
                </button>
              </form>
            </section>
          )}

          {selectedZone && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 mt-10">
              <h2 className="text-3xl font-bold mb-6">
                Booking Summary
              </h2>

              <div className="space-y-3 text-lg">
                <p>
                  <span className="text-zinc-400">
                    Show:
                  </span>{" "}
                  {getShowLabel(selectedShow)}
                </p>

                <p>
                  <span className="text-zinc-400">
                    Experience:
                  </span>{" "}
                  {selectedZone.title}
                </p>

                <p>
                  <span className="text-zinc-400">
                    Party Size:
                  </span>{" "}
                  {partySize} Guests
                </p>

                <p>
                  <span className="text-zinc-400">
                    Price Per Person:
                  </span>{" "}
                  {formatCurrency(dynamicPricePerPerson)}
                  {dynamicPriceMultiplier !== 1 && (
                    <span className="ml-2 text-sm text-[#D8C36A]">
                      Dynamic rate
                    </span>
                  )}
                </p>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                  <p className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
                    Optional Add-Ons
                  </p>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {bookingAddons.map((addon) => {
                      const isSelected = selectedAddonIds.includes(
                        addon.id,
                      );

                      return (
                        <label
                          key={addon.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                            isSelected
                              ? "border-[#D8C36A] bg-[#D8C36A]/10"
                              : "border-white/10 bg-zinc-950 hover:border-[#D8C36A]/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleAddon(addon.id)}
                            className="mt-1 h-4 w-4 accent-[#D8C36A]"
                          />
                          <span>
                            <span className="block font-semibold text-white">
                              {addon.name}
                            </span>
                            <span className="mt-1 block text-sm text-zinc-400">
                              {formatCurrency(addon.price)}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-700">
                  <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <span className="mb-3 block text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
                        Payment Option
                      </span>
                      <select
                        value={paymentOption}
                        onChange={(event) =>
                          setPaymentOption(
                            event.target.value as PaymentOption,
                          )
                        }
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3"
                      >
                        <option value="full">
                          Pay In Full Today
                        </option>
                        <option value="deposit">
                          Deposit Only ({depositPercentage}%)
                        </option>
                      </select>
                    </label>

                    <label className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <span className="mb-3 block text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
                        Promo Code
                      </span>
                      <input
                        value={promoCodeInput}
                        onChange={(event) =>
                          setPromoCodeInput(event.target.value)
                        }
                        placeholder="COUNTESS10"
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 uppercase"
                      />
                      {promoCodeInput &&
                        (appliedPromoCode ? (
                          <span className="mt-2 block text-sm text-emerald-300">
                            {appliedPromoCode.description}
                          </span>
                        ) : (
                          <span className="mt-2 block text-sm text-amber-200">
                            Promo code not recognized.
                          </span>
                        ))}
                    </label>
                  </div>

                  <div className="mb-4 space-y-2 text-base text-zinc-300">
                    <p>
                      Seating: {formatCurrency(seatingSubtotal)}
                    </p>
                    {addonsTotal > 0 && (
                      <p>
                        Add-Ons: {formatCurrency(addonsTotal)}
                      </p>
                    )}
                    <p>
                      Subtotal: {formatCurrency(subtotal)}
                    </p>
                    {discountAmount > 0 && (
                      <p className="text-emerald-300">
                        Discount: -{formatCurrency(discountAmount)}
                      </p>
                    )}
                    <p>
                      Due Today: {formatCurrency(amountDueNow)}
                    </p>
                    {balanceDue > 0 && (
                      <p>
                        Balance Due Later:{" "}
                        {formatCurrency(balanceDue)}
                      </p>
                    )}
                  </div>
                  <p className="text-3xl font-bold">
                    Total: {formatCurrency(total)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleContinueBooking}
                className="mt-8 bg-white text-black px-8 py-4 rounded-full text-xl font-semibold hover:opacity-90 transition"
              >
                Continue Booking
              </button>
            </div>
          )}
        </div>
      </div>

      {isConfirmationOpen && selectedZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 py-10 backdrop-blur-sm">
          <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-[#8D7A2F]/50 bg-[radial-gradient(circle_at_top,#2A1710_0%,#111_46%,#050505_100%)] p-8 shadow-[0_0_80px_rgba(216,195,106,0.18)]">
            <div className="flex flex-col gap-4 border-b border-[#8D7A2F]/30 pb-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                  Confirm Your Evening
                </p>

                <h2 className="text-4xl font-bold">
                  Booking Confirmation
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsConfirmationOpen(false)}
                className="self-start rounded-full border border-white/20 px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300 transition hover:bg-white hover:text-black"
              >
                Close
              </button>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Seating Zone
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {selectedZone.title}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Booking Date
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {getShowLabel(selectedShow)}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Party Size
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {partySize} Guests
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Total Price
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {formatCurrency(total)}
                </p>
                {discountAmount > 0 && (
                  <p className="mt-2 text-sm text-emerald-300">
                    {formatCurrency(discountAmount)} promo
                    discount applied
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-5 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Add-Ons
                </p>
                {selectedAddons.length === 0 ? (
                  <p className="mt-2 text-zinc-400">
                    No optional extras selected.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedAddons.map((addon) => (
                      <span
                        key={addon.id}
                        className="rounded-full border border-[#D8C36A]/30 bg-black/40 px-3 py-1 text-sm text-[#F2D66C]"
                      >
                        {addon.name} · {formatCurrency(addon.price)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-5 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Payment Plan
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {paymentOption === "deposit"
                    ? `${depositPercentage}% Deposit`
                    : "Full Payment"}
                </p>
                <p className="mt-2 text-zinc-300">
                  Due today: {formatCurrency(amountDueNow)}
                  {balanceDue > 0 &&
                    ` · Balance due: ${formatCurrency(balanceDue)}`}
                </p>
              </div>
            </div>

            <form
              className="mt-8 space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                handleFakePayment();
              }}
            >
              <h3 className="text-2xl font-bold">
                Customer Information
              </h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
                    Full Name
                  </span>
                  <input
                    required
                    value={customerInfo.name}
                    onChange={(e) =>
                      setCustomerInfo((current) => ({
                        ...current,
                        name: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-lg"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
                    Email
                  </span>
                  <input
                    required
                    type="email"
                    value={customerInfo.email}
                    onChange={(e) =>
                      setCustomerInfo((current) => ({
                        ...current,
                        email: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-lg"
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
                    Phone
                  </span>
                  <input
                    required
                    type="tel"
                    value={customerInfo.phone}
                    onChange={(e) =>
                      setCustomerInfo((current) => ({
                        ...current,
                        phone: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-lg"
                  />
                </label>
              </div>

              {bookingReference && (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/30 p-5">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">
                      Payment Approved
                    </p>
                      <p className="mt-2 text-2xl font-bold">
                        Reference: {bookingReference}
                      </p>
                      <p className="mt-2 text-zinc-200">
                        Paid Today: {formatCurrency(amountDueNow)}
                      </p>
                      {balanceDue > 0 && (
                        <p className="mt-1 text-zinc-300">
                          Balance Due: {formatCurrency(balanceDue)}
                        </p>
                      )}
                    {allocatedTableNumber && (
                      <p className="mt-2 text-zinc-200">
                        Allocated Table: {allocatedTableNumber}
                      </p>
                    )}
                  </div>

                  <div className="rounded-[1.5rem] border border-[#D8C36A]/45 bg-black p-6 shadow-[0_0_45px_rgba(216,195,106,0.16)]">
                    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                          Digital Ticket
                        </p>
                        <h4 className="mt-2 text-3xl font-bold">
                          Zingara
                        </h4>
                        <div className="mt-4 space-y-2 text-zinc-300">
                          <p>
                            <span className="text-zinc-500">
                              Guest:
                            </span>{" "}
                            {customerInfo.name}
                          </p>
                          <p>
                            <span className="text-zinc-500">
                              Show:
                            </span>{" "}
                            {getShowLabel(selectedShow)}
                          </p>
                          <p>
                            <span className="text-zinc-500">
                              Zone:
                            </span>{" "}
                            {selectedZone.title}
                          </p>
                          <p>
                            <span className="text-zinc-500">
                              Table:
                            </span>{" "}
                            {allocatedTableNumber}
                          </p>
                          {selectedAddons.length > 0 && (
                            <p>
                              <span className="text-zinc-500">
                                Add-Ons:
                              </span>{" "}
                              {selectedAddons
                                .map((addon) => addon.name)
                                .join(", ")}
                            </p>
                          )}
                          <p>
                            <span className="text-zinc-500">
                              Paid:
                            </span>{" "}
                            {formatCurrency(amountDueNow)}
                          </p>
                          {balanceDue > 0 && (
                            <p>
                              <span className="text-zinc-500">
                                Balance:
                              </span>{" "}
                              {formatCurrency(balanceDue)}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/15 bg-white p-3">
                        <div className="grid grid-cols-9 gap-1">
                          {Array.from({ length: 81 }).map(
                            (_, index) => (
                              <span
                                key={index}
                                className={`h-3 w-3 ${
                                  getQrCell(
                                    bookingReference,
                                    index,
                                  )
                                    ? "bg-black"
                                    : "bg-white"
                                }`}
                              />
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="mt-5 border-t border-white/10 pt-4 font-mono text-sm text-zinc-400">
                      {createTicketCode(bookingReference)}
                    </p>
                    <a
                      href={getTicketUrl(bookingReference)}
                      className="mt-4 inline-flex rounded-full border border-[#D8C36A]/40 px-5 py-3 text-sm font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                    >
                      Open Live Ticket
                    </a>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={!selectedShow || Boolean(bookingReference)}
                className="w-full rounded-full bg-white px-8 py-4 text-xl font-semibold text-black transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {bookingReference
                  ? "Booking Stored"
                  : "Fake Payment And Confirm Booking"}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
