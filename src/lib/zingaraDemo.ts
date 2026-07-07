export const demoBookingsStorageKey = "zingara-demo-bookings";
export const demoShowsStorageKey = "zingara-demo-shows";
export const demoTablesStorageKey = "zingara-demo-tables";
export const demoWaitlistStorageKey = "zingara-demo-waitlist";
export const demoCustomerCrmStorageKey = "zingara-demo-customer-crm";
export const demoCorporateRequestsStorageKey =
  "zingara-demo-corporate-requests";
export const demoCommunicationTemplatesStorageKey =
  "zingara-demo-communication-templates";
export const demoVenueSettingsStorageKey =
  "zingara-demo-venue-settings";
const legacyZingaraLogoUrl =
  "https://static.wixstatic.com/media/25de3e_83a12d0b43a149f9b491a2ce37eb2836~mv2.png/v1/fill/w_428,h_286,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Gold-Text-Effect.png";
const legacyZingaraFaviconUrl =
  "https://www.zingara.co.za/favicon.ico";
export const defaultZingaraLandingLogoUrl =
  "/brand/zingara-logo-landing.svg";
export const defaultZingaraLogoUrl = "/brand/zingara-activator.svg";
export const defaultZingaraFaviconUrl = "/brand/wax-seal.png";
export const includedBookingFeeAmount = 10;
export const defaultStandardDepositPerPerson = 550;

export function getIncludedBookingFeeBreakdown(ticketGrossAmount = 0) {
  const bookingFee = ticketGrossAmount > 0 ? includedBookingFeeAmount : 0;

  return {
    bookingFee,
    ticketAmount: Math.max(ticketGrossAmount - bookingFee, 0),
  };
}

export type DemoVenueSettings = {
  brandTitle: string;
  emailSender: {
    fromEmail: string;
    fromName: string;
    replyTo: string;
  };
  faviconUrl: string;
  logoUrl: string;
  operationalMessaging: {
    broadcastPrefix: string;
    defaultGuestMessage: string;
    reminderLeadHours: number;
  };
  operationalSettings: {
    allowDuplicateCheckIn: boolean;
    bookingCutoffHours: number;
    cancellationRule: string;
    checkInGraceMinutes: number;
    defaultDepositAmount?: number;
    defaultDepositPercentage: number;
    ticketRefreshSeconds: number;
    waitlistAutoPromotionEnabled: boolean;
    waitlistAutoPromotionThreshold: number;
  };
  showBranding: {
    heroImageUrl: string;
    posterImageUrl: string;
    tagline: string;
  };
  showTitle: string;
  socialLinks: {
    facebook: string;
    instagram: string;
    tiktok: string;
    x: string;
  };
  subtitle: string;
  supportContact: {
    email: string;
    phone: string;
    website: string;
  };
  theme: {
    accent: string;
    background: string;
    primary: string;
    surface: string;
  };
  ticketBranding: {
    accentText: string;
    footerNote: string;
    ticketLogoUrl: string;
  };
  typography: {
    bodyFont: string;
    headingFont: string;
  };
  venueId: string;
  venueName: string;
  zonePricing: Record<
    string,
    {
      depositAmount?: number;
      depositPercentage: number;
      price: number;
    }
  >;
};

export const defaultVenueSettings: DemoVenueSettings = {
  brandTitle: "Zingara",
  emailSender: {
    fromEmail: "boxoffice@zingara.example",
    fromName: "Zingara Box Office",
    replyTo: "support@zingara.example",
  },
  faviconUrl: defaultZingaraFaviconUrl,
  logoUrl: defaultZingaraLogoUrl,
  operationalMessaging: {
    broadcastPrefix: "Zingara Guest Update",
    defaultGuestMessage:
      "We look forward to welcoming you to The Royal Countess Dinner Show.",
    reminderLeadHours: 24,
  },
  operationalSettings: {
    allowDuplicateCheckIn: false,
    bookingCutoffHours: 4,
    cancellationRule:
      "Refund review required for cancellations within 48 hours of showtime.",
    checkInGraceMinutes: 30,
    defaultDepositAmount: defaultStandardDepositPerPerson,
    defaultDepositPercentage: 50,
    ticketRefreshSeconds: 20,
    waitlistAutoPromotionEnabled: false,
    waitlistAutoPromotionThreshold: 6,
  },
  showBranding: {
    heroImageUrl: "",
    posterImageUrl: "",
    tagline: "A luxury dinner show beneath the velvet lights.",
  },
  showTitle: "The Royal Countess",
  socialLinks: {
    facebook: "",
    instagram: "",
    tiktok: "",
    x: "",
  },
  subtitle: "Select your show, party size and seating experience.",
  supportContact: {
    email: "support@zingara.example",
    phone: "+27 00 000 0000",
    website: "https://zingara.example",
  },
  theme: {
    accent: "#F2D66C",
    background: "#000000",
    primary: "#D8C36A",
    surface: "#101010",
  },
  ticketBranding: {
    accentText: "The Royal Countess Zingara",
    footerNote:
      "This live ticket reflects the latest box office status.",
    ticketLogoUrl: defaultZingaraLogoUrl,
  },
  typography: {
    bodyFont: "Inter",
    headingFont: "Playfair Display",
  },
  venueId: "zingara-cape-town",
  venueName: "The Royal Countess Zingara",
  zonePricing: {
    "elevated-stage": {
      depositAmount: defaultStandardDepositPerPerson,
      depositPercentage: 50,
      price: 1470,
    },
    "golden-circle": {
      depositAmount: defaultStandardDepositPerPerson,
      depositPercentage: 40,
      price: 1470,
    },
    "middle-ring": {
      depositAmount: defaultStandardDepositPerPerson,
      depositPercentage: 35,
      price: 1260,
    },
    "royal-balcony": {
      depositAmount: defaultStandardDepositPerPerson,
      depositPercentage: 50,
      price: 1340,
    },
    "royal-booths": {
      depositAmount: defaultStandardDepositPerPerson,
      depositPercentage: 50,
      price: 1420,
    },
  },
};

export const seatingZones = [
  {
    id: "elevated-stage",
    title: "Elevated Stage",
    subtitle: "The Countess's Table",
    description:
      "The most exclusive seats in the house, positioned directly on stage.",
    price: 1470,
    colour: "bg-[#4D4213] border-[#8D7A2F]",
    adminColour: "border-[#8D7A2F] bg-[#4D4213]",
    mapClass:
      "bottom-[25%] left-1/2 h-[18%] w-[44%] -translate-x-1/2 rounded-t-[999px] rounded-b-2xl",
    glowClass: "shadow-[#C5A94B]/30 hover:shadow-[#C5A94B]/60",
    minGuests: 2,
    maxGuests: 20,
    depositPercentage: 50,
    totalCapacity: 0,
    bookedSeats: 0,
  },
  {
    id: "golden-circle",
    title: "Golden Circle",
    subtitle: "In The Heat Of The Magic",
    description:
      "Closest seating to the stage and the heart of the spectacle.",
    price: 1470,
    colour: "bg-[#4A0D2B] border-[#8F4B68]",
    adminColour: "border-[#8F4B68] bg-[#4A0D2B]",
    mapClass:
      "bottom-[42%] left-1/2 h-[18%] w-[64%] -translate-x-1/2 rounded-[999px]",
    glowClass: "shadow-[#E06B9C]/30 hover:shadow-[#E06B9C]/60",
    minGuests: 2,
    maxGuests: 20,
    depositPercentage: 40,
    totalCapacity: 86,
    bookedSeats: 0,
  },
  {
    id: "middle-ring",
    title: "Middle Ring",
    subtitle: "The Midst Of The Madness",
    description:
      "Elevated panoramic seating with sweeping views of the salon.",
    price: 1260,
    colour: "bg-[#0F5C4D] border-[#3A9D8B]",
    adminColour: "border-[#3A9D8B] bg-[#0F5C4D]",
    mapClass:
      "top-[18%] left-1/2 h-[24%] w-[82%] -translate-x-1/2 rounded-[999px]",
    glowClass: "shadow-[#55D8C1]/25 hover:shadow-[#55D8C1]/55",
    minGuests: 2,
    maxGuests: 20,
    depositPercentage: 35,
    totalCapacity: 90,
    bookedSeats: 0,
  },
  {
    id: "royal-booths",
    title: "Royal Booths",
    subtitle: "Your Private Velvet Haven",
    description:
      "Private 6-seater booths with exceptional views and privacy.",
    price: 1420,
    colour: "bg-[#5B001B] border-[#A34063]",
    adminColour: "border-[#A34063] bg-[#5B001B]",
    mapClass:
      "top-[43%] left-[6%] h-[26%] w-[24%] rounded-l-[999px] rounded-r-3xl",
    glowClass: "shadow-[#F05F8D]/30 hover:shadow-[#F05F8D]/60",
    minGuests: 2,
    maxGuests: 20,
    depositPercentage: 50,
    totalCapacity: 114,
    bookedSeats: 0,
  },
  {
    id: "royal-balcony",
    title: "Royal Balcony",
    subtitle: "An Elevated Affair",
    description:
      "Exclusive elevated private balcony seating for premium celebrations.",
    price: 1340,
    colour: "bg-[#3B1B52] border-[#8C62A8]",
    adminColour: "border-[#8C62A8] bg-[#3B1B52]",
    mapClass:
      "top-[43%] right-[6%] h-[26%] w-[24%] rounded-r-[999px] rounded-l-3xl",
    glowClass: "shadow-[#C087E8]/30 hover:shadow-[#C087E8]/60",
    minGuests: 2,
    maxGuests: 20,
    depositPercentage: 50,
    totalCapacity: 20,
    bookedSeats: 0,
  },
] as const;

export type SeatingZone = (typeof seatingZones)[number];
export type SeatingZoneId = SeatingZone["id"];
export type TableStatus = "available" | "booked" | "disabled";
export type BookingStatus =
  | "new"
  | "confirmed"
  | "pending"
  | "pending-payment"
  | "cancelled"
  | "checked-in"
  | "completed"
  | "refunded"
  | "no-show"
  | "waitlisted";
export type TicketState =
  | "Active"
  | "Checked In"
  | "Cancelled"
  | "Completed"
  | "No Show"
  | "Refunded"
  | "Waitlist"
  | "Pending Payment";
export type WaitlistStatus =
  | "waiting"
  | "promoted"
  | "converted"
  | "removed";
export type PaymentOption = "full" | "deposit";
export type PaymentStatus =
  | "pending-payment"
  | "deposit-paid"
  | "fully-paid"
  | "comp-vip"
  | "refunded";
export type PromoDiscountType = "fixed" | "percentage";
export type BookingSource =
  | "admin"
  | "box-office"
  | "corporate-direct"
  | "external-agent"
  | "marketing-campaign"
  | "online"
  | "referral"
  | "social-media"
  | "telephone"
  | "waitlist";
export type BookingAddon = {
  id: string;
  name: string;
  price: number;
};
export type DemoTable = {
  id: string;
  showId?: string;
  zoneId: SeatingZoneId;
  tableNumber: string;
  baseSeatCapacity?: number;
  baseStatus?: TableStatus;
  baseGuestNotes?: string;
  baseMergeable?: boolean;
  seatCapacity: number;
  status: TableStatus;
  guestNotes: string;
  mergeable?: boolean;
  bookingReference?: string;
  mergedFrom?: string[];
  mergedInto?: string;
  mergeHistory?: Array<{
    id: string;
    at: string;
    summary: string;
    type: "merged" | "split" | "restored";
  }>;
  showOverride?: {
    mergeable?: boolean;
    operationalNotes?: string;
    seatCapacity?: number;
    status?: TableStatus;
    updatedAt: string;
  };
};
export type TableAllocation = {
  isCombination: boolean;
  sourceTables: DemoTable[];
  table: DemoTable;
  wastedSeats: number;
};
export type DemoShow = {
  id: string;
  date: string;
  time: string;
  label: string;
  archivedAt?: string;
  description?: string;
  internalNotes?: string;
  operationalStatus?:
    | "active"
    | "inactive"
    | "sold-out"
    | "blackout"
    | "venue-closure"
    | "special-event";
  venueName?: string;
};
export type CustomerInfo = {
  name: string;
  email: string;
  phone: string;
};
export type DemoCustomerCrmRecord = {
  customerKey: string;
  notes: string;
  vipTags: string[];
  updatedAt: string;
};
export type CommunicationChannel = "email" | "push" | "sms";
export type CommunicationTrigger =
  | "booking-confirmation"
  | "payment-confirmation"
  | "reservation-confirmed"
  | "reservation-pending"
  | "complimentary-booking"
  | "corporate-tentative-booking"
  | "booking-update"
  | "table-change"
  | "waitlist-promotion"
  | "show-reminder"
  | "check-in-confirmation"
  | "cancellation-refund"
  | "ticket-resend"
  | "confirmation-resend"
  | "custom-message"
  | "operational-broadcast";
