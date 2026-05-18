export const demoBookingsStorageKey = "zingara-demo-bookings";
export const demoShowsStorageKey = "zingara-demo-shows";
export const demoTablesStorageKey = "zingara-demo-tables";
export const demoWaitlistStorageKey = "zingara-demo-waitlist";
export const demoCustomerCrmStorageKey = "zingara-demo-customer-crm";
export const demoCommunicationTemplatesStorageKey =
  "zingara-demo-communication-templates";
export const demoVenueSettingsStorageKey =
  "zingara-demo-venue-settings";

export type DemoVenueSettings = {
  brandTitle: string;
  emailSender: {
    fromEmail: string;
    fromName: string;
    replyTo: string;
  };
  logoInitial: string;
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
  logoInitial: "Z",
  logoUrl: "",
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
    ticketLogoUrl: "",
  },
  typography: {
    bodyFont: "Inter",
    headingFont: "Playfair Display",
  },
  venueId: "zingara-cape-town",
  venueName: "The Royal Countess Zingara",
  zonePricing: {
    "elevated-stage": {
      depositPercentage: 50,
      price: 1470,
    },
    "golden-circle": {
      depositPercentage: 40,
      price: 1470,
    },
    "middle-ring": {
      depositPercentage: 35,
      price: 1260,
    },
    "royal-balcony": {
      depositPercentage: 50,
      price: 1340,
    },
    "royal-booths": {
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
    maxGuests: 12,
    depositPercentage: 50,
    totalCapacity: 24,
    bookedSeats: 8,
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
    maxGuests: 12,
    depositPercentage: 40,
    totalCapacity: 36,
    bookedSeats: 18,
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
    maxGuests: 16,
    depositPercentage: 35,
    totalCapacity: 48,
    bookedSeats: 34,
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
    minGuests: 6,
    maxGuests: 6,
    depositPercentage: 50,
    totalCapacity: 18,
    bookedSeats: 12,
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
    minGuests: 8,
    maxGuests: 16,
    depositPercentage: 50,
    totalCapacity: 16,
    bookedSeats: 4,
  },
] as const;

export type SeatingZone = (typeof seatingZones)[number];
export type SeatingZoneId = SeatingZone["id"];
export type TableStatus = "available" | "booked" | "disabled";
export type BookingStatus =
  | "confirmed"
  | "pending"
  | "cancelled"
  | "checked-in";
export type TicketState =
  | "Active"
  | "Checked In"
  | "Cancelled"
  | "Waitlist"
  | "Pending Payment";
export type WaitlistStatus =
  | "waiting"
  | "promoted"
  | "converted"
  | "removed";
export type PaymentOption = "full" | "deposit";
export type PromoDiscountType = "fixed" | "percentage";
export type BookingSource = "online" | "waitlist" | "admin";
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
  seatCapacity: number;
  status: TableStatus;
  guestNotes: string;
  bookingReference?: string;
  mergedFrom?: string[];
};
export type DemoShow = {
  id: string;
  date: string;
  time: string;
  label: string;
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
  subject?: string;
  sentAt: string;
  templateId?: string;
  trigger?: CommunicationTrigger;
  message: string;
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
  totalPrice: number;
  pricePerPerson: number;
  paymentOption?: PaymentOption;
  depositPercentage?: number;
  amountPaid?: number;
  balanceDue?: number;
  promoCode?: string;
  promoLabel?: string;
  source?: BookingSource;
  ticketCode?: string;
  ticketIssuedAt?: string;
  customer: CustomerInfo;
  status: BookingStatus;
  arrivalTime?: string;
  communicationHistory: CommunicationRecord[];
  createdAt: string;
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
    message: extras.message,
    partySize: booking.partySize,
    refundSummary:
      extras.refundSummary ??
      "Any eligible refund will be reviewed by the box office.",
    seatingZone: booking.zoneTitle,
    showDate: show?.date ?? booking.bookingDate,
    showName: show?.label ?? booking.bookingDate,
    showTime: show?.time ?? "",
    tableNumber: booking.tableNumber,
    ticketCode: booking.ticketCode ?? createTicketCode(booking.reference),
    ticketUrl: getTicketUrl(booking.reference),
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
  booking: Pick<DemoBooking, "communicationHistory" | "reference">;
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
    subject,
    templateId,
    trigger,
  };
}

