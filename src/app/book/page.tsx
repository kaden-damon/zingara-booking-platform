"use client";

import Link from "next/link";
import {
  type ReactNode,
  useEffect,
  useState,
} from "react";
import QRCode from "qrcode";

import ScannableQrCode from "../components/ScannableQrCode";
import { sendZingaraBrowserNotification } from "../../lib/browserNotifications";
import { getTemplates } from "../../lib/supabase/communicationTemplates";
import { getShows } from "../../lib/supabase/shows";
import { getVenueSettings } from "../../lib/supabase/venueSettings";
import {
  type BookingAddon,
  type CommunicationRecord,
  type CommunicationTemplate,
  type CustomerInfo,
  type DemoTable,
  type DemoWaitlistEntry,
  type PaymentOption,
  type PromoDiscountType,
  type DemoShow,
  type SeatingZone,
  applyTableAllocation,
  createCommunicationRecord,
  createTablesForShow,
  createTicketCode,
  defaultCommunicationTemplates,
  defaultVenueSettings,
  defaultShows,
  findBestTableAllocation,
  getConfiguredZoneDepositPercentage,
  getConfiguredZonePrice,
  getCommunicationTemplate,
  getCompactShowDateTime,
  getSouthAfricaShowTime,
  getStoredDemoBookings,
  getStoredDemoTables,
  getStoredDemoWaitlist,
  getTableAllocationDisplay,
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
const serviceFeeGuestThreshold = 6;
const serviceFeeRate = 0.125;
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
      findBestTableAllocation(
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
  isLimited = false,
) {
  if (!isGroupSizeAvailable) {
    return "Not Available For This Group Size";
  }

  if (!hasEnoughInventory) {
    return "No suitable table available";
  }

  if (isLimited) {
    return "Limited";
  }

  return "Available";
}

function getAvailabilityState(
  option: SeatingOption,
  guests: number,
  selectedShowId: string,
  tables: DemoTable[],
) {
  const remainingSeats = getRemainingSeats(
    option,
    selectedShowId,
    tables,
  );
  const isGroupSizeAvailable = isAvailableForParty(option, guests);
  const bestAllocation = findBestTableAllocation(
    tables,
    selectedShowId,
    option.id,
    guests,
  );
  const bestTable = bestAllocation?.table;
  const hasEnoughInventory = Boolean(bestTable);
  const isAvailable = isGroupSizeAvailable && hasEnoughInventory;
  const isLimited =
    isAvailable &&
    (remainingSeats <= Math.max(guests * 2, 6) ||
      (bestTable?.seatCapacity ?? 0) === guests);

  return {
    availabilityMessage: getAvailabilityMessage(
      isGroupSizeAvailable,
      hasEnoughInventory,
      isLimited,
    ),
    bestTable,
    bestAllocation,
    isAvailable,
    isGroupSizeAvailable,
    isLimited,
    remainingSeats,
  };
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

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function createImagePdfBlob(
  jpegDataUrl: string,
  imageWidth: number,
  imageHeight: number,
) {
  const encoder = new TextEncoder();
  const imageBytes = dataUrlToBytes(jpegDataUrl);
  const pageWidth = 595;
  const pageHeight = 842;
  const chunks: BlobPart[] = [];
  const offsets: number[] = [];
  let byteLength = 0;

  function addChunk(bytes: Uint8Array) {
    const chunk = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(chunk).set(bytes);
    chunks.push(chunk);
    byteLength += bytes.length;
  }

  function addString(value: string) {
    const bytes = encoder.encode(value);

    addChunk(bytes);
  }

  function addBytes(bytes: Uint8Array) {
    addChunk(bytes);
  }

  function addObject(id: number, body: () => void) {
    offsets[id] = byteLength;
    addString(`${id} 0 obj\n`);
    body();
    addString("\nendobj\n");
  }

  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ`;

  addString("%PDF-1.4\n");
  addObject(1, () =>
    addString("<< /Type /Catalog /Pages 2 0 R >>"),
  );
  addObject(2, () =>
    addString("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
  );
  addObject(3, () =>
    addString(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    ),
  );
  addObject(4, () => {
    addString(
      `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
    );
    addBytes(imageBytes);
    addString("\nendstream");
  });
  addObject(5, () =>
    addString(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
  );

  const xrefOffset = byteLength;

  addString(`xref\n0 6\n0000000000 65535 f \n`);
  for (let id = 1; id <= 5; id += 1) {
    addString(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  addString(
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  );

  return new Blob(chunks, { type: "application/pdf" });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function loadImageFromUrl(url: string) {
  try {
    const response = await fetch(url, { mode: "cors" });
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const image = await loadImage(objectUrl);

    URL.revokeObjectURL(objectUrl);
    return image;
  } catch {
    return null;
  }
}

export default function BookingPage() {
  const [shows, setShows] = useState<DemoShow[]>([]);
  const [venueSettings, setVenueSettings] = useState(
    defaultVenueSettings,
  );
  const [communicationTemplates, setCommunicationTemplates] =
    useState<CommunicationTemplate[]>(defaultCommunicationTemplates);
  const [selectedShowId, setSelectedShowId] = useState("");
  const [selectedShowDate, setSelectedShowDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(
    getMonthKey(defaultShows[0]?.date ?? "2026-06-01"),
  );
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
  const discountedSubtotal = Math.max(subtotal - discountAmount, 0);
  const serviceFeeAmount =
    partySize >= serviceFeeGuestThreshold
      ? Math.round(discountedSubtotal * serviceFeeRate)
      : 0;
  const total = discountedSubtotal + serviceFeeAmount;
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
  const guestVisibleShows = shows.filter(isGuestVisibleShow);
  const showDateSet = new Set(
    guestVisibleShows.map((show) => show.date),
  );
  const calendarDays = getCalendarDays(calendarMonth);
  const selectedDateShows = guestVisibleShows.filter(
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
        selectedShowId,
        tables,
      ),
    );
  const canJoinWaitlist =
    Boolean(selectedShowId) &&
    selectedShowIsBookable &&
    !hasBookableSeatingOption;
  const previewTableAllocation =
    selectedZone && selectedShowId
      ? findBestTableAllocation(
          tables,
          selectedShowId,
          selectedZone.id,
          partySize,
        )
      : undefined;
  const customerDetailsComplete = Boolean(
    customerInfo.name.trim() &&
      customerInfo.email.trim() &&
      customerInfo.phone.trim(),
  );
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
  const activeProgressIndex = bookingReference ? 5 : activeBookingStep;
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

  function selectPartySize(nextPartySize: number) {
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
        selectedShowId,
        tables,
      )
        ? null
        : currentZone,
    );
    setPreviewSeatingZone((currentZone) =>
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
    let isMounted = true;

    async function loadShowInventory() {
      const nextShows = await getShows();
      const nextTables = getStoredDemoTables();
      const nextVenueSettings = await getVenueSettings();
      const nextCommunicationTemplates = await getTemplates();
      const nextGuestVisibleShows = nextShows.filter(isGuestVisibleShow);

      if (!isMounted) {
        return;
      }

      console.log("[Zingara booking] booking page show source", {
        bookableShows: nextGuestVisibleShows
          .filter(isGuestBookableShow)
          .map((show) => ({
          date: show.date,
          id: show.id,
          label: show.label,
          status: show.operationalStatus ?? "active",
          time: getSouthAfricaShowTime(show),
        })),
        loadedShows: nextShows.map((show) => ({
          date: show.date,
          id: show.id,
          label: show.label,
          status: show.operationalStatus ?? "active",
          time: getSouthAfricaShowTime(show),
        })),
      });

      setShows(nextShows);
      setTables(nextTables);
      setVenueSettings(nextVenueSettings);
      setCommunicationTemplates(nextCommunicationTemplates);
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
      setCalendarMonth((currentMonth) =>
        nextGuestVisibleShows.some(
          (show) => getMonthKey(show.date) === currentMonth,
        )
          ? currentMonth
          : getMonthKey(
              nextGuestVisibleShows[0]?.date ?? defaultShows[0].date,
            ),
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
    window.addEventListener(
      "zingara-demo-communication-templates-updated",
      loadShowInventory,
    );

    return () => {
      isMounted = false;
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
      window.removeEventListener(
        "zingara-demo-communication-templates-updated",
        loadShowInventory,
      );
      window.clearTimeout(hydrationTimer);
    };
  }, []);

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

  function handleContinueBooking() {
    if (
      !selectedZone ||
      !selectedShowId ||
      !customerDetailsComplete ||
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
      !customerDetailsComplete ||
      !isAvailableForBooking(
        selectedZone,
        partySize,
        selectedShow.id,
        tables,
      )
    ) {
      return;
    }

    const tableAllocation = findBestTableAllocation(
      tables,
      selectedShow.id,
      selectedZone.id,
      partySize,
    );

    if (!tableAllocation) {
      return;
    }

    const allocatedTable = tableAllocation.table;
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
      bookingDate: `${selectedShow.date} ${getSouthAfricaShowTime(selectedShow)}`,
      addons: selectedAddons,
      addonsTotal,
      subtotalPrice: subtotal,
      discountAmount,
      serviceFeeAmount,
      totalPrice: total,
      pricePerPerson: dynamicPricePerPerson,
      paymentOption,
      paymentStatus:
        paymentOption === "deposit"
          ? ("deposit-paid" as const)
          : ("fully-paid" as const),
      depositPercentage,
      amountPaid: amountDueNow,
      balanceDue,
      promoCode: appliedPromoCode?.code,
      promoLabel: appliedPromoCode?.description,
      source: "online" as const,
      ticketCode: createTicketCode(reference),
      ticketIssuedAt: createdAt,
      customer: customerInfo,
      status:
        paymentOption === "deposit"
          ? ("pending-payment" as const)
          : ("confirmed" as const),
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
          toStatus:
            paymentOption === "deposit"
              ? ("pending-payment" as const)
              : ("confirmed" as const),
          note:
            paymentOption === "deposit"
              ? "Deposit payment recorded"
              : "Full payment recorded",
          createdAt,
        },
      ],
      operationalNotes: customerNotes.trim(),
      cancellationReason: "",
      refundNotes: "",
      communicationHistory: [],
      createdAt,
    };
    const reservationTemplateTrigger =
      booking.status === "pending-payment" ||
      booking.paymentStatus === "deposit-paid"
        ? ("reservation-pending" as const)
        : ("reservation-confirmed" as const);
    const bookingConfirmationTemplate = getCommunicationTemplate(
      communicationTemplates,
      reservationTemplateTrigger,
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
            trigger: reservationTemplateTrigger,
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
    const nextTables = applyTableAllocation(
      tables,
      tableAllocation,
      reference,
      customerInfo.name,
    );

    storeDemoBookings(nextBookings);
    storeDemoTables(nextTables);
    setTables(nextTables);
    setAllocatedTableNumber(allocatedTable.tableNumber);
    setBookingReference(reference);
    void sendZingaraBrowserNotification("booking-confirmed");
  }

  function getZoneAvailability(option: SeatingOption) {
    const availability = getAvailabilityState(
      option,
      partySize,
      selectedShowId,
      tables,
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
    if (!bookingReference || !selectedShow || !selectedZone) {
      return;
    }

    setTicketDownloadStatus("Preparing ticket...");

    const canvas = document.createElement("canvas");
    const width = 1200;
    const height = 1700;
    const context = canvas.getContext("2d");

    if (!context) {
      setTicketDownloadStatus("Unable to prepare ticket.");
      return;
    }

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#050505";
    context.fillRect(0, 0, width, height);

    const gradient = context.createRadialGradient(
      width / 2,
      180,
      80,
      width / 2,
      260,
      920,
    );

    gradient.addColorStop(0, "#2A1710");
    gradient.addColorStop(0.55, "#111111");
    gradient.addColorStop(1, "#050505");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#D8C36A";
    context.lineWidth = 4;
    context.strokeRect(56, 56, width - 112, height - 112);

    const logo = await loadImageFromUrl(
      venueConfig.ticketBranding.ticketLogoUrl || venueConfig.logoUrl,
    );

    if (logo) {
      const logoWidth = 300;
      const logoHeight = (logo.height / logo.width) * logoWidth;

      context.drawImage(logo, 80, 86, logoWidth, logoHeight);
    } else {
      context.fillStyle = "#D8C36A";
      context.font = "700 56px serif";
      context.fillText("ZINGARA", 80, 150);
    }

    context.fillStyle = "#D8C36A";
    context.font = "700 28px sans-serif";
    context.fillText("LIVE DIGITAL TICKET", 80, 285);
    context.fillStyle = "#FFFFFF";
    context.font = "700 54px sans-serif";
    context.fillText(customerInfo.name || "Guest", 80, 365);
    context.fillStyle = "#A1A1AA";
    context.font = "400 30px sans-serif";
    context.fillText(getCompactShowDateTime(selectedShow), 80, 420);

    const qrValue = new URL(
      getTicketUrl(bookingReference),
      window.location.origin,
    ).toString();
    const qrDataUrl = await QRCode.toDataURL(qrValue, {
      color: { dark: "#000000", light: "#FFFFFF" },
      errorCorrectionLevel: "H",
      margin: 2,
      scale: 10,
      width: 420,
    });
    const qrImage = await loadImage(qrDataUrl);

    context.fillStyle = "#FFFFFF";
    context.fillRect(690, 250, 430, 430);
    context.drawImage(qrImage, 705, 265, 400, 400);

    const detailRows = [
      ["Booking Reference", bookingReference],
      ["Ticket Code", createTicketCode(bookingReference)],
      ["Seating", selectedZone.title],
      ["Guests", `${partySize}`],
      ["Service Fee", formatCurrency(serviceFeeAmount)],
      ["Total Due", formatCurrency(total)],
      ["Payment", paymentOption === "deposit" ? "Deposit Paid" : "Paid"],
      ["Paid Today", formatCurrency(amountDueNow)],
      ["Balance", formatCurrency(balanceDue)],
    ].filter(
      ([label, value]) =>
        label !== "Service Fee" ||
        value !== formatCurrency(0),
    );

    let y = 570;

    for (const [label, value] of detailRows) {
      context.fillStyle = "#71717A";
      context.font = "700 24px sans-serif";
      context.fillText(label.toUpperCase(), 80, y);
      context.fillStyle = "#FFFFFF";
      context.font = "700 36px sans-serif";
      context.fillText(value, 80, y + 46);
      y += 96;
    }

    const ticketUrlY = Math.max(y + 24, 1420);
    context.fillStyle = "#D8C36A";
    context.font = "700 28px sans-serif";
    context.fillText("LIVE TICKET URL", 80, ticketUrlY);
    context.fillStyle = "#A1A1AA";
    context.font = "400 26px sans-serif";
    context.fillText(qrValue, 80, ticketUrlY + 45, 1040);
    context.fillStyle = "#71717A";
    context.font = "400 22px sans-serif";
    context.fillText(
      "This PDF is a demo ticket export. The live ticket URL reflects the latest booking and check-in status.",
      80,
      ticketUrlY + 115,
      1040,
    );

    const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.94);
    const pdfBlob = createImagePdfBlob(jpegDataUrl, width, height);
    const downloadUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");

    link.href = downloadUrl;
    link.download = `zingara-ticket-${bookingReference}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
    setTicketDownloadStatus("Ticket downloaded.");
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

  return (
    <main className="relative isolate z-10 min-h-screen overflow-x-hidden bg-black px-3 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6 text-white sm:px-6 sm:py-14 lg:py-16">
      <div className="relative z-10 mx-auto max-w-5xl">
        <h1 className="mb-3.5 text-left text-2xl font-bold min-[390px]:text-3xl sm:mb-4 sm:text-5xl lg:text-6xl">
          Book Your Experience
        </h1>

        <p className="mb-9 max-w-3xl text-left text-base leading-6 text-zinc-400 sm:mb-14 sm:text-2xl">
          {venueConfig.subtitle}
        </p>

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
                  {getDateDisplay(selectedShowDate)}
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
                      guestVisibleShows.filter(
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
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="zingara-heading text-xl font-bold text-white sm:text-3xl">
                  Step 2 · Guests
                </p>
                <p className="zingara-subheading mt-1.5 max-w-2xl text-sm leading-5 text-zinc-300 sm:mt-2 sm:text-lg sm:leading-6 lg:whitespace-nowrap">
                  Choose 1 to 21 guests. Seating rules update instantly.
                </p>
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-end lg:shrink-0">
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
                  onClick={() => selectPartySize(Math.min(21, partySize + 1))}
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
                  Availability is based on party size and live
                  table fit.
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
                        pp · {availability.remainingSeats} Seats · Best Fit{" "}
                        {getTableAllocationDisplay(
                          availability.bestAllocation,
                        )}
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
                  No Suitable Seating Found
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
                    Full Name
                  </span>
                  <input
                    required
                    value={customerInfo.name}
                    onChange={(event) =>
                      setCustomerInfo((currentInfo) => ({
                        ...currentInfo,
                        name: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm sm:rounded-2xl sm:p-3 sm:text-base"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:mb-2 sm:text-sm">
                    Email
                  </span>
                  <input
                    required
                    type="email"
                    value={customerInfo.email}
                    onChange={(event) =>
                      setCustomerInfo((currentInfo) => ({
                        ...currentInfo,
                        email: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm sm:rounded-2xl sm:p-3 sm:text-base"
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:mb-2 sm:text-sm">
                    Phone Number
                  </span>
                  <input
                    required
                    type="tel"
                    value={customerInfo.phone}
                    onChange={(event) =>
                      setCustomerInfo((currentInfo) => ({
                        ...currentInfo,
                        phone: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm sm:rounded-2xl sm:p-3 sm:text-base"
                  />
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

              <button
                type="button"
                disabled={!customerDetailsComplete}
                onClick={() => setActiveBookingStep(4)}
                className="mt-5 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40 sm:mt-6 sm:py-3 sm:text-base"
              >
                Continue To Payment
              </button>
            </section>
          )}

          {selectedZone && customerDetailsComplete && activeBookingStep === 4 && (
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
                    Review totals, select full payment or deposit, then
                    continue to confirmation.
                  </p>
                </div>
                <span className="w-fit rounded-full border border-[#D8C36A]/30 bg-black/30 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#F2D66C] sm:px-4 sm:py-2 sm:text-sm">
                  {previewTableAllocation
                    ? "Best-fit seating held internally"
                    : "Seating fit pending"}
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
                    Confirmed internally
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

                <div className="rounded-xl border border-white/10 bg-black/30 p-3 sm:rounded-2xl sm:p-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A] sm:mb-4 sm:text-sm">
                    Optional Add-Ons
                  </p>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 sm:gap-3">
                    {bookingAddons.map((addon) => {
                      const isSelected = selectedAddonIds.includes(
                        addon.id,
                      );

                      return (
                        <label
                          key={addon.id}
                          className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 transition sm:gap-3 sm:rounded-2xl sm:p-4 ${
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
                            <span className="block text-sm font-semibold text-white">
                              {addon.name}
                            </span>
                            <span className="mt-0.5 block text-xs text-zinc-400 sm:mt-1 sm:text-sm">
                              {formatCurrency(addon.price)}
                            </span>
                          </span>
                        </label>
                      );
                    })}
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
                          Deposit Only ({depositPercentage}%)
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
                      <span>Due Today</span>
                      <span>{formatCurrency(amountDueNow)}</span>
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
                disabled={!customerDetailsComplete}
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

      {previewSeatingZone && activeBookingStep === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[1.5rem] border border-[#8D7A2F]/55 bg-[radial-gradient(circle_at_top,#25170D_0%,#0E0C0A_48%,#040404_100%)] p-5 shadow-[0_0_70px_rgba(216,195,106,0.18)] transition sm:rounded-[2rem] sm:p-7">
            {(() => {
              const availability = getAvailabilityState(
                previewSeatingZone,
                partySize,
                selectedShowId,
                tables,
              );
              const status = availability.availabilityMessage;
              const statusClass = !availability.isAvailable
                ? "border-zinc-600 bg-black/40 text-zinc-300"
                : availability.isLimited
                  ? "border-amber-300/45 bg-amber-950/25 text-amber-100"
                  : "border-emerald-300/35 bg-emerald-950/20 text-emerald-200";

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
                      pp · {availability.remainingSeats} Seats · Best Fit{" "}
                      {getTableAllocationDisplay(
                        availability.bestAllocation,
                      )}
                    </p>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-zinc-300">
                    {previewSeatingZone.description}
                  </p>

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

      {isConfirmationOpen && selectedZone && (
        <div className="fixed inset-x-0 bottom-0 top-[6.9rem] z-30 flex items-start justify-center overflow-y-auto bg-black/80 px-2.5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm min-[390px]:top-[7.4rem] sm:inset-0 sm:z-50 sm:items-center sm:overflow-visible sm:px-6 sm:py-10">
          <div className="max-h-[calc(100dvh-8.65rem-env(safe-area-inset-bottom))] w-full max-w-3xl overflow-y-auto rounded-[1.5rem] border border-[#8D7A2F]/50 bg-[radial-gradient(circle_at_top,#2A1710_0%,#111_46%,#050505_100%)] p-3.5 shadow-[0_0_80px_rgba(216,195,106,0.18)] min-[390px]:max-h-[calc(100dvh-9.15rem-env(safe-area-inset-bottom))] sm:max-h-full sm:rounded-[2rem] sm:p-6">
            <div className="flex flex-row items-start justify-between gap-3 border-b border-[#8D7A2F]/30 pb-4 sm:pb-6">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A] sm:mb-2 sm:text-sm sm:tracking-[0.24em]">
                  Step 5 · Payment
                </p>

                <h2 className="text-2xl font-bold sm:text-3xl">
                  Payment & Confirmation
                </h2>
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
                  Confirmed internally
                </p>
                {!bookingReference && previewTableAllocation && (
                  <p className="mt-1.5 text-xs text-zinc-400 sm:mt-2 sm:text-sm">
                    Best-fit assignment is held for operations.
                  </p>
                )}
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
                  Add-Ons
                </p>
                {selectedAddons.length === 0 ? (
                  <p className="mt-1.5 text-sm text-zinc-400 sm:mt-2 sm:text-base">
                    No optional extras selected.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
                    {selectedAddons.map((addon) => (
                      <span
                        key={addon.id}
                        className="rounded-full border border-[#D8C36A]/30 bg-black/40 px-2.5 py-1 text-xs text-[#F2D66C] sm:px-3 sm:text-sm"
                      >
                        {addon.name} · {formatCurrency(addon.price)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="col-span-2 rounded-xl border border-white/10 bg-black/30 p-3 sm:rounded-2xl sm:p-5">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-xs">
                  Payment Plan
                </p>
                <p className="mt-1.5 text-base font-bold sm:mt-2 sm:text-xl">
                  {paymentOption === "deposit"
                    ? `${depositPercentage}% Deposit`
                    : "Full Payment"}
                </p>
                <p className="mt-1.5 text-sm text-zinc-300 sm:mt-2">
                  Due today: {formatCurrency(amountDueNow)}
                  {balanceDue > 0 &&
                    ` · Balance due: ${formatCurrency(balanceDue)}`}
                </p>
              </div>

              <div className="col-span-2 rounded-xl border border-[#D8C36A]/25 bg-black/30 p-3 text-sm text-zinc-300 sm:rounded-2xl sm:p-4">
                <div className="flex justify-between gap-4">
                  <span>Seating Total</span>
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
                handleFakePayment();
              }}
            >
              <h3 className="zingara-heading text-lg font-bold sm:text-xl">
                Confirm Customer Information
              </h3>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:mb-2 sm:text-sm">
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
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm sm:rounded-2xl sm:p-3 sm:text-base"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:mb-2 sm:text-sm">
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
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm sm:rounded-2xl sm:p-3 sm:text-base"
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:mb-2 sm:text-sm">
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
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm sm:rounded-2xl sm:p-3 sm:text-base"
                  />
                </label>
              </div>

              {bookingReference && (
                <div className="space-y-4 sm:space-y-5">
                  <div className="rounded-xl border border-emerald-400/40 bg-emerald-950/30 p-3.5 sm:rounded-2xl sm:p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300 sm:text-sm">
                      Step 6 · Complete
                    </p>
                        <p className="mt-1 text-base font-bold text-white">
                          Payment Approved
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
                          Paid Today
                        </p>
                        <p className="mt-1 text-base font-bold sm:text-lg">
                          {formatCurrency(amountDueNow)}
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

                      <ScannableQrCode
                        value={getTicketUrl(bookingReference)}
                        label="Scannable live ticket QR code"
                        logoUrl={venueConfig.faviconUrl}
                        className="mx-auto mb-1 w-[min(70vw,196px)] max-w-[196px] shrink-0 p-3 pb-3.5 md:mx-0 md:mb-0 md:w-full md:max-w-[220px] md:p-3"
                      />
                    </div>
                    <p className="mt-3 break-all border-t border-white/10 pt-3 font-mono text-[0.65rem] text-zinc-400 sm:mt-5 sm:pt-4 sm:text-sm">
                      {createTicketCode(bookingReference)}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4 sm:gap-3">
                      <a
                        href={getTicketUrl(bookingReference)}
                        className="inline-flex rounded-full border border-[#D8C36A]/40 px-4 py-2.5 text-xs font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black sm:px-5 sm:py-3 sm:text-sm"
                      >
                        Open Live Ticket
                      </a>
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
              )}

              <button
                type="submit"
                disabled={!selectedShow || Boolean(bookingReference)}
                className="w-full rounded-full bg-white px-6 py-3 text-base font-semibold text-black transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40 sm:px-8 sm:py-4 sm:text-xl"
              >
                {bookingReference
                  ? "Booking Stored"
                  : "Confirm Booking"}
              </button>
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