export type CommunicationTemplate = {
  id: string;
  channel: CommunicationChannel;
  trigger: CommunicationTrigger;
  name: string;
  subject: string;
  body: string;
  updatedAt: string;
};
export type CommunicationRecord = {
  id: string;
  channel: CommunicationChannel;
  showId?: string;
  subject?: string;
  sentAt: string;
  templateId?: string;
  trigger?: CommunicationTrigger;
  message: string;
};
export type BookingLifecycleEvent = {
  id: string;
  fromStatus?: BookingStatus;
  toStatus: BookingStatus;
  note?: string;
  createdAt: string;
};
export type DemoBooking = {
  reference: string;
  showId?: string;
  zoneId: SeatingZoneId;
  zoneTitle: string;
  tableId: string;
  tableNumber: string;
  partySize: number;
  bookingDate: string;
  addons?: BookingAddon[];
  addonsTotal?: number;
  subtotalPrice?: number;
  discountAmount?: number;
  serviceFeeAmount?: number;
  totalPrice: number;
  pricePerPerson: number;
  paymentOption?: PaymentOption;
  paymentStatus?: PaymentStatus;
  depositPercentage?: number;
  amountPaid?: number;
  balanceDue?: number;
  guestTickets?: GuestTicket[];
  corporatePaymentLinkSentAt?: string;
  corporatePaymentToken?: string;
  promoCode?: string;
  promoLabel?: string;
  source?: BookingSource;
  ticketCode?: string;
  ticketIssuedAt?: string;
  customer: CustomerInfo;
  status: BookingStatus;
  lifecycleHistory?: BookingLifecycleEvent[];
  operationalNotes?: string;
  cancellationReason?: string;
  refundNotes?: string;
  arrivalTime?: string;
  communicationHistory: CommunicationRecord[];
  createdAt: string;
};
export type GuestTicket = {
  checkedInAt?: string;
  email?: string;
  fullName: string;
  id: string;
  index: number;
  mobile?: string;
  regeneratedAt?: string;
  status: "checked-in" | "valid" | "void";
  ticketCode: string;
  total: number;
};
export type DemoWaitlistEntry = {
  id: string;
  showId: string;
  desiredZoneId?: SeatingZoneId;
  desiredZoneTitle?: string;
  partySize: number;
  customer: CustomerInfo;
  notes: string;
  status: WaitlistStatus;
  communicationHistory?: CommunicationRecord[];
  createdAt: string;
  promotedAt?: string;
  convertedAt?: string;
  bookingReference?: string;
};
export type CorporateRequestStatus =
  | "awaiting-acceptance"
  | "awaiting-payment"
  | "cancelled"
  | "confirmed"
  | "converted"
  | "corporate-tentative"
  | "quote-sent";
export type CorporateRequest = {
  id: string;
  companyName: string;
  contactName: string;
  contactNumber: string;
  email: string;
  preferredDate: string;
  alternativeDate: string;
  guestCount: number;
  seatingPreference: string;
  occasion: string;
  otherOccasion: string;
  dietaryRequirements: string[];
  otherDietaryRequirement: string;
  barTab: string;
  addons: string[];
  assignedConsultant?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  locationAcknowledgement?: string;
  notes: string;
  paymentLinkSentAt?: string;
  paymentLinkToken?: string;
  status: CorporateRequestStatus;
  requestType: "agent-contact" | "corporate-booking";
  source: "Corporate Direct";
  archivedAt?: string;
  communicationHistory?: CommunicationRecord[];
  linkedBookingReference?: string;
  createdAt: string;
  updatedAt: string;
};

const bookingStatusValues: BookingStatus[] = [
  "new",
  "confirmed",
  "pending",
  "pending-payment",
  "cancelled",
  "checked-in",
  "completed",
  "refunded",
  "no-show",
  "waitlisted",
];
const corporateRequestStatusValues: CorporateRequestStatus[] = [
  "corporate-tentative",
  "quote-sent",
  "awaiting-acceptance",
  "awaiting-payment",
  "confirmed",
  "converted",
  "cancelled",
];
const paymentStatusValues: PaymentStatus[] = [
  "pending-payment",
  "deposit-paid",
  "fully-paid",
  "comp-vip",
  "refunded",
];
const waitlistStatusValues: WaitlistStatus[] = [
  "waiting",
  "promoted",
  "converted",
  "removed",
];
const tableStatusValues: TableStatus[] = [
  "available",
  "booked",
  "disabled",
];
const zoneIds = seatingZones.map((zone) => zone.id);

function isKnownValue<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
): value is T {
  return (
    typeof value === "string" &&
    allowedValues.includes(value as T)
  );
}

export function isValidBookingStatus(
  value: unknown,
): value is BookingStatus {
  return isKnownValue(value, bookingStatusValues);
}

export function isValidPaymentStatus(
  value: unknown,
): value is PaymentStatus {
  return isKnownValue(value, paymentStatusValues);
}

export function isValidSeatingZoneId(
  value: unknown,
): value is SeatingZoneId {
  return isKnownValue(value, zoneIds);
}

function getSafeNumber(value: unknown, fallback = 0) {
  const numberValue =
    typeof value === "number" ? value : Number(value ?? fallback);

  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function getSafeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeCustomerInfo(customer?: Partial<CustomerInfo>) {
  return {
    email: getSafeString(customer?.email),
    name: normalizeDemoName(getSafeString(customer?.name, "Guest")),
    phone: getSafeString(customer?.phone),
  };
}

export function createTicketCode(reference: string) {
  const checksum = reference
    .split("")
    .reduce(
      (total, char, index) =>
        total + char.charCodeAt(0) * (index + 17),
      0,
    )
    .toString(36)
    .toUpperCase();

  return `ZQR-${reference.replaceAll("-", "")}-${checksum}`;
}

export function createGuestTicketCode(reference: string, index: number) {
  return `${createTicketCode(reference)}-${String(index).padStart(2, "0")}`;
}

export function normalizeTicketReference(input: string) {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return "";
  }

  try {
    const url = new URL(trimmedInput);
    const ticketSegment = url.pathname.split("/").filter(Boolean).pop();
    const ticketQuery =
      url.searchParams.get("ticket") ??
      url.searchParams.get("code") ??
      url.searchParams.get("reference");

    return decodeURIComponent(ticketQuery ?? ticketSegment ?? trimmedInput);
  } catch {
    return decodeURIComponent(trimmedInput);
  }
}

export function getGuestTicketsForBooking(booking: DemoBooking) {
  const existingTickets = Array.isArray(booking.guestTickets)
    ? booking.guestTickets
    : [];
  const total = Math.max(booking.partySize, 1);

  return Array.from({ length: total }, (_, ticketIndex) => {
    const index = ticketIndex + 1;
    const existingTicket = existingTickets.find(
      (ticket) => ticket.index === index,
    );

    return {
      checkedInAt: existingTicket?.checkedInAt,
      email:
        existingTicket?.email ??
        (index === 1 ? booking.customer.email : ""),
      fullName:
        existingTicket?.fullName ??
        (index === 1
          ? booking.customer.name
          : `Guest ${index}`),
      id: existingTicket?.id ?? `${booking.reference}-${index}`,
      index,
      mobile:
        existingTicket?.mobile ??
        (index === 1 ? booking.customer.phone : ""),
      regeneratedAt: existingTicket?.regeneratedAt,
      status: existingTicket?.status ?? "valid",
      ticketCode:
        existingTicket?.ticketCode ??
        createGuestTicketCode(booking.reference, index),
      total,
    } satisfies GuestTicket;
  });
}

export function getTicketUrl(reference: string) {
  return `/ticket/${encodeURIComponent(reference)}`;
}

function formatDemoCurrency(amount?: number) {
  return `R${(amount ?? 0).toLocaleString()}`;
}

export function getCommunicationTemplate(
  templates: CommunicationTemplate[],
  trigger: CommunicationTrigger,
  channel: CommunicationChannel,
) {
  return (
    templates.find(
      (template) =>
        template.trigger === trigger && template.channel === channel,
    ) ??
    defaultCommunicationTemplates.find(
      (template) =>
        template.trigger === trigger && template.channel === channel,
    ) ??
    defaultCommunicationTemplates.find(
      (template) => template.trigger === trigger,
    )
  );
}

export function renderCommunicationTemplate(
  templateText: string,
  booking: DemoBooking,
  show?: DemoShow,
  extras: Record<string, string | number | undefined> = {},
) {
  const variables: Record<string, string | number | undefined> = {
    amountPaid: formatDemoCurrency(booking.amountPaid),
    balanceDue: formatDemoCurrency(booking.balanceDue),
    bookingRef: booking.reference,
    customerName: booking.customer.name,
    date: show?.date ?? booking.bookingDate,
    deposit_amount: formatDemoCurrency(booking.amountPaid),
    guest_count: booking.partySize,
    guest_name: booking.customer.name,
    message: extras.message,
    outstanding_balance: formatDemoCurrency(booking.balanceDue),
    partySize: booking.partySize,
    refundSummary:
      extras.refundSummary ??
      "Any eligible refund will be reviewed by the box office.",
    seatingZone: booking.zoneTitle,
    section: booking.zoneTitle,
    showDate: show?.date ?? booking.bookingDate,
    showName: show?.label ?? booking.bookingDate,
    showTime: show?.time ?? "",
    tableNumber: booking.tableNumber,
    ticketCode: booking.ticketCode ?? createTicketCode(booking.reference),
    ticket_price: formatDemoCurrency(booking.totalPrice),
    ticketUrl: getTicketUrl(booking.reference),
    time: show?.time ?? "",
    totalPrice: formatDemoCurrency(booking.totalPrice),
    updateSummary: extras.updateSummary,
    ...extras,
  };

  return templateText.replaceAll(
    /\{\{\s*([\w]+)\s*\}\}/g,
    (match, variableName: string) =>
      variables[variableName] === undefined
        ? match
        : String(variables[variableName]),
  );
}

export function createCommunicationRecord({
  booking,
  channel,
  message,
  sentAt,
  subject,
  templateId,
  trigger,
}: {
  booking: Pick<
    DemoBooking,
    "communicationHistory" | "reference" | "showId"
  >;
  channel: CommunicationChannel;
  message: string;
  sentAt?: string;
  subject?: string;
  templateId?: string;
  trigger: CommunicationTrigger;
}): CommunicationRecord {
  return {
    id: `${booking.reference}-${trigger}-${channel}-${(booking.communicationHistory ?? []).length + 1}-${Date.now().toString(36)}`,
    channel,
    message,
    sentAt: sentAt ?? new Date().toISOString(),
    showId: booking.showId,
    subject,
    templateId,
    trigger,
  };
}

export function getBookingTicketState(
  booking: Pick<
    DemoBooking,
    "balanceDue" | "paymentStatus" | "status" | "totalPrice"
  >,
): TicketState {
  if ((booking.status ?? "confirmed") === "refunded") {
    return "Refunded";
  }

  if ((booking.status ?? "confirmed") === "cancelled") {
    return "Cancelled";
  }

  if ((booking.paymentStatus ?? "fully-paid") === "refunded") {
    return "Refunded";
  }

  if ((booking.status ?? "confirmed") === "checked-in") {
    return "Checked In";
  }

  if ((booking.status ?? "confirmed") === "completed") {
    return "Completed";
  }

  if ((booking.status ?? "confirmed") === "no-show") {
    return "No Show";
  }

  if ((booking.status ?? "confirmed") === "waitlisted") {
    return "Waitlist";
  }

  if (
    (booking.status ?? "confirmed") === "pending" ||
    (booking.status ?? "confirmed") === "pending-payment" ||
    (booking.status ?? "confirmed") === "new" ||
    (booking.paymentStatus ?? "fully-paid") === "pending-payment" ||
    (booking.balanceDue ?? 0) > 0
  ) {
    return "Pending Payment";
  }

  return "Active";
}

export function getTicketStateClasses(state: TicketState) {
  const classes: Record<TicketState, string> = {
    Active: "border-emerald-400/40 bg-emerald-950/30 text-emerald-300",
    "Checked In": "border-sky-300/40 bg-sky-950/30 text-sky-200",
    Cancelled: "border-red-400/40 bg-red-950/30 text-red-300",
    Completed:
      "border-emerald-300/40 bg-emerald-950/20 text-emerald-200",
    "No Show": "border-zinc-500/50 bg-zinc-900/70 text-zinc-300",
    "Pending Payment":
      "border-amber-300/40 bg-amber-950/30 text-amber-200",
    Refunded: "border-red-300/40 bg-red-950/25 text-red-200",
    Waitlist: "border-purple-300/40 bg-purple-950/30 text-purple-200",
  };

  return classes[state];
}