export function getBookingTicketState(
  booking: Pick<
    DemoBooking,
    "balanceDue" | "status" | "totalPrice"
  >,
): TicketState {
  if ((booking.status ?? "confirmed") === "cancelled") {
    return "Cancelled";
  }

  if ((booking.status ?? "confirmed") === "checked-in") {
    return "Checked In";
  }

  if (
    (booking.status ?? "confirmed") === "pending" ||
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
    "Pending Payment":
      "border-amber-300/40 bg-amber-950/30 text-amber-200",
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

export const defaultTables: DemoTable[] = [
  {
    id: "elevated-stage-1",
    zoneId: "elevated-stage",
    tableNumber: "ES1",
    seatCapacity: 4,
    status: "available",
    guestNotes: "",
  },
  {
    id: "elevated-stage-2",
    zoneId: "elevated-stage",
    tableNumber: "ES2",
    seatCapacity: 6,
    status: "booked",
    guestNotes: "VIP host hold",
  },
  {
    id: "elevated-stage-3",
    zoneId: "elevated-stage",
    tableNumber: "ES3",
    seatCapacity: 8,
    status: "available",
    guestNotes: "",
  },
  {
    id: "golden-circle-1",
    zoneId: "golden-circle",
    tableNumber: "GC1",
    seatCapacity: 4,
    status: "available",
    guestNotes: "",
  },
  {
    id: "golden-circle-2",
    zoneId: "golden-circle",
    tableNumber: "GC2",
    seatCapacity: 6,
    status: "available",
    guestNotes: "",
  },
  {
    id: "golden-circle-3",
    zoneId: "golden-circle",
    tableNumber: "GC3",
    seatCapacity: 8,
    status: "booked",
    guestNotes: "Anniversary booking",
  },
  {
    id: "middle-ring-1",
    zoneId: "middle-ring",
    tableNumber: "MR1",
    seatCapacity: 4,
    status: "available",
    guestNotes: "",
  },
  {
    id: "middle-ring-2",
    zoneId: "middle-ring",
    tableNumber: "MR2",
    seatCapacity: 8,
    status: "available",
    guestNotes: "",
  },
  {
    id: "middle-ring-3",
    zoneId: "middle-ring",
    tableNumber: "MR3",
    seatCapacity: 12,
    status: "booked",
    guestNotes: "Corporate hold",
  },
  {
    id: "royal-booths-1",
    zoneId: "royal-booths",
    tableNumber: "RB1",
    seatCapacity: 6,
    status: "available",
    guestNotes: "",
  },
  {
    id: "royal-booths-2",
    zoneId: "royal-booths",
    tableNumber: "RB2",
    seatCapacity: 6,
    status: "booked",
    guestNotes: "Private booth booking",
  },
  {
    id: "royal-balcony-1",
    zoneId: "royal-balcony",
    tableNumber: "BAL1",
    seatCapacity: 8,
    status: "available",
    guestNotes: "",
  },
  {
    id: "royal-balcony-2",
    zoneId: "royal-balcony",
    tableNumber: "BAL2",
    seatCapacity: 8,
    status: "available",
    guestNotes: "",
  },
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

export function getShowById(showId: string) {
  return getStoredDemoShows().find((show) => show.id === showId);
}

export function getShowLabel(show?: DemoShow) {
  return show
    ? `${show.date} at ${show.time} · ${show.label}`
    : "Unassigned show";
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
  if (
    show.id === "show-2026-06-20-1900" ||
    show.label === "Saturday Gala"
  ) {
    return {
      ...show,
      label: "Saturday, The Royal Countess Dinner Show",
    };
  }

  if (
    show.id === "show-2026-06-21-1700" ||
    show.label === "Sunday Matinee"
  ) {
    return {
      ...show,
      label: "Sunday, The Royal Countess Dinner Show",
    };
  }

  return show;
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

function normalizeDemoBooking(booking: DemoBooking) {
  const addons = booking.addons ?? [];
  const addonsTotal =
    booking.addonsTotal ??
    addons.reduce((total, addon) => total + addon.price, 0);
  const amountPaid = booking.amountPaid ?? booking.totalPrice;
  const balanceDue = booking.balanceDue ?? 0;

  return {
    ...booking,
    showId: booking.showId ?? defaultShows[0].id,
    status: booking.status ?? "confirmed",
    addons,
    addonsTotal,
    subtotalPrice: booking.subtotalPrice ?? booking.totalPrice,
    discountAmount: booking.discountAmount ?? 0,
    paymentOption: booking.paymentOption ?? "full",
    depositPercentage: booking.depositPercentage ?? 100,
    amountPaid,
    balanceDue,
    source: booking.source ?? "online",
    ticketCode:
      booking.ticketCode ?? createTicketCode(booking.reference),
    ticketIssuedAt: booking.ticketIssuedAt ?? booking.createdAt,
    customer: {
      ...booking.customer,
      name: normalizeDemoName(booking.customer.name),
    },
    communicationHistory: (
      booking.communicationHistory ?? []
    ).map((record) => ({
      ...record,
      message: normalizeDemoText(record.message),
    })),
  };
}

function normalizeDemoWaitlistEntry(
  entry: DemoWaitlistEntry,
) {
  return {
    ...entry,
    showId: entry.showId ?? defaultShows[0].id,
    customer: {
      ...entry.customer,
      name: normalizeDemoName(entry.customer.name),
    },
    notes: normalizeDemoText(entry.notes ?? ""),
    status: entry.status ?? "waiting",
    communicationHistory: (
      entry.communicationHistory ?? []
    ).map((record) => ({
      ...record,
      message: normalizeDemoText(record.message),
    })),
  };
}

function normalizeDemoCustomerCrmRecord(
  record: DemoCustomerCrmRecord,
) {
  return {
    ...record,
    notes: normalizeDemoText(record.notes ?? ""),
    vipTags: record.vipTags ?? [],
  };
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
  const normalizedTables = tables.map((table) => ({
    ...table,
    showId: table.showId ?? defaultShows[0].id,
  }));
  const tableShowIds = new Set(
    normalizedTables.map((table) => table.showId),
  );
  const missingShowTables = shows
    .filter((show) => !tableShowIds.has(show.id))
    .flatMap((show) => createTablesForShow(show.id));

  return [...normalizedTables, ...missingShowTables];
}

function replaceStoredDemoValue<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
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

    return parsedShows.map(normalizeDemoShow);
  } catch {
    replaceStoredDemoValue(demoShowsStorageKey, defaultShows);

    return defaultShows;
  }
}

export function getStoredDemoBookings() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedBookings = window.localStorage.getItem(
      demoBookingsStorageKey,
    );
    const parsedBookings = storedBookings
      ? (JSON.parse(storedBookings) as unknown)
      : [];

    return Array.isArray(parsedBookings)
      ? parsedBookings.map(normalizeDemoBooking)
      : [];
  } catch {
    return [];
  }
}

