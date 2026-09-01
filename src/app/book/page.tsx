"use client";

import Link from "next/link";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import PaymentBrandMarks from "../components/PaymentBrandMarks";
import ScannableQrCode from "../components/ScannableQrCode";
import {
  registerZingaraPushSubscription,
} from "../../lib/browserNotifications";
import {
  bookingAddons,
  getDiscountAmount,
  getDynamicPriceMultiplier,
  getRemainingVenueSeatsForZone,
  legacyPromoCodes,
  normalizePromoCode,
  serviceFeeGuestThreshold,
  serviceFeeRate,
} from "../../lib/pricing";
import {
  corporatePartySizeThreshold,
  isCorporatePartySize,
} from "../../lib/bookingClassification";
import {
  type BookingCreateFieldErrors,
  getFirstBookingCreateError,
  getPublicBookingGuidance,
  validateBookingCreate,
} from "../../lib/bookingCreateValidation";
import {
  getBookingJourneyId,
  trackPlatformEvent,
  upsertPlatformPresence,
} from "../../lib/browserPlatformTelemetry";
import {
  createDownloadableTicketPdf,
  resolveDownloadableTicketPdfInput,
  TicketPdfDataError,
} from "../../lib/ticketPdf";
import { createBooking } from "../../lib/supabase/bookings";
import { getPublicShows } from "../../lib/supabase/shows";
import { getPublicVenueSettings } from "../../lib/supabase/venueSettings";
import { createWaitlistEntry } from "../../lib/supabase/waitlist";
import {
  type BookingAddon,
  type CustomerInfo,
  type DemoBooking,
  type DemoVenueSettings,
  type DemoWaitlistEntry,
  type GuestTicket,
  type PaymentOption,
  type PromoDiscountType,
  type DemoShow,
  type SeatingZone,
  isShortBookingReference,
  createTicketCode,
  calculateConfiguredDeposit,
  defaultVenueSettings,
  getConfiguredZoneDepositAmount,
  getConfiguredZonePrice,
  getCompactShowDateTime,
  getSouthAfricaShowTime,
  getTicketUrl,
  normalizeShowLocation,
  seatingZones,
} from "../../lib/zingaraDemo";
import { calculatePayFastTransactionAmounts } from "../../lib/payfast/transactionFee";

type SeatingOption = SeatingZone;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PayFastCheckoutResponse = {
  actionUrl?: string;
  error?: string;
  fields?: Record<string, boolean | number | string | null | undefined>;
  mode?: "live" | "sandbox";
};

type ZeroValueCompletionResponse = {
  booking?: DemoBooking;
  error?: string;
  status?: "already_confirmed" | "confirmed" | string;
  ticketCode?: string;
};