export const defaultShows: DemoShow[] = [
  {
    id: "show-2026-06-20-1900",
    date: "2026-06-20",
    time: "19:00",
    label: "Saturday, The Royal Countess Dinner Show",
  },
  {
    id: "show-2026-06-21-1700",
    date: "2026-06-21",
    time: "17:00",
    label: "Sunday, The Royal Countess Dinner Show",
  },
];

export const communicationVariableHints = [
  "customerName",
  "bookingRef",
  "showName",
  "showDate",
  "showTime",
  "guest_name",
  "date",
  "time",
  "guest_count",
  "section",
  "ticket_price",
  "deposit_amount",
  "outstanding_balance",
  "seatingZone",
  "tableNumber",
  "partySize",
  "ticketUrl",
  "ticketCode",
  "totalPrice",
  "amountPaid",
  "balanceDue",
  "message",
  "updateSummary",
  "refundSummary",
] as const;

export const defaultCommunicationTemplates: CommunicationTemplate[] = [
  {
    id: "email-reservation-confirmed",
    channel: "email",
    trigger: "reservation-confirmed",
    name: "Reservation Confirmed",
    subject: "Your Zingara reservation is confirmed",
    body: "Dear {{guest_name}}, your Zingara reservation for {{guest_count}} guests on {{date}} at {{time}} is confirmed. Section: {{section}}. Total: {{ticket_price}}. Live ticket: {{ticketUrl}}",
    updatedAt: "2026-06-15T00:00:00.000Z",
  },
  {
    id: "email-reservation-pending",
    channel: "email",
    trigger: "reservation-pending",
    name: "Reservation Pending",
    subject: "Your Zingara reservation is pending payment",
    body: "Dear {{guest_name}}, your Zingara reservation for {{guest_count}} guests on {{date}} at {{time}} is pending payment. Deposit: {{deposit_amount}}. Outstanding balance: {{outstanding_balance}}.",
    updatedAt: "2026-06-15T00:00:00.000Z",
  },
  {
    id: "email-complimentary-booking",
    channel: "email",
    trigger: "complimentary-booking",
    name: "Complimentary Booking",
    subject: "Your Zingara complimentary reservation",
    body: "Dear {{guest_name}}, your complimentary Zingara reservation for {{guest_count}} guests on {{date}} at {{time}} has been confirmed. Section: {{section}}. Live ticket: {{ticketUrl}}",
    updatedAt: "2026-06-15T00:00:00.000Z",
  },
  {
    id: "email-corporate-tentative-booking",
    channel: "email",
    trigger: "corporate-tentative-booking",
    name: "Corporate Tentative Booking",
    subject: "Your Zingara corporate booking enquiry",
    body: "Dear {{guest_name}}, your corporate booking enquiry for {{guest_count}} guests on {{date}} has been received. Preferred section: {{section}}. A quote will be issued after availability has been reviewed.",
    updatedAt: "2026-06-15T00:00:00.000Z",
  },
  {
    id: "email-booking-confirmation",
    channel: "email",
    trigger: "booking-confirmation",
    name: "Email Booking Confirmation",
    subject: "Your Royal Countess Zingara booking {{bookingRef}}",
    body: "Dear {{customerName}}, your {{showName}} booking for {{partySize}} guests is confirmed. You are seated in {{seatingZone}}, table {{tableNumber}}. Live ticket: {{ticketUrl}}",
    updatedAt: "2026-05-17T00:00:00.000Z",
  },
  {
    id: "email-payment-confirmation",
    channel: "email",
    trigger: "payment-confirmation",
    name: "Email Payment Confirmation",
    subject: "Payment received for {{bookingRef}}",
    body: "Thank you {{customerName}}. We have recorded payment of {{amountPaid}} for {{bookingRef}}. Remaining balance: {{balanceDue}}.",
    updatedAt: "2026-05-17T00:00:00.000Z",
  },
  {
    id: "email-booking-update",
    channel: "email",
    trigger: "booking-update",
    name: "Email Booking Update",
    subject: "Your Zingara booking has been updated",
    body: "Dear {{customerName}}, your booking {{bookingRef}} has been updated. {{updateSummary}} View your live ticket: {{ticketUrl}}",
    updatedAt: "2026-05-17T00:00:00.000Z",
  },
  {
    id: "email-table-change",
    channel: "email",
    trigger: "table-change",
    name: "Email Table Change",
    subject: "Updated table details for {{bookingRef}}",
    body: "Dear {{customerName}}, your seating has been updated to {{seatingZone}}, table {{tableNumber}}. Your live ticket has already been refreshed: {{ticketUrl}}",
    updatedAt: "2026-05-17T00:00:00.000Z",
  },
  {
    id: "email-waitlist-promotion",
    channel: "email",
    trigger: "waitlist-promotion",
    name: "Email Waitlist Promotion",
    subject: "A Zingara table may be available",
    body: "Dear {{customerName}}, your waitlist request for {{showName}} has been promoted. The box office will confirm the table shortly.",
    updatedAt: "2026-05-17T00:00:00.000Z",
  },
  {
    id: "email-show-reminder",
    channel: "email",
    trigger: "show-reminder",
    name: "Email Show Reminder",
    subject: "Your Royal Countess dinner show is approaching",
    body: "Dear {{customerName}}, we look forward to welcoming you for {{showName}} at {{showTime}}. Table {{tableNumber}} is ready on your live ticket: {{ticketUrl}}",
    updatedAt: "2026-05-17T00:00:00.000Z",
  },
  {
    id: "email-check-in-confirmation",
    channel: "email",
    trigger: "check-in-confirmation",
    name: "Email Check-In Confirmation",
    subject: "Welcome to Zingara",
    body: "Welcome {{customerName}}. Your arrival for {{bookingRef}} has been recorded. Enjoy The Royal Countess Dinner Show.",
    updatedAt: "2026-05-17T00:00:00.000Z",
  },
  {
    id: "email-cancellation-refund",
    channel: "email",
    trigger: "cancellation-refund",
    name: "Email Cancellation / Refund Notice",
    subject: "Cancellation notice for {{bookingRef}}",
    body: "Dear {{customerName}}, booking {{bookingRef}} has been cancelled. {{refundSummary}}",
    updatedAt: "2026-05-17T00:00:00.000Z",
  },
  {
    id: "push-operational-broadcast",
    channel: "push",
    trigger: "operational-broadcast",
    name: "Push Operational Broadcast",
    subject: "Zingara guest update",
    body: "{{message}}",
    updatedAt: "2026-05-17T00:00:00.000Z",
  },
  {
    id: "sms-show-reminder",
    channel: "sms",
    trigger: "show-reminder",
    name: "Future SMS Show Reminder",
    subject: "Zingara reminder",
    body: "Reminder: {{showName}} at {{showTime}}. Booking {{bookingRef}}, table {{tableNumber}}.",
    updatedAt: "2026-05-17T00:00:00.000Z",
  },
];

function createVenueTables(
  zoneId: SeatingZoneId,
  tablePrefix: string,
  capacities: number[],
  status: TableStatus = "available",
) {
  return capacities.map((seatCapacity, index) => {
    const tableNumber = `${tablePrefix}${index + 1}`;

    return {
      id: `${zoneId}-${index + 1}`,
      zoneId,
      tableNumber,
      baseSeatCapacity: seatCapacity,
      baseStatus: status,
      baseGuestNotes:
        status === "disabled"
          ? "Temporarily unavailable for the Johannesburg show"
          : "",
      baseMergeable: true,
      seatCapacity,
      status,
      guestNotes:
        status === "disabled"
          ? "Temporarily unavailable for the Johannesburg show"
          : "",
      mergeable: true,
      mergeHistory: [],
    };
  });
}

export const defaultTables: DemoTable[] = [
  ...createVenueTables("elevated-stage", "ES", [4, 6, 8, 12], "disabled"),
  ...createVenueTables(
    "golden-circle",
    "GC",
    [2, 2, 4, 4, 4, 6, 6, 6, 6, 8, 8, 8, 10, 10, 12],
  ),
  ...createVenueTables(
    "middle-ring",
    "MR",
    [2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 6, 6, 8, 8, 8, 8, 8, 8],
  ),
  ...createVenueTables(
    "royal-booths",
    "B",
    Array.from({ length: 19 }, () => 6),
  ),
  ...createVenueTables("royal-balcony", "RB", [2, 4, 6, 8]),
];

export function getZoneById(zoneId: SeatingZoneId) {
  return seatingZones.find((zone) => zone.id === zoneId);
}

export function getConfiguredZonePrice(
  settings: DemoVenueSettings,
  zone: Pick<SeatingZone, "id" | "price">,
) {
  return settings.zonePricing[zone.id]?.price ?? zone.price;
}

export function getConfiguredZoneDepositPercentage(
  settings: DemoVenueSettings,
  zone: Pick<SeatingZone, "depositPercentage" | "id">,
) {
  return (
    settings.zonePricing[zone.id]?.depositPercentage ??
    zone.depositPercentage ??
    settings.operationalSettings.defaultDepositPercentage
  );
}

export function getConfiguredZoneDepositAmount(
  settings: DemoVenueSettings,
  zone: Pick<SeatingZone, "id">,
) {
  return (
    settings.zonePricing[zone.id]?.depositAmount ??
    settings.operationalSettings.defaultDepositAmount ??
    defaultStandardDepositPerPerson
  );
}

export function getShowById(showId: string) {
  return getStoredDemoShows().find((show) => show.id === showId);
}

export function getShowLabel(show?: DemoShow) {
  return show
    ? `${show.date} at ${show.time} · ${show.label}`
    : "Unassigned show";
}

export function getCompactShowDateTime(show?: DemoShow) {
  if (!show) {
    return "Unassigned show";
  }

  const [year, month, day] = show.date.split("-");

  return `${day}/${month}/${year.slice(-2)} · ${getSouthAfricaShowTime(show)}`;
}

export function getSouthAfricaShowTime(
  showOrTime: Pick<DemoShow, "time"> | string,
) {
  const timeValue =
    typeof showOrTime === "string" ? showOrTime : showOrTime.time;
  const directTimeMatch = timeValue.match(/^(\d{1,2}):(\d{2})/);

  if (directTimeMatch) {
    return `${directTimeMatch[1].padStart(2, "0")}:${directTimeMatch[2]}`;
  }

  const parsedDate = new Date(timeValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return timeValue;
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Johannesburg",
  }).format(parsedDate);
}

function getCanonicalShowFields(show: DemoShow) {
  if (show.label === "Saturday Gala") {
    return {
      date: show.date,
      label: "Saturday, The Royal Countess Dinner Show",
      time: getSouthAfricaShowTime(show),
    };
  }

  if (show.label === "Sunday Matinee") {
    return {
      date: show.date,
      label: "Sunday, The Royal Countess Dinner Show",
      time: getSouthAfricaShowTime(show),
    };
  }

  return {
    date: show.date,
    label: show.label,
    time: getSouthAfricaShowTime(show),
  };
}

export function createTablesForShow(showId: string) {
  return defaultTables.map((table) => ({
    ...table,
    id: `${showId}-${table.id}`,
    showId,
    bookingReference: undefined,
  }));
}

function normalizeDemoShow(show: DemoShow) {
  const canonicalShowFields = getCanonicalShowFields(show);

  return {
    ...show,
    ...canonicalShowFields,
    description: show.description ?? "",
    internalNotes: show.internalNotes ?? "",
    operationalStatus: show.operationalStatus ?? "active",
  };
}

function normalizeDemoName(name: string) {
  const demoNameReplacements: Record<string, string> = {
    "Isabella Laurent": "Tracy Maltman",
    "Mara Stone": "Richard Griffin",
    "Theo Black": "Craig Leo",
  };

  return demoNameReplacements[name] ?? name;
}

function normalizeDemoText(text: string) {
  return text
    .replaceAll("Isabella Laurent", "Tracy Maltman")
    .replaceAll("Mara Stone", "Richard Griffin")
    .replaceAll("Theo Black", "Craig Leo");
}

