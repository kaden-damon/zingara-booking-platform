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

export default function BookingPage() {
  const [shows, setShows] = useState<DemoShow[]>(defaultShows);
  const [venueSettings, setVenueSettings] = useState(
    defaultVenueSettings,
  );
  const [selectedShowId, setSelectedShowId] = useState("");
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

  useEffect(() => {
    function loadShowInventory() {
      const nextShows = getStoredDemoShows();
      const nextTables = getStoredDemoTables();
      const nextVenueSettings = getStoredVenueSettings();

      setShows(nextShows);
      setTables(nextTables);
      setVenueSettings(nextVenueSettings);
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
          <div>
            <label
              htmlFor="show"
              className="block mb-3 text-zinc-300 text-lg"
            >
              Select Show Date & Time
            </label>

            <select
              id="show"
              value={selectedShowId}
              onChange={(e) => {
                setSelectedShowId(e.target.value);
                setSelectedZone(null);
                setIsConfirmationOpen(false);
                setBookingReference(null);
                setAllocatedTableNumber(null);
                setWaitlistReference(null);
              }}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-2xl p-5 text-lg"
            >
              <option value="">Choose a show</option>
              {shows.map((show) => (
                <option key={show.id} value={show.id}>
                  {getShowLabel(show)}
                </option>
              ))}
            </select>
          </div>

          {selectedShowId && (
            <>

          <div>
            <label className="block mb-3 text-zinc-300 text-lg">
              Party Size
            </label>

            <select
              value={partySize}
              onChange={(e) => {
                const nextPartySize = Number(e.target.value);

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
              }}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-2xl p-5 text-lg"
            >
              <option value={2}>2 Guests</option>
              <option value={4}>4 Guests</option>
              <option value={6}>6 Guests</option>
              <option value={8}>8 Guests</option>
              <option value={10}>10 Guests</option>
              <option value={12}>12 Guests</option>
              <option value={16}>16 Guests</option>
            </select>
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