type PromoValidationPreview = {
  code: string | null;
  description: string | null;
  discountAmount: number;
  status: string;
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

type EntryLocationKey = "cape-town" | "johannesburg";

type PostPaymentStatus =
  | "idle"
  | "confirming"
  | "timeout"
  | "cancelled"
  | "failed";

type BookingStatusLookupRow = {
  amount_paid?: number;
  balance_outstanding?: number;
  booking_reference: string;
  booking_status: string;
  guest_count?: number;
  notes?: string | null;
  payment_status: string;
  total_amount?: number;
};

const bookingMetadataPrefix = "__zingara_booking_meta__:";

function parseReturnedBooking(
  row: BookingStatusLookupRow,
): DemoBooking | null {
  if (!row.notes?.startsWith(bookingMetadataPrefix)) {
    return null;
  }

  try {
    return JSON.parse(
      row.notes.slice(bookingMetadataPrefix.length),
    ) as DemoBooking;
  } catch {
    return null;
  }
}

function getPlatformTicketUrl(reference: string) {
  const ticketUrl = getTicketUrl(reference);

  if (typeof window === "undefined") {
    return ticketUrl;
  }

  const returnTo =
    `${window.location.pathname}${window.location.search}${window.location.hash}` ||
    "/book";
  const contextualTicketUrl = new URL(ticketUrl, window.location.origin);

  contextualTicketUrl.searchParams.set("returnTo", returnTo);

  return `${contextualTicketUrl.pathname}${contextualTicketUrl.search}`;
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

function getCurrentCalendarMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "Africa/Johannesburg",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  return year && month
    ? `${year}-${month}`
    : new Date().toISOString().slice(0, 7);
}
const bookingCalendarStatusOrder = [
  "special-event",
  "active",
  "sold-out",
  "blackout",
  "venue-closure",
] as const;
type BookingCalendarStatus =
  (typeof bookingCalendarStatusOrder)[number];
const bookingCalendarStatusLabels: Record<
  BookingCalendarStatus,
  string
> = {
  active: "Available",
  blackout: "Blackout",
  "sold-out": "Sold Out",
  "special-event": "Special Event",
  "venue-closure": "Venue Closed",
};
const bookingCalendarStatusClasses: Record<
  BookingCalendarStatus,
  string
> = {
  active:
    "border-[#D8C36A]/45 bg-[#1A1208] text-[#F2D66C] hover:scale-[1.03] hover:border-[#F2D66C]",
  blackout:
    "border-sky-300/35 bg-sky-950/25 text-sky-200",
  "sold-out":
    "border-red-300/35 bg-red-950/25 text-red-200",
  "special-event":
    "border-purple-300/45 bg-purple-950/30 text-purple-100 hover:scale-[1.03] hover:border-purple-200",
  "venue-closure":
    "border-zinc-500/35 bg-zinc-900/65 text-zinc-400",
};
const bookingCalendarLegend = bookingCalendarStatusOrder.map(
  (status) => ({
    label:
      status === "venue-closure"
        ? "Venue Closure"
        : bookingCalendarStatusLabels[status],
    status,
  }),
);
const boothsHotspotPath =
  "M198.92 0a198.92 198.92 0 1 0 0 397.84a198.92 198.92 0 1 0 0 -397.84ZM198.06 34.72a164.17 164.17 0 1 0 0 328.34a164.17 164.17 0 1 0 0 -328.34Z";
const middleRingHotspotPath =
  "M198.06 34.72a164.17 164.17 0 1 0 0 328.34a164.17 164.17 0 1 0 0 -328.34ZM306.52,199.47c0,60.04-48.67,108.71-108.71,108.71-56.45,0-102.86-43.03-108.2-98.09h83.19c.04.1.09.21.13.31,4.21,9.56,13.76,16.23,24.87,16.23,15,0,27.17-12.16,27.17-27.17s-12.16-27.17-27.17-27.17c-11,0-20.48,6.54-24.74,15.94h-83.4c5.62-54.77,51.89-97.49,108.14-97.49,60.04,0,108.71,48.67,108.71,108.71Z";
const elevatedStageHotspotPath =
  "M13.85,271.31l-.63-1.53C1.52,238.98-2.65,204.94,2.45,170.35c2.14-14.52,5.81-28.48,10.84-41.73l.56-1.16,84.1,32.31,72.38,14.46,25.97-14.57,36.11,12.67,5.07,30.41-4.43,26.61-43.98,7.47-19.18-25.54L13.85,271.31l84.1-32.31";
const goldenCircleHotspotPath =
  "M306.52,199.47c0,60.04-48.67,108.71-108.71,108.71-56.45,0-102.86-43.03-108.2-98.09h83.19c.04.1.09.21.13.31,4.21,9.56,13.76,16.23,24.87,16.23,15,0,27.17-12.16,27.17-27.17s-12.16-27.17-27.17-27.17c-11,0-20.48,6.54-24.74,15.94h-83.4c5.62-54.77,51.89-97.49,108.14-97.49,60.04,0,108.71,48.67,108.71,108.71Z";
const royalBalconyUpperHotspotPath =
  "M333.81,52.73c33.78,31.18,56.73,73.92,62.56,121.95h77.59V52.73h-140.15Z";
const royalBalconyLowerHotspotPath =
  "M390.95,250.95c-13.84,51.19-47.58,94.2-92.43,120.19h175.44v-120.19h-83Z";

function isAvailableForParty(
  option: SeatingOption,
  guests: number,
) {
  return guests >= option.minGuests && guests <= option.maxGuests;
}

function getRemainingSeats(
  option: SeatingOption,
  occupiedSeats: number,
  settings: DemoVenueSettings = defaultVenueSettings,
) {
  return getRemainingVenueSeatsForZone(option, occupiedSeats, settings);
}

function isAvailableForBooking(
  option: SeatingOption,
  guests: number,
  occupiedSeats = 0,
  settings: DemoVenueSettings = defaultVenueSettings,
) {
  return (
    isAvailableForParty(option, guests) &&
    getRemainingSeats(option, occupiedSeats, settings) >= guests
  );
}

function getAvailabilityMessage(
  isGroupSizeAvailable: boolean,
  hasEnoughVenueCapacity: boolean,
  isLimited = false,
) {
  if (!isGroupSizeAvailable) {
    return "Not Available For This Group Size";
  }

  if (!hasEnoughVenueCapacity) {
    return "Not Enough Seats Available";
  }

  if (isLimited) {
    return "Limited";
  }

  return "Available";
}

function getAvailabilityState(
  option: SeatingOption,
  guests: number,
  occupiedSeats: number,
  settings: DemoVenueSettings = defaultVenueSettings,
) {
  const remainingSeats = getRemainingSeats(option, occupiedSeats, settings);
  const isGroupSizeAvailable = isAvailableForParty(option, guests);
  const hasEnoughVenueCapacity = remainingSeats >= guests;
  const isAvailable = isGroupSizeAvailable && hasEnoughVenueCapacity;
  const isLimited =
    isAvailable && remainingSeats <= Math.max(guests * 2, 6);

  return {
    availabilityMessage: getAvailabilityMessage(
      isGroupSizeAvailable,
      hasEnoughVenueCapacity,
      isLimited,
    ),
    isAvailable,
    isGroupSizeAvailable,
    isLimited,
    remainingSeats,
  };
}

async function createBookingReference() {
  const response = await fetch("/api/bookings/reference", {
    cache: "no-store",
    headers: { Accept: "application/json" },
    method: "POST",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    reference?: string;
  };

  if (
    !response.ok ||
    !payload.reference ||
    !isShortBookingReference(payload.reference)
  ) {
    throw new Error(
      payload.error ?? "Booking reference could not be generated.",
    );
  }

  return payload.reference;
}

function createWaitlistReference() {
  return `WLT-${Date.now().toString(36).toUpperCase()}-${Math.floor(
    Math.random() * 900 + 100,
  )}`;
}

function getCurrencyCents(value: number) {
  return Math.round(Math.max(Number(value) || 0, 0) * 100);
}

function formatCurrency(amount: number) {
  return `R${amount.toLocaleString()}`;
}

function getPromoCode(code: string) {
  const normalizedCode = normalizePromoCode(code);

  return legacyPromoCodes.find((promo) => promo.code === normalizedCode);
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

function getGuestShowStatus(show: DemoShow): BookingCalendarStatus {
  const status = show.operationalStatus ?? "active";

  if (
    status === "blackout" ||
    status === "sold-out" ||
    status === "special-event" ||
    status === "venue-closure"
  ) {
    return status;
  }

  return "active";
}

function isGuestVisibleShow(show: DemoShow) {
  return (
    !show.archivedAt &&
    (show.operationalStatus ?? "active") !== "inactive"
  );
}

function isGuestBookableShow(show: DemoShow | undefined) {
  if (!show || !isGuestVisibleShow(show)) {
    return false;
  }

  const status = show.operationalStatus ?? "active";

  return status === "active" || status === "special-event";
}

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

function getShowVenueKey(show: DemoShow | undefined): EntryLocationKey | null {
  return normalizeShowLocation(show?.location ?? show?.venueName);
}

function getShowTimeValue(show: DemoShow) {
  return new Date(
    `${show.date}T${getSouthAfricaShowTime(show) || show.time || "00:00"}`,
  ).getTime();
}

function getDateCalendarStatus(
  showsForDate: DemoShow[],
): BookingCalendarStatus | undefined {
  const visibleShows = showsForDate.filter(isGuestVisibleShow);

  return bookingCalendarStatusOrder.find((status) =>
    visibleShows.some((show) => getGuestShowStatus(show) === status),
  );
}

function getCompactDateDisplay(dateValue: string) {
  if (!dateValue) {
    return "";
  }

  const [year, month, day] = dateValue.split("-");

  return `${day}/${month}/${year.slice(-2)}`;
}

function getCompactCustomerName(name: string) {
  const nameParts = name.trim().split(/\s+/).filter(Boolean);

  if (nameParts.length <= 1) {
    return nameParts[0] ?? "";
  }

  return `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.`;
}

function getBookingInstallState() {
  if (typeof window === "undefined") {
    return {
      isAndroid: false,
      isIOS: false,
      isStandalone: false,
    };
  }

  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };
  const userAgent = window.navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1);

  return {
    isAndroid: /Android/i.test(userAgent),
    isIOS,
    isStandalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      navigatorWithStandalone.standalone === true,
  };
}

export default function BookingPage() {
  const [shows, setShows] = useState<DemoShow[]>([]);
  const [showLoadStatus, setShowLoadStatus] = useState<
    "loading" | "success" | "error"
  >("loading");
  const [showLoadRetryToken, setShowLoadRetryToken] = useState(0);
  const [venueSettings, setVenueSettings] = useState(
    defaultVenueSettings,
  );
  const [selectedEntryLocation, setSelectedEntryLocation] =
    useState<EntryLocationKey | null>(null);
  const [selectedShowId, setSelectedShowId] = useState("");
  const [selectedShowDate, setSelectedShowDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(getCurrentCalendarMonth);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isBackToTopVisible, setIsBackToTopVisible] = useState(false);
  const [activeBookingStep, setActiveBookingStep] = useState(0);
  const [partySize, setPartySize] = useState(2);
  const [selectedZone, setSelectedZone] =
    useState<SeatingOption | null>(null);
  const [previewSeatingZone, setPreviewSeatingZone] =
    useState<SeatingOption | null>(null);
  const [isConfirmationOpen, setIsConfirmationOpen] =
    useState(false);
  const [customerInfo, setCustomerInfo] =
    useState<CustomerInfo>({
      name: "",
      email: "",
      phone: "",
    });
  const [customerNotes, setCustomerNotes] = useState("");
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
  const [ticketDownloadStatus, setTicketDownloadStatus] = useState("");
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [isStandaloneApp, setIsStandaloneApp] = useState(false);
  const [showTicketReadyPrompt, setShowTicketReadyPrompt] =
    useState(true);
  const [installPromptStatus, setInstallPromptStatus] = useState("");
  const [bookingUpdatesStatus, setBookingUpdatesStatus] = useState("");
  const [paymentOption, setPaymentOption] =
    useState<PaymentOption>("full");
  const [paymentRedirectStatus, setPaymentRedirectStatus] = useState("");
  const [customerValidationErrors, setCustomerValidationErrors] =
    useState<BookingCreateFieldErrors>({});
  const [postPaymentStatus, setPostPaymentStatus] =
    useState<PostPaymentStatus>("idle");
  const [postPaymentBookingReference, setPostPaymentBookingReference] =
    useState("");
  const [isPayFastRedirecting, setIsPayFastRedirecting] =
    useState(false);
  const [hasAcceptedBookingTerms, setHasAcceptedBookingTerms] =
    useState(false);
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [promoValidationPreview, setPromoValidationPreview] =
    useState<PromoValidationPreview | null>(null);
  const [isPromoValidationLoading, setIsPromoValidationLoading] =
    useState(false);
  const [selectedAddonIds] = useState<string[]>([]);
  const [occupiedSeatsByZone, setOccupiedSeatsByZone] = useState<
    Partial<Record<SeatingZone["id"], number>>
  >({});
  const confirmedSectionRef = useRef<HTMLElement | null>(null);
  const trackedTelemetryEventsRef = useRef<Set<string>>(new Set());
  const showLoadRequestRef = useRef(0);
  const hasScrolledToConfirmedRef = useRef(false);
  const venueConfig = venueSettings;

  const dynamicPriceMultiplier = getDynamicPriceMultiplier(
    selectedZone,
    partySize,
    selectedZone && selectedShowId
      ? getRemainingSeats(
          selectedZone,
          occupiedSeatsByZone[selectedZone.id] ?? 0,
          venueConfig,
        )
      : undefined,
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
  const fallbackPromoCode = getPromoCode(promoCodeInput);
  const appliedPromoCode =
    promoValidationPreview?.status === "valid"
      ? {
          code: promoValidationPreview.code ?? normalizePromoCode(promoCodeInput),
          description:
            promoValidationPreview.description ?? "Promo code accepted",
          discountType: "fixed" as const,
          value: promoValidationPreview.discountAmount,
        }
      : fallbackPromoCode;
  const discountAmount =
    promoValidationPreview?.status === "valid"
      ? promoValidationPreview.discountAmount
      : getDiscountAmount(fallbackPromoCode, subtotal);
  const discountedSubtotal = Math.max(subtotal - discountAmount, 0);
  const serviceFeeAmount =
    partySize >= serviceFeeGuestThreshold
      ? Math.round(discountedSubtotal * serviceFeeRate)
      : 0;
  const total = discountedSubtotal + serviceFeeAmount;
  const depositPerPerson = selectedZone
    ? getConfiguredZoneDepositAmount(venueConfig, selectedZone)
    : (venueConfig.operationalSettings.defaultDepositAmount ?? 0);
  const depositAmount = selectedZone
    ? calculateConfiguredDeposit(
        venueConfig,
        selectedZone,
        total,
        partySize,
      )
    : Math.min(total, depositPerPerson * partySize);
  const depositPercentage =
    total > 0 ? (depositAmount / total) * 100 : 100;
  const amountDueNow =
    paymentOption === "deposit" ? depositAmount : total;
  const payFastTransaction =
    calculatePayFastTransactionAmounts(amountDueNow);
  const balanceDue = Math.max(total - amountDueNow, 0);
  const selectedShow = shows.find(
    (show) => show.id === selectedShowId,
  );

  useEffect(() => {
    if (!selectedShow) {
      setOccupiedSeatsByZone({});
      return;
    }

    const controller = new AbortController();
    const authoritativeShowId = selectedShow.supabaseId ?? selectedShow.id;

    setOccupiedSeatsByZone({});
    fetch(
      `/api/shows/availability?showId=${encodeURIComponent(authoritativeShowId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Show availability could not be loaded.");
        }

        return (await response.json()) as {
          occupiedSeatsByZone?: Partial<Record<SeatingZone["id"], number>>;
        };
      })
      .then((payload) => {
        setOccupiedSeatsByZone(payload.occupiedSeatsByZone ?? {});
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.warn("[Zingara booking] Show availability unavailable", error);
        }
      });

    return () => controller.abort();
  }, [selectedShow]);

  useEffect(() => {
    const code = normalizePromoCode(promoCodeInput);

    if (!code || !selectedShow || subtotal <= 0) {
      setPromoValidationPreview(null);
      setIsPromoValidationLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setIsPromoValidationLoading(true);
      fetch("/api/promo-codes/validate", {
        body: JSON.stringify({
          code,
          location: selectedEntryLocation,
          showId: selectedShow.id,
          subtotal,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Promo validation failed.");
          }

          return (await response.json()) as PromoValidationPreview;
        })
        .then((preview) => {
          setPromoValidationPreview(preview);
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            console.warn("[Zingara Booking] Promo validation unavailable", error);
            setPromoValidationPreview(null);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsPromoValidationLoading(false);
          }
        });
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [promoCodeInput, selectedEntryLocation, selectedShow, subtotal]);

  const guestVisibleShows = shows.filter(isGuestVisibleShow);
  const locationVisibleShows = selectedEntryLocation
    ? guestVisibleShows.filter(
        (show) => getShowVenueKey(show) === selectedEntryLocation,
      )
    : guestVisibleShows;
  const showDateSet = new Set(
    locationVisibleShows.map((show) => show.date),
  );
  const calendarDays = getCalendarDays(calendarMonth);
  const selectedDateShows = locationVisibleShows.filter(
    (show) => show.date === selectedShowDate,
  );
  const selectedShowIsBookable = isGuestBookableShow(selectedShow);
  const hasBookableSeatingOption =
    selectedShowId &&
    selectedShowIsBookable &&
    seatingZones.some((zone) =>
      isAvailableForBooking(
        zone,
        partySize,
        occupiedSeatsByZone[zone.id] ?? 0,
        venueConfig,
      ),
    );
  const canJoinWaitlist =
    Boolean(selectedShowId) &&
    selectedShowIsBookable &&
    !hasBookableSeatingOption;
  const selectedShowTimeValue = selectedShow
    ? getShowTimeValue(selectedShow)
    : 0;
  function getRecommendedFutureShow() {
    if (!selectedShow) {
      return undefined;
    }

    return locationVisibleShows
      .filter(
        (show) =>
          show.id !== selectedShow.id &&
          getShowVenueKey(show) === getShowVenueKey(selectedShow) &&
          isGuestBookableShow(show) &&
          getShowTimeValue(show) > selectedShowTimeValue,
      )
      .sort((firstShow, secondShow) => {
        return getShowTimeValue(firstShow) - getShowTimeValue(secondShow);
      })[0];
  }
  const currentCustomerValidationErrors = validateBookingCreate({
    bookingSource: "online",
    customer: customerInfo,
    isCreate: true,
    isTrustedStaff: false,
    partySize,
  });
  const customerDetailsComplete =
    Object.keys(currentCustomerValidationErrors).length === 0;

  const publicBookingGuidance = getPublicBookingGuidance(
    currentCustomerValidationErrors,
  );

  function getCustomerFieldError(
    field: "email" | "name" | "phone",
    customer: CustomerInfo,
  ) {
    return validateBookingCreate({
      bookingSource: "online",
      customer,
      isCreate: true,
      isTrustedStaff: false,
      partySize,
    })[field];
  }

  function updateCustomerField(
    field: "email" | "name" | "phone",
    value: string,
  ) {
    const nextCustomer = { ...customerInfo, [field]: value };
    setCustomerInfo(nextCustomer);

    if (!customerValidationErrors[field]) {
      return;
    }

    const nextError = getCustomerFieldError(field, nextCustomer);
    setCustomerValidationErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };

      if (nextError) {
        nextErrors[field] = nextError;
      } else {
        delete nextErrors[field];
      }

      return nextErrors;
    });
  }

  function validateCustomerField(field: "email" | "name" | "phone") {
    const fieldError = getCustomerFieldError(field, customerInfo);

    setCustomerValidationErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };

      if (fieldError) {
        nextErrors[field] = fieldError;
      } else {
        delete nextErrors[field];
      }

      return nextErrors;
    });
  }

  function validatePublicCustomerDetails() {
    const errors = validateBookingCreate({
      bookingSource: "online",
      customer: customerInfo,
      isCreate: true,
      isTrustedStaff: false,
      partySize,
    });
    const firstError = getFirstBookingCreateError(errors);

    setCustomerValidationErrors(errors);

    if (!firstError) {
      return true;
    }

    setPaymentRedirectStatus(firstError);
    window.requestAnimationFrame(() => {
      const firstInvalidField = (["name", "phone", "email"] as const).find(
        (field) => errors[field],
      );
      const visibleInput = Array.from(
        document.querySelectorAll<HTMLInputElement>(
          `[data-booking-field="${firstInvalidField}"]`,
        ),
      ).find((input) => input.offsetParent !== null);

      visibleInput?.focus();
      visibleInput?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return false;
  }
  const showStepSummary = selectedShow
    ? `${getCompactDateDisplay(selectedShowDate)} · ${getSouthAfricaShowTime(selectedShow)}`
    : "";
  const seatingStepSummary = selectedZone ? selectedZone.title : "";
  const mobileSeatingStepSummary = selectedZone ? selectedZone.title : "";
  const paymentStepSummary = bookingReference
    ? paymentOption === "deposit"
      ? balanceDue > 0
        ? `Deposit Paid · ${formatCurrency(balanceDue)} Outstanding`
        : "Deposit Paid"
      : "Paid"
    : customerDetailsComplete
      ? `${formatCurrency(amountDueNow)} Due`
      : "";
  const shouldShowInstallOpportunity =
    !isStandaloneApp && (Boolean(installPrompt) || isIOSDevice);
  const activeProgressIndex = bookingReference ? 5 : activeBookingStep;

  function trackTelemetryEventOnce(
    key: string,
    input: Parameters<typeof trackPlatformEvent>[0],
  ) {
    if (trackedTelemetryEventsRef.current.has(key)) {
      return;
    }

    trackedTelemetryEventsRef.current.add(key);
    trackPlatformEvent(input);
  }

  function getTelemetryStage() {
    if (postPaymentStatus === "confirming") {
      return "Awaiting Payment Confirmation";
    }

    if (postPaymentStatus === "cancelled" || postPaymentStatus === "failed") {
      return "PayFast Return";
    }

    if (bookingReference) {
      return "Booking Complete";
    }

    if (isPayFastRedirecting) {
      return "Redirecting to PayFast";
    }

    if (activeBookingStep === 4) {
      return "Checkout";
    }

    if (activeBookingStep === 3) {
      return "Booking Details";
    }

    if (activeBookingStep === 2) {
      return "Selecting Seating";
    }

    if (activeBookingStep === 1) {
      return "Selecting Party Size";
    }

    return selectedEntryLocation ? "Selecting Date" : "Selecting Location";
  }

  const telemetryStage = getTelemetryStage();
  const bookingProgressSteps = [
    {
      isActive: activeProgressIndex === 0,
      isComplete: Boolean(selectedShowId),
      label: "Show",
      summary: showStepSummary,
    },
    {
      isActive: activeProgressIndex === 1,
      isComplete: Boolean(selectedShowId && partySize),
      label: "Guests",
      summary: selectedShowId
        ? `${partySize} ${partySize === 1 ? "Guest" : "Guests"}`
        : "",
    },
    {
      isActive: activeProgressIndex === 2,
      isComplete: Boolean(selectedZone),
      label: "Seating",
      mobileSummary: mobileSeatingStepSummary,
      summary: seatingStepSummary,
    },
    {
      isActive: activeProgressIndex === 3,
      isComplete: customerDetailsComplete,
      label: "Details",
      summary: getCompactCustomerName(customerInfo.name),
    },
    {
      isActive: activeProgressIndex === 4,
      isComplete: Boolean(bookingReference),
      label: "Payment",
      summary: paymentStepSummary,
    },
    {
      isActive: activeProgressIndex === 5,
      isComplete: Boolean(bookingReference),
      isSuccessSummary: Boolean(bookingReference),
      label: "Complete",
      summary: bookingReference ?? "",
    },
  ];
  const mobileTimelineOrderClasses = [
    "order-1",
    "order-2",
    "order-3",
    "order-6",
    "order-5",
    "order-4",
  ];

  function canNavigateBookingStep(stepIndex: number) {
    if (stepIndex === 0) {
      return true;
    }

    if (stepIndex === 1) {
      return Boolean(selectedShowId);
    }

    if (stepIndex === 2) {
      return Boolean(selectedShowId && partySize);
    }

    if (stepIndex === 3) {
      return Boolean(selectedZone);
    }

    if (stepIndex === 4) {
      return Boolean(selectedZone && customerDetailsComplete);
    }

    return Boolean(bookingReference);
  }

  function resetBookingProgress() {
    setSelectedZone(null);
    setPreviewSeatingZone(null);
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
    setActiveBookingStep(0);
    setIsCalendarOpen(false);
    resetBookingProgress();
  }

  function selectShowTime(showId: string) {
    const show = shows.find((currentShow) => currentShow.id === showId);

    if (!isGuestBookableShow(show)) {
      return;
    }

    setSelectedShowId(showId);
    setActiveBookingStep(1);
    resetBookingProgress();
  }

  function selectRecommendedShow(show: DemoShow) {
    setSelectedShowDate(show.date);
    setSelectedShowId(show.id);
    setCalendarMonth(getMonthKey(show.date));
    setActiveBookingStep(2);
    setPreviewSeatingZone(null);
    setIsConfirmationOpen(false);
    setBookingReference(null);
    setAllocatedTableNumber(null);
    setWaitlistReference(null);
  }

  function selectPartySize(nextPartySize: number) {
    if (isCorporatePartySize(nextPartySize)) {
      window.location.assign(
        `/corporate?guests=${Math.trunc(nextPartySize)}`,
      );
      return;
    }

    setPartySize(nextPartySize);
    setActiveBookingStep((currentStep) =>
      currentStep <= 1 ? 1 : currentStep,
    );
    setIsConfirmationOpen(false);
    setBookingReference(null);
    setAllocatedTableNumber(null);
    setWaitlistReference(null);
    setSelectedZone((currentZone) =>
      currentZone &&
      !isAvailableForBooking(
        currentZone,
        nextPartySize,
        occupiedSeatsByZone[currentZone.id] ?? 0,
        venueConfig,
      )
        ? null
        : currentZone,
    );
    setPreviewSeatingZone((currentZone) =>
      currentZone &&
      !isAvailableForBooking(
        currentZone,
        nextPartySize,
        occupiedSeatsByZone[currentZone.id] ?? 0,
        venueConfig,
      )
        ? null
        : currentZone,
    );
  }

  useEffect(() => {
    let isMounted = true;

    async function loadShowInventory() {
      const requestId = showLoadRequestRef.current + 1;
      showLoadRequestRef.current = requestId;
      setShowLoadStatus("loading");

      try {
        const [nextShows, nextVenueSettings] = await Promise.all([
          getPublicShows(),
          getPublicVenueSettings(),
        ]);

        if (!isMounted || requestId !== showLoadRequestRef.current) {
          return;
        }

        const nextGuestVisibleShows = nextShows.filter(isGuestVisibleShow);

        setShows(nextShows);
        setVenueSettings(nextVenueSettings);
        setSelectedShowId((currentShowId) =>
          nextGuestVisibleShows.some(
            (show) =>
              show.id === currentShowId && isGuestBookableShow(show),
          )
            ? currentShowId
            : "",
        );
        setSelectedShowDate((currentDate) =>
          nextGuestVisibleShows.some((show) => show.date === currentDate)
            ? currentDate
            : "",
        );
        setShowLoadStatus("success");
      } catch (error) {
        if (!isMounted || requestId !== showLoadRequestRef.current) {
          return;
        }

        console.warn("[Zingara booking] Show calendar unavailable", error);
        setShowLoadStatus("error");
      }
    }

    const hydrationTimer = window.setTimeout(loadShowInventory, 0);

    window.addEventListener("storage", loadShowInventory);
    window.addEventListener(
      "zingara-demo-shows-updated",
      loadShowInventory,
    );
    window.addEventListener(
      "zingara-demo-venue-settings-updated",
      loadShowInventory,
    );
    window.addEventListener(
      "zingara-demo-communication-templates-updated",
      loadShowInventory,
    );

    return () => {
      isMounted = false;
      showLoadRequestRef.current += 1;
      window.removeEventListener("storage", loadShowInventory);
      window.removeEventListener(
        "zingara-demo-shows-updated",
        loadShowInventory,
      );
      window.removeEventListener(
        "zingara-demo-venue-settings-updated",
        loadShowInventory,
      );
      window.removeEventListener(
        "zingara-demo-communication-templates-updated",
        loadShowInventory,
      );
      window.clearTimeout(hydrationTimer);
    };
  }, [showLoadRetryToken]);

  useEffect(() => {
    const mobilePortraitQuery = window.matchMedia(
      "(max-width: 767px) and (orientation: portrait)",
    );

    function updateBackToTopVisibility() {
      setIsBackToTopVisible(
        mobilePortraitQuery.matches && window.scrollY > 320,
      );
    }

    updateBackToTopVisibility();
    window.addEventListener("scroll", updateBackToTopVisibility, {
      passive: true,
    });
    mobilePortraitQuery.addEventListener(
      "change",
      updateBackToTopVisibility,
    );

    return () => {
      window.removeEventListener("scroll", updateBackToTopVisibility);
      mobilePortraitQuery.removeEventListener(
        "change",
        updateBackToTopVisibility,
      );
    };
  }, []);

  useEffect(() => {
    const installState = getBookingInstallState();

    setIsIOSDevice(installState.isIOS);
    setIsStandaloneApp(installState.isStandalone);

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setInstallPrompt(null);
      setIsStandaloneApp(true);
      setInstallPromptStatus("App installed. Enable notifications next.");
    }

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt,
    );
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const locationFromQuery = normalizeEntryLocation(
      searchParams.get("location"),
    );
    const locationFromStorage = normalizeEntryLocation(
      window.localStorage.getItem("zingara-selected-location"),
    );
    const nextLocation = locationFromQuery ?? locationFromStorage;
    const paymentState = searchParams.get("payment");
    const booking = searchParams.get("booking");

    if (nextLocation) {
      setSelectedEntryLocation(nextLocation);
      window.localStorage.setItem(
        "zingara-selected-location",
        nextLocation,
      );
    }

    if (paymentState === "cancelled") {
      setPostPaymentBookingReference(booking ?? "");
      setPostPaymentStatus("cancelled");
      setPaymentRedirectStatus("");
      trackPlatformEvent({
        bookingReference: booking,
        eventType: "payfast_returned",
        metadata: {
          paymentState,
          stage: "PayFast Return",
        },
      });
    }

    if (paymentState === "failed") {
      setPostPaymentBookingReference(booking ?? "");
      setPostPaymentStatus("failed");
      setPaymentRedirectStatus("");
      trackPlatformEvent({
        bookingReference: booking,
        eventType: "payfast_returned",
        metadata: {
          paymentState,
          stage: "PayFast Return",
        },
      });
    }

    if (paymentState === "return") {
      setPostPaymentBookingReference(booking ?? "");
      setPostPaymentStatus(booking ? "confirming" : "timeout");
      setPaymentRedirectStatus("");
      trackPlatformEvent({
        bookingReference: booking,
        eventType: "payfast_returned",
        metadata: {
          paymentState,
          stage: "Awaiting Payment Confirmation",
        },
      });
    }
  }, []);

  useEffect(() => {
    trackTelemetryEventOnce("journey-started", {
      eventType: "journey_started",
      metadata: {
        source: "public-booking",
        stage: "Browsing Shows",
      },
    });
  }, []);

  useEffect(() => {
    upsertPlatformPresence({
      currentArea: "Book",
      currentStage: telemetryStage,
      metadata: {
        location: selectedEntryLocation,
        stage: telemetryStage,
      },
    });
  }, [
    selectedEntryLocation,
    telemetryStage,
  ]);

  useEffect(() => {
    if (!selectedEntryLocation) {
      return;
    }

    trackTelemetryEventOnce(`location:${selectedEntryLocation}`, {
      eventType: "location_selected",
      metadata: {
        location: selectedEntryLocation,
      },
    });
  }, [selectedEntryLocation]);

  useEffect(() => {
    if (!selectedShowId || !selectedShow) {
      return;
    }

    trackTelemetryEventOnce(`show:${selectedShowId}`, {
      eventType: "show_selected",
      metadata: {
        location: getShowVenueKey(selectedShow),
      },
    });
  }, [selectedShow, selectedShowId]);

  useEffect(() => {
    if (!selectedZone) {
      return;
    }

    trackTelemetryEventOnce(`seating:${selectedZone.id}`, {
      eventType: "seating_selected",
      metadata: {
        section: selectedZone.title,
      },
    });
  }, [selectedZone]);

  useEffect(() => {
    if (!customerDetailsComplete) {
      return;
    }

    trackTelemetryEventOnce("guest-details-completed", {
      eventType: "guest_details_completed",
      metadata: {
        stage: "Booking Details",
      },
    });
  }, [customerDetailsComplete]);

  useEffect(() => {
    if (activeBookingStep !== 4 || !isConfirmationOpen) {
      return;
    }

    trackTelemetryEventOnce("checkout-viewed", {
      eventType: "checkout_viewed",
      metadata: {
        stage: "Checkout",
      },
    });
  }, [activeBookingStep, isConfirmationOpen]);

  useEffect(() => {
    if (!selectedEntryLocation) {
      return;
    }

    if (selectedShowId) {
      const selectedShowForLocation = shows.find(
        (show) => show.id === selectedShowId,
      );

      if (
        selectedShowForLocation &&
        getShowVenueKey(selectedShowForLocation) !== selectedEntryLocation
      ) {
        setSelectedShowId("");
        setSelectedZone(null);
        setPreviewSeatingZone(null);
      }
    }

    if (selectedShowDate && !showDateSet.has(selectedShowDate)) {
      setSelectedShowDate("");
    }
  }, [selectedEntryLocation, selectedShowDate, selectedShowId, showDateSet, shows]);

  useEffect(() => {
    if (
      postPaymentStatus !== "confirming" ||
      !postPaymentBookingReference
    ) {
      return;
    }

    let isActive = true;
    let elapsedMs = 0;

    async function checkBookingStatus() {
      try {
        const response = await fetch(
          `/api/admin/bookings?reference=${encodeURIComponent(
            postPaymentBookingReference,
          )}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          rows?: BookingStatusLookupRow[];
        };
        const row = payload.rows?.[0];

        if (!row) {
          return;
        }

        if (
          row.booking_status === "cancelled" ||
          row.payment_status === "failed" ||
          row.payment_status === "cancelled"
        ) {
          setPostPaymentStatus("failed");
          return;
        }

        const isConfirmed =
          row.booking_status === "confirmed" ||
          row.payment_status === "fully_paid" ||
          row.payment_status === "deposit_paid";

        if (!isConfirmed) {
          return;
        }

        const returnedBooking = parseReturnedBooking(row);

        if (returnedBooking) {
          const returnedShow = shows.find(
            (show) => show.id === returnedBooking.showId,
          );
          const returnedZone =
            seatingZones.find(
              (zone) => zone.id === returnedBooking.zoneId,
            ) ??
            seatingZones.find(
              (zone) => zone.title === returnedBooking.zoneTitle,
            ) ??
            null;

          if (returnedBooking.showId) {
            setSelectedShowId(returnedBooking.showId);
          }
          if (returnedShow) {
            setSelectedShowDate(returnedShow.date);
            setCalendarMonth(getMonthKey(returnedShow.date));
            setSelectedEntryLocation(getShowVenueKey(returnedShow));
          }
          setPartySize(returnedBooking.partySize);
          setSelectedZone(returnedZone);
          setPreviewSeatingZone(returnedZone);
          if (returnedBooking.customer) {
            setCustomerInfo(returnedBooking.customer);
          }
          setCustomerNotes(returnedBooking.operationalNotes ?? "");
          setPaymentOption(returnedBooking.paymentOption ?? "full");
          setAllocatedTableNumber(returnedBooking.tableNumber);
        } else {
          setPartySize(row.guest_count ?? partySize);
        }

        setBookingReference(row.booking_reference);
        setShowTicketReadyPrompt(true);
        setPostPaymentStatus("idle");
        setPaymentRedirectStatus("");
        setActiveBookingStep(4);
        setIsConfirmationOpen(true);
      } catch {
        // Stay in the reassuring state; timeout covers slow confirmation.
      }
    }

    void checkBookingStatus();

    const intervalId = window.setInterval(() => {
      if (!isActive) {
        return;
      }

      elapsedMs += 2000;

      if (elapsedMs >= 30000) {
        setPostPaymentStatus("timeout");
        window.clearInterval(intervalId);
        return;
      }

      void checkBookingStatus();
    }, 2000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [partySize, postPaymentBookingReference, postPaymentStatus, shows]);

  useEffect(() => {
    if (!bookingReference || !isConfirmationOpen) {
      hasScrolledToConfirmedRef.current = false;
      return;
    }

    if (hasScrolledToConfirmedRef.current) {
      return;
    }

    hasScrolledToConfirmedRef.current = true;
    window.requestAnimationFrame(() => {
      confirmedSectionRef.current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    });
  }, [bookingReference, isConfirmationOpen]);

  function handleContinueBooking() {
    if (
      !selectedZone ||
      !selectedShowId ||
      !isAvailableForBooking(
        selectedZone,
        partySize,
        occupiedSeatsByZone[selectedZone.id] ?? 0,
        venueConfig,
      )
    ) {
      return;
    }

    if (!validatePublicCustomerDetails()) {
      return;
    }

    setBookingReference(null);
    setAllocatedTableNumber(null);
    setHasAcceptedBookingTerms(false);
    setIsConfirmationOpen(true);
  }

  async function handleJoinWaitlist() {
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

    await createWaitlistEntry(entry);
    setWaitlistReference(reference);
  }

  async function handlePayFastCheckout() {
    if (isPayFastRedirecting) {
      return;
    }

    if (
      !selectedZone ||
      !selectedShow ||
      !isAvailableForBooking(
        selectedZone,
        partySize,
        occupiedSeatsByZone[selectedZone.id] ?? 0,
        venueConfig,
      )
    ) {
      return;
    }

    if (!validatePublicCustomerDetails()) {
      return;
    }

    if (!hasAcceptedBookingTerms) {
      setPaymentRedirectStatus(
        "Please agree to the Royal Decrees before continuing.",
      );
      return;
    }

    setIsPayFastRedirecting(true);
    setPaymentRedirectStatus(
      getCurrencyCents(amountDueNow) === 0
        ? "Completing your booking..."
        : "Preparing secure PayFast checkout...",
    );

    const journeyId = getBookingJourneyId();
    let reference = "";

    try {
      reference = await createBookingReference();
    } catch (error) {
      console.error("[Zingara Booking] Failed to generate booking reference", error);
      setIsPayFastRedirecting(false);
      setPaymentRedirectStatus(
        "We could not start your payment securely. Please try again.",
      );
      return;
    }

    const createdAt = new Date().toISOString();
    const booking = {
      reference,
      showId: selectedShow.id,
      zoneId: selectedZone.id,
      zoneTitle: selectedZone.title,
      tableId: "",
      tableNumber: "",
      partySize,
      bookingDate: `${selectedShow.date} ${getSouthAfricaShowTime(selectedShow)}`,
      addons: selectedAddons,
      addonsTotal,
      subtotalPrice: subtotal,
      discountAmount,
      serviceFeeAmount,
      totalPrice: total,
      pricePerPerson: dynamicPricePerPerson,
      paymentOption,
      paymentStatus: "pending-payment" as const,
      journeyId,
      depositPercentage,
      amountPaid: 0,
      balanceDue: total,
      promoCode: appliedPromoCode?.code,
      promoLabel: appliedPromoCode?.description,
      source: "online" as const,
      customer: customerInfo,
      status: "pending-payment" as const,
      lifecycleHistory: [
        {
          id: `${reference}-created`,
          toStatus: "new" as const,
          note: "Online booking created",
          createdAt,
        },
        {
          id: `${reference}-payment`,
          fromStatus: "new" as const,
          toStatus: "pending-payment" as const,
          note: "Awaiting PayFast payment",
          createdAt,
        },
      ],
      operationalNotes: customerNotes.trim(),
      cancellationReason: "",
      refundNotes: "",
      communicationHistory: [],
      createdAt,
      reservationTableClaims: [],
    };

    try {
      const persistedBooking = await createBooking(booking, journeyId);

      setAllocatedTableNumber(persistedBooking.tableNumber ?? null);

      if (getCurrencyCents(amountDueNow) === 0) {
        const response = await fetch("/api/bookings/complete-zero-value", {
          body: JSON.stringify({
            bookingReference: reference,
            journeyId,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        const completion = (await response.json()) as ZeroValueCompletionResponse;

        if (!response.ok || !completion.booking) {
          throw new Error(
            completion.error ?? "Booking could not be completed.",
          );
        }

        const confirmedBooking = completion.booking;

        setBookingReference(confirmedBooking.reference);
        setCustomerInfo(confirmedBooking.customer ?? customerInfo);
        setCustomerNotes(confirmedBooking.operationalNotes ?? customerNotes);
        setPaymentOption(confirmedBooking.paymentOption ?? paymentOption);
        setAllocatedTableNumber(
          confirmedBooking.tableNumber ??
            persistedBooking.tableNumber ??
            null,
        );
        setPaymentRedirectStatus("");
        setShowTicketReadyPrompt(true);
        setActiveBookingStep(4);
        setIsConfirmationOpen(true);
        trackPlatformEvent({
          bookingReference: confirmedBooking.reference,
          eventType: "payment_initiated",
          journeyId,
          metadata: {
            section: selectedZone.title,
            stage: "Zero-value booking completed",
            source: "zero-value-promo",
          },
        });
        setIsPayFastRedirecting(false);
        return;
      }

      const response = await fetch("/api/payfast/checkout", {
        body: JSON.stringify({
          amount: amountDueNow,
          bookingReference: reference,
          customer: customerInfo,
          itemDescription: `${selectedShow.label} · ${selectedZone.title} · ${partySize} guests`,
          itemName: "The Royal Countess Zingara Booking",
          journeyId,
          section: selectedZone.title,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const checkout = (await response.json()) as PayFastCheckoutResponse;

      if (!response.ok || !checkout.actionUrl || !checkout.fields) {
        throw new Error(
          checkout.error ?? "PayFast checkout could not be prepared.",
        );
      }

      setPaymentRedirectStatus("Redirecting to secure PayFast checkout...");
      trackPlatformEvent({
        bookingReference: reference,
        eventType: "payment_initiated",
        journeyId,
        metadata: {
          section: selectedZone.title,
          stage: "Redirecting to PayFast",
        },
      });
      submitPayFastCheckoutForm(checkout.actionUrl, checkout.fields);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "PayFast checkout could not be prepared.";
      const isAvailabilityConflict = message
        .toLowerCase()
        .includes("reserved by another guest");

      setPaymentRedirectStatus(
        isAvailabilityConflict
          ? message
          : `Payment could not be started. ${message}`,
      );
      trackPlatformEvent({
        bookingReference: reference || null,
        eventType: "journey_failed",
        journeyId,
        metadata: {
          stage: "Checkout",
          status: isAvailabilityConflict ? "availability-conflict" : "checkout-failed",
        },
        operation: "prepare_payfast_checkout",
        safeFingerprint: isAvailabilityConflict
          ? "public_booking_availability_conflict"
          : "public_booking_checkout_failed",
      });
      setIsPayFastRedirecting(false);
    }
  }

  async function installZingaraApp() {
    if (!installPrompt) {
      setInstallPromptStatus(
        isIOSDevice
          ? "Use Share, then Add to Home Screen to install."
          : "Use your browser menu to install the app.",
      );
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;

    setInstallPrompt(null);

    if (choice.outcome === "accepted") {
      setInstallPromptStatus("App installed.");
    } else {
      setInstallPromptStatus("You can install the app later from this ticket.");
    }
  }

  async function enableBookingUpdates() {
    if (!bookingReference) {
      return;
    }

    setBookingUpdatesStatus("Preparing booking updates...");

    const result = await registerZingaraPushSubscription({
      bookingReference,
      customerEmail: customerInfo.email,
      customerName: customerInfo.name,
    });

    if (result.ok) {
      setBookingUpdatesStatus("Booking updates enabled on this device.");
      return;
    }

    setBookingUpdatesStatus(
      result.reason ??
        "Booking updates could not be enabled on this device.",
    );
  }

  function getZoneAvailability(option: SeatingOption) {
    const availability = getAvailabilityState(
      option,
      partySize,
      occupiedSeatsByZone[option.id] ?? 0,
      venueConfig,
    );

    return {
      ...availability,
      isSelected:
        selectedZone?.id === option.id ||
        previewSeatingZone?.id === option.id,
    };
  }

  function selectSeatingZone(option: SeatingOption) {
    setPreviewSeatingZone(option);
  }

  function confirmSeatingSelection() {
    if (!previewSeatingZone) {
      return;
    }

    setSelectedZone(previewSeatingZone);
    setPreviewSeatingZone(null);
    setIsConfirmationOpen(false);
    setBookingReference(null);
    setAllocatedTableNumber(null);
  }

  async function downloadTicketPdf() {
    if (!bookingReference) {
      return;
    }

    setTicketDownloadStatus("Preparing ticket...");
    const ticketWindow = window.open("", "_blank");

    if (!ticketWindow) {
      setTicketDownloadStatus("Please allow pop-ups to open ticket.");
      return;
    }

    ticketWindow.opener = null;

    try {
      const ticketCode = createTicketCode(bookingReference);
      const response = await fetch(
        `/api/tickets/${encodeURIComponent(ticketCode)}`,
        { cache: "no-store" },
      );
      const nextPayload = (await response.json()) as
        | TicketPayload
        | { error?: string };

      if (!response.ok || "error" in nextPayload) {
        throw new Error("Ticket data could not be loaded.");
      }

      const ticketPayload = nextPayload as TicketPayload;
      const pdfInput = resolveDownloadableTicketPdfInput({
        booking: ticketPayload.booking,
        show: ticketPayload.show,
        tableColour: ticketPayload.tableColour,
        ticket: ticketPayload.activeTicket,
        venueSettings: ticketPayload.venueSettings,
      });
      const pdfBlob = await createDownloadableTicketPdf(pdfInput);
      const ticketUrl = URL.createObjectURL(pdfBlob);

      ticketWindow.location.href = ticketUrl;
      window.setTimeout(() => URL.revokeObjectURL(ticketUrl), 30000);
      setTicketDownloadStatus("Ticket opened in a new tab.");
    } catch (error) {
      ticketWindow.close();
      if (error instanceof TicketPdfDataError) {
        console.error("[Zingara ticket PDF] Missing ticket data", {
          bookingReference,
          missingFields: error.missingFields,
        });
      } else {
        console.error("[Zingara ticket PDF] Ticket PDF generation failed", {
          bookingReference,
          error,
        });
      }
      setTicketDownloadStatus(
        "Ticket PDF could not be prepared. Please contact Guest Services.",
      );
    }
  }

  function renderVenueSvgHotspot({
    children,
    label,
    option,
    regionKey = label,
  }: {
    children: ReactNode;
    label: string;
    option: SeatingOption;
    regionKey?: string;
  }) {
    const {
      isAvailable,
      isLimited,
      isSelected,
    } = getZoneAvailability(option);
    const fill = isSelected
      ? "rgba(216,195,106,0.22)"
      : "rgba(0,0,0,0.001)";

    const hotspotTitle = `${label} · ${
      !isAvailable ? "Unavailable" : isLimited ? "Limited" : "Available"
    }`;

    return (
      <g
        key={`${option.id}-${regionKey}`}
        aria-label={hotspotTitle}
        role="button"
        tabIndex={isAvailable ? 0 : -1}
        onClick={() => {
          selectSeatingZone(option);
        }}
        onKeyDown={(event) => {
          if (
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            selectSeatingZone(option);
          }
        }}
        className="cursor-pointer"
        fill={fill}
        stroke="none"
        style={{
          opacity: 1,
          pointerEvents: "auto",
        }}
      >
        <title>{hotspotTitle}</title>
        {children}
      </g>
    );
  }

  const elevatedStageZone = seatingZones.find(
    (zone) => zone.id === "elevated-stage",
  );
  const goldenCircleZone = seatingZones.find(
    (zone) => zone.id === "golden-circle",
  );
  const middleRingZone = seatingZones.find(
    (zone) => zone.id === "middle-ring",
  );
  const boothsZone = seatingZones.find(
    (zone) => zone.id === "royal-booths",
  );
  const royalBalconyZone = seatingZones.find(
    (zone) => zone.id === "royal-balcony",
  );
  const retryBookingHref = selectedEntryLocation
    ? `/book?location=${selectedEntryLocation}`
    : "/book";

  function renderPostPaymentExperience() {
    if (postPaymentStatus === "idle") {
      return null;
    }

    const isConfirming = postPaymentStatus === "confirming";
    const isTimeout = postPaymentStatus === "timeout";
    const isProblem =
      postPaymentStatus === "cancelled" || postPaymentStatus === "failed";
    const title = isConfirming
      ? "Confirming your payment..."
      : isTimeout
        ? "We're still confirming your payment."
        : postPaymentStatus === "cancelled"
          ? "Payment was cancelled."
          : "Payment could not be confirmed.";

    return (
      <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/95 px-4 py-8 text-white backdrop-blur-xl">
        <section className="w-full max-w-2xl rounded-[2rem] border border-[#D8C36A]/35 bg-[radial-gradient(circle_at_top,#231A0A_0%,#101010_46%,#050505_100%)] p-6 text-center shadow-[0_0_80px_rgba(216,195,106,0.18)] sm:p-10">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-[#D8C36A]/45 bg-[#D8C36A]/10 shadow-[0_0_34px_rgba(216,195,106,0.2)]">
            {isConfirming ? (
              <span
                aria-hidden="true"
                className="h-7 w-7 animate-spin rounded-full border-2 border-[#D8C36A]/30 border-t-[#F2D66C]"
              />
            ) : (
              <span className="text-2xl" aria-hidden="true">
                {isTimeout ? "✓" : "!"}
              </span>
            )}
          </div>

          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
            PayFast Payment
          </p>
          <h2 className="mt-3 text-3xl font-bold sm:text-5xl">
            {title}
          </h2>

          {postPaymentBookingReference && (
            <p className="mt-4 font-mono text-sm font-semibold text-[#F2D66C] sm:text-base">
              {postPaymentBookingReference}
            </p>
          )}

          {isConfirming && (
            <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg sm:leading-8">
              We're securely confirming your payment with PayFast. This
              usually takes only a few seconds. Please do not refresh or
              close this page.
            </p>
          )}

          {isTimeout && (
            <div className="mx-auto mt-6 max-w-xl space-y-4 text-base leading-7 text-zinc-300 sm:text-lg sm:leading-8">
              <p>Your payment has been received.</p>
              <p>
                There is no need to pay again. Your booking confirmation
                and tickets will be emailed to you automatically once
                confirmation has completed.
              </p>
            </div>
          )}

          {isProblem && (
            <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg sm:leading-8">
              Your booking has not been confirmed. You can try the secure
              payment again, or find your booking to check its latest
              status.
            </p>
          )}

          {(isTimeout || isProblem) && (
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              {isProblem && (
                <Link
                  href={retryBookingHref}
                  className="rounded-full bg-[#D8C36A] px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-black transition hover:bg-[#F2D66C]"
                >
                  Try Again
                </Link>
              )}
              <Link
                href="/find-booking"
                className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-200 transition hover:bg-white hover:text-black"
              >
                Find My Booking
              </Link>
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderConfirmedBookingExperience() {
    if (!bookingReference || !selectedZone) {
      return null;
    }

    const ticketCode = createTicketCode(bookingReference);
    const venueLabel = getEntryLocationLabel(
      selectedEntryLocation ?? getShowVenueKey(selectedShow),
    );

    return (
      <section
        ref={confirmedSectionRef}
        className="relative z-10 mx-auto w-full max-w-3xl px-0 py-2 sm:py-6"
      >
        <div className="space-y-5 rounded-[1.5rem] border border-[#8D7A2F]/50 bg-[radial-gradient(circle_at_top,#2A1710_0%,#111_46%,#050505_100%)] p-3.5 shadow-[0_0_80px_rgba(216,195,106,0.18)] sm:space-y-6 sm:rounded-[2rem] sm:p-6">
          <div className="rounded-xl border border-emerald-400/40 bg-emerald-950/30 p-3.5 sm:rounded-2xl sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300 sm:text-sm">
              Step 6 · Complete
            </p>
            <p className="mt-1 text-2xl font-bold text-white sm:text-3xl">
              Booking Confirmed
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
              <div>
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-emerald-200/70 sm:text-xs">
                  Reference
                </p>
                <p className="mt-1 break-words font-mono text-sm font-bold sm:text-lg">
                  {bookingReference}
                </p>
              </div>
              <div>
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-emerald-200/70 sm:text-xs">
                  Guests
                </p>
                <p className="mt-1 text-base font-bold sm:text-lg">
                  {partySize}
                </p>
              </div>
              <div>
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-emerald-200/70 sm:text-xs">
                  Status
                </p>
                <p className="mt-1 text-base font-bold sm:text-lg">
                  Confirmed
                </p>
              </div>
              <div>
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-emerald-200/70 sm:text-xs">
                  Payment
                </p>
                <p className="mt-1 text-base font-bold sm:text-lg">
                  Confirmed
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-[#D8C36A]/45 bg-black p-3 shadow-[0_0_45px_rgba(216,195,106,0.16)] sm:rounded-[1.5rem] sm:p-6">
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(12rem,14rem)] md:items-start">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#D8C36A] sm:text-sm sm:tracking-[0.24em]">
                  Digital Ticket
                </p>
                <div
                  aria-label={venueConfig.brandTitle}
                  className="mt-2 h-10 w-32 bg-contain bg-left bg-no-repeat sm:h-16 sm:w-44"
                  style={{
                    backgroundImage: `url("${venueConfig.ticketBranding.ticketLogoUrl || venueConfig.logoUrl}")`,
                  }}
                />
                <div className="mt-4 grid grid-cols-1 gap-2 text-xs leading-5 text-zinc-300 min-[390px]:grid-cols-2 sm:gap-3 sm:text-sm">
                  <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Guest Name
                    </span>
                    <span className="mt-1 block font-semibold text-white">
                      {customerInfo.name || "Guest"}
                    </span>
                  </p>
                  <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Ticket Number
                    </span>
                    <span className="mt-1 block font-semibold text-white">
                      Ticket 1 of {partySize}
                    </span>
                  </p>
                  <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Booking Reference
                    </span>
                    <span className="mt-1 block break-words font-mono font-semibold text-white">
                      {bookingReference}
                    </span>
                  </p>
                  <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Show Date
                    </span>
                    <span className="mt-1 block font-semibold text-white">
                      {selectedShow
                        ? getCompactDateDisplay(selectedShow.date)
                        : "Confirmed"}
                    </span>
                  </p>
                  <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Show Time
                    </span>
                    <span className="mt-1 block font-semibold text-white">
                      {selectedShow
                        ? getSouthAfricaShowTime(selectedShow)
                        : ""}
                    </span>
                  </p>
                  <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Venue
                    </span>
                    <span className="mt-1 block font-semibold text-white">
                      {venueLabel}
                    </span>
                  </p>
                  <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Seating Zone
                    </span>
                    <span className="mt-1 block font-semibold text-white">
                      {selectedZone.title}
                    </span>
                  </p>
                  <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Table
                    </span>
                    <span className="mt-1 block font-semibold text-white">
                      {allocatedTableNumber ?? "Assigned"}
                    </span>
                  </p>
                  <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      Table Colour
                    </span>
                    <span className="mt-1 flex items-center gap-2 font-semibold text-white">
                      <span
                        aria-hidden="true"
                        className={`h-3 w-3 rounded-full border ${selectedZone.colour}`}
                      />
                      {selectedZone.title}
                    </span>
                  </p>
                </div>
                <p className="mt-4 break-all rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[0.65rem] text-zinc-400 sm:text-sm">
                  {ticketCode}
                </p>
              </div>

              <div className="mx-auto w-full max-w-[15rem] md:max-w-none">
                <ScannableQrCode
                  value={ticketCode}
                  label="Scannable live ticket QR code"
                  logoUrl={venueConfig.faviconUrl}
                  className="mx-auto w-full max-w-[15rem] p-4"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 sm:gap-3">
              <a
                href={getPlatformTicketUrl(bookingReference)}
                className="inline-flex rounded-full border border-[#D8C36A]/40 px-4 py-2.5 text-xs font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black sm:px-5 sm:py-3 sm:text-sm"
              >
                View Digital Ticket
              </a>
              {partySize > 1 && (
                <a
                  href={`${getPlatformTicketUrl(bookingReference)}&customise=1`}
                  className="inline-flex rounded-full border border-white/15 px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-white hover:text-black sm:px-5 sm:py-3 sm:text-sm"
                >
                  Customise Tickets
                </a>
              )}
              <button
                type="button"
                onClick={downloadTicketPdf}
                className="inline-flex items-center gap-2 rounded-full bg-[#D8C36A] px-4 py-2.5 text-xs font-bold text-black shadow-[0_0_24px_rgba(216,195,106,0.22)] transition hover:bg-[#F2D66C] sm:px-5 sm:py-3 sm:text-sm"
              >
                <span aria-hidden="true">↓</span>
                Download Ticket
              </button>
              {ticketDownloadStatus && (
                <span className="text-sm font-semibold text-emerald-300">
                  {ticketDownloadStatus}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <main className="relative isolate z-10 min-h-screen overflow-x-hidden bg-black px-3 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6 text-white sm:px-6 sm:py-14 lg:py-16">
      {renderPostPaymentExperience()}
      {bookingReference && isConfirmationOpen && selectedZone ? (
        renderConfirmedBookingExperience()
      ) : (
      <div className="relative z-10 mx-auto max-w-5xl">
        <h1 className="mb-3.5 text-left text-2xl font-bold min-[390px]:text-3xl sm:mb-4 sm:text-5xl lg:text-6xl">
          Book Your Experience
        </h1>

        <p className="mb-9 max-w-3xl text-left text-base leading-6 text-zinc-400 sm:mb-14 sm:text-2xl">
          {venueConfig.subtitle}
        </p>

        {selectedEntryLocation && (
          <div className="-mt-5 mb-8 flex justify-start sm:-mt-10 sm:mb-10">
            <span className="inline-flex rounded-full border border-[#D8C36A]/35 bg-[#D8C36A]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#F2D66C]">
              {getEntryLocationLabel(selectedEntryLocation)}
            </span>
          </div>
        )}

	        <section className="mb-8 sm:mb-10">
	          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#D8C36A]">
	            Select your booking type
	          </p>
	          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
	            <button
	              type="button"
	              className="rounded-[1.25rem] border border-[#D8C36A]/45 bg-[#D8C36A]/10 px-5 py-4 text-left shadow-[0_0_24px_rgba(216,195,106,0.08)] transition hover:border-[#F2D66C]/70 sm:px-6"
	            >
	              <span className="block text-sm font-semibold uppercase tracking-[0.16em] text-[#F2D66C]">
	                Standard Booking
	              </span>
	              <span className="mt-2 block text-sm text-zinc-400">
	                Continue with the dinner show booking journey.
	              </span>
	            </button>
	            <Link
	              href="/corporate"
	              className="rounded-[1.25rem] border border-white/15 bg-black/35 px-5 py-4 text-left transition hover:border-[#D8C36A]/60 hover:bg-[#D8C36A]/10 sm:px-6"
	            >
	              <span className="block text-sm font-semibold uppercase tracking-[0.16em] text-white">
	                Corporate Booking
	              </span>
	              <span className="mt-2 block text-sm text-zinc-400">
	                Create a business, group, or event enquiry.
	              </span>
	            </Link>
	          </div>
	        </section>

        <div className="relative mb-6 sm:mb-12">
          <div className="pointer-events-none absolute left-[10%] right-[10%] top-7 hidden h-px bg-white/10 sm:block">
            <div
              className="h-full bg-[#D8C36A]/70 shadow-[0_0_18px_rgba(216,195,106,0.35)] transition-all duration-500"
              style={{
                width: `${Math.max(
                  0,
                  (activeProgressIndex /
                    (bookingProgressSteps.length - 1)) *
                    100,
                )}%`,
              }}
            />
          </div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-6 sm:gap-4">
            {bookingProgressSteps.map((step, index) => (
              <div
                key={step.label}
                className={`relative rounded-2xl px-0.5 text-center transition sm:px-2 ${mobileTimelineOrderClasses[index]} sm:order-none ${
                  step.isComplete || step.isActive
                    ? "text-[#F2D66C]"
                    : "text-zinc-500"
                }`}
              >
                {(index === 0 || index === 1) && (
                  <span
                    className={`pointer-events-none absolute left-[calc(50%+1.25rem)] right-[calc(-50%-0.5rem+1.25rem)] top-5 h-px sm:hidden ${
                      index < activeProgressIndex
                        ? "bg-[#D8C36A]/70 shadow-[0_0_14px_rgba(216,195,106,0.35)]"
                        : "bg-white/10"
                    }`}
                  />
                )}
                {(index === 3 || index === 4) && (
                  <span
                    className={`pointer-events-none absolute left-[calc(-50%-0.5rem+1.25rem)] ${
                      index === 3
                        ? "right-[calc(50%+1rem)]"
                        : "right-[calc(50%+1.25rem)]"
                    } top-5 h-px sm:hidden ${
                      index < activeProgressIndex
                        ? "bg-[#D8C36A]/70 shadow-[0_0_14px_rgba(216,195,106,0.35)]"
                        : "bg-white/10"
                    }`}
                  />
                )}
                {index === 2 && (
                  <>
                    <span
                      className={`pointer-events-none absolute left-[calc(50%+1.25rem)] right-[-0.25rem] top-5 h-px sm:hidden ${
                        index < activeProgressIndex
                          ? "bg-[#D8C36A]/70 shadow-[0_0_14px_rgba(216,195,106,0.35)]"
                          : "bg-white/10"
                      }`}
                    />
                    <span
                      className={`pointer-events-none absolute right-[-0.25rem] top-5 h-[calc(100%+1rem)] w-px sm:hidden ${
                        index < activeProgressIndex
                          ? "bg-[#D8C36A]/70 shadow-[0_0_14px_rgba(216,195,106,0.35)]"
                          : "bg-white/10"
                      }`}
                    />
                  </>
                )}
                {index === 3 && (
                  <span
                    className={`pointer-events-none absolute left-[calc(50%+1rem)] right-[-0.25rem] top-5 h-px sm:hidden ${
                      index < activeProgressIndex
                        ? "bg-[#D8C36A]/70 shadow-[0_0_14px_rgba(216,195,106,0.35)]"
                        : "bg-white/10"
                    }`}
                  />
                )}
                <span className="pointer-events-none absolute left-1/2 top-0 z-[1] h-10 w-10 -translate-x-1/2 rounded-full bg-black sm:h-14 sm:w-14" />
                <button
                  type="button"
                  disabled={!canNavigateBookingStep(index)}
                  onClick={() => setActiveBookingStep(index)}
                  className={`relative z-10 mx-auto mb-2.5 grid h-10 w-10 place-items-center rounded-full border text-sm font-bold transition sm:mb-4 sm:h-14 sm:w-14 sm:text-xl ${
                    step.isComplete || step.isActive
                      ? "border-[#D8C36A]/70 bg-[#D8C36A]/15 text-[#F2D66C] shadow-[0_0_22px_rgba(216,195,106,0.24)]"
                      : "border-white/15 bg-zinc-950/80 text-zinc-500 shadow-[0_0_16px_rgba(0,0,0,0.35)]"
                  } ${
                    canNavigateBookingStep(index)
                      ? "cursor-pointer hover:scale-105 hover:border-[#F2D66C]"
                      : "cursor-not-allowed opacity-50"
                  }`}
                  aria-label={`Go to ${step.label} step`}
                >
                  {index + 1}
                </button>
                <span className="block text-[0.58rem] font-semibold uppercase tracking-[0.1em] sm:text-xs sm:tracking-[0.12em]">
                  {step.label}
                </span>
                {step.summary && (
                  <div className="mt-1 flex flex-col items-center gap-0.5 sm:mt-2 sm:gap-1.5">
                    {step.isSuccessSummary ? (
                      <>
                        <span
                          aria-hidden="true"
                          className="grid h-6 w-6 place-items-center rounded-full bg-emerald-400 text-sm font-black leading-none text-black shadow-[0_0_18px_rgba(52,211,153,0.55)] sm:hidden"
                        >
                          ✓
                        </span>
                        <span className="mx-auto hidden max-w-[12rem] truncate whitespace-nowrap text-lg font-semibold leading-6 text-white sm:block">
                          {step.summary}
                        </span>
                      </>
                    ) : (
                      <span className="mx-auto block max-w-[6.75rem] truncate whitespace-nowrap text-xs font-semibold leading-4 text-white min-[390px]:text-sm sm:max-w-[12rem] sm:text-lg sm:leading-6">
                        {step.mobileSummary ?? step.summary}
                      </span>
                    )}
                    {canNavigateBookingStep(index) && (
                      <button
                        type="button"
                        onClick={() => setActiveBookingStep(index)}
                        className="text-base font-semibold leading-none text-[#F2D66C] drop-shadow-[0_0_10px_rgba(216,195,106,0.35)] transition hover:scale-110 hover:text-white sm:text-xl"
                        aria-label={`Edit ${step.label}`}
                      >
                        ✎
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6 sm:space-y-10">
          {activeBookingStep === 0 && (
          <div className="relative text-left">
            <p className="zingara-heading text-xl font-bold text-white min-[390px]:text-2xl sm:text-3xl">
              Step 1 · Select Show Date
            </p>
            <p className="zingara-subheading mt-1.5 max-w-2xl text-sm leading-5 text-zinc-300 sm:mt-2 sm:text-lg sm:leading-6">
              Choose a show date and time to view live seating
              availability.
            </p>

            <button
              type="button"
              onClick={() =>
                setIsCalendarOpen((currentValue) => !currentValue)
              }
              className="group relative z-10 mt-4 flex w-full max-w-xs items-center justify-between gap-3 rounded-2xl border border-[#8D7A2F]/45 bg-zinc-950 px-4 py-2.5 text-left shadow-2xl shadow-black/20 transition hover:border-[#D8C36A]/70 sm:max-w-sm sm:py-3"
            >
              <span>
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">
                  Date
                </span>
                <span className="mt-1 block text-base font-bold text-white sm:text-lg">
                  {showLoadStatus === "loading"
                    ? "Loading shows..."
                    : getDateDisplay(selectedShowDate)}
                </span>
              </span>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-[#F2D66C] transition group-hover:border-[#D8C36A] sm:h-10 sm:w-10">
                <span className="relative h-5 w-5 rounded-[0.25rem] border-2 border-current">
                  <span className="absolute left-0 right-0 top-1.5 border-t-2 border-current" />
                  <span className="absolute -top-1 left-1 h-2 w-0.5 rounded-full bg-current" />
                  <span className="absolute -top-1 right-1 h-2 w-0.5 rounded-full bg-current" />
                </span>
              </span>
            </button>

            {isCalendarOpen && (
              <div className="absolute left-0 z-40 mt-2 w-full max-w-[17rem] rounded-[1.25rem] border border-[#D8C36A]/30 bg-[#070505] p-2.5 shadow-2xl shadow-[#8D7A2F]/20 sm:mt-3 sm:w-80 sm:max-w-xs sm:rounded-[1.5rem] sm:p-3">
                <div className="mb-2 flex items-center justify-between sm:mb-3">
                  <button
                    type="button"
                    onClick={() =>
                      setCalendarMonth((currentMonth) =>
                        shiftMonth(currentMonth, -1),
                      )
                    }
                    className="grid h-7 w-7 place-items-center rounded-full border border-white/15 text-base text-zinc-300 transition hover:border-[#D8C36A] hover:text-[#F2D66C] sm:h-8 sm:w-8 sm:text-lg"
                    aria-label="Previous month"
                  >
                    ‹
                  </button>
                <p className="text-sm font-bold text-white sm:text-base">
                  {getCalendarMonthLabel(calendarMonth)}
                </p>
                  <button
                    type="button"
                    onClick={() =>
                      setCalendarMonth((currentMonth) =>
                        shiftMonth(currentMonth, 1),
                      )
                    }
                    className="grid h-7 w-7 place-items-center rounded-full border border-white/15 text-base text-zinc-300 transition hover:border-[#D8C36A] hover:text-[#F2D66C] sm:h-8 sm:w-8 sm:text-lg"
                    aria-label="Next month"
                  >
                    ›
                  </button>
                </div>

                {showLoadStatus === "loading" && (
                  <div
                    className="rounded-xl border border-[#D8C36A]/20 bg-[#D8C36A]/5 px-3 py-5 text-center text-sm font-semibold text-[#F2D66C]"
                    role="status"
                  >
                    Loading shows...
                  </div>
                )}

                {showLoadStatus === "error" && (
                  <div
                    className="rounded-xl border border-red-300/25 bg-red-950/20 px-3 py-4 text-center"
                    role="alert"
                  >
                    <p className="text-sm font-semibold text-red-100">
                      Shows could not be loaded.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setShowLoadRetryToken((currentToken) => currentToken + 1)
                      }
                      className="mt-3 rounded-full border border-red-200/30 px-4 py-1.5 text-xs font-semibold text-red-100 transition hover:bg-red-100 hover:text-red-950"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {showLoadStatus === "success" &&
                  locationVisibleShows.length === 0 && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-5 text-center text-sm text-zinc-300">
                      No shows are available for this location.
                    </div>
                  )}

                {showLoadStatus === "success" &&
                  locationVisibleShows.length > 0 && (
                  <>
                <div className="grid grid-cols-7 gap-1">
                  {calendarWeekdays.map((weekday) => (
                    <p
                      key={weekday}
                      className="text-center text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-zinc-500 sm:text-xs sm:tracking-[0.12em]"
                    >
                      {weekday}
                    </p>
                  ))}

                  {calendarDays.map((dateValue, index) => {
                    if (!dateValue) {
                      return (
                        <span
                          key={`blank-${index}`}
                          className="aspect-square rounded-lg"
                        />
                      );
                    }

                    const day = Number(dateValue.split("-")[2]);
                    const dateStatus = getDateCalendarStatus(
                      locationVisibleShows.filter(
                        (show) => show.date === dateValue,
                      ),
                    );
                    const isAvailableDate = showDateSet.has(dateValue);
                    const isSelectedDate =
                      selectedShowDate === dateValue;

                    return (
                      <button
                        key={dateValue}
                        type="button"
                        disabled={!isAvailableDate}
                        onClick={() => selectShowDate(dateValue)}
                        title={
                          dateStatus
                            ? bookingCalendarStatusLabels[dateStatus]
                            : "Unavailable"
                        }
                        className={`aspect-square rounded-lg border text-xs font-semibold transition sm:rounded-xl sm:text-sm ${
                          isSelectedDate
                            ? "border-white bg-[#D8C36A] text-black shadow-[0_0_28px_rgba(216,195,106,0.35)]"
                            : dateStatus
                              ? bookingCalendarStatusClasses[dateStatus]
                              : "cursor-not-allowed border-white/5 bg-zinc-900/60 text-zinc-700"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5 text-[0.52rem] font-semibold uppercase tracking-[0.08em] text-zinc-400 sm:mt-4 sm:gap-2 sm:text-[0.6rem]">
                  {bookingCalendarLegend.map(({ label, status }) => (
                    <span
                      key={status}
                      className="inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          status === "active"
                            ? "bg-[#D8C36A]"
                            : status === "special-event"
                              ? "bg-purple-300"
                              : status === "sold-out"
                                ? "bg-red-300"
                                : status === "blackout"
                                  ? "bg-sky-300"
                                  : "bg-zinc-500"
                        }`}
                      />
                      {label}
                    </span>
                  ))}
                </div>
                  </>
                )}
              </div>
            )}
          </div>
          )}

          {selectedShowDate && (activeBookingStep === 0 || !selectedShowId) && (
            <div className="text-left">
              <p className="zingara-subheading mb-3 text-lg text-zinc-300">
                Available Show Times
              </p>

              <div className="flex max-w-xs flex-wrap justify-start gap-3 sm:max-w-sm">
                {selectedDateShows.map((show) => {
                  const isSelectedTime = selectedShowId === show.id;
                  const showStatus = getGuestShowStatus(show);
                  const isBookableTime = isGuestBookableShow(show);

                  return (
                    <button
                      key={show.id}
                      type="button"
                      disabled={!isBookableTime}
                      onClick={() => selectShowTime(show.id)}
                      className={`min-w-32 rounded-2xl border px-4 py-3 text-center transition sm:min-w-40 sm:px-5 sm:py-4 ${
                        isSelectedTime
                          ? "border-white bg-[#D8C36A] text-black shadow-[0_0_28px_rgba(216,195,106,0.25)]"
                          : isBookableTime
                            ? "border-[#8D7A2F]/35 bg-zinc-950 text-white hover:border-[#D8C36A] hover:bg-[#171006]"
                            : "cursor-not-allowed border-white/10 bg-zinc-950/60 text-zinc-500"
                      }`}
                    >
                      <span className="block text-2xl font-bold sm:text-3xl">
                        {getSouthAfricaShowTime(show)}
                      </span>
                      <span
                        className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.12em] ${
                          showStatus === "active"
                            ? "border-[#D8C36A]/35 text-[#F2D66C]"
                            : showStatus === "special-event"
                              ? "border-purple-300/40 text-purple-100"
                              : showStatus === "sold-out"
                                ? "border-red-300/35 text-red-200"
                                : showStatus === "blackout"
                                  ? "border-sky-300/35 text-sky-200"
                                  : "border-zinc-500/35 text-zinc-400"
                        }`}
                      >
                        {bookingCalendarStatusLabels[showStatus]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedShowId && (
            <>

          {activeBookingStep === 1 && (
          <div className="max-w-5xl rounded-[1.5rem] border border-[#8D7A2F]/30 bg-zinc-950/70 p-3.5 sm:rounded-[2rem] sm:p-5">
            <div className="flex flex-col gap-3">
              <div className="min-w-0">
                <p className="zingara-heading text-xl font-bold text-white sm:text-3xl">
                  Step 2 · Guests
                </p>
                <p className="zingara-subheading mt-1.5 max-w-3xl text-sm leading-5 text-zinc-300 sm:mt-2 sm:text-lg sm:leading-6">
                  Choose 1 to 19 guests. Parties of 20 or more are handled through Corporate Booking.
                </p>
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <div className="grid w-full grid-cols-[2.5rem_1fr_2.5rem] items-center rounded-full border border-[#8D7A2F]/35 bg-zinc-950 p-1 sm:inline-flex sm:w-auto">
                <button
                  type="button"
                  onClick={() => selectPartySize(Math.max(1, partySize - 1))}
                  className="grid h-10 w-10 place-items-center rounded-full text-xl text-zinc-300 transition hover:bg-white hover:text-black"
                  aria-label="Decrease guests"
                >
                  −
                </button>
                <span className="min-w-0 whitespace-nowrap px-3 text-center text-sm font-bold text-[#F2D66C] sm:min-w-24 sm:px-4 sm:text-base lg:text-lg">
                  {partySize} {partySize === 1 ? "Guest" : "Guests"}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    selectPartySize(
                      Math.min(corporatePartySizeThreshold, partySize + 1),
                    )
                  }
                  className="grid h-10 w-10 place-items-center rounded-full text-xl text-zinc-300 transition hover:bg-white hover:text-black"
                  aria-label="Increase guests"
                >
                  +
                </button>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveBookingStep(2)}
                  className="whitespace-nowrap rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-300 sm:px-6 sm:py-3"
                >
                  Continue To Seating
                </button>
              </div>
            </div>
          </div>
          )}

          {activeBookingStep === 2 && (
          <div>
            <div className="mb-3 flex flex-col gap-3 lg:mb-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="zingara-heading text-xl font-bold text-white sm:text-3xl">
                  Step 3 · Seating Experience
                </p>
                <p className="zingara-subheading mt-1.5 max-w-2xl text-xs leading-5 text-zinc-300 min-[390px]:text-sm sm:mt-2 sm:text-lg sm:leading-7">
                  Choose a section from the Zingara venue map.
                  Availability is based on party size and remaining
                  seats in each section.
                </p>
              </div>
              <div className="flex flex-nowrap gap-1 text-[8px] font-semibold uppercase tracking-[0.04em] text-zinc-400 sm:gap-1.5 sm:text-[9px]">
                <span className="inline-flex h-5 items-center gap-1 whitespace-nowrap rounded border border-emerald-300/25 bg-emerald-950/20 px-1.5 leading-none text-emerald-300">
                  <span className="h-[3px] w-[3px] rounded-full bg-emerald-300" />
                  Available
                </span>
                <span className="inline-flex h-5 items-center gap-1 whitespace-nowrap rounded border border-amber-300/25 bg-amber-950/20 px-1.5 leading-none text-amber-200">
                  <span className="h-[3px] w-[3px] rounded-full bg-amber-300" />
                  Limited
                </span>
                <span className="inline-flex h-5 items-center gap-1 whitespace-nowrap rounded border border-zinc-700 bg-black/30 px-1.5 leading-none text-zinc-500">
                  <span className="h-[3px] w-[3px] rounded-full bg-zinc-600" />
                  Unavailable
                </span>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[1.25rem] border border-[#8D7A2F]/40 bg-black p-1.5 shadow-2xl shadow-[#8D7A2F]/10 sm:rounded-[2rem] sm:p-5 lg:p-6">
              <div
                className="relative mx-auto w-full max-w-[380px]"
                style={{ aspectRatio: "473.96 / 397.84" }}
              >
                <img
                  src="/brand/final_venue_floorplan.svg"
                  alt="Zingara venue seating floorplan"
                  className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
                />

                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 473.96 397.84"
                >
                  {boothsZone &&
                    renderVenueSvgHotspot({
                      label: "Booths",
                      option: boothsZone,
                      children: (
                        <path
                          d={boothsHotspotPath}
                          fillRule="evenodd"
                        />
                      ),
                    })}

                  {middleRingZone &&
                    renderVenueSvgHotspot({
                      label: "Middle Ring",
                      option: middleRingZone,
                      children: (
                        <path
                          d={middleRingHotspotPath}
                          fillRule="evenodd"
                        />
                      ),
                    })}

                  {goldenCircleZone &&
                    renderVenueSvgHotspot({
                      label: "Golden Circle",
                      option: goldenCircleZone,
                      children: <path d={goldenCircleHotspotPath} />,
                    })}

                  {elevatedStageZone &&
                    renderVenueSvgHotspot({
                      label: "Elevated Stage",
                      option: elevatedStageZone,
                      children: (
                        <>
                          <path d={elevatedStageHotspotPath} />
                          <circle cx="197.8" cy="199.47" r="27.17" />
                        </>
                      ),
                    })}

                  {royalBalconyZone && (
                    <>
                      {renderVenueSvgHotspot({
                        label: "Royal Balcony Upper",
                        option: royalBalconyZone,
                        regionKey: "royal-balcony-upper",
                        children: (
                          <path d={royalBalconyUpperHotspotPath} />
                        ),
                      })}
                      {renderVenueSvgHotspot({
                        label: "Royal Balcony Lower",
                        option: royalBalconyZone,
                        regionKey: "royal-balcony-lower",
                        children: (
                          <path d={royalBalconyLowerHotspotPath} />
                        ),
                      })}
                    </>
                  )}
                </svg>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-[#8D7A2F]/35 bg-black/35 p-4 shadow-[0_0_28px_rgba(216,195,106,0.08)]">
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">
                Selected Seating
              </p>

              {selectedZone ? (
                (() => {
                  const availability = getZoneAvailability(selectedZone);
                  const status = availability.isLimited
                    ? "Limited"
                    : "Available";
                  const statusClass = availability.isLimited
                    ? "border-amber-300/45 bg-amber-950/25 text-amber-100"
                    : "border-emerald-300/35 bg-emerald-950/20 text-emerald-200";

                  return (
                    <>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-white">
                          {selectedZone.title}
                        </h3>
                        <span
                          className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.08em] ${statusClass}`}
                        >
                          {status}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm leading-5 text-zinc-300">
                        {selectedZone.description}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[#F2D66C]">
                        {formatCurrency(
                          getConfiguredZonePrice(venueConfig, selectedZone),
                        )}{" "}
                        pp · {availability.remainingSeats} Seats Available
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedZone(null)}
                          className="rounded-full border border-[#D8C36A]/35 px-4 py-2 text-xs font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                        >
                          Change Seating
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveBookingStep(3)}
                          className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-zinc-300"
                        >
                          Continue To Guest Details
                        </button>
                      </div>
                    </>
                  );
                })()
              ) : (
                <>
                  <p className="mt-2 text-sm text-zinc-400">
                    Choose a section from the floorplan to review
                    seating details.
                  </p>
                  <button
                    type="button"
                    disabled
                    className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black opacity-40"
                  >
                    Continue To Guest Details
                  </button>
                </>
              )}
            </div>
            {canJoinWaitlist && (
              <div className="mt-6 rounded-2xl border border-amber-300/30 bg-amber-950/20 p-5 text-amber-100">
                <p className="text-sm font-semibold uppercase tracking-[0.16em]">
                  No Seating Capacity Available
                </p>
                <p className="mt-2 text-sm leading-6">
                  The selected show currently has no seating that can
                  safely host {partySize} guests. You can adjust party
                  size, choose another show time, or join the waitlist
                  below.
                </p>
              </div>
            )}
          </div>
          )}
            </>
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
                No seating section currently has enough remaining
                capacity for this party size. Leave your details and
                the box office can promote or convert your request
                when capacity opens.
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

          {selectedZone && activeBookingStep === 3 && (
            <section className="mt-5 rounded-[1.25rem] border border-[#8D7A2F]/35 bg-[radial-gradient(circle_at_top,#18100A_0%,#111_48%,#050505_100%)] p-3.5 shadow-2xl shadow-black/25 sm:mt-10 sm:rounded-[2rem] sm:p-6">
              <div className="mb-4 sm:mb-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A] sm:text-sm">
                  Step 4
                </p>
                <h2 className="mt-1.5 text-2xl font-bold sm:mt-2 sm:text-3xl">
                  Guest Details
                </h2>
                <p className="mt-2 text-sm leading-5 text-zinc-300 sm:mt-3 sm:text-base sm:leading-6">
                  Add the lead guest details before moving to payment.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:mb-2 sm:text-sm">
                    Full Name <span aria-hidden="true">*</span>
                  </span>
                  <input
                    required
                    aria-invalid={Boolean(customerValidationErrors.name)}
                    aria-describedby={
                      customerValidationErrors.name
                        ? "booking-name-error"
                        : undefined
                    }
                    autoComplete="name"
                    data-booking-field="name"
                    value={customerInfo.name}
                    onBlur={() => validateCustomerField("name")}
                    onChange={(event) =>
                      updateCustomerField("name", event.target.value)
                    }
                    className={`w-full rounded-xl border bg-zinc-950 px-3 py-2.5 text-sm sm:rounded-2xl sm:p-3 sm:text-base ${customerValidationErrors.name ? "border-red-400" : "border-zinc-700"}`}
                  />
                  {customerValidationErrors.name && (
                    <span
                      id="booking-name-error"
                      className="mt-1.5 block text-sm font-semibold text-red-200"
                    >
                      {customerValidationErrors.name}
                    </span>
                  )}
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:mb-2 sm:text-sm">
                    Email Address <span aria-hidden="true">*</span>
                  </span>
                  <input
                    required
                    aria-invalid={Boolean(customerValidationErrors.email)}
                    aria-describedby={
                      customerValidationErrors.email
                        ? "booking-email-error"
                        : undefined
                    }
                    autoComplete="email"
                    data-booking-field="email"
                    type="email"
                    value={customerInfo.email}
                    onBlur={() => validateCustomerField("email")}
                    onChange={(event) =>
                      updateCustomerField("email", event.target.value)
                    }
                    className={`w-full rounded-xl border bg-zinc-950 px-3 py-2.5 text-sm sm:rounded-2xl sm:p-3 sm:text-base ${customerValidationErrors.email ? "border-red-400" : "border-zinc-700"}`}
                  />
                  {customerValidationErrors.email && (
                    <span
                      id="booking-email-error"
                      className="mt-1.5 block text-sm font-semibold text-red-200"
                    >
                      {customerValidationErrors.email}
                    </span>
                  )}
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:mb-2 sm:text-sm">
                    Mobile Number <span aria-hidden="true">*</span>
                  </span>
                  <input
                    required
                    aria-invalid={Boolean(customerValidationErrors.phone)}
                    aria-describedby={
                      customerValidationErrors.phone
                        ? "booking-phone-error"
                        : undefined
                    }
                    autoComplete="tel"
                    data-booking-field="phone"
                    inputMode="tel"
                    type="tel"
                    value={customerInfo.phone}
                    onBlur={() => validateCustomerField("phone")}
                    onChange={(event) =>
                      updateCustomerField("phone", event.target.value)
                    }
                    className={`w-full rounded-xl border bg-zinc-950 px-3 py-2.5 text-sm sm:rounded-2xl sm:p-3 sm:text-base ${customerValidationErrors.phone ? "border-red-400" : "border-zinc-700"}`}
                  />
                  {customerValidationErrors.phone && (
                    <span
                      id="booking-phone-error"
                      className="mt-1.5 block text-sm font-semibold text-red-200"
                    >
                      {customerValidationErrors.phone}
                    </span>
                  )}
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:mb-2 sm:text-sm">
                    Notes / Preferences
                  </span>
                  <textarea
                    value={customerNotes}
                    onChange={(event) =>
                      setCustomerNotes(event.target.value)
                    }
                    placeholder="Dietary requirements, celebration notes, access needs, or seating preferences."
                    className="min-h-20 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm sm:min-h-24 sm:rounded-2xl sm:p-3 sm:text-base"
                  />
                </label>
              </div>

              {publicBookingGuidance && (
                <p
                  aria-live="polite"
                  className="mt-4 rounded-xl border border-amber-300/30 bg-amber-950/25 px-4 py-3 text-sm font-semibold leading-5 text-amber-100"
                  role="status"
                >
                  {publicBookingGuidance}
                </p>
              )}

              <button
                type="button"
                onClick={() => {
                  if (validatePublicCustomerDetails()) {
                    setActiveBookingStep(4);
                  }
                }}
                className="mt-5 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40 sm:mt-6 sm:py-3 sm:text-base"
              >
                Continue To Payment
              </button>
            </section>
          )}

          {selectedZone && activeBookingStep === 4 && (
            <div className="mt-5 rounded-[1.25rem] border border-[#8D7A2F]/35 bg-[radial-gradient(circle_at_top,#18100A_0%,#111_48%,#050505_100%)] p-3.5 shadow-2xl shadow-black/25 sm:mt-10 sm:rounded-[2rem] sm:p-6">
              <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A] sm:text-sm">
                    Step 5
                  </p>
                  <h2 className="mt-1.5 text-2xl font-bold sm:mt-2 sm:text-3xl">
                    Payment Summary
                  </h2>
                  <p className="mt-2 text-sm leading-5 text-zinc-300 sm:mt-3 sm:text-base sm:leading-6">
                    Review the amount due today, choose full payment
                    or deposit, then continue to secure checkout.
                  </p>
                </div>
                <span className="w-fit rounded-full border border-[#D8C36A]/30 bg-black/30 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#F2D66C] sm:px-4 sm:py-2 sm:text-sm">
                  Seating section selected
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs sm:gap-3 sm:text-sm lg:grid-cols-4">
                <div className="col-span-2 rounded-xl border border-white/10 bg-black/30 p-3 sm:col-span-1 sm:rounded-2xl sm:p-4">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-zinc-500 sm:text-xs">
                    Show:
                  </p>
                  <p className="mt-1.5 text-sm font-semibold leading-5 text-white sm:mt-2 sm:text-base">
                    {getCompactShowDateTime(selectedShow)}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/30 p-3 sm:rounded-2xl sm:p-4">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-zinc-500 sm:text-xs">
                    Section
                  </p>
                  <p className="mt-1.5 font-semibold text-white sm:mt-2">
                    {selectedZone.title}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/30 p-3 sm:rounded-2xl sm:p-4">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-zinc-500 sm:text-xs">
                    Guests
                  </p>
                  <p className="mt-1.5 font-semibold text-white sm:mt-2">
                    {partySize}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/30 p-3 sm:rounded-2xl sm:p-4">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-zinc-500 sm:text-xs">
                    Seating Assignment
                  </p>
                  <p className="mt-1.5 font-semibold text-white sm:mt-2">
                    Section selected
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-3 text-sm sm:mt-5 sm:space-y-4 sm:text-base">
                <div className="rounded-xl border border-[#D8C36A]/20 bg-black/30 p-3 sm:rounded-2xl sm:p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        Price Per Person
                      </p>
                      <p className="mt-1 text-lg font-bold sm:text-xl">
                        {formatCurrency(dynamicPricePerPerson)}
                      </p>
                    </div>
                    {dynamicPriceMultiplier !== 1 && (
                      <span className="text-left">
                        <span className="inline-flex rounded-full border border-[#D8C36A]/30 bg-[#D8C36A]/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-[#F2D66C]">
                          Dynamic rate
                        </span>
                        <span className="mt-1.5 block text-xs text-zinc-400">
                          Dynamic rate applied due to group size.
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="border-t border-zinc-700 pt-3 sm:pt-4">
                  <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2 sm:mb-5 sm:gap-4">
                    <label className="rounded-xl border border-white/10 bg-black/30 p-3 sm:rounded-2xl sm:p-4">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:mb-3 sm:text-sm">
                        Payment Option
                      </span>
                      <select
                        value={paymentOption}
                        onChange={(event) =>
                          setPaymentOption(
                            event.target.value as PaymentOption,
                          )
                        }
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm sm:px-4 sm:py-3 sm:text-base"
                      >
                        <option value="full">
                          Pay In Full Today
                        </option>
                        <option value="deposit">
                          Deposit Only ({formatCurrency(depositPerPerson)} pp)
                        </option>
                      </select>
                    </label>

                    <label className="rounded-xl border border-white/10 bg-black/30 p-3 sm:rounded-2xl sm:p-4">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:mb-3 sm:text-sm">
                        Promo Code
                      </span>
                      <input
                        value={promoCodeInput}
                        onChange={(event) =>
                          setPromoCodeInput(event.target.value)
                        }
                        placeholder="COUNTESS10"
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm uppercase sm:px-4 sm:py-3 sm:text-base"
                      />
                      {promoCodeInput &&
                        (isPromoValidationLoading ? (
                          <span className="mt-2 block text-sm text-zinc-300">
                            Checking promo code...
                          </span>
                        ) : appliedPromoCode ? (
                          <span className="mt-2 block text-sm text-emerald-300">
                            {appliedPromoCode.description}
                          </span>
                        ) : (
                          <span className="mt-2 block text-sm text-amber-200">
                            {promoValidationPreview?.status === "expired"
                              ? "Promo code has expired."
                              : promoValidationPreview?.status ===
                                  "usage_exhausted"
                                ? "Promo code has reached its usage limit."
                                : promoValidationPreview?.status ===
                                    "scheduled"
                                  ? "Promo code is not active yet."
                                  : promoValidationPreview?.status ===
                                      "not_applicable"
                                    ? "Promo code is not available for this booking."
                                    : "Promo code not recognized."}
                          </span>
                        ))}
                    </label>
                  </div>

                  <div className="mb-3 rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-zinc-300 sm:mb-4 sm:rounded-2xl sm:p-4">
                    <div className="flex justify-between gap-4">
                      <span>Seating</span>
                      <span>{formatCurrency(seatingSubtotal)}</span>
                    </div>
                    <div className="mt-2 flex justify-between gap-4">
                      <span>Add-Ons</span>
                      <span>{formatCurrency(addonsTotal)}</span>
                    </div>
                    <div className="mt-2 flex justify-between gap-4">
                      <span>Subtotal</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="mt-2 flex justify-between gap-4 text-emerald-300">
                        <span>Discount</span>
                        <span>-{formatCurrency(discountAmount)}</span>
                      </div>
                    )}
                    {serviceFeeAmount > 0 && (
                      <div className="mt-2 flex justify-between gap-4 text-[#F2D66C]">
                        <span>Service Fee (12.5%)</span>
                        <span>{formatCurrency(serviceFeeAmount)}</span>
                      </div>
                    )}
                    <div className="mt-2 flex justify-between gap-4 font-semibold text-white">
                      <span>Total Due</span>
                      <span>{formatCurrency(total)}</span>
                    </div>
                    <div className="mt-2 flex justify-between gap-4">
                      <span>Booking Amount Due</span>
                      <span>
                        {formatCurrency(
                          payFastTransaction.bookingAppliedAmount,
                        )}
                      </span>
                    </div>
                    {payFastTransaction.transactionFeeAmount > 0 && (
                      <div className="mt-2 flex justify-between gap-4">
                        <span>Transaction Fee</span>
                        <span>
                          {formatCurrency(
                            payFastTransaction.transactionFeeAmount,
                          )}
                        </span>
                      </div>
                    )}
                    <div className="mt-2 flex justify-between gap-4 font-semibold text-white">
                      <span>Total Payable Today</span>
                      <span>
                        {formatCurrency(
                          payFastTransaction.providerGrossAmount,
                        )}
                      </span>
                    </div>
                    {balanceDue > 0 && (
                      <div className="mt-2 flex justify-between gap-4">
                        <span>Balance Due Later</span>
                        <span>{formatCurrency(balanceDue)}</span>
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-[#D8C36A]/35 bg-[#D8C36A]/10 p-3 sm:rounded-2xl sm:p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F2D66C] sm:text-sm">
                      Total Amount
                    </p>
                    <p className="mt-1.5 text-2xl font-bold sm:mt-2 sm:text-3xl">
                      {formatCurrency(total)}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleContinueBooking}
                className="mt-5 w-full rounded-full bg-white px-6 py-2.5 text-base font-semibold text-black transition hover:scale-[1.01] hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40 sm:mt-8 sm:w-auto sm:px-8 sm:py-4 sm:text-xl"
              >
                Continue To Payment
              </button>
              {!customerDetailsComplete && (
                <p className="mt-3 text-sm text-amber-200">
                  Complete guest details before continuing.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {previewSeatingZone && activeBookingStep === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[1.5rem] border border-[#8D7A2F]/55 bg-[radial-gradient(circle_at_top,#25170D_0%,#0E0C0A_48%,#040404_100%)] p-5 shadow-[0_0_70px_rgba(216,195,106,0.18)] transition sm:rounded-[2rem] sm:p-7">
            {(() => {
              const availability = getAvailabilityState(
                previewSeatingZone,
                partySize,
                occupiedSeatsByZone[previewSeatingZone.id] ?? 0,
                venueConfig,
              );
              const status = availability.availabilityMessage;
              const statusClass = !availability.isAvailable
                ? "border-zinc-600 bg-black/40 text-zinc-300"
                : availability.isLimited
                  ? "border-amber-300/45 bg-amber-950/25 text-amber-100"
                  : "border-emerald-300/35 bg-emerald-950/20 text-emerald-200";
              const recommendedShow = !availability.isAvailable
                ? getRecommendedFutureShow()
                : undefined;

              return (
                <>
                  <div className="flex items-start justify-between gap-4 border-b border-[#8D7A2F]/25 pb-4">
                    <div>
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                        Seating Preview
                      </p>
                      <h2 className="mt-2 text-2xl font-bold uppercase tracking-[0.06em] text-white sm:text-3xl">
                        {previewSeatingZone.title}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewSeatingZone(null)}
                      className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300 transition hover:bg-white hover:text-black"
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-5">
                    <span
                      className={`inline-flex w-fit rounded-md border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.08em] ${statusClass}`}
                    >
                      {status}
                    </span>
                    <p className="mt-3 text-sm font-semibold text-[#F2D66C]">
                      {formatCurrency(
                        getConfiguredZonePrice(
                          venueConfig,
                          previewSeatingZone,
                        ),
                      )}{" "}
                      pp · {availability.remainingSeats} Seats Available
                    </p>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-zinc-300">
                    {previewSeatingZone.description}
                  </p>

                  {!availability.isAvailable && recommendedShow && (
                    <div className="mt-4 rounded-2xl border border-[#D8C36A]/25 bg-[#D8C36A]/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F2D66C]">
                        Next Show Option
                      </p>
                      <p className="mt-2 text-sm text-zinc-200">
                        You can also check {getCompactShowDateTime(recommendedShow)}
                        for {previewSeatingZone.title}.
                      </p>
                      <button
                        type="button"
                        onClick={() => selectRecommendedShow(recommendedShow)}
                        className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-zinc-300"
                      >
                        Select This Show
                      </button>
                    </div>
                  )}

                  {!availability.isAvailable && !recommendedShow && (
                    <p className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-950/20 p-4 text-sm leading-6 text-amber-100">
                      No future show in this location currently has
                      availability for {previewSeatingZone.title}.
                    </p>
                  )}

                  <button
                    type="button"
                    disabled={!availability.isAvailable}
                    onClick={confirmSeatingSelection}
                    className="mt-6 w-full rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Select Seating
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {isConfirmationOpen && selectedZone && !bookingReference && (
        <div className="fixed inset-x-0 bottom-0 top-[6.9rem] z-30 flex items-start justify-center overflow-y-auto bg-black/80 px-2.5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm min-[390px]:top-[7.4rem] sm:inset-0 sm:z-50 sm:items-center sm:overflow-visible sm:px-6 sm:py-10">
          <div className="max-h-[calc(100dvh-8.65rem-env(safe-area-inset-bottom))] w-full max-w-3xl overflow-y-auto rounded-[1.5rem] border border-[#8D7A2F]/50 bg-[radial-gradient(circle_at_top,#2A1710_0%,#111_46%,#050505_100%)] p-3.5 shadow-[0_0_80px_rgba(216,195,106,0.18)] min-[390px]:max-h-[calc(100dvh-9.15rem-env(safe-area-inset-bottom))] sm:max-h-full sm:rounded-[2rem] sm:p-6">
            <div className="flex flex-row items-start justify-between gap-3 border-b border-[#8D7A2F]/30 pb-4 sm:pb-6">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A] sm:mb-2 sm:text-sm sm:tracking-[0.24em]">
                  Step 5 · Payment
                </p>

                <h2 className="text-2xl font-bold sm:text-3xl">
                  Payment Summary
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-5 text-zinc-300 sm:text-base sm:leading-6">
                  Confirm your details and continue to secure PayFast
                  checkout. Tickets are issued after payment is
                  confirmed.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsConfirmationOpen(false)}
                className="shrink-0 rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300 transition hover:bg-white hover:text-black sm:px-4 sm:py-2 sm:text-sm"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-8 sm:gap-4">
              <div className="rounded-xl border border-white/10 bg-black/30 p-3 sm:rounded-2xl sm:p-5">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-xs">
                  Section
                </p>
                <p className="mt-1.5 text-base font-bold sm:mt-2 sm:text-xl">
                  {selectedZone.title}
                </p>
              </div>

              <div className="col-span-2 rounded-xl border border-white/10 bg-black/30 p-3 sm:col-span-1 sm:rounded-2xl sm:p-5">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-xs">
                  Booking Date
                </p>
                <p className="mt-1.5 text-base font-bold leading-6 sm:mt-2 sm:text-lg sm:leading-7">
                  {getCompactShowDateTime(selectedShow)}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/30 p-3 sm:rounded-2xl sm:p-5">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-xs">
                  Party Size
                </p>
                <p className="mt-1.5 text-base font-bold sm:mt-2 sm:text-xl">
                  {partySize} Guests
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/30 p-3 sm:rounded-2xl sm:p-5">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-xs">
                  Seating Assignment
                </p>
                <p className="mt-1.5 text-base font-bold sm:mt-2 sm:text-xl">
                  Section selected
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/30 p-3 sm:rounded-2xl sm:p-5">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-xs">
                  Total Price
                </p>
                <p className="mt-1.5 text-base font-bold sm:mt-2 sm:text-xl">
                  {formatCurrency(total)}
                </p>
                {discountAmount > 0 && (
                  <p className="mt-1.5 text-xs text-emerald-300 sm:mt-2 sm:text-sm">
                    {formatCurrency(discountAmount)} promo
                    discount applied
                  </p>
                )}
              </div>

              <div className="col-span-2 rounded-xl border border-white/10 bg-black/30 p-3 sm:rounded-2xl sm:p-5">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-xs">
                  Booking Reference
                </p>
                <p className="mt-1.5 break-words font-mono text-base font-bold text-[#F2D66C] sm:mt-2 sm:text-xl">
                  {bookingReference ?? "Generated after confirmation"}
                </p>
              </div>

              <div className="col-span-2 rounded-xl border border-white/10 bg-black/30 p-3 sm:rounded-2xl sm:p-5">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-xs">
                  Payment Plan
                </p>
                <p className="mt-1.5 text-base font-bold sm:mt-2 sm:text-xl">
                  {paymentOption === "deposit"
                    ? `${formatCurrency(depositPerPerson)} pp Deposit`
                    : "Full Payment"}
                </p>
                <p className="mt-1.5 text-sm text-zinc-300 sm:mt-2">
                  Booking amount due today: {formatCurrency(amountDueNow)}
                  {payFastTransaction.transactionFeeAmount > 0 &&
                    ` · Transaction fee: ${formatCurrency(payFastTransaction.transactionFeeAmount)}`}
                  {payFastTransaction.providerGrossAmount > 0 &&
                    ` · Total payable: ${formatCurrency(payFastTransaction.providerGrossAmount)}`}
                  {balanceDue > 0 &&
                    ` · Balance due: ${formatCurrency(balanceDue)}`}
                </p>
              </div>

              <div className="col-span-2 rounded-xl border border-[#D8C36A]/25 bg-black/30 p-3 text-sm text-zinc-300 sm:rounded-2xl sm:p-4">
                <div className="flex justify-between gap-4">
                  <span>Seating</span>
                  <span>{formatCurrency(seatingSubtotal)}</span>
                </div>
                <div className="mt-2 flex justify-between gap-4">
                  <span>Add-Ons</span>
                  <span>{formatCurrency(addonsTotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="mt-2 flex justify-between gap-4 text-emerald-300">
                    <span>Discount</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                {serviceFeeAmount > 0 && (
                  <div className="mt-2 flex justify-between gap-4 text-[#F2D66C]">
                    <span>Service Fee (12.5%)</span>
                    <span>{formatCurrency(serviceFeeAmount)}</span>
                  </div>
                )}
                <div className="mt-2 flex justify-between gap-4 font-semibold text-white">
                  <span>Total Due</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            </div>

            <form
              className="mt-5 space-y-4 sm:mt-8 sm:space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                void handlePayFastCheckout();
              }}
            >
              <h3 className="zingara-heading text-lg font-bold sm:text-xl">
                Confirm Customer Information
              </h3>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:mb-2 sm:text-sm">
                    Full Name <span aria-hidden="true">*</span>
                  </span>
                  <input
                    required
                    aria-invalid={Boolean(customerValidationErrors.name)}
                    aria-describedby={
                      customerValidationErrors.name
                        ? "checkout-booking-name-error"
                        : undefined
                    }
                    autoComplete="name"
                    data-booking-field="name"
                    value={customerInfo.name}
                    onBlur={() => validateCustomerField("name")}
                    onChange={(event) =>
                      updateCustomerField("name", event.target.value)
                    }
                    className={`w-full rounded-xl border bg-zinc-950 px-3 py-2.5 text-sm sm:rounded-2xl sm:p-3 sm:text-base ${customerValidationErrors.name ? "border-red-400" : "border-zinc-700"}`}
                  />
                  {customerValidationErrors.name && (
                    <span
                      id="checkout-booking-name-error"
                      className="mt-1.5 block text-sm font-semibold text-red-200"
                    >
                      {customerValidationErrors.name}
                    </span>
                  )}
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:mb-2 sm:text-sm">
                    Email Address <span aria-hidden="true">*</span>
                  </span>
                  <input
                    required
                    aria-invalid={Boolean(customerValidationErrors.email)}
                    aria-describedby={
                      customerValidationErrors.email
                        ? "checkout-booking-email-error"
                        : undefined
                    }
                    autoComplete="email"
                    data-booking-field="email"
                    type="email"
                    value={customerInfo.email}
                    onBlur={() => validateCustomerField("email")}
                    onChange={(event) =>
                      updateCustomerField("email", event.target.value)
                    }
                    className={`w-full rounded-xl border bg-zinc-950 px-3 py-2.5 text-sm sm:rounded-2xl sm:p-3 sm:text-base ${customerValidationErrors.email ? "border-red-400" : "border-zinc-700"}`}
                  />
                  {customerValidationErrors.email && (
                    <span
                      id="checkout-booking-email-error"
                      className="mt-1.5 block text-sm font-semibold text-red-200"
                    >
                      {customerValidationErrors.email}
                    </span>
                  )}
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:mb-2 sm:text-sm">
                    Mobile Number <span aria-hidden="true">*</span>
                  </span>
                  <input
                    required
                    aria-invalid={Boolean(customerValidationErrors.phone)}
                    aria-describedby={
                      customerValidationErrors.phone
                        ? "checkout-booking-phone-error"
                        : undefined
                    }
                    autoComplete="tel"
                    data-booking-field="phone"
                    inputMode="tel"
                    type="tel"
                    value={customerInfo.phone}
                    onBlur={() => validateCustomerField("phone")}
                    onChange={(event) =>
                      updateCustomerField("phone", event.target.value)
                    }
                    className={`w-full rounded-xl border bg-zinc-950 px-3 py-2.5 text-sm sm:rounded-2xl sm:p-3 sm:text-base ${customerValidationErrors.phone ? "border-red-400" : "border-zinc-700"}`}
                  />
                  {customerValidationErrors.phone && (
                    <span
                      id="checkout-booking-phone-error"
                      className="mt-1.5 block text-sm font-semibold text-red-200"
                    >
                      {customerValidationErrors.phone}
                    </span>
                  )}
                </label>
              </div>

              {publicBookingGuidance && (
                <p
                  aria-live="polite"
                  className="rounded-xl border border-amber-300/30 bg-amber-950/25 px-4 py-3 text-sm font-semibold leading-5 text-amber-100"
                  role="status"
                >
                  {publicBookingGuidance}
                </p>
              )}

              {paymentRedirectStatus && (
                <p className="rounded-xl border border-[#D8C36A]/25 bg-black/30 px-4 py-3 text-sm font-semibold text-[#F2D66C]">
                  {paymentRedirectStatus}
                </p>
              )}

              <div className="rounded-xl border border-[#D8C36A]/25 bg-black/30 p-3 text-sm leading-6 text-zinc-300 sm:rounded-2xl sm:p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
                  PLEASE NOTE
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Beverages are charged separately</li>
                  <li>
                    A 12.5% gratuity will be applied to beverages and
                    the dinner portion of your tickets for bookings of 6
                    or more
                  </li>
                </ul>
              </div>

              {shouldShowInstallOpportunity && (
                <div className="rounded-xl border border-white/10 bg-black/25 p-3 sm:rounded-2xl sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
                        Get the Zingara App
                      </p>
                      <p className="mt-2 text-sm leading-6 text-zinc-300">
                        Install Zingara for quick access to your
                        booking, digital tickets and important show
                        updates.
                      </p>
                      {isIOSDevice && !installPrompt && (
                        <p className="mt-2 text-xs leading-5 text-zinc-400">
                          To install Zingara on iPhone, tap Share and
                          choose Add to Home Screen.
                        </p>
                      )}
                    </div>
                    {installPrompt && (
                      <button
                        type="button"
                        onClick={() => void installZingaraApp()}
                        className="shrink-0 rounded-full border border-[#D8C36A]/45 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                      >
                        Install App
                      </button>
                    )}
                  </div>
                  {installPromptStatus && (
                    <p className="mt-3 text-sm font-semibold text-emerald-300">
                      {installPromptStatus}
                    </p>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-[#D8C36A]/20 bg-black/25 p-3 text-center sm:rounded-2xl sm:p-4">
                <p className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
                  Accepted Secure Payment Methods
                </p>
                <div className="mt-3">
                  <PaymentBrandMarks />
                </div>
              </div>

              <label className="flex gap-3 rounded-xl border border-[#D8C36A]/25 bg-black/30 p-3 text-sm leading-6 text-zinc-300 sm:rounded-2xl sm:p-4">
                <input
                  required
                  type="checkbox"
                  checked={hasAcceptedBookingTerms}
                  onChange={(event) => {
                    setHasAcceptedBookingTerms(event.target.checked);
                    if (event.target.checked) {
                      setPaymentRedirectStatus("");
                    }
                  }}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#D8C36A]"
                />
                <span>
                  I have read and agree to the{" "}
                  <Link
                    href="/royal-decrees/terms-and-conditions"
                    target="_blank"
                    className="font-semibold text-[#F2D66C] underline decoration-[#D8C36A]/45 underline-offset-4 transition hover:text-white"
                  >
                    Terms & Conditions
                  </Link>
                  ,{" "}
                  <Link
                    href="/royal-decrees/booking-terms"
                    target="_blank"
                    className="font-semibold text-[#F2D66C] underline decoration-[#D8C36A]/45 underline-offset-4 transition hover:text-white"
                  >
                    Booking Terms
                  </Link>
                  {" "}and{" "}
                  <Link
                    href="/royal-decrees/booking-and-cancellation-policy"
                    target="_blank"
                    className="font-semibold text-[#F2D66C] underline decoration-[#D8C36A]/45 underline-offset-4 transition hover:text-white"
                  >
                    Booking & Cancellation Policy
                  </Link>
                  .
                </span>
              </label>

              {bookingReference && (
                <div className="space-y-4 sm:space-y-5">
                  <div className="rounded-xl border border-emerald-400/40 bg-emerald-950/30 p-3.5 sm:rounded-2xl sm:p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300 sm:text-sm">
                      Step 6 · Complete
                    </p>
                        <p className="mt-1 text-base font-bold text-white">
                          Booking Confirmed
                        </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3">
                      <div>
                        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-emerald-200/70 sm:text-xs">
                          Reference
                        </p>
                        <p className="mt-1 break-words font-mono text-sm font-bold sm:text-lg">
                          {bookingReference}
                        </p>
                      </div>
                      <div>
                        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-emerald-200/70 sm:text-xs">
                          Guests
                        </p>
                        <p className="mt-1 text-base font-bold sm:text-lg">
                          {partySize}
                        </p>
                      </div>
                      <div>
                        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-emerald-200/70 sm:text-xs">
                          Booking Amount
                        </p>
                        <p className="mt-1 text-base font-bold sm:text-lg">
                          {formatCurrency(amountDueNow)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-emerald-200/70 sm:text-xs">
                          Transaction Fee
                        </p>
                        <p className="mt-1 text-base font-bold sm:text-lg">
                          {formatCurrency(
                            payFastTransaction.transactionFeeAmount,
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-emerald-200/70 sm:text-xs">
                          Total Paid
                        </p>
                        <p className="mt-1 text-base font-bold sm:text-lg">
                          {formatCurrency(
                            payFastTransaction.providerGrossAmount,
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-emerald-200/70 sm:text-xs">
                          Status
                        </p>
                        <p className="mt-1 text-base font-bold sm:text-lg">
                          Confirmed
                        </p>
                      </div>
                    </div>
                    {balanceDue > 0 && (
                      <p className="mt-4 text-zinc-300">
                        Balance Due: {formatCurrency(balanceDue)}
                      </p>
                    )}
                  </div>

                  <div className="rounded-[1.25rem] border border-[#D8C36A]/45 bg-black p-3 shadow-[0_0_45px_rgba(216,195,106,0.16)] sm:rounded-[1.5rem] sm:p-6">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-5">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#D8C36A] sm:text-sm sm:tracking-[0.24em]">
                          Digital Ticket
                        </p>
                        <div
                          aria-label={venueConfig.brandTitle}
                          className="mt-2 h-10 w-32 bg-contain bg-left bg-no-repeat sm:h-16 sm:w-44"
                          style={{
                            backgroundImage: `url("${venueConfig.ticketBranding.ticketLogoUrl || venueConfig.logoUrl}")`,
                          }}
                        />
                        <div className="mt-3 space-y-1.5 text-xs leading-5 text-zinc-300 sm:mt-4 sm:space-y-2 sm:text-sm">
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
                            {getCompactShowDateTime(selectedShow)}
                          </p>
                          <p>
                            <span className="text-zinc-500">
                              Zone:
                            </span>{" "}
                            {selectedZone.title}
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
                              Booking Amount:
                            </span>{" "}
                            {formatCurrency(amountDueNow)}
                          </p>
                          <p>
                            <span className="text-zinc-500">
                              Transaction Fee:
                            </span>{" "}
                            {formatCurrency(
                              payFastTransaction.transactionFeeAmount,
                            )}
                          </p>
                          <p>
                            <span className="text-zinc-500">
                              Total Paid:
                            </span>{" "}
                            {formatCurrency(
                              payFastTransaction.providerGrossAmount,
                            )}
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

                      <ScannableQrCode
                        value={createTicketCode(bookingReference)}
                        label="Scannable live ticket QR code"
                        logoUrl={venueConfig.faviconUrl}
                        className="mx-auto mb-2 w-[min(70vw,206px)] max-w-[206px] shrink-0 p-4 pb-5 md:mx-0 md:mb-0 md:w-full md:max-w-[230px]"
                      />
                    </div>
                    <p className="mt-3 break-all border-t border-white/10 pt-3 font-mono text-[0.65rem] text-zinc-400 sm:mt-5 sm:pt-4 sm:text-sm">
                      {createTicketCode(bookingReference)}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4 sm:gap-3">
                      <a
                        href={getPlatformTicketUrl(bookingReference)}
                        className="inline-flex rounded-full border border-[#D8C36A]/40 px-4 py-2.5 text-xs font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black sm:px-5 sm:py-3 sm:text-sm"
                      >
                        View Digital Ticket
                      </a>
                      {partySize > 1 && (
                        <a
                          href={`${getPlatformTicketUrl(bookingReference)}&customise=1`}
                          className="inline-flex rounded-full border border-white/15 px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-white hover:text-black sm:px-5 sm:py-3 sm:text-sm"
                        >
                          Customise Tickets
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={downloadTicketPdf}
                        className="inline-flex items-center gap-2 rounded-full bg-[#D8C36A] px-4 py-2.5 text-xs font-bold text-black shadow-[0_0_24px_rgba(216,195,106,0.22)] transition hover:bg-[#F2D66C] sm:px-5 sm:py-3 sm:text-sm"
                      >
                        <span aria-hidden="true">↓</span>
                        Download Ticket
                      </button>
                      {ticketDownloadStatus && (
                        <span className="text-sm font-semibold text-emerald-300">
                          {ticketDownloadStatus}
                        </span>
                      )}
                    </div>
                  </div>

                  {showTicketReadyPrompt && shouldShowInstallOpportunity && (
                    <div className="rounded-[1.25rem] border border-[#D8C36A]/40 bg-[radial-gradient(circle_at_top,#241B0A_0%,#111111_48%,#050505_100%)] p-4 shadow-[0_0_36px_rgba(216,195,106,0.14)] sm:rounded-[1.5rem] sm:p-5">
                      <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#F2D66C]">
                        Get the Zingara App
                      </p>
                      <p className="mt-3 text-sm leading-6 text-zinc-300 sm:text-base">
                        Install Zingara for quick access to your
                        confirmed booking, digital tickets and important
                        show updates.
                      </p>

                      {isIOSDevice && !installPrompt && (
                        <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4 text-sm text-zinc-300">
                          <p className="font-semibold text-white">
                            iPhone / iPad setup
                          </p>
                          <p className="mt-2 text-zinc-400">
                            To install Zingara on iPhone, tap Share and
                            choose Add to Home Screen.
                          </p>
                        </div>
                      )}

                      {installPromptStatus && (
                        <p className="mt-3 text-sm font-semibold text-emerald-300">
                          {installPromptStatus}
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2 sm:gap-3">
                        {installPrompt && (
                          <button
                            type="button"
                            onClick={() => void installZingaraApp()}
                            className="rounded-full bg-[#D8C36A] px-4 py-2.5 text-xs font-bold text-black shadow-[0_0_24px_rgba(216,195,106,0.2)] transition hover:bg-[#F2D66C] sm:px-5 sm:py-3 sm:text-sm"
                          >
                            Install App
                          </button>
                        )}
                        {!(isIOSDevice && !isStandaloneApp) && (
                          <button
                            type="button"
                            onClick={() => void enableBookingUpdates()}
                            className="rounded-full border border-[#D8C36A]/45 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black sm:px-5 sm:py-3 sm:text-sm"
                          >
                            Get Booking Updates
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowTicketReadyPrompt(false)}
                          className="rounded-full border border-white/15 px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-white hover:text-black sm:px-5 sm:py-3 sm:text-sm"
                        >
                          Maybe Later
                        </button>
                      </div>
                      {bookingUpdatesStatus && (
                        <p className="mt-3 text-sm font-semibold text-emerald-300">
                          {bookingUpdatesStatus}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                aria-busy={isPayFastRedirecting}
                disabled={
                  !selectedShow ||
                  isPayFastRedirecting ||
                  !hasAcceptedBookingTerms
                }
                className="inline-flex w-full items-center justify-center gap-3 rounded-full bg-white px-6 py-3 text-base font-semibold text-black transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40 sm:px-8 sm:py-4 sm:text-xl"
              >
                {isPayFastRedirecting && (
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-black/25 border-t-black"
                  />
                )}
                {isPayFastRedirecting
                  ? getCurrencyCents(amountDueNow) === 0
                    ? "Completing Booking..."
                    : "Processing Secure Payment..."
                  : getCurrencyCents(amountDueNow) === 0
                    ? "Complete Booking"
                    : "Confirm Booking"}
              </button>
              <p className="text-center text-xs leading-5 text-zinc-500">
                {getCurrencyCents(amountDueNow) === 0
                  ? "Your booking will be completed securely. Digital tickets and confirmation email are sent after confirmation."
                  : "Secure online payment. Digital tickets and confirmation email are sent after PayFast confirms payment."}
              </p>
            </form>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() =>
          window.scrollTo({ top: 0, behavior: "smooth" })
        }
        className={`mobile-portrait-back-to-top fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-50 hidden h-12 w-12 place-items-center rounded-full border border-[#D8C36A]/45 bg-black/75 text-xl font-bold text-[#F2D66C] shadow-[0_0_26px_rgba(216,195,106,0.28)] backdrop-blur-xl transition duration-300 ${
          isBackToTopVisible
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-3 scale-95 opacity-0"
        }`}
        aria-label="Back to top"
      >
        ↑
      </button>
    </main>
  );
}