function normalizeCommunicationRecord(
  record: Partial<CommunicationRecord>,
  fallbackId: string,
) {
  return {
    id: getSafeString(record.id, fallbackId),
    channel: isKnownValue(record.channel, ["email", "push", "sms"])
      ? record.channel
      : "email",
    message: normalizeDemoText(getSafeString(record.message)),
    sentAt: getSafeString(record.sentAt, new Date().toISOString()),
    subject: record.subject
      ? normalizeDemoText(getSafeString(record.subject))
      : undefined,
    templateId: record.templateId,
    trigger: record.trigger,
  };
}

function normalizeLifecycleEvent(
  event: Partial<BookingLifecycleEvent>,
  booking: Pick<DemoBooking, "createdAt" | "reference" | "status">,
  index: number,
) {
  const toStatus = isValidBookingStatus(event.toStatus)
    ? event.toStatus
    : booking.status;

  return {
    id: getSafeString(
      event.id,
      `${booking.reference}-lifecycle-${index + 1}`,
    ),
    fromStatus: isValidBookingStatus(event.fromStatus)
      ? event.fromStatus
      : undefined,
    toStatus,
    note: event.note ? getSafeString(event.note) : undefined,
    createdAt: getSafeString(event.createdAt, booking.createdAt),
  };
}

function normalizeDemoBooking(booking: DemoBooking) {
  const fallbackReference = `LEGACY-${Math.random()
    .toString(36)
    .slice(2, 10)
    .toUpperCase()}`;
  const reference = getSafeString(booking.reference, fallbackReference);
  const zoneId = isValidSeatingZoneId(booking.zoneId)
    ? booking.zoneId
    : "middle-ring";
  const zone = getZoneById(zoneId) ?? seatingZones[1];
  const status = isValidBookingStatus(booking.status)
    ? booking.status === "pending"
      ? "pending-payment"
      : booking.status
    : "confirmed";
  const totalPrice = getSafeNumber(booking.totalPrice);
  const addons = Array.isArray(booking.addons) ? booking.addons : [];
  const addonsTotal =
    booking.addonsTotal ??
    addons.reduce((total, addon) => total + addon.price, 0);
  const depositPercentage = getSafeNumber(
    booking.depositPercentage,
    100,
  );
  const depositAmount = Math.ceil(
    totalPrice * (depositPercentage / 100),
  );
  const inferredPaymentStatus: PaymentStatus =
    isValidPaymentStatus(booking.paymentStatus)
      ? booking.paymentStatus
      : status === "cancelled"
      ? "pending-payment"
      : getSafeNumber(booking.amountPaid, totalPrice) >= totalPrice
        ? "fully-paid"
        : getSafeNumber(booking.amountPaid) > 0
          ? "deposit-paid"
          : "pending-payment";
  const amountPaid =
    booking.amountPaid ??
    (inferredPaymentStatus === "fully-paid"
      ? totalPrice
      : inferredPaymentStatus === "deposit-paid"
        ? depositAmount
        : 0);
  const balanceDue =
    booking.balanceDue ??
    (inferredPaymentStatus === "comp-vip" ||
    inferredPaymentStatus === "refunded"
      ? 0
      : Math.max(totalPrice - amountPaid, 0));
  const createdAt = getSafeString(
    booking.createdAt,
    new Date().toISOString(),
  );
  const normalizedBooking = {
    ...booking,
    reference,
    showId: getSafeString(booking.showId, defaultShows[0].id),
    zoneId,
    zoneTitle: getSafeString(booking.zoneTitle, zone.title),
    tableId: getSafeString(booking.tableId, "unassigned"),
    tableNumber: getSafeString(booking.tableNumber, "Unassigned"),
    partySize: Math.max(1, getSafeNumber(booking.partySize, 1)),
    bookingDate: getSafeString(booking.bookingDate, getShowLabel(defaultShows[0])),
    totalPrice,
    pricePerPerson: getSafeNumber(booking.pricePerPerson),
    customer: normalizeCustomerInfo(booking.customer),
    status,
    createdAt,
  };

  return {
    ...normalizedBooking,
    addons,
    addonsTotal,
    subtotalPrice: getSafeNumber(booking.subtotalPrice, totalPrice),
    discountAmount: getSafeNumber(booking.discountAmount),
    serviceFeeAmount: getSafeNumber(booking.serviceFeeAmount),
    paymentOption: booking.paymentOption ?? "full",
    paymentStatus: inferredPaymentStatus,
    depositPercentage,
    amountPaid: getSafeNumber(amountPaid),
    balanceDue,
    source: booking.source ?? "online",
    ticketCode:
      booking.ticketCode ?? createTicketCode(reference),
    ticketIssuedAt: booking.ticketIssuedAt ?? createdAt,
    lifecycleHistory:
      booking.lifecycleHistory?.map((event, index) =>
        normalizeLifecycleEvent(event, normalizedBooking, index),
      ) ?? [
        {
        id: `${reference}-created`,
        toStatus: status,
        note: "Booking created",
        createdAt,
      },
    ],
    operationalNotes: booking.operationalNotes ?? "",
    cancellationReason: booking.cancellationReason ?? "",
    refundNotes: booking.refundNotes ?? "",
    communicationHistory: (
      Array.isArray(booking.communicationHistory)
        ? booking.communicationHistory
        : []
    ).map((record, index) =>
      normalizeCommunicationRecord(record, `${reference}-comm-${index}`),
    ),
  };
}