export function getStoredDemoWaitlist() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedWaitlist = window.localStorage.getItem(
      demoWaitlistStorageKey,
    );
    const parsedWaitlist = storedWaitlist
      ? (JSON.parse(storedWaitlist) as unknown)
      : [];

    return Array.isArray(parsedWaitlist)
      ? parsedWaitlist.map(normalizeDemoWaitlistEntry)
      : [];
  } catch {
    return [];
  }
}

export function getStoredDemoCustomerCrm() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedCrm = window.localStorage.getItem(
      demoCustomerCrmStorageKey,
    );
    const parsedCrm = storedCrm
      ? (JSON.parse(storedCrm) as unknown)
      : [];

    return Array.isArray(parsedCrm)
      ? parsedCrm.map(normalizeDemoCustomerCrmRecord)
      : [];
  } catch {
    return [];
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

    return parsedSettings;
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
    return defaultShows.flatMap((show) =>
      createTablesForShow(show.id),
    );
  }

  try {
    const storedTables = window.localStorage.getItem(
      demoTablesStorageKey,
    );
    const shows = getStoredDemoShows();
    const parsedTables = storedTables
      ? (JSON.parse(storedTables) as unknown)
      : shows.flatMap((show) => createTablesForShow(show.id));

    if (!Array.isArray(parsedTables) || parsedTables.length === 0) {
      const defaultTablesForShows = shows.flatMap((show) =>
        createTablesForShow(show.id),
      );

      replaceStoredDemoValue(demoTablesStorageKey, defaultTablesForShows);

      return defaultTablesForShows;
    }

    return normalizeTablesForShows(parsedTables, shows);
  } catch {
    return defaultShows.flatMap((show) =>
      createTablesForShow(show.id),
    );
  }
}

export function storeDemoShows(shows: DemoShow[]) {
  window.localStorage.setItem(
    demoShowsStorageKey,
    JSON.stringify(shows),
  );
  window.dispatchEvent(
    new CustomEvent("zingara-demo-shows-updated"),
  );
}

export function storeDemoBookings(bookings: DemoBooking[]) {
  window.localStorage.setItem(
    demoBookingsStorageKey,
    JSON.stringify(bookings),
  );
  window.dispatchEvent(
    new CustomEvent("zingara-demo-bookings-updated"),
  );
}

export function storeDemoTables(tables: DemoTable[]) {
  window.localStorage.setItem(
    demoTablesStorageKey,
    JSON.stringify(tables),
  );
  window.dispatchEvent(
    new CustomEvent("zingara-demo-tables-updated"),
  );
}

export function storeDemoWaitlist(waitlist: DemoWaitlistEntry[]) {
  window.localStorage.setItem(
    demoWaitlistStorageKey,
    JSON.stringify(waitlist),
  );
  window.dispatchEvent(
    new CustomEvent("zingara-demo-waitlist-updated"),
  );
}

export function storeDemoCustomerCrm(
  records: DemoCustomerCrmRecord[],
) {
  window.localStorage.setItem(
    demoCustomerCrmStorageKey,
    JSON.stringify(records),
  );
  window.dispatchEvent(
    new CustomEvent("zingara-demo-customer-crm-updated"),
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
  return tables
    .filter(
      (table) =>
        table.showId === showId &&
        table.zoneId === zoneId &&
        table.status === "available" &&
        table.seatCapacity >= partySize,
    )
    .sort(
      (firstTable, secondTable) =>
        firstTable.seatCapacity - secondTable.seatCapacity,
    )[0];
}