function normalizeDemoWaitlistEntry(
  entry: DemoWaitlistEntry,
) {
  const id = getSafeString(
    entry.id,
    `WAITLIST-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
  );
  const desiredZoneId = isValidSeatingZoneId(entry.desiredZoneId)
    ? entry.desiredZoneId
    : undefined;
  const desiredZone = desiredZoneId
    ? getZoneById(desiredZoneId)
    : undefined;

  return {
    ...entry,
    id,
    showId: getSafeString(entry.showId, defaultShows[0].id),
    desiredZoneId,
    desiredZoneTitle: entry.desiredZoneTitle ?? desiredZone?.title,
    partySize: Math.max(1, getSafeNumber(entry.partySize, 1)),
    customer: normalizeCustomerInfo(entry.customer),
    notes: normalizeDemoText(entry.notes ?? ""),
    status: isKnownValue(entry.status, waitlistStatusValues)
      ? entry.status
      : "waiting",
    communicationHistory: (
      Array.isArray(entry.communicationHistory)
        ? entry.communicationHistory
        : []
    ).map((record, index) =>
      normalizeCommunicationRecord(record, `${id}-comm-${index}`),
    ),
    createdAt: getSafeString(entry.createdAt, new Date().toISOString()),
  };
}

function normalizeDemoCustomerCrmRecord(
  record: DemoCustomerCrmRecord,
) {
  const customerKey = getSafeString(record.customerKey, "unknown-customer");

  return {
    ...record,
    customerKey,
    notes: normalizeDemoText(record.notes ?? ""),
    vipTags: Array.isArray(record.vipTags) ? record.vipTags : [],
    updatedAt: getSafeString(record.updatedAt, new Date().toISOString()),
  };
}

function normalizeCorporateRequest(
  request: Partial<CorporateRequest>,
  index = 0,
): CorporateRequest {
  const createdAt = getSafeString(request.createdAt, new Date().toISOString());

  return {
    id: getSafeString(
      request.id,
      `CORP-${Date.now().toString(36).toUpperCase()}-${index + 1}`,
    ),
    companyName: getSafeString(request.companyName),
    contactName: getSafeString(request.contactName),
    contactNumber: getSafeString(request.contactNumber),
    email: getSafeString(request.email),
    preferredDate: getSafeString(request.preferredDate),
    alternativeDate: getSafeString(request.alternativeDate),
    guestCount: Math.max(1, getSafeNumber(request.guestCount, 1)),
    seatingPreference: getSafeString(request.seatingPreference),
    occasion: getSafeString(request.occasion),
    otherOccasion: getSafeString(request.otherOccasion),
    dietaryRequirements: Array.isArray(request.dietaryRequirements)
      ? request.dietaryRequirements.map((item) => getSafeString(item))
      : [],
    otherDietaryRequirement: getSafeString(
      request.otherDietaryRequirement,
    ),
    barTab: getSafeString(request.barTab, "No Bar Tab"),
    addons: Array.isArray(request.addons)
      ? request.addons.map((item) => getSafeString(item))
      : [],
    assignedConsultant: request.assignedConsultant
      ? getSafeString(request.assignedConsultant)
      : undefined,
    cancellationReason: request.cancellationReason
      ? getSafeString(request.cancellationReason)
      : undefined,
    cancelledAt: request.cancelledAt
      ? getSafeString(request.cancelledAt)
      : undefined,
    locationAcknowledgement: request.locationAcknowledgement
      ? getSafeString(request.locationAcknowledgement)
      : undefined,
    notes: getSafeString(request.notes),
    paymentLinkSentAt: request.paymentLinkSentAt
      ? getSafeString(request.paymentLinkSentAt)
      : undefined,
    paymentLinkToken: request.paymentLinkToken
      ? getSafeString(request.paymentLinkToken)
      : undefined,
    status: isKnownValue(
      request.status,
      corporateRequestStatusValues,
    )
      ? request.status
      : "corporate-tentative",
    requestType:
      request.requestType === "agent-contact"
        ? "agent-contact"
        : "corporate-booking",
    source: "Corporate Direct",
    archivedAt: request.archivedAt
      ? getSafeString(request.archivedAt)
      : undefined,
    linkedBookingReference: request.linkedBookingReference
      ? getSafeString(request.linkedBookingReference)
      : undefined,
    communicationHistory: (
      Array.isArray(request.communicationHistory)
        ? request.communicationHistory
        : []
    ).map((record, recordIndex) =>
      normalizeCommunicationRecord(
        record,
        `${request.id ?? "corporate"}-comm-${recordIndex}`,
      ),
    ),
    createdAt,
    updatedAt: getSafeString(request.updatedAt, createdAt),
  };
}

const seededDemoBookings: DemoBooking[] = [
  {
    reference: "ZNG-TRACY-GC7",
    showId: "show-2026-06-20-1900",
    zoneId: "golden-circle",
    zoneTitle: "Golden Circle",
    tableId: "show-2026-06-20-1900-golden-circle-7",
    tableNumber: "GC7",
    partySize: 6,
    bookingDate: "2026-06-20 19:00",
    addons: [
      {
        id: "vip-champagne",
        name: "VIP Champagne Package",
        price: 1250,
      },
    ],
    addonsTotal: 1250,
    subtotalPrice: 8820,
    discountAmount: 882,
    totalPrice: 9188,
    pricePerPerson: 1470,
    paymentOption: "full",
    paymentStatus: "fully-paid",
    depositPercentage: 40,
    amountPaid: 9188,
    balanceDue: 0,
    promoCode: "COUNTESS10",
    promoLabel: "10% Countess guest discount",
    source: "online",
    ticketCode: createTicketCode("ZNG-TRACY-GC7"),
    ticketIssuedAt: "2026-05-25T13:30:25.000Z",
    customer: {
      name: "Tracy Maltman",
      email: "tracy@zingara.co.za",
      phone: "0793637771",
    },
    status: "checked-in",
    lifecycleHistory: [
      {
        id: "ZNG-TRACY-GC7-created",
        toStatus: "new",
        note: "Online booking created",
        createdAt: "2026-05-25T13:30:25.000Z",
      },
      {
        id: "ZNG-TRACY-GC7-confirmed",
        fromStatus: "new",
        toStatus: "confirmed",
        note: "Full payment recorded",
        createdAt: "2026-05-25T13:31:10.000Z",
      },
      {
        id: "ZNG-TRACY-GC7-arrived",
        fromStatus: "confirmed",
        toStatus: "checked-in",
        note: "Guest arrived",
        createdAt: "2026-06-20T17:42:00.000Z",
      },
    ],
    operationalNotes: "VIP arrival. Seat close to performance sightline.",
    cancellationReason: "",
    refundNotes: "",
    arrivalTime: "2026-06-20T17:42:00.000Z",
    communicationHistory: [
      {
        id: "ZNG-TRACY-GC7-confirmation-email",
        channel: "email",
        sentAt: "2026-05-25T13:30:25.000Z",
        subject: "Your Royal Countess Zingara booking ZNG-TRACY-GC7",
        templateId: "email-booking-confirmation",
        trigger: "booking-confirmation",
        message:
          "Dear Tracy Maltman, your Saturday, The Royal Countess Dinner Show booking for 6 guests is confirmed. You are seated in Golden Circle, table GC7. Live ticket: /ticket/ZNG-TRACY-GC7",
      },
      {
        id: "ZNG-TRACY-GC7-payment-email",
        channel: "email",
        sentAt: "2026-05-25T13:31:10.000Z",
        subject: "Payment received for ZNG-TRACY-GC7",
        templateId: "email-payment-confirmation",
        trigger: "payment-confirmation",
        message:
          "Thank you Tracy Maltman. We have recorded payment of R9,188 for ZNG-TRACY-GC7. Remaining balance: R0.",
      },
    ],
    createdAt: "2026-05-25T13:30:25.000Z",
  },
  {
    reference: "ZNG-RICHARD-RB2",
    showId: "show-2026-06-20-1900",
    zoneId: "royal-balcony",
    zoneTitle: "Royal Balcony",
    tableId: "show-2026-06-20-1900-royal-balcony-2",
    tableNumber: "RB2",
    partySize: 4,
    bookingDate: "2026-06-20 19:00",
    addons: [],
    addonsTotal: 0,
    subtotalPrice: 5360,
    discountAmount: 0,
    totalPrice: 5360,
    pricePerPerson: 1340,
    paymentOption: "deposit",
    paymentStatus: "deposit-paid",
    depositPercentage: 50,
    amountPaid: 2680,
    balanceDue: 2680,
    source: "admin",
    ticketCode: createTicketCode("ZNG-RICHARD-RB2"),
    ticketIssuedAt: "2026-05-25T13:45:00.000Z",
    customer: {
      name: "Richard Griffin",
      email: "richard@zingara.co.za",
      phone: "0825550184",
    },
    status: "pending-payment",
    lifecycleHistory: [
      {
        id: "ZNG-RICHARD-RB2-created",
        toStatus: "new",
        note: "Box office booking created",
        createdAt: "2026-05-25T13:45:00.000Z",
      },
      {
        id: "ZNG-RICHARD-RB2-deposit",
        fromStatus: "new",
        toStatus: "pending-payment",
        note: "Deposit payment recorded",
        createdAt: "2026-05-25T13:46:20.000Z",
      },
    ],
    operationalNotes: "Requested balcony placement and easy aisle access.",
    cancellationReason: "",
    refundNotes: "",
    communicationHistory: [
      {
        id: "ZNG-RICHARD-RB2-confirmation-email",
        channel: "email",
        sentAt: "2026-05-25T13:45:00.000Z",
        subject: "Your Royal Countess Zingara booking ZNG-RICHARD-RB2",
        templateId: "email-booking-confirmation",
        trigger: "booking-confirmation",
        message:
          "Dear Richard Griffin, your Saturday, The Royal Countess Dinner Show booking for 4 guests is confirmed. You are seated in Royal Balcony, table RB2. Live ticket: /ticket/ZNG-RICHARD-RB2",
      },
    ],
    createdAt: "2026-05-25T13:45:00.000Z",
  },
  {
    reference: "ZNG-CRAIG-MR8",
    showId: "show-2026-06-21-1700",
    zoneId: "middle-ring",
    zoneTitle: "Middle Ring",
    tableId: "show-2026-06-21-1700-middle-ring-8",
    tableNumber: "MR8",
    partySize: 4,
    bookingDate: "2026-06-21 17:00",
    addons: [
      {
        id: "birthday-celebration",
        name: "Birthday Celebration Package",
        price: 750,
      },
    ],
    addonsTotal: 750,
    subtotalPrice: 5040,
    discountAmount: 0,
    totalPrice: 5790,
    pricePerPerson: 1260,
    paymentOption: "deposit",
    paymentStatus: "pending-payment",
    depositPercentage: 35,
    amountPaid: 0,
    balanceDue: 5790,
    source: "online",
    ticketCode: createTicketCode("ZNG-CRAIG-MR8"),
    ticketIssuedAt: "2026-05-25T14:05:00.000Z",
    customer: {
      name: "Craig Leo",
      email: "craig@zingara.co.za",
      phone: "0831009911",
    },
    status: "pending-payment",
    lifecycleHistory: [
      {
        id: "ZNG-CRAIG-MR8-created",
        toStatus: "new",
        note: "Online booking created",
        createdAt: "2026-05-25T14:05:00.000Z",
      },
      {
        id: "ZNG-CRAIG-MR8-payment-pending",
        fromStatus: "new",
        toStatus: "pending-payment",
        note: "Awaiting deposit payment",
        createdAt: "2026-05-25T14:05:00.000Z",
      },
    ],
    operationalNotes: "Birthday celebration package selected.",
    cancellationReason: "",
    refundNotes: "",
    communicationHistory: [
      {
        id: "ZNG-CRAIG-MR8-confirmation-email",
        channel: "email",
        sentAt: "2026-05-25T14:05:00.000Z",
        subject: "Your Royal Countess Zingara booking ZNG-CRAIG-MR8",
        templateId: "email-booking-confirmation",
        trigger: "booking-confirmation",
        message:
          "Dear Craig Leo, your Sunday, The Royal Countess Dinner Show booking for 4 guests is pending payment. You are seated in Middle Ring, table MR8. Live ticket: /ticket/ZNG-CRAIG-MR8",
      },
    ],
    createdAt: "2026-05-25T14:05:00.000Z",
  },
  {
    reference: "ZNG-KAREN-GC2",
    showId: "show-2026-06-20-1900",
    zoneId: "golden-circle",
    zoneTitle: "Golden Circle",
    tableId: "show-2026-06-20-1900-golden-circle-2",
    tableNumber: "GC2",
    partySize: 2,
    bookingDate: "2026-06-20 19:00",
    addons: [],
    addonsTotal: 0,
    subtotalPrice: 2940,
    discountAmount: 0,
    totalPrice: 2940,
    pricePerPerson: 1470,
    paymentOption: "full",
    paymentStatus: "fully-paid",
    depositPercentage: 40,
    amountPaid: 2940,
    balanceDue: 0,
    source: "online",
    ticketCode: createTicketCode("ZNG-KAREN-GC2"),
    ticketIssuedAt: "2026-05-25T14:12:00.000Z",
    customer: {
      name: "Karen Damon",
      email: "karen@zingara.co.za",
      phone: "0712222202",
    },
    status: "confirmed",
    lifecycleHistory: [
      {
        id: "ZNG-KAREN-GC2-created",
        toStatus: "new",
        note: "Online booking created",
        createdAt: "2026-05-25T14:12:00.000Z",
      },
      {
        id: "ZNG-KAREN-GC2-confirmed",
        fromStatus: "new",
        toStatus: "confirmed",
        note: "Full payment recorded",
        createdAt: "2026-05-25T14:13:00.000Z",
      },
    ],
    operationalNotes: "",
    cancellationReason: "",
    refundNotes: "",
    communicationHistory: [],
    createdAt: "2026-05-25T14:12:00.000Z",
  },
  {
    reference: "ZNG-KADEN-RB4",
    showId: "show-2026-06-20-1900",
    zoneId: "royal-balcony",
    zoneTitle: "Royal Balcony",
    tableId: "show-2026-06-20-1900-royal-balcony-4",
    tableNumber: "RB4",
    partySize: 8,
    bookingDate: "2026-06-20 19:00",
    addons: [
      {
        id: "premium-wine",
        name: "Premium Wine Pairing",
        price: 890,
      },
    ],
    addonsTotal: 890,
    subtotalPrice: 10720,
    discountAmount: 0,
    totalPrice: 11610,
    pricePerPerson: 1340,
    paymentOption: "deposit",
    paymentStatus: "deposit-paid",
    depositPercentage: 50,
    amountPaid: 5805,
    balanceDue: 5805,
    source: "admin",
    ticketCode: createTicketCode("ZNG-KADEN-RB4"),
    ticketIssuedAt: "2026-05-25T14:20:00.000Z",
    customer: {
      name: "Kaden Kaden",
      email: "kaden@zingara.co.za",
      phone: "0793637777",
    },
    status: "pending-payment",
    lifecycleHistory: [
      {
        id: "ZNG-KADEN-RB4-created",
        toStatus: "new",
        note: "Box office booking created",
        createdAt: "2026-05-25T14:20:00.000Z",
      },
      {
        id: "ZNG-KADEN-RB4-deposit",
        fromStatus: "new",
        toStatus: "pending-payment",
        note: "Deposit payment recorded",
        createdAt: "2026-05-25T14:21:00.000Z",
      },
    ],
    operationalNotes: "Balance due at box office.",
    cancellationReason: "",
    refundNotes: "",
    communicationHistory: [],
    createdAt: "2026-05-25T14:20:00.000Z",
  },
  {
    reference: "ZNG-CHARLIE-B1",
    showId: "show-2026-06-20-1900",
    zoneId: "royal-booths",
    zoneTitle: "Royal Booths",
    tableId: "show-2026-06-20-1900-royal-booths-1",
    tableNumber: "B1",
    partySize: 6,
    bookingDate: "2026-06-20 19:00",
    addons: [],
    addonsTotal: 0,
    subtotalPrice: 8520,
    discountAmount: 0,
    totalPrice: 8520,
    pricePerPerson: 1420,
    paymentOption: "full",
    paymentStatus: "fully-paid",
    depositPercentage: 50,
    amountPaid: 8520,
    balanceDue: 0,
    source: "online",
    ticketCode: createTicketCode("ZNG-CHARLIE-B1"),
    ticketIssuedAt: "2026-05-25T14:34:00.000Z",
    customer: {
      name: "Charlie",
      email: "charlie@zingara.co.za",
      phone: "0727778899",
    },
    status: "confirmed",
    lifecycleHistory: [
      {
        id: "ZNG-CHARLIE-B1-created",
        toStatus: "new",
        note: "Online booking created",
        createdAt: "2026-05-25T14:34:00.000Z",
      },
      {
        id: "ZNG-CHARLIE-B1-confirmed",
        fromStatus: "new",
        toStatus: "confirmed",
        note: "Full payment recorded",
        createdAt: "2026-05-25T14:35:00.000Z",
      },
    ],
    operationalNotes: "Private booth confirmed.",
    cancellationReason: "",
    refundNotes: "",
    communicationHistory: [],
    createdAt: "2026-05-25T14:34:00.000Z",
  },
  {
    reference: "ZNG-PIERRE-GC12",
    showId: "show-2026-06-21-1700",
    zoneId: "golden-circle",
    zoneTitle: "Golden Circle",
    tableId: "show-2026-06-21-1700-golden-circle-12",
    tableNumber: "GC12",
    partySize: 8,
    bookingDate: "2026-06-21 17:00",
    addons: [],
    addonsTotal: 0,
    subtotalPrice: 11760,
    discountAmount: 1176,
    totalPrice: 10584,
    pricePerPerson: 1470,
    paymentOption: "full",
    paymentStatus: "fully-paid",
    depositPercentage: 40,
    amountPaid: 10584,
    balanceDue: 0,
    promoCode: "COUNTESS10",
    promoLabel: "10% Countess guest discount",
    source: "online",
    ticketCode: createTicketCode("ZNG-PIERRE-GC12"),
    ticketIssuedAt: "2026-05-25T14:48:00.000Z",
    customer: {
      name: "Jacques Pierre",
      email: "jacques.pierre@zingara.co.za",
      phone: "0745559876",
    },
    status: "confirmed",
    lifecycleHistory: [
      {
        id: "ZNG-PIERRE-GC12-created",
        toStatus: "new",
        note: "Online booking created",
        createdAt: "2026-05-25T14:48:00.000Z",
      },
      {
        id: "ZNG-PIERRE-GC12-confirmed",
        fromStatus: "new",
        toStatus: "confirmed",
        note: "Full payment recorded",
        createdAt: "2026-05-25T14:49:00.000Z",
      },
    ],
    operationalNotes: "",
    cancellationReason: "",
    refundNotes: "",
    communicationHistory: [],
    createdAt: "2026-05-25T14:48:00.000Z",
  },
  {
    reference: "ZNG-AMANDA-MR16",
    showId: "show-2026-06-21-1700",
    zoneId: "middle-ring",
    zoneTitle: "Middle Ring",
    tableId: "show-2026-06-21-1700-middle-ring-16",
    tableNumber: "MR16",
    partySize: 8,
    bookingDate: "2026-06-21 17:00",
    addons: [],
    addonsTotal: 0,
    subtotalPrice: 10080,
    discountAmount: 0,
    totalPrice: 10080,
    pricePerPerson: 1260,
    paymentOption: "deposit",
    paymentStatus: "deposit-paid",
    depositPercentage: 35,
    amountPaid: 3528,
    balanceDue: 6552,
    source: "admin",
    ticketCode: createTicketCode("ZNG-AMANDA-MR16"),
    ticketIssuedAt: "2026-05-25T15:02:00.000Z",
    customer: {
      name: "Amanda Venter",
      email: "amanda@zingara.co.za",
      phone: "0733334455",
    },
    status: "pending-payment",
    lifecycleHistory: [
      {
        id: "ZNG-AMANDA-MR16-created",
        toStatus: "new",
        note: "Box office booking created",
        createdAt: "2026-05-25T15:02:00.000Z",
      },
      {
        id: "ZNG-AMANDA-MR16-deposit",
        fromStatus: "new",
        toStatus: "pending-payment",
        note: "Deposit payment recorded",
        createdAt: "2026-05-25T15:03:00.000Z",
      },
    ],
    operationalNotes: "Confirm remaining balance on arrival.",
    cancellationReason: "",
    refundNotes: "",
    communicationHistory: [],
    createdAt: "2026-05-25T15:02:00.000Z",
  },
  {
    reference: "ZNG-MEGAN-RB1",
    showId: "show-2026-06-21-1700",
    zoneId: "royal-balcony",
    zoneTitle: "Royal Balcony",
    tableId: "show-2026-06-21-1700-royal-balcony-1",
    tableNumber: "RB1",
    partySize: 2,
    bookingDate: "2026-06-21 17:00",
    addons: [
      {
        id: "backstage-experience",
        name: "Backstage Experience",
        price: 1450,
      },
    ],
    addonsTotal: 1450,
    subtotalPrice: 2680,
    discountAmount: 0,
    totalPrice: 4130,
    pricePerPerson: 1340,
    paymentOption: "full",
    paymentStatus: "fully-paid",
    depositPercentage: 50,
    amountPaid: 4130,
    balanceDue: 0,
    source: "online",
    ticketCode: createTicketCode("ZNG-MEGAN-RB1"),
    ticketIssuedAt: "2026-05-25T15:30:00.000Z",
    customer: {
      name: "Megan Botha",
      email: "megan@zingara.co.za",
      phone: "0784443311",
    },
    status: "checked-in",
    lifecycleHistory: [
      {
        id: "ZNG-MEGAN-RB1-created",
        toStatus: "new",
        note: "Online booking created",
        createdAt: "2026-05-25T15:30:00.000Z",
      },
      {
        id: "ZNG-MEGAN-RB1-confirmed",
        fromStatus: "new",
        toStatus: "confirmed",
        note: "Full payment recorded",
        createdAt: "2026-05-25T15:31:00.000Z",
      },
      {
        id: "ZNG-MEGAN-RB1-arrived",
        fromStatus: "confirmed",
        toStatus: "checked-in",
        note: "Guest arrived",
        createdAt: "2026-06-21T15:55:00.000Z",
      },
    ],
    operationalNotes: "Backstage experience guest.",
    cancellationReason: "",
    refundNotes: "",
    arrivalTime: "2026-06-21T15:55:00.000Z",
    communicationHistory: [],
    createdAt: "2026-05-25T15:30:00.000Z",
  },
  {
    reference: "ZNG-OLIVER-MR3",
    showId: "show-2026-06-20-1900",
    zoneId: "middle-ring",
    zoneTitle: "Middle Ring",
    tableId: "show-2026-06-20-1900-middle-ring-3",
    tableNumber: "MR3",
    partySize: 2,
    bookingDate: "2026-06-20 19:00",
    addons: [],
    addonsTotal: 0,
    subtotalPrice: 2520,
    discountAmount: 0,
    totalPrice: 2520,
    pricePerPerson: 1260,
    paymentOption: "full",
    paymentStatus: "refunded",
    depositPercentage: 35,
    amountPaid: 0,
    balanceDue: 0,
    source: "online",
    ticketCode: createTicketCode("ZNG-OLIVER-MR3"),
    ticketIssuedAt: "2026-05-25T15:44:00.000Z",
    customer: {
      name: "Oliver Smith",
      email: "oliver@zingara.co.za",
      phone: "0821113333",
    },
    status: "cancelled",
    lifecycleHistory: [
      {
        id: "ZNG-OLIVER-MR3-created",
        toStatus: "new",
        note: "Online booking created",
        createdAt: "2026-05-25T15:44:00.000Z",
      },
      {
        id: "ZNG-OLIVER-MR3-cancelled",
        fromStatus: "confirmed",
        toStatus: "cancelled",
        note: "Guest cancelled",
        createdAt: "2026-05-25T16:10:00.000Z",
      },
    ],
    operationalNotes: "",
    cancellationReason: "Guest cancelled",
    refundNotes: "Refund processed manually.",
    communicationHistory: [],
    createdAt: "2026-05-25T15:44:00.000Z",
  },
  {
    reference: "ZNG-LERATO-MR10",
    showId: "show-2026-06-20-1900",
    zoneId: "middle-ring",
    zoneTitle: "Middle Ring",
    tableId: "show-2026-06-20-1900-middle-ring-10",
    tableNumber: "MR10",
    partySize: 6,
    bookingDate: "2026-06-20 19:00",
    addons: [],
    addonsTotal: 0,
    subtotalPrice: 7560,
    discountAmount: 0,
    totalPrice: 7560,
    pricePerPerson: 1260,
    paymentOption: "deposit",
    paymentStatus: "pending-payment",
    depositPercentage: 35,
    amountPaid: 0,
    balanceDue: 7560,
    source: "admin",
    ticketCode: createTicketCode("ZNG-LERATO-MR10"),
    ticketIssuedAt: "2026-05-25T16:02:00.000Z",
    customer: {
      name: "Lerato Nkosi",
      email: "lerato@zingara.co.za",
      phone: "0724449988",
    },
    status: "no-show",
    lifecycleHistory: [
      {
        id: "ZNG-LERATO-MR10-created",
        toStatus: "new",
        note: "Box office booking created",
        createdAt: "2026-05-25T16:02:00.000Z",
      },
      {
        id: "ZNG-LERATO-MR10-noshow",
        fromStatus: "confirmed",
        toStatus: "no-show",
        note: "Marked no-show",
        createdAt: "2026-06-20T19:45:00.000Z",
      },
    ],
    operationalNotes: "No-show sample for reporting.",
    cancellationReason: "",
    refundNotes: "",
    communicationHistory: [],
    createdAt: "2026-05-25T16:02:00.000Z",
  },
];

const seededDemoWaitlist: DemoWaitlistEntry[] = [
  {
    id: "WAITLIST-ROYAL-6",
    showId: "show-2026-06-20-1900",
    desiredZoneId: "royal-booths",
    desiredZoneTitle: "Royal Booths",
    partySize: 6,
    customer: {
      name: "Nadia Jacobs",
      email: "nadia@zingara.co.za",
      phone: "0842204411",
    },
    notes: "Prefers a booth if one becomes available.",
    status: "waiting",
    communicationHistory: [],
    createdAt: "2026-05-25T15:10:00.000Z",
  },
  {
    id: "WAITLIST-GC-8",
    showId: "show-2026-06-21-1700",
    desiredZoneId: "golden-circle",
    desiredZoneTitle: "Golden Circle",
    partySize: 8,
    customer: {
      name: "Lara Mokoena",
      email: "lara@zingara.co.za",
      phone: "0764402219",
    },
    notes: "Open to Middle Ring if Golden Circle remains full.",
    status: "promoted",
    communicationHistory: [
      {
        id: "WAITLIST-GC-8-promotion-email",
        channel: "email",
        sentAt: "2026-05-25T16:00:00.000Z",
        subject: "A Zingara table may be available",
        templateId: "email-waitlist-promotion",
        trigger: "waitlist-promotion",
        message:
          "Dear Lara Mokoena, your waitlist request for Sunday, The Royal Countess Dinner Show has been promoted. The box office will confirm the table shortly.",
      },
    ],
    createdAt: "2026-05-25T15:25:00.000Z",
    promotedAt: "2026-05-25T16:00:00.000Z",
  },
];

const seededDemoCustomerCrm: DemoCustomerCrmRecord[] = [
  {
    customerKey: "tracy@zingara.co.za",
    notes: "VIP guest. Prefers Golden Circle sightlines and early arrival.",
    vipTags: ["VIP", "Returning Guest"],
    updatedAt: "2026-05-25T13:32:00.000Z",
  },
  {
    customerKey: "richard@zingara.co.za",
    notes: "Prefers balcony seating and clear aisle access.",
    vipTags: ["Balcony Preference"],
    updatedAt: "2026-05-25T13:47:00.000Z",
  },
  {
    customerKey: "craig@zingara.co.za",
    notes: "Birthday celebration booking. Confirm cake timing with floor team.",
    vipTags: ["Celebration"],
    updatedAt: "2026-05-25T14:06:00.000Z",
  },
];

function getSeededDemoBookings() {
  return seededDemoBookings.map(normalizeDemoBooking);
}

function getSeededDemoWaitlist() {
  return seededDemoWaitlist.map(normalizeDemoWaitlistEntry);
}

function getSeededDemoCustomerCrm() {
  return seededDemoCustomerCrm.map(normalizeDemoCustomerCrmRecord);
}

function createSeededDemoTables(shows = defaultShows) {
  const bookings = getSeededDemoBookings();

  return shows
    .flatMap((show) => createTablesForShow(show.id))
    .map((table) => {
      const booking = bookings.find(
        (currentBooking) =>
          currentBooking.showId === table.showId &&
          currentBooking.tableId === table.id,
      );

      return booking
        ? {
            ...table,
            status: "booked" as const,
            bookingReference: booking.reference,
            guestNotes: booking.customer.name,
          }
        : table;
    });
}

function mergeSeededItems<T>(
  storedItems: T[],
  seededItems: T[],
  getId: (item: T) => string,
) {
  if (storedItems.length >= seededItems.length) {
    return storedItems;
  }

  const storedIds = new Set(storedItems.map(getId));
  const missingSeedItems = seededItems.filter(
    (item) => !storedIds.has(getId(item)),
  );

  return [...storedItems, ...missingSeedItems];
}

function isOccupyingDemoBookingStatus(status: BookingStatus) {
  return ![
    "cancelled",
    "refunded",
    "completed",
    "no-show",
    "waitlisted",
  ].includes(status);
}

function applyBookingOccupancyToTables(
  tables: DemoTable[],
  bookings: DemoBooking[],
) {
  return tables.map((table) => {
    if (table.status === "disabled" || table.bookingReference) {
      return table;
    }

    const occupyingBooking = bookings.find(
      (booking) =>
        booking.tableId === table.id &&
        booking.showId === table.showId &&
        isOccupyingDemoBookingStatus(booking.status),
    );

    return occupyingBooking
      ? {
          ...table,
          status: "booked" as const,
          bookingReference: occupyingBooking.reference,
          guestNotes:
            table.guestNotes || occupyingBooking.customer.name
              ? `${occupyingBooking.customer.name} ${table.guestNotes}`.trim()
              : table.guestNotes,
        }
      : table;
  });
}

function isCompleteDemoVenueSettings(settings: unknown) {
  if (!settings || typeof settings !== "object") {
    return false;
  }

  const venueSettings = settings as DemoVenueSettings;
  const theme = venueSettings.theme;
  const themePrimary = theme?.primary;

  return Boolean(
    venueSettings.brandTitle &&
      venueSettings.emailSender &&
      venueSettings.emailSender.fromEmail &&
      venueSettings.emailSender.fromName &&
      venueSettings.emailSender.replyTo &&
      venueSettings.faviconUrl &&
      venueSettings.logoUrl &&
      venueSettings.operationalMessaging &&
      venueSettings.operationalMessaging.broadcastPrefix &&
      venueSettings.operationalMessaging.defaultGuestMessage &&
      venueSettings.operationalSettings &&
      typeof venueSettings.operationalSettings
        .defaultDepositPercentage === "number" &&
      typeof venueSettings.operationalSettings.bookingCutoffHours ===
        "number" &&
      venueSettings.operationalSettings.cancellationRule &&
      venueSettings.showBranding &&
      venueSettings.socialLinks &&
      venueSettings.supportContact &&
      theme &&
      theme.accent &&
      theme.background &&
      themePrimary &&
      theme.surface &&
      venueSettings.ticketBranding &&
      venueSettings.ticketBranding.accentText &&
      venueSettings.ticketBranding.footerNote &&
      venueSettings.typography &&
      venueSettings.typography.bodyFont &&
      venueSettings.typography.headingFont &&
      venueSettings.zonePricing,
  );
}

function normalizeCommunicationTemplate(
  template: CommunicationTemplate,
) {
  const defaultTemplate = defaultCommunicationTemplates.find(
    (currentTemplate) => currentTemplate.id === template.id,
  );

  return {
    ...template,
    body: template.body ?? defaultTemplate?.body ?? "",
    channel: template.channel ?? defaultTemplate?.channel ?? "email",
    name: template.name ?? defaultTemplate?.name ?? "Guest Message",
    subject: template.subject ?? defaultTemplate?.subject ?? "",
    trigger:
      template.trigger ??
      defaultTemplate?.trigger ??
      "custom-message",
    updatedAt: template.updatedAt ?? new Date().toISOString(),
  };
}

function normalizeTablesForShows(
  tables: DemoTable[],
  shows: DemoShow[],
) {
  const normalizedTables = tables.map((table, index) => {
    const zoneId = isValidSeatingZoneId(table.zoneId)
      ? table.zoneId
      : "middle-ring";

    return {
      ...table,
      id: getSafeString(table.id, `table-${index + 1}`),
      showId: getSafeString(table.showId, defaultShows[0].id),
      zoneId,
      tableNumber: getSafeString(
        table.tableNumber,
        `T${index + 1}`,
      ),
      baseSeatCapacity: Math.max(
        1,
        getSafeNumber(table.baseSeatCapacity, table.seatCapacity ?? 2),
      ),
      baseStatus: isKnownValue(table.baseStatus, tableStatusValues)
        ? table.baseStatus
        : "available",
      baseGuestNotes: getSafeString(table.baseGuestNotes),
      baseMergeable: table.baseMergeable ?? true,
      seatCapacity: Math.max(1, getSafeNumber(table.seatCapacity, 2)),
      status: isKnownValue(table.status, tableStatusValues)
        ? table.status
        : "available",
      guestNotes: getSafeString(table.guestNotes),
      mergeable: table.mergeable ?? true,
      bookingReference: table.bookingReference,
      mergedFrom: Array.isArray(table.mergedFrom)
        ? table.mergedFrom
        : undefined,
      mergedInto: getSafeString(table.mergedInto),
      mergeHistory: Array.isArray(table.mergeHistory)
        ? table.mergeHistory
        : [],
      showOverride:
        table.showOverride && typeof table.showOverride === "object"
          ? {
              mergeable: table.showOverride.mergeable,
              operationalNotes: getSafeString(
                table.showOverride.operationalNotes,
              ),
              seatCapacity:
                table.showOverride.seatCapacity === undefined
                  ? undefined
                  : Math.max(
                      1,
                      getSafeNumber(table.showOverride.seatCapacity, 2),
                    ),
              status: isKnownValue(
                table.showOverride.status,
                tableStatusValues,
              )
                ? table.showOverride.status
                : undefined,
              updatedAt: getSafeString(
                table.showOverride.updatedAt,
                new Date().toISOString(),
              ),
            }
          : undefined,
    };
  });
  const tableShowIds = new Set(
    normalizedTables.map((table) => table.showId),
  );
  const missingShowTables = shows
    .filter((show) => !tableShowIds.has(show.id))
    .flatMap((show) => createTablesForShow(show.id));

  return [...normalizedTables, ...missingShowTables];
}

function hasCurrentVenueTableShape(tables: DemoTable[], shows: DemoShow[]) {
  if (shows.length === 0) {
    return true;
  }

  return shows.every((show) => {
    const showTables = tables.filter((table) => table.showId === show.id);

    return (
      showTables.filter((table) => table.zoneId === "royal-booths")
        .length === 19 &&
      showTables.filter((table) => table.zoneId === "middle-ring")
        .length >= 20 &&
      showTables.filter((table) => table.zoneId === "golden-circle")
        .length >= 15 &&
      showTables.filter((table) => table.zoneId === "royal-balcony")
        .length >= 4 &&
      showTables
        .filter((table) => table.zoneId === "royal-balcony")
        .every((table) => table.tableNumber.startsWith("RB")) &&
      showTables
        .filter((table) => table.zoneId === "elevated-stage")
        .every((table) => table.status === "disabled")
    );
  });
}

function replaceStoredDemoValue<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function dedupeById<T>(
  items: T[],
  getId: (item: T) => string,
) {
  const seenIds = new Set<string>();

  return items.filter((item) => {
    const id = getId(item);

    if (seenIds.has(id)) {
      return false;
    }

    seenIds.add(id);
    return true;
  });
}

export function getStoredDemoShows() {
  if (typeof window === "undefined") {
    return defaultShows;
  }

  try {
    const storedShows = window.localStorage.getItem(
      demoShowsStorageKey,
    );
    const parsedShows = storedShows
      ? (JSON.parse(storedShows) as unknown)
      : defaultShows;

    if (!Array.isArray(parsedShows) || parsedShows.length === 0) {
      replaceStoredDemoValue(demoShowsStorageKey, defaultShows);

      return defaultShows;
    }

    const normalizedShows = parsedShows.map(normalizeDemoShow);
    const showHasChanged = normalizedShows.some(
      (show, index) =>
        show.date !== (parsedShows[index] as DemoShow).date ||
        show.time !== (parsedShows[index] as DemoShow).time ||
        show.label !== (parsedShows[index] as DemoShow).label,
    );

    if (showHasChanged) {
      replaceStoredDemoValue(demoShowsStorageKey, normalizedShows);
    }

    console.log("[Zingara shows] show loaded", {
      source: "localStorage",
      storageKey: demoShowsStorageKey,
      shows: normalizedShows.map((show) => ({
        date: show.date,
        id: show.id,
        label: show.label,
        status: show.operationalStatus ?? "active",
        time: getSouthAfricaShowTime(show),
      })),
    });

    return normalizedShows;
  } catch {
    replaceStoredDemoValue(demoShowsStorageKey, defaultShows);

    console.log("[Zingara shows] show loaded", {
      source: "fallback-defaults",
      storageKey: demoShowsStorageKey,
      shows: defaultShows.map((show) => ({
        date: show.date,
        id: show.id,
        label: show.label,
        status: show.operationalStatus ?? "active",
        time: getSouthAfricaShowTime(show),
      })),
    });

    return defaultShows;
  }
}

export function getStoredDemoBookings() {
  if (typeof window === "undefined") {
    return getSeededDemoBookings();
  }

  try {
    const storedBookings = window.localStorage.getItem(
      demoBookingsStorageKey,
    );
    const parsedBookings = storedBookings
      ? (JSON.parse(storedBookings) as unknown)
      : getSeededDemoBookings();

    const seededBookings = getSeededDemoBookings();

    if (!Array.isArray(parsedBookings) || parsedBookings.length === 0) {

      replaceStoredDemoValue(demoBookingsStorageKey, seededBookings);

      return seededBookings;
    }

    const normalizedBookings = parsedBookings.map(normalizeDemoBooking);
    const mergedBookings = mergeSeededItems(
      normalizedBookings,
      seededBookings,
      (booking) => booking.reference,
    );

    if (mergedBookings.length !== normalizedBookings.length) {
      replaceStoredDemoValue(demoBookingsStorageKey, mergedBookings);
    }

    return mergedBookings;
  } catch {
    const seededBookings = getSeededDemoBookings();

    replaceStoredDemoValue(demoBookingsStorageKey, seededBookings);

    return seededBookings;
  }
}

export function getStoredDemoWaitlist() {
  if (typeof window === "undefined") {
    return getSeededDemoWaitlist();
  }

  try {
    const storedWaitlist = window.localStorage.getItem(
      demoWaitlistStorageKey,
    );
    const parsedWaitlist = storedWaitlist
      ? (JSON.parse(storedWaitlist) as unknown)
      : getSeededDemoWaitlist();

    const seededWaitlist = getSeededDemoWaitlist();

    if (!Array.isArray(parsedWaitlist) || parsedWaitlist.length === 0) {

      replaceStoredDemoValue(demoWaitlistStorageKey, seededWaitlist);

      return seededWaitlist;
    }

    const normalizedWaitlist = parsedWaitlist.map(
      normalizeDemoWaitlistEntry,
    );
    const mergedWaitlist = mergeSeededItems(
      normalizedWaitlist,
      seededWaitlist,
      (entry) => entry.id,
    );

    if (mergedWaitlist.length !== normalizedWaitlist.length) {
      replaceStoredDemoValue(demoWaitlistStorageKey, mergedWaitlist);
    }

    return mergedWaitlist;
  } catch {
    const seededWaitlist = getSeededDemoWaitlist();

    replaceStoredDemoValue(demoWaitlistStorageKey, seededWaitlist);

    return seededWaitlist;
  }
}

export function getStoredDemoCustomerCrm() {
  if (typeof window === "undefined") {
    return getSeededDemoCustomerCrm();
  }

  try {
    const storedCrm = window.localStorage.getItem(
      demoCustomerCrmStorageKey,
    );
    const parsedCrm = storedCrm
      ? (JSON.parse(storedCrm) as unknown)
      : getSeededDemoCustomerCrm();

    const seededCrm = getSeededDemoCustomerCrm();

    if (!Array.isArray(parsedCrm) || parsedCrm.length === 0) {

      replaceStoredDemoValue(demoCustomerCrmStorageKey, seededCrm);

      return seededCrm;
    }

    const normalizedCrm = parsedCrm.map(normalizeDemoCustomerCrmRecord);
    const mergedCrm = mergeSeededItems(
      normalizedCrm,
      seededCrm,
      (record) => record.customerKey,
    );

    if (mergedCrm.length !== normalizedCrm.length) {
      replaceStoredDemoValue(demoCustomerCrmStorageKey, mergedCrm);
    }

    return mergedCrm;
  } catch {
    const seededCrm = getSeededDemoCustomerCrm();

    replaceStoredDemoValue(demoCustomerCrmStorageKey, seededCrm);

    return seededCrm;
  }
}

export function getStoredCorporateRequests() {
  if (typeof window === "undefined") {
    return [] as CorporateRequest[];
  }

  try {
    const storedRequests = window.localStorage.getItem(
      demoCorporateRequestsStorageKey,
    );
    const parsedRequests = storedRequests
      ? (JSON.parse(storedRequests) as unknown)
      : [];

    if (!Array.isArray(parsedRequests)) {
      replaceStoredDemoValue(demoCorporateRequestsStorageKey, []);

      return [] as CorporateRequest[];
    }

    const normalizedRequests = parsedRequests.map((request, index) =>
      normalizeCorporateRequest(
        request as Partial<CorporateRequest>,
        index,
      ),
    );

    if (normalizedRequests.length !== parsedRequests.length) {
      replaceStoredDemoValue(
        demoCorporateRequestsStorageKey,
        normalizedRequests,
      );
    }

    return normalizedRequests;
  } catch {
    replaceStoredDemoValue(demoCorporateRequestsStorageKey, []);

    return [] as CorporateRequest[];
  }
}

export function getStoredVenueSettings() {
  if (typeof window === "undefined") {
    return defaultVenueSettings;
  }

  try {
    const storedSettings = window.localStorage.getItem(
      demoVenueSettingsStorageKey,
    );
    const parsedSettings = storedSettings
      ? (JSON.parse(storedSettings) as DemoVenueSettings)
      : defaultVenueSettings;

    if (!isCompleteDemoVenueSettings(parsedSettings)) {
      replaceStoredDemoValue(
        demoVenueSettingsStorageKey,
        defaultVenueSettings,
      );

      return defaultVenueSettings;
    }

    const nextSettings = {
      ...parsedSettings,
      faviconUrl:
        parsedSettings.faviconUrl === legacyZingaraFaviconUrl
          ? defaultZingaraFaviconUrl
          : parsedSettings.faviconUrl,
      logoUrl:
        parsedSettings.logoUrl === legacyZingaraLogoUrl
          ? defaultZingaraLogoUrl
          : parsedSettings.logoUrl,
      ticketBranding: {
        ...parsedSettings.ticketBranding,
        ticketLogoUrl:
          parsedSettings.ticketBranding.ticketLogoUrl ===
          legacyZingaraLogoUrl
            ? defaultZingaraLogoUrl
            : parsedSettings.ticketBranding.ticketLogoUrl,
      },
    };

    if (
      nextSettings.faviconUrl !== parsedSettings.faviconUrl ||
      nextSettings.logoUrl !== parsedSettings.logoUrl ||
      nextSettings.ticketBranding.ticketLogoUrl !==
        parsedSettings.ticketBranding.ticketLogoUrl
    ) {
      replaceStoredDemoValue(
        demoVenueSettingsStorageKey,
        nextSettings,
      );
    }

    return nextSettings;
  } catch {
    return defaultVenueSettings;
  }
}

export function getStoredCommunicationTemplates() {
  if (typeof window === "undefined") {
    return defaultCommunicationTemplates;
  }

  try {
    const storedTemplates = window.localStorage.getItem(
      demoCommunicationTemplatesStorageKey,
    );
    const parsedTemplates = storedTemplates
      ? (JSON.parse(storedTemplates) as unknown)
      : defaultCommunicationTemplates;
    const templates = Array.isArray(parsedTemplates)
      ? parsedTemplates.map(normalizeCommunicationTemplate)
      : defaultCommunicationTemplates;
    const storedTemplateIds = new Set(
      templates.map((template) => template.id),
    );
    const missingDefaultTemplates =
      defaultCommunicationTemplates.filter(
        (template) => !storedTemplateIds.has(template.id),
      );

    return [...templates, ...missingDefaultTemplates];
  } catch {
    return defaultCommunicationTemplates;
  }
}

export function getStoredDemoTables() {
  if (typeof window === "undefined") {
    return createSeededDemoTables();
  }

  try {
    const storedTables = window.localStorage.getItem(
      demoTablesStorageKey,
    );
    const shows = getStoredDemoShows();
    const parsedTables = storedTables
      ? (JSON.parse(storedTables) as unknown)
      : createSeededDemoTables(shows);

    if (!Array.isArray(parsedTables) || parsedTables.length === 0) {
      const defaultTablesForShows = createSeededDemoTables(shows);

      replaceStoredDemoValue(demoTablesStorageKey, defaultTablesForShows);

      return defaultTablesForShows;
    }

    const normalizedTables = applyBookingOccupancyToTables(
      normalizeTablesForShows(parsedTables, shows),
      getStoredDemoBookings(),
    );

    if (!hasCurrentVenueTableShape(normalizedTables, shows)) {
      const defaultTablesForShows = createSeededDemoTables(shows);

      replaceStoredDemoValue(demoTablesStorageKey, defaultTablesForShows);

      return defaultTablesForShows;
    }

    replaceStoredDemoValue(demoTablesStorageKey, normalizedTables);

    return normalizedTables;
  } catch {
    return createSeededDemoTables();
  }
}

export function storeDemoShows(shows: DemoShow[]) {
  const normalizedShows = dedupeById(
    shows.map(normalizeDemoShow),
    (show) => show.id,
  );

  window.localStorage.setItem(
    demoShowsStorageKey,
    JSON.stringify(normalizedShows),
  );
  console.log("[Zingara shows] show saved", {
    source: "localStorage",
    storageKey: demoShowsStorageKey,
    shows: normalizedShows.map((show) => ({
      date: show.date,
      id: show.id,
      label: show.label,
      status: show.operationalStatus ?? "active",
      time: getSouthAfricaShowTime(show),
    })),
  });
  window.dispatchEvent(
    new CustomEvent("zingara-demo-shows-updated"),
  );
}

export function storeDemoBookings(bookings: DemoBooking[]) {
  const normalizedBookings = dedupeById(
    bookings.map(normalizeDemoBooking),
    (booking) => booking.reference,
  );

  window.localStorage.setItem(
    demoBookingsStorageKey,
    JSON.stringify(normalizedBookings),
  );
  window.dispatchEvent(
    new CustomEvent("zingara-demo-bookings-updated"),
  );
}

export function storeDemoTables(tables: DemoTable[]) {
  const normalizedTables = normalizeTablesForShows(
    tables,
    getStoredDemoShows(),
  );

  window.localStorage.setItem(
    demoTablesStorageKey,
    JSON.stringify(normalizedTables),
  );
  window.dispatchEvent(
    new CustomEvent("zingara-demo-tables-updated"),
  );
}

export function storeDemoWaitlist(waitlist: DemoWaitlistEntry[]) {
  const normalizedWaitlist = dedupeById(
    waitlist.map(normalizeDemoWaitlistEntry),
    (entry) => entry.id,
  );

  window.localStorage.setItem(
    demoWaitlistStorageKey,
    JSON.stringify(normalizedWaitlist),
  );
  window.dispatchEvent(
    new CustomEvent("zingara-demo-waitlist-updated"),
  );
}

export function storeDemoCustomerCrm(
  records: DemoCustomerCrmRecord[],
) {
  const normalizedRecords = dedupeById(
    records.map(normalizeDemoCustomerCrmRecord),
    (record) => record.customerKey,
  );

  window.localStorage.setItem(
    demoCustomerCrmStorageKey,
    JSON.stringify(normalizedRecords),
  );
  window.dispatchEvent(
    new CustomEvent("zingara-demo-customer-crm-updated"),
  );
}

export function storeCorporateRequests(requests: CorporateRequest[]) {
  const normalizedRequests = dedupeById(
    requests.map((request, index) =>
      normalizeCorporateRequest(request, index),
    ),
    (request) => request.id,
  );

  window.localStorage.setItem(
    demoCorporateRequestsStorageKey,
    JSON.stringify(normalizedRequests),
  );
  window.dispatchEvent(
    new CustomEvent("zingara-demo-corporate-requests-updated"),
  );
}

export function storeVenueSettings(settings: DemoVenueSettings) {
  window.localStorage.setItem(
    demoVenueSettingsStorageKey,
    JSON.stringify(settings),
  );
  window.dispatchEvent(
    new CustomEvent("zingara-demo-venue-settings-updated"),
  );
}

export function storeCommunicationTemplates(
  templates: CommunicationTemplate[],
) {
  window.localStorage.setItem(
    demoCommunicationTemplatesStorageKey,
    JSON.stringify(templates),
  );
  window.dispatchEvent(
    new CustomEvent("zingara-demo-communication-templates-updated"),
  );
}

export function findBestAvailableTable(
  tables: DemoTable[],
  showId: string,
  zoneId: SeatingZoneId,
  partySize: number,
) {
  return findBestTableAllocation(tables, showId, zoneId, partySize)
    ?.table;
}

function getAllocationScore(tableCapacity: number, partySize: number) {
  const wastedSeats = tableCapacity - partySize;

  return wastedSeats;
}

function getTableSortValue(tableNumber: string) {
  const match = tableNumber.match(/^([A-Z]+)(\d+)$/i);

  if (!match) {
    return tableNumber;
  }

  return `${match[1].toUpperCase()}${match[2].padStart(4, "0")}`;
}

function isAllocatableTable(table: DemoTable) {
  return (
    table.status === "available" &&
    !table.bookingReference &&
    !table.mergedInto
  );
}

function isAutoMergeCandidate(table: DemoTable) {
  return (
    isAllocatableTable(table) &&
    table.mergeable !== false &&
    !table.mergedFrom?.length
  );
}

function getTableCombinationNumber(tables: DemoTable[]) {
  return tables.map((table) => table.tableNumber).join(" + ");
}

function createCombinedTable(
  showId: string,
  zoneId: SeatingZoneId,
  sourceTables: DemoTable[],
): DemoTable {
  const tableNumber = getTableCombinationNumber(sourceTables);
  const seatCapacity = sourceTables.reduce(
    (totalSeats, table) => totalSeats + table.seatCapacity,
    0,
  );

  return {
    id: `${showId}-${zoneId}-auto-merge-${sourceTables
      .map((table) => table.id)
      .join("-")}`,
    showId,
    zoneId,
    tableNumber,
    baseSeatCapacity: seatCapacity,
    baseStatus: "available",
    baseGuestNotes: `Combined from ${tableNumber}`,
    baseMergeable: true,
    seatCapacity,
    status: "available",
    guestNotes: `Combined from ${tableNumber}`,
    mergeable: true,
    mergedFrom: sourceTables.map((table) => table.id),
  };
}

function compareTableAllocations(
  firstAllocation: TableAllocation,
  secondAllocation: TableAllocation,
) {
  return (
    firstAllocation.wastedSeats - secondAllocation.wastedSeats ||
    firstAllocation.sourceTables.length -
      secondAllocation.sourceTables.length ||
    firstAllocation.table.seatCapacity - secondAllocation.table.seatCapacity ||
    getTableSortValue(firstAllocation.table.tableNumber).localeCompare(
      getTableSortValue(secondAllocation.table.tableNumber),
    )
  );
}

function getCompatibleMergedAllocation(
  tables: DemoTable[],
  showId: string,
  zoneId: SeatingZoneId,
  partySize: number,
) {
  const mergeCandidates = tables
    .filter(
      (table) =>
        table.showId === showId &&
        table.zoneId === zoneId &&
        isAutoMergeCandidate(table),
    )
    .sort(
      (firstTable, secondTable) =>
        firstTable.seatCapacity - secondTable.seatCapacity ||
        getTableSortValue(firstTable.tableNumber).localeCompare(
          getTableSortValue(secondTable.tableNumber),
        ),
    );
  const allocations: TableAllocation[] = [];
  const maxTablesToMerge = Math.min(4, mergeCandidates.length);

  function collectCombinations(
    startIndex: number,
    sourceTables: DemoTable[],
    targetTableCount: number,
  ) {
    if (sourceTables.length === targetTableCount) {
      const seatCapacity = sourceTables.reduce(
        (totalSeats, table) => totalSeats + table.seatCapacity,
        0,
      );

      if (seatCapacity >= partySize) {
        allocations.push({
          isCombination: true,
          sourceTables,
          table: createCombinedTable(showId, zoneId, sourceTables),
          wastedSeats: seatCapacity - partySize,
        });
      }

      return;
    }

    for (
      let tableIndex = startIndex;
      tableIndex < mergeCandidates.length;
      tableIndex += 1
    ) {
      collectCombinations(
        tableIndex + 1,
        [...sourceTables, mergeCandidates[tableIndex]],
        targetTableCount,
      );
    }
  }

  for (let tableCount = 2; tableCount <= maxTablesToMerge; tableCount += 1) {
    collectCombinations(0, [], tableCount);
  }

  return allocations.sort(compareTableAllocations)[0];
}

export function findBestTableAllocation(
  tables: DemoTable[],
  showId: string,
  zoneId: SeatingZoneId,
  partySize: number,
): TableAllocation | undefined {
  const availableTables = tables.filter(
    (table) =>
      table.showId === showId &&
      table.zoneId === zoneId &&
      isAllocatableTable(table),
  );
  const singleTable = availableTables
    .filter((table) => table.seatCapacity >= partySize)
    .sort(
      (firstTable, secondTable) =>
        getAllocationScore(firstTable.seatCapacity, partySize) -
          getAllocationScore(secondTable.seatCapacity, partySize) ||
        firstTable.seatCapacity - secondTable.seatCapacity ||
        getTableSortValue(firstTable.tableNumber).localeCompare(
          getTableSortValue(secondTable.tableNumber),
        )
    )[0];

  if (singleTable) {
    return {
      isCombination: false,
      sourceTables: [singleTable],
      table: singleTable,
      wastedSeats: singleTable.seatCapacity - partySize,
    };
  }

  return getCompatibleMergedAllocation(tables, showId, zoneId, partySize);
}

export function getTableAllocationDisplay(
  allocation: TableAllocation | undefined,
) {
  if (!allocation) {
    return "No Suitable Table Available";
  }

  return allocation.isCombination
    ? `${allocation.table.tableNumber} (Combined Table)`
    : allocation.table.tableNumber;
}

export function applyTableAllocation(
  tables: DemoTable[],
  allocation: TableAllocation,
  bookingReference: string,
  guestNotes: string,
) {
  if (!allocation.isCombination) {
    return tables.map((table) =>
      table.id === allocation.table.id
        ? {
            ...table,
            status: "booked" as const,
            bookingReference,
            guestNotes:
              guestNotes || table.guestNotes
                ? `${guestNotes} ${table.guestNotes}`.trim()
                : table.guestNotes,
          }
        : table,
    );
  }

  return [
    ...tables.map((table) =>
      allocation.sourceTables.some(
        (sourceTable) => sourceTable.id === table.id,
      )
        ? {
            ...table,
            status: "disabled" as const,
            mergedInto: allocation.table.id,
            guestNotes: `Combined into ${allocation.table.tableNumber}`,
          }
        : table,
    ),
    {
      ...allocation.table,
      status: "booked" as const,
      bookingReference,
      guestNotes,
    },
  ];
}

export function getBetterFitTableSuggestion(
  tables: DemoTable[],
  booking: Pick<
    DemoBooking,
    "partySize" | "showId" | "tableId" | "zoneId"
  >,
) {
  const currentTable = tables.find(
    (table) => table.id === booking.tableId,
  );

  if (!currentTable || !booking.showId) {
    return undefined;
  }

  const allocation = findBestTableAllocation(
    tables,
    booking.showId,
    booking.zoneId,
    booking.partySize,
  );

  if (
    allocation &&
    !allocation.isCombination &&
    allocation.table.id !== currentTable.id &&
    allocation.table.seatCapacity < currentTable.seatCapacity
  ) {
    return allocation.table;
  }

  return undefined;
}
