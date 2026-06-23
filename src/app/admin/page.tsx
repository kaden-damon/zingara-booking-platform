"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type AdminRole,
  type Permission,
  type StaffSession,
  adminRoleLabels,
  hasPermission,
  rolePermissions,
} from "../../lib/zingaraAccess";
import {
  getBrowserNotificationDiagnostics,
  getBrowserNotificationStatusLabel,
  getStaffNotifications,
  markAllStaffNotificationsRead,
  markStaffNotificationRead,
  registerZingaraPushSubscription,
  sendZingaraBrowserNotification,
  sendZingaraGuestPushNotification,
  sendZingaraStaffPushNotification,
  sendZingaraPushTestNotification,
  type StaffNotificationRecord,
} from "../../lib/browserNotifications";
import {
  getBookings,
  saveBookings as persistBookings,
} from "../../lib/supabase/bookings";
import {
  adminAuthChangedEvent,
  getAdminAuthSession,
  signInAdmin,
  signOutAdmin,
} from "../../lib/supabase/auth";
import {
  getTemplates,
  saveTemplates,
} from "../../lib/supabase/communicationTemplates";
import { syncCorporateRequestCommunications } from "../../lib/supabase/communications";
import {
  getCustomers,
  saveCustomers,
  upsertCustomerFromInfo,
} from "../../lib/supabase/customers";
import {
  getCorporateRequests,
  saveCorporateRequests as persistCorporateRequests,
} from "../../lib/supabase/corporateRequests";
import { updatePayment } from "../../lib/supabase/payments";
import {
  getOrCreateStaffProfileSession,
} from "../../lib/supabase/staffProfiles";
import {
  type StaffManagementProfile,
  type StaffManagementRole,
  getStaffProfiles,
  deleteStaffProfile,
  updateStaffActive,
  updateStaffRole,
} from "../../lib/supabase/staffManagement";
import {
  createStaffUser,
  getAvailableRoles,
} from "../../lib/supabase/staffInvitations";
import {
  getShows,
  replaceShows,
} from "../../lib/supabase/shows";
import { createTicketValidation } from "../../lib/supabase/ticketValidations";
import { updateTicket } from "../../lib/supabase/tickets";
import {
  getVenueSettings,
  saveVenueSettings as persistVenueSettings,
} from "../../lib/supabase/venueSettings";
import {
  getWaitlistEntries,
  saveWaitlistEntries,
} from "../../lib/supabase/waitlist";
import {
  type BookingStatus,
  type BookingSource,
  type CommunicationChannel,
  type CommunicationTemplate,
  type CommunicationTrigger,
  type CorporateRequest,
  type CorporateRequestStatus,
  type DemoBooking,
  type DemoCustomerCrmRecord,
  type DemoShow,
  type DemoTable,
  type DemoVenueSettings,
  type DemoWaitlistEntry,
  type PaymentStatus,
  type SeatingZone,
  type SeatingZoneId,
  type TicketState,
  type WaitlistStatus,
  applyTableAllocation,
  communicationVariableHints,
  createCommunicationRecord,
  createTablesForShow,
  createTicketCode,
  defaultCommunicationTemplates,
  defaultVenueSettings,
  defaultShows,
  findBestTableAllocation,
  getBetterFitTableSuggestion,
  getBookingTicketState,
  getCommunicationTemplate,
  getIncludedBookingFeeBreakdown,
  getShowLabel,
  getZoneById,
  getStoredDemoTables,
  getSouthAfricaShowTime,
  getTicketUrl,
  renderCommunicationTemplate,
  isValidBookingStatus,
  isValidSeatingZoneId,
  seatingZones,
  storeDemoTables,
} from "../../lib/zingaraDemo";

type NewTableForm = {
  tableNumber: string;
  seatCapacity: number;
};
type NewTablesByZone = Record<SeatingZoneId, NewTableForm>;
type MergeSelection = Record<SeatingZoneId, string>;
type NewShowForm = {
  date: string;
  time: string;
  label: string;
};
type ShowEditForm = {
  date: string;
  description: string;
  internalNotes: string;
  label: string;
  operationalStatus: NonNullable<DemoShow["operationalStatus"]>;
  time: string;
  venueName: string;
};
type AdminSession = StaffSession;
type StaffInviteForm = {
  email: string;
  fullName: string;
  role: AdminRole;
  venueScope: string;
};
type SplitMergeReview = {
  booking?: DemoBooking;
  table: DemoTable;
  targetTableId?: string;
  warning: string;
};
type LoginForm = {
  password: string;
  username: string;
};
type TicketValidationResult = {
  booking?: DemoBooking;
  message: string;
  state: TicketState | "Invalid";
  waitlistEntry?: DemoWaitlistEntry;
};
type CustomMessageForms = Record<
  string,
  {
    channel: CommunicationChannel;
    message: string;
    subject: string;
  }
>;
type BroadcastForm = {
  channel: CommunicationChannel;
  message: string;
  subject: string;
};
type WaitlistReport = Record<WaitlistStatus, number> & {
  activeGuests: number;
};
type OperationalReportType =
  | "bookings"
  | "guest-list"
  | "table-allocations"
  | "check-ins"
  | "revenue"
  | "waitlist"
  | "crm";
type LegacyImportPreview = {
  bookings: DemoBooking[];
  crmRecords: DemoCustomerCrmRecord[];
  errors: string[];
};
type TableOccupancyState =
  | "available"
  | "blocked"
  | "checked-in"
  | "reserved";
type CustomerProfile = {
  addOns: { count: number; name: string; revenue: number }[];
  attendanceCount: number;
  attendanceFrequency: number;
  bookingHistory: DemoBooking[];
  communicationHistory: {
    bookingReference: string;
    channel: CommunicationChannel;
    id: string;
    message: string;
    sentAt: string;
    subject?: string;
    trigger?: CommunicationTrigger;
  }[];
  customer: {
    email: string;
    name: string;
    phone: string;
  };
  favouriteZone: string;
  key: string;
  notes: string;
  promoUsage: { code: string; count: number; discount: number }[];
  totalBookings: number;
  totalSpend: number;
  vipTags: string[];
  waitlistEntries: DemoWaitlistEntry[];
};

const bookingStatuses: BookingStatus[] = [
  "new",
  "pending-payment",
  "confirmed",
  "checked-in",
  "completed",
  "cancelled",
  "refunded",
  "no-show",
  "waitlisted",
];

const bookingStatusLabels: Record<BookingStatus, string> = {
  cancelled: "Cancelled",
  completed: "Completed",
  confirmed: "Confirmed",
  new: "New Booking",
  "no-show": "No Show",
  pending: "Pending",
  "pending-payment": "Pending Payment",
  refunded: "Refunded",
  waitlisted: "Waitlisted",
  "checked-in": "Checked In",
};

const bookingStatusClasses: Record<BookingStatus, string> = {
  cancelled: "border-red-400/40 bg-red-950/30 text-red-300",
  completed:
    "border-emerald-300/40 bg-emerald-950/20 text-emerald-200",
  confirmed:
    "border-emerald-400/40 bg-emerald-950/30 text-emerald-300",
  new: "border-[#D8C36A]/40 bg-[#D8C36A]/10 text-[#F2D66C]",
  "no-show": "border-zinc-500/50 bg-zinc-900/70 text-zinc-300",
  pending: "border-amber-300/40 bg-amber-950/30 text-amber-200",
  "pending-payment":
    "border-amber-300/40 bg-amber-950/30 text-amber-200",
  refunded: "border-red-300/40 bg-red-950/25 text-red-200",
  waitlisted:
    "border-purple-300/40 bg-purple-950/30 text-purple-200",
  "checked-in":
    "border-sky-300/40 bg-sky-950/30 text-sky-200",
};

const cancellationReasons = [
  "Guest unable to attend",
  "Date no longer suitable",
  "Pricing concern",
  "Booked in error",
  "Duplicate booking",
  "Event cancelled",
  "Other",
] as const;

const paymentStatusLabels: Record<PaymentStatus, string> = {
  "comp-vip": "Comp/VIP",
  "deposit-paid": "Deposit Paid",
  "fully-paid": "Fully Paid",
  "pending-payment": "Pending Payment",
  refunded: "Refunded",
};

const paymentStatusClasses: Record<PaymentStatus, string> = {
  "comp-vip": "border-purple-300/40 bg-purple-950/30 text-purple-200",
  "deposit-paid":
    "border-amber-300/40 bg-amber-950/30 text-amber-200",
  "fully-paid":
    "border-emerald-400/40 bg-emerald-950/30 text-emerald-300",
  "pending-payment":
    "border-zinc-500/50 bg-zinc-900/60 text-zinc-300",
  refunded: "border-red-300/40 bg-red-950/30 text-red-200",
};

const waitlistStatusLabels: Record<WaitlistStatus, string> = {
  converted: "Converted",
  promoted: "Promoted",
  removed: "Removed",
  waiting: "Waiting",
};

const waitlistStatusClasses: Record<WaitlistStatus, string> = {
  converted:
    "border-emerald-400/40 bg-emerald-950/30 text-emerald-300",
  promoted: "border-sky-300/40 bg-sky-950/30 text-sky-200",
  removed: "border-red-400/40 bg-red-950/30 text-red-300",
  waiting: "border-amber-300/40 bg-amber-950/30 text-amber-200",
};

const bookingSourceLabels: Record<BookingSource, string> = {
  admin: "Manual/Admin",
  "box-office": "Box Office",
  "corporate-direct": "Corporate Direct",
  "external-agent": "External Agent",
  "marketing-campaign": "Marketing Campaign",
  online: "Online / Website",
  referral: "Referral",
  "social-media": "Social Media",
  telephone: "Telephone",
  waitlist: "Waitlist Conversion",
};

const corporateRequestStatusLabels: Record<
  CorporateRequestStatus,
  string
> = {
  "awaiting-acceptance": "Awaiting Acceptance",
  "awaiting-payment": "Awaiting Payment",
  cancelled: "Cancelled",
  confirmed: "Confirmed",
  converted: "Converted",
  "corporate-tentative": "Corporate Tentative",
  "quote-sent": "Quote Sent",
};

const corporateRequestStatusClasses: Record<
  CorporateRequestStatus,
  string
> = {
  "awaiting-acceptance":
    "border-sky-300/40 bg-sky-950/30 text-sky-200",
  "awaiting-payment":
    "border-amber-300/40 bg-amber-950/30 text-amber-200",
  cancelled: "border-red-300/40 bg-red-950/30 text-red-200",
  confirmed:
    "border-emerald-300/40 bg-emerald-950/30 text-emerald-200",
  converted: "border-sky-300/40 bg-sky-950/30 text-sky-200",
  "corporate-tentative":
    "border-[#D8C36A]/45 bg-[#1A1208] text-[#F2D66C]",
  "quote-sent":
    "border-purple-300/40 bg-purple-950/30 text-purple-200",
};

const tableOccupancyLabels: Record<TableOccupancyState, string> = {
  available: "Available",
  blocked: "Blocked",
  "checked-in": "Checked In",
  reserved: "Reserved",
};

const tableOccupancyClasses: Record<TableOccupancyState, string> = {
  available: "border-emerald-400/40 bg-emerald-950/30 text-emerald-300",
  blocked: "border-red-400/40 bg-red-950/30 text-red-300",
  "checked-in": "border-sky-300/40 bg-sky-950/30 text-sky-200",
  reserved: "border-amber-300/40 bg-amber-950/30 text-amber-200",
};

type AdminTab =
  | "overview"
  | "bookings"
  | "corporate"
  | "operations"
  | "customers"
  | "analytics"
  | "settings";
type BookingViewMode = "grid" | "list";
type FloorZoneFilter = SeatingZoneId | "all";
type OperationsTab = "floor" | "check-in" | "waitlist";
type SettingsTab = "staff" | "venue" | "workflows";
type DashboardWidgetId =
  | "tonight"
  | "guest-ops"
  | "revenue"
  | "occupancy-trends"
  | "sales-performance"
  | "upcoming"
  | "alerts"
  | "quick-actions";
type DashboardLayoutState = {
  hidden: DashboardWidgetId[];
  minimized: DashboardWidgetId[];
  order: DashboardWidgetId[];
};

const adminTabs: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "Dashboard" },
  { id: "bookings", label: "Bookings" },
  { id: "corporate", label: "Corporate Requests" },
  { id: "operations", label: "Operations" },
  { id: "customers", label: "Customers" },
  { id: "analytics", label: "Analytics" },
  { id: "settings", label: "Settings" },
];
const dashboardWidgetLabels: Record<DashboardWidgetId, string> = {
  alerts: "Operational Alerts",
  "guest-ops": "Guest Operations",
  "occupancy-trends": "Occupancy Trends",
  "quick-actions": "Quick Actions",
  revenue: "Revenue Snapshot",
  "sales-performance": "Sales Performance",
  tonight: "Tonight's Show",
  upcoming: "Upcoming Shows",
};
const defaultDashboardWidgetOrder: DashboardWidgetId[] = [
  "tonight",
  "guest-ops",
  "alerts",
  "quick-actions",
  "upcoming",
  "revenue",
  "occupancy-trends",
  "sales-performance",
];
const defaultHiddenDashboardWidgets: DashboardWidgetId[] = [
  "revenue",
  "occupancy-trends",
  "sales-performance",
];
const dashboardLayoutStorageKey = "zingara-demo-dashboard-layouts";
const showOperationalStatusLabels: Record<
  NonNullable<DemoShow["operationalStatus"]>,
  string
> = {
  active: "Active",
  blackout: "Blackout",
  inactive: "Inactive",
  "sold-out": "Sold Out",
  "special-event": "Special Event",
  "venue-closure": "Venue Closure",
};
const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "staff", label: "Staff" },
  { id: "venue", label: "Venue Configuration" },
  { id: "workflows", label: "Automated Workflows" },
];
const userManagementRoles: AdminRole[] = [
  "super-admin",
  "venue-manager",
  "concierge",
  "floor-manager",
  "box-office",
  "marketing",
  "finance",
];
const permissionLabels: Record<Permission, string> = {
  "analytics:read": "Analytics Access",
  "bookings:manage": "Bookings Manage",
  "communications:manage": "Communications Manage",
  "crm:read": "CRM Access",
  "settings:manage": "Settings Access",
  "tables:manage": "Tables Manage",
  "tickets:validate": "Tickets Validate",
  "waitlist:manage": "Waitlist Manage",
};
const permissionBadges: Record<
  Permission,
  { label: string; short: string }
> = {
  "analytics:read": { label: "Analytics", short: "AN" },
  "bookings:manage": { label: "Bookings", short: "BK" },
  "communications:manage": { label: "Comms", short: "CM" },
  "crm:read": { label: "CRM", short: "CR" },
  "settings:manage": { label: "Settings", short: "ST" },
  "tables:manage": { label: "Tables", short: "TB" },
  "tickets:validate": { label: "Tickets", short: "TK" },
  "waitlist:manage": { label: "Waitlist", short: "WL" },
};
const permissionOptions = Object.keys(permissionLabels) as Permission[];
const floorManagementZones = seatingZones.filter(
  (zone) => zone.id !== "elevated-stage",
);
const floorZoneFilterLabels: Partial<Record<FloorZoneFilter, string>> = {
  all: "All Tables",
  "golden-circle": "Golden Circle",
  "middle-ring": "Middle Ring",
  "royal-balcony": "Royal Balcony",
  "royal-booths": "Booths",
};
const bookingCalendarWeekdays = ["S", "M", "T", "W", "T", "F", "S"];
const bookingCalendarMonths = [
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

const bookingPageSize = 5;

const operationalReportLabels: Record<OperationalReportType, string> = {
  bookings: "Booking Manifest",
  "check-ins": "Guest Check-In Sheet",
  crm: "CRM Customer List",
  "guest-list": "Guest List",
  revenue: "Revenue Summary",
  "table-allocations": "Floor Allocation Summary",
  waitlist: "Waitlist Report",
};

const defaultWaitlistReport: WaitlistReport = {
  activeGuests: 0,
  converted: 0,
  promoted: 0,
  removed: 0,
  waiting: 0,
};

const communicationChannelLabels: Record<
  CommunicationChannel,
  string
> = {
  email: "Email",
  push: "Push",
  sms: "Future SMS",
};

const communicationTriggerLabels: Record<
  CommunicationTrigger,
  string
> = {
  "booking-confirmation": "Booking Confirmation",
  "booking-update": "Booking Update",
  "cancellation-refund": "Cancellation / Refund",
  "check-in-confirmation": "Check-In Confirmation",
  "complimentary-booking": "Complimentary Booking",
  "confirmation-resend": "Confirmation Resend",
  "corporate-tentative-booking": "Corporate Tentative Booking",
  "custom-message": "Custom Guest Message",
  "operational-broadcast": "Operational Broadcast",
  "payment-confirmation": "Payment Confirmation",
  "reservation-confirmed": "Reservation Confirmed",
  "reservation-pending": "Reservation Pending",
  "show-reminder": "Reminder Before Show",
  "table-change": "Table Change",
  "ticket-resend": "Ticket Resend",
  "waitlist-promotion": "Waitlist Promotion",
};

function getBlankNewTables() {
  return seatingZones.reduce(
    (forms, zone) => ({
      ...forms,
      [zone.id]: {
        tableNumber: "",
        seatCapacity: 2,
      },
    }),
    {} as NewTablesByZone,
  );
}

function getBlankMergeSelections() {
  return seatingZones.reduce(
    (selections, zone) => ({
      ...selections,
      [zone.id]: "",
    }),
    {} as MergeSelection,
  );
}

function getShowEditForm(
  show: DemoShow,
  fallbackVenueName: string,
): ShowEditForm {
  return {
    date: show.date,
    description: show.description ?? "",
    internalNotes: show.internalNotes ?? "",
    label: show.label,
    operationalStatus: show.operationalStatus ?? "active",
    time: show.time,
    venueName: show.venueName ?? fallbackVenueName,
  };
}

function getDefaultDashboardLayout(): DashboardLayoutState {
  return {
    hidden: defaultHiddenDashboardWidgets,
    minimized: [],
    order: defaultDashboardWidgetOrder,
  };
}

  function getDashboardLayoutForUser(userId?: string) {
  if (typeof window === "undefined" || !userId) {
    return getDefaultDashboardLayout();
  }

  try {
    const storedLayouts = window.localStorage.getItem(
      dashboardLayoutStorageKey,
    );
    const parsedLayouts = storedLayouts
      ? (JSON.parse(storedLayouts) as Record<
          string,
          Partial<DashboardLayoutState>
        >)
      : {};
    return normalizeDashboardLayout(parsedLayouts[userId]);
  } catch {
    return getDefaultDashboardLayout();
  }
}

function normalizeDashboardLayout(
  layout: Partial<DashboardLayoutState> | undefined,
): DashboardLayoutState {
  const validWidgets = new Set(defaultDashboardWidgetOrder);
  const storedOrder = Array.isArray(layout?.order)
    ? layout.order.filter((widget) => validWidgets.has(widget))
    : [];
  const order = [
    ...storedOrder,
    ...defaultDashboardWidgetOrder.filter(
      (widget) => !storedOrder.includes(widget),
    ),
  ];

  return {
    hidden: Array.isArray(layout?.hidden)
      ? layout.hidden.filter((widget) => validWidgets.has(widget))
      : defaultHiddenDashboardWidgets,
    minimized: Array.isArray(layout?.minimized)
      ? layout.minimized.filter((widget) => validWidgets.has(widget))
      : [],
    order,
  };
}

function getZoneTables(
  tables: DemoTable[],
  showId: string,
  zoneId: SeatingZoneId,
) {
  return tables.filter(
    (table) => table.showId === showId && table.zoneId === zoneId,
  );
}

function getZoneStats(
  tables: DemoTable[],
  showId: string,
  zone: SeatingZone,
) {
  const zoneTables = getZoneTables(tables, showId, zone.id);
  const activeTables = zoneTables.filter(
    (table) => table.status !== "disabled",
  );
  const totalCapacity = activeTables.reduce(
    (total, table) => total + table.seatCapacity,
    0,
  );
  const bookedSeats = activeTables
    .filter((table) => table.status === "booked")
    .reduce((total, table) => total + table.seatCapacity, 0);

  return {
    bookedSeats,
    remainingSeats: totalCapacity - bookedSeats,
    totalCapacity,
  };
}

function getTableOccupancy(
  table: DemoTable,
  bookings: DemoBooking[],
) {
  if (table.status === "disabled") {
    return {
      booking: undefined,
      state: "blocked" as const,
    };
  }

  const booking = bookings.find(
    (currentBooking) =>
      (currentBooking.tableId === table.id ||
        currentBooking.reference === table.bookingReference) &&
      isOccupyingBookingStatus(currentBooking.status ?? "confirmed"),
  );

  if ((booking?.status ?? "confirmed") === "checked-in") {
    return {
      booking,
      state: "checked-in" as const,
    };
  }

  if (booking || table.status === "booked") {
    return {
      booking,
      state: "reserved" as const,
    };
  }

  return {
    booking: undefined,
    state: "available" as const,
  };
}

function getNextTableId(
  tables: DemoTable[],
  showId: string,
  zoneId: SeatingZoneId,
  suffix: string,
) {
  let index = tables.length + 1;
  let nextId = `${showId}-${zoneId}-${suffix}-${index}`;

  while (tables.some((table) => table.id === nextId)) {
    index += 1;
    nextId = `${showId}-${zoneId}-${suffix}-${index}`;
  }

  return nextId;
}

function createBookingReference() {
  return `ZNG-${Date.now().toString(36).toUpperCase()}-${Math.floor(
    Math.random() * 900 + 100,
  )}`;
}

function canUseTableForBooking(
  table: DemoTable,
  booking: DemoBooking,
) {
  return (
    table.status === "available" ||
    table.id === booking.tableId ||
    table.bookingReference === booking.reference
  );
}

function isTerminalBookingStatus(status: BookingStatus) {
  return (
    status === "cancelled" ||
    status === "refunded" ||
    status === "completed" ||
    status === "no-show" ||
    status === "waitlisted"
  );
}

function isOccupyingBookingStatus(status: BookingStatus) {
  return !isTerminalBookingStatus(status);
}

function formatArrivalTime(arrivalTime?: string) {
  return arrivalTime
    ? new Date(arrivalTime).toLocaleString()
    : "Awaiting arrival";
}

function formatCurrency(amount: number) {
  return `R${amount.toLocaleString()}`;
}

function formatOperationalShowDate(date: string) {
  const [year, month, day] = date.split("-");
  const monthNames = [
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

  return `${Number(day)} ${monthNames[Number(month) - 1] ?? month} ${year}`;
}

function createZingaraUserEmail(
  name: string,
  username: string,
  email?: string,
) {
  const trimmedEmail = email?.trim();

  if (trimmedEmail && !trimmedEmail.endsWith(".example")) {
    return trimmedEmail;
  }

  const nameParts = name
    .toLowerCase()
    .replaceAll(/[^a-z\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  const handle =
    nameParts.length >= 2
      ? `${nameParts[0]}.${nameParts[nameParts.length - 1]}`
      : nameParts[0] ??
        username
          .toLowerCase()
          .replaceAll(/[^a-z0-9.-]/g, "")
          .replaceAll(/\.+/g, ".") ??
        "staff";

  return `${handle || "staff"}@zingara.co.za`;
}

function escapeCsvValue(value: string | number | undefined) {
  const stringValue = String(value ?? "");

  return /[",\n]/.test(stringValue)
    ? `"${stringValue.replaceAll('"', '""')}"`
    : stringValue;
}

function createCsv(rows: Array<Record<string, string | number | undefined>>) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);

  return [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvValue(row[header])).join(","),
    ),
  ].join("\n");
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let isQuoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"' && isQuoted && nextCharacter === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      isQuoted = !isQuoted;
    } else if (character === "," && !isQuoted) {
      row.push(field.trim());
      field = "";
    } else if (
      (character === "\n" || character === "\r") &&
      !isQuoted
    ) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      row.push(field.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      field = "";
      row = [];
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((header) =>
    header.trim().toLowerCase().replaceAll(/\s+/g, "_"),
  );

  return rows.slice(1).map((values) =>
    headers.reduce(
      (record, header, index) => ({
        ...record,
        [header]: values[index] ?? "",
      }),
      {} as Record<string, string>,
    ),
  );
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function getBarWidth(value: number, maxValue: number) {
  if (maxValue <= 0) {
    return 0;
  }

  return Math.max(4, Math.round((value / maxValue) * 100));
}

function getCustomerKey(customer: {
  email?: string;
  name?: string;
  phone?: string;
}) {
  const email = customer.email?.trim().toLowerCase();
  const phone = customer.phone?.replace(/\D/g, "");
  const name = customer.name?.trim().toLowerCase();

  return email || phone || name || "unknown-customer";
}

function getBookingFinancials(booking: DemoBooking) {
  const totalPrice = booking.totalPrice;
  const addonsTotal = booking.addonsTotal ?? 0;
  const subtotalPrice = booking.subtotalPrice ?? booking.totalPrice;
  const ticketBreakdown = getIncludedBookingFeeBreakdown(
    Math.max(subtotalPrice - addonsTotal, 0),
  );
  const depositPercentage = booking.depositPercentage ?? 100;
  const depositAmount = Math.ceil(
    totalPrice * (depositPercentage / 100),
  );
  const paymentStatus = getBookingPaymentStatus(booking);
  const amountPaid =
    booking.amountPaid ??
    (paymentStatus === "fully-paid"
      ? totalPrice
      : paymentStatus === "deposit-paid"
        ? depositAmount
        : 0);
  const balanceDue =
    paymentStatus === "comp-vip" || paymentStatus === "refunded"
      ? 0
      : booking.balanceDue ?? Math.max(totalPrice - amountPaid, 0);

  return {
    addonsTotal,
    amountPaid,
    balanceDue,
    bookingFeeAmount: ticketBreakdown.bookingFee,
    depositAmount,
    discountAmount: booking.discountAmount ?? 0,
    paymentOption: booking.paymentOption ?? "full",
    paymentStatus,
    serviceFeeAmount: booking.serviceFeeAmount ?? 0,
    subtotalPrice,
    ticketAmount: ticketBreakdown.ticketAmount,
    totalPrice,
  };
}

function getBookingPaymentStatus(
  booking: Pick<
    DemoBooking,
    | "amountPaid"
    | "balanceDue"
    | "paymentStatus"
    | "status"
    | "totalPrice"
  >,
): PaymentStatus {
  if (booking.paymentStatus) {
    return booking.paymentStatus;
  }

  if ((booking.status ?? "confirmed") === "cancelled") {
    return "pending-payment";
  }

  if ((booking.amountPaid ?? 0) >= booking.totalPrice) {
    return "fully-paid";
  }

  if ((booking.amountPaid ?? 0) > 0) {
    return "deposit-paid";
  }

  if ((booking.balanceDue ?? 0) > 0) {
    return "pending-payment";
  }

  return "fully-paid";
}

async function getSupabaseAdminSession() {
  const authSession = await getAdminAuthSession();

  if (!authSession?.user.email) {
    return null;
  }

  return getOrCreateStaffProfileSession(authSession.user);
}

export default function AdminDashboardPage() {
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const [bookings, setBookings] = useState<DemoBooking[]>([]);
  const [corporateRequests, setCorporateRequests] = useState<
    CorporateRequest[]
  >([]);
  const [customerCrmRecords, setCustomerCrmRecords] = useState<
    DemoCustomerCrmRecord[]
  >([]);
  const [waitlist, setWaitlist] = useState<DemoWaitlistEntry[]>(
    [],
  );
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingPage, setBookingPage] = useState(1);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<
    string | null
  >(null);
  const [waitlistSearch, setWaitlistSearch] = useState("");
  const [staffSearch, setStaffSearch] = useState("");
  const [ticketValidationInput, setTicketValidationInput] =
    useState("");
  const [ticketValidationResult, setTicketValidationResult] =
    useState<TicketValidationResult | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerCameraError, setScannerCameraError] = useState("");
  const [communicationTemplates, setCommunicationTemplates] =
    useState<CommunicationTemplate[]>(
      defaultCommunicationTemplates,
    );
  const [venueSettings, setVenueSettings] =
    useState<DemoVenueSettings>(defaultVenueSettings);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    defaultCommunicationTemplates[0]?.id ?? "",
  );
  const [customMessageForms, setCustomMessageForms] =
    useState<CustomMessageForms>({});
  const [broadcastForm, setBroadcastForm] =
    useState<BroadcastForm>({
      channel: "email",
      message: "",
      subject: "",
    });
  const [currentStaff, setCurrentStaff] =
    useState<AdminSession | null>(null);
  const [activeAdminTab, setActiveAdminTab] =
    useState<AdminTab>("overview");
  const [dashboardWidgetOrder, setDashboardWidgetOrder] = useState<
    DashboardWidgetId[]
  >(defaultDashboardWidgetOrder);
  const [hiddenDashboardWidgets, setHiddenDashboardWidgets] = useState<
    DashboardWidgetId[]
  >(defaultHiddenDashboardWidgets);
  const [minimizedDashboardWidgets, setMinimizedDashboardWidgets] =
    useState<DashboardWidgetId[]>([]);
  const [draggedDashboardWidget, setDraggedDashboardWidget] =
    useState<DashboardWidgetId | null>(null);
  const [activeOperationsTab, setActiveOperationsTab] =
    useState<OperationsTab>("floor");
  const [activeSettingsTab, setActiveSettingsTab] =
    useState<SettingsTab>("staff");
  const [notificationPermission, setNotificationPermission] =
    useState("unsupported");
  const [notificationTestStatus, setNotificationTestStatus] =
    useState("");
  const [staffNotifications, setStaffNotifications] = useState<
    StaffNotificationRecord[]
  >([]);
  const [notificationCentreUserId, setNotificationCentreUserId] =
    useState("");
  const [isNotificationCentreOpen, setIsNotificationCentreOpen] =
    useState(false);
  const [templatePreviewVisible, setTemplatePreviewVisible] =
    useState(false);
  const [bookingViewMode, setBookingViewMode] =
    useState<BookingViewMode>("list");
  const [corporateViewMode, setCorporateViewMode] =
    useState<BookingViewMode>("list");
  const [corporateSearch, setCorporateSearch] = useState("");
  const [corporateStatusFilter, setCorporateStatusFilter] =
    useState<CorporateRequestStatus | "archived" | "all">("all");
  const [openCorporateRequestId, setOpenCorporateRequestId] =
    useState("");
  const [
    corporateConversionShowSelections,
    setCorporateConversionShowSelections,
  ] = useState<Record<string, string>>({});
  const [corporateConversionStatus, setCorporateConversionStatus] =
    useState("");
  const [corporateConversionStatusRequestId, setCorporateConversionStatusRequestId] =
    useState("");
  const [convertedCorporateBookingReference, setConvertedCorporateBookingReference] =
    useState("");
  const [conciergeViewMode, setConciergeViewMode] =
    useState<BookingViewMode>("list");
  const [hideCancelledBookings, setHideCancelledBookings] =
    useState(true);
  const [bookingShowFilter, setBookingShowFilter] = useState("all");
  const [bookingDateFilter, setBookingDateFilter] = useState("all");
  const [bookingSourceFilter, setBookingSourceFilter] =
    useState<BookingSource | "all">("all");
  const [isBookingCalendarOpen, setIsBookingCalendarOpen] =
    useState(false);
  const [isFloorCalendarOpen, setIsFloorCalendarOpen] =
    useState(false);
  const [hideCancelledConcierge, setHideCancelledConcierge] =
    useState(true);
  const [conciergeStatusFilter, setConciergeStatusFilter] =
    useState<BookingStatus | "all">("all");
  const [loginForm, setLoginForm] = useState<LoginForm>({
    password: "",
    username: "",
  });
  const [loginError, setLoginError] = useState("");
  const [staffProfiles, setStaffProfiles] = useState<
    StaffManagementProfile[]
  >([]);
  const [staffRoles, setStaffRoles] = useState<StaffManagementRole[]>(
    [],
  );
  const [staffManagementStatus, setStaffManagementStatus] =
    useState("");
  const [isStaffInviteOpen, setIsStaffInviteOpen] = useState(false);
  const [staffInviteForm, setStaffInviteForm] =
    useState<StaffInviteForm>({
      email: "",
      fullName: "",
      role: "venue-manager",
      venueScope: defaultVenueSettings.venueId,
    });
  const [staffDeleteProfileId, setStaffDeleteProfileId] = useState("");
  const [staffDeleteReplacementUserId, setStaffDeleteReplacementUserId] =
    useState("");
  const [shows, setShows] = useState<DemoShow[]>(defaultShows);
  const [selectedShowId, setSelectedShowId] = useState(
    defaultShows[0]?.id ?? "",
  );
  const [workflowShowId, setWorkflowShowId] = useState(
    defaultShows[0]?.id ?? "",
  );
  const [workflowStatus, setWorkflowStatus] = useState("");
  const [workflowToast, setWorkflowToast] = useState("");
  const workflowToastTimerRef = useRef<number | null>(null);
  const [newShow, setNewShow] = useState<NewShowForm>({
    date: "",
    time: "",
    label: "",
  });
  const [editingShowId, setEditingShowId] = useState("");
  const [showDeleteConfirmationId, setShowDeleteConfirmationId] =
    useState("");
  const [showEditForm, setShowEditForm] = useState<ShowEditForm>({
    date: "",
    description: "",
    internalNotes: "",
    label: "",
    operationalStatus: "active",
    time: "",
    venueName: defaultVenueSettings.venueName,
  });
  const [tables, setTables] = useState<DemoTable[]>(() =>
    defaultShows.flatMap((show) => createTablesForShow(show.id)),
  );
  const [newTables, setNewTables] =
    useState<NewTablesByZone>(getBlankNewTables);
  const [mergeSelections, setMergeSelections] =
    useState<MergeSelection>(getBlankMergeSelections);
  const [floorZoneFilter, setFloorZoneFilter] =
    useState<FloorZoneFilter>("all");
  const [expandedTableId, setExpandedTableId] = useState("");
  const [splitMergeReview, setSplitMergeReview] =
    useState<SplitMergeReview | null>(null);
  const [expandedBookingReference, setExpandedBookingReference] =
    useState("");
  const [cancellingBookingReference, setCancellingBookingReference] =
    useState("");
  const [cancellationReason, setCancellationReason] = useState<
    (typeof cancellationReasons)[number]
  >(cancellationReasons[0]);
  const [cancellationOtherReason, setCancellationOtherReason] =
    useState("");
  const [tableCompatibilityWarnings, setTableCompatibilityWarnings] =
    useState<Record<string, string>>({});
  const [reportStatusFilter, setReportStatusFilter] =
    useState<BookingStatus | "all">("all");
  const [reportZoneFilter, setReportZoneFilter] =
    useState<SeatingZoneId | "all">("all");
  const [reportPaymentFilter, setReportPaymentFilter] =
    useState<PaymentStatus | "all">("all");
  const [reportDateFilter, setReportDateFilter] = useState("");
  const [legacyImportPreview, setLegacyImportPreview] =
    useState<LegacyImportPreview | null>(null);
  const [legacyImportError, setLegacyImportError] = useState("");
  const [deleteCorporateRequestId, setDeleteCorporateRequestId] =
    useState("");
  const handledAdminDeepLinkRef = useRef("");

  useEffect(() => {
    let isMounted = true;

    async function loadDemoData() {
      const nextShows = await getShows();
      const nextBookings = await getBookings();
      const nextCorporateRequests = await getCorporateRequests();
      const nextCommunicationTemplates = await getTemplates();
      const nextCustomerCrm = await getCustomers();
      const nextVenueSettings = await getVenueSettings();
      const nextWaitlist = await getWaitlistEntries();
      const nextTables = getStoredDemoTables();
      const nextAdminSession = await getSupabaseAdminSession();
      const nextStaffProfiles = await getStaffProfiles();
      const nextStaffRoles = await getAvailableRoles();

      console.log("[Zingara show management] show reloaded", {
        showCount: nextShows.length,
        shows: nextShows.map((show) => ({
          date: show.date,
          id: show.id,
          label: show.label,
          status: show.operationalStatus ?? "active",
          time: getSouthAfricaShowTime(show),
        })),
      });
      console.log("[Zingara admin] dashboard show source", {
        shows: nextShows.map((show) => ({
          date: show.date,
          id: show.id,
          label: show.label,
          status: show.operationalStatus ?? "active",
          time: getSouthAfricaShowTime(show),
        })),
      });

      if (!isMounted) {
        return;
      }

      setHasHydrated(true);
      setCurrentStaff(nextAdminSession);
      setShows(nextShows);
      setSelectedShowId((currentShowId) =>
        nextShows.some((show) => show.id === currentShowId)
          ? currentShowId
          : nextShows[0]?.id ?? "",
      );
      setWorkflowShowId((currentShowId) =>
        nextShows.some((show) => show.id === currentShowId)
          ? currentShowId
          : nextShows[0]?.id ?? "",
      );
      setBookings(nextBookings);
      setCorporateRequests(nextCorporateRequests);
      setCommunicationTemplates(nextCommunicationTemplates);
      setCustomerCrmRecords(nextCustomerCrm);
      setVenueSettings(nextVenueSettings);
      setWaitlist(nextWaitlist);
      setTables(nextTables);
      setStaffProfiles(nextStaffProfiles);
      setStaffRoles(nextStaffRoles);
    }

    const hydrationTimer = window.setTimeout(loadDemoData, 0);

    window.addEventListener("storage", loadDemoData);
    window.addEventListener(
      "zingara-demo-bookings-updated",
      loadDemoData,
    );
    window.addEventListener(
      "zingara-demo-corporate-requests-updated",
      loadDemoData,
    );
    window.addEventListener(adminAuthChangedEvent, loadDemoData);
    window.addEventListener(
      "zingara-demo-shows-updated",
      loadDemoData,
    );
    window.addEventListener(
      "zingara-demo-tables-updated",
      loadDemoData,
    );
    window.addEventListener(
      "zingara-demo-waitlist-updated",
      loadDemoData,
    );
    window.addEventListener(
      "zingara-demo-customer-crm-updated",
      loadDemoData,
    );
    window.addEventListener(
      "zingara-demo-communication-templates-updated",
      loadDemoData,
    );
    window.addEventListener(
      "zingara-demo-venue-settings-updated",
      loadDemoData,
    );

    return () => {
      isMounted = false;
      window.removeEventListener("storage", loadDemoData);
      window.removeEventListener(
        "zingara-demo-bookings-updated",
        loadDemoData,
      );
      window.removeEventListener(
        "zingara-demo-corporate-requests-updated",
        loadDemoData,
      );
      window.removeEventListener(adminAuthChangedEvent, loadDemoData);
      window.removeEventListener(
        "zingara-demo-shows-updated",
        loadDemoData,
      );
      window.removeEventListener(
        "zingara-demo-tables-updated",
        loadDemoData,
      );
      window.removeEventListener(
        "zingara-demo-waitlist-updated",
        loadDemoData,
      );
      window.removeEventListener(
        "zingara-demo-customer-crm-updated",
        loadDemoData,
      );
      window.removeEventListener(
        "zingara-demo-communication-templates-updated",
        loadDemoData,
      );
      window.removeEventListener(
        "zingara-demo-venue-settings-updated",
        loadDemoData,
      );
      window.clearTimeout(hydrationTimer);
    };
  }, []);

  useEffect(() => {
    if (!currentStaff) {
      return;
    }

    function handleAdminDeepLink(rawUrl = window.location.href) {
      const url = new URL(rawUrl, window.location.origin);
      const bookingReference = url.searchParams.get("booking")?.trim();
      const waitlistId = url.searchParams.get("waitlist")?.trim();
      const corporateRequestId = url.searchParams.get("corporate")?.trim();
      const section = url.searchParams.get("section")?.trim();
      const deepLinkKey = `${bookingReference ?? ""}|${waitlistId ?? ""}|${corporateRequestId ?? ""}|${section ?? ""}`;

      if (!deepLinkKey.replaceAll("|", "")) {
        return;
      }

      if (handledAdminDeepLinkRef.current === deepLinkKey) {
        return;
      }

      if (bookingReference) {
        setActiveAdminTab("bookings");
        setBookingSearch(bookingReference);
        setBookingPage(1);
        setExpandedBookingReference(bookingReference);
      } else if (waitlistId) {
        const linkedWaitlistEntry = waitlist.find(
          (entry) => entry.id === waitlistId,
        );

        if (!linkedWaitlistEntry && waitlist.length === 0) {
          return;
        }

        setActiveAdminTab("operations");
        setActiveOperationsTab("waitlist");
        setWaitlistSearch(waitlistId);

        if (linkedWaitlistEntry) {
          setSelectedShowId(linkedWaitlistEntry.showId);
        }
      } else if (corporateRequestId) {
        setActiveAdminTab("corporate");
        setOpenCorporateRequestId(corporateRequestId);
      } else if (section === "bookings") {
        setActiveAdminTab("bookings");
      } else if (section === "waitlist") {
        setActiveAdminTab("operations");
        setActiveOperationsTab("waitlist");
      } else if (section === "corporate") {
        setActiveAdminTab("corporate");
      }

      handledAdminDeepLinkRef.current = deepLinkKey;
    }

    handleAdminDeepLink();

    function handleServiceWorkerMessage(event: MessageEvent) {
      if (event.data?.type !== "ZINGARA_NOTIFICATION_NAVIGATE") {
        return;
      }

      const targetUrl =
        typeof event.data.url === "string" ? event.data.url : "/admin";

      handleAdminDeepLink(targetUrl);
    }

    navigator.serviceWorker?.addEventListener(
      "message",
      handleServiceWorkerMessage,
    );

    return () => {
      navigator.serviceWorker?.removeEventListener(
        "message",
        handleServiceWorkerMessage,
      );
    };
  }, [currentStaff, waitlist]);

  useEffect(() => {
    function refreshNotificationPermission() {
      setNotificationPermission(getBrowserNotificationStatusLabel());
    }

    const permissionTimer = window.setTimeout(
      refreshNotificationPermission,
      0,
    );

    window.addEventListener("focus", refreshNotificationPermission);

    return () => {
      window.clearTimeout(permissionTimer);
      window.removeEventListener(
        "focus",
        refreshNotificationPermission,
      );
    };
  }, []);

  useEffect(() => {
    if (!currentStaff) {
      setStaffNotifications([]);
      setNotificationCentreUserId("");
      return;
    }

    let isActive = true;
    const staffId = currentStaff.id;

    async function loadNotifications() {
      try {
        const payload = await getStaffNotifications();

        if (!isActive) {
          return;
        }

        setStaffNotifications(payload.notifications ?? []);
        setNotificationCentreUserId(payload.userId ?? staffId);
      } catch {
        // Notification centre should not block admin operations.
      }
    }

    void loadNotifications();
    const intervalId = window.setInterval(loadNotifications, 15000);

    window.addEventListener("focus", loadNotifications);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", loadNotifications);
    };
  }, [currentStaff]);

  useEffect(() => {
    return () => {
      if (workflowToastTimerRef.current) {
        window.clearTimeout(workflowToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!currentStaff) {
      applyDashboardLayout(getDefaultDashboardLayout());
      return;
    }

    applyDashboardLayout(getDashboardLayoutForUser(currentStaff.id));
  }, [currentStaff]);

  useEffect(() => {
    if (
      communicationTemplates.length > 0 &&
      !communicationTemplates.some(
        (template) => template.id === selectedTemplateId,
      )
    ) {
      setSelectedTemplateId(communicationTemplates[0].id);
    }
  }, [communicationTemplates, selectedTemplateId]);

  useEffect(() => {
    setTemplatePreviewVisible(false);
  }, [selectedTemplateId]);

  const canCheckInGuests =
    hasPermission(currentStaff, "tickets:validate");
  const canManageBookings = hasPermission(
    currentStaff,
    "bookings:manage",
  );
  const canManageShows = hasPermission(
    currentStaff,
    "settings:manage",
  );
  const canManageSettings = hasPermission(
    currentStaff,
    "settings:manage",
  );
  const canManageTables = hasPermission(
    currentStaff,
    "tables:manage",
  );
  const canViewAnalytics = hasPermission(
    currentStaff,
    "analytics:read",
  );
  const canViewCrm = hasPermission(currentStaff, "crm:read");
  const canManageCommunications = hasPermission(
    currentStaff,
    "communications:manage",
  );
  const canManageWaitlist = hasPermission(
    currentStaff,
    "waitlist:manage",
  );
  const canViewBookingManagement =
    canManageBookings || canCheckInGuests;
  const canViewStaffOperations = canCheckInGuests;
  const venueConfig = venueSettings;
  const unreadNotificationCount = staffNotifications.filter(
    (notification) =>
      !notification.readBy?.includes(
        notificationCentreUserId || currentStaff?.id || "",
      ),
  ).length;

  async function refreshStaffNotifications() {
    try {
      const payload = await getStaffNotifications();

      setStaffNotifications(payload.notifications ?? []);
      setNotificationCentreUserId(payload.userId ?? currentStaff?.id ?? "");
    } catch {
      showWorkflowToast("⚠ Could not load notifications");
    }
  }

  async function markNotificationRead(notificationId: string) {
    try {
      const payload = await markStaffNotificationRead(notificationId);

      setStaffNotifications(payload.notifications ?? []);
      setNotificationCentreUserId(payload.userId ?? currentStaff?.id ?? "");
    } catch {
      showWorkflowToast("⚠ Could not save");
    }
  }

  async function markAllNotificationsRead() {
    try {
      const payload = await markAllStaffNotificationsRead();

      setStaffNotifications(payload.notifications ?? []);
      setNotificationCentreUserId(payload.userId ?? currentStaff?.id ?? "");
    } catch {
      showWorkflowToast("⚠ Could not save");
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const authEmail = loginForm.username.trim();
    const result = await signInAdmin(authEmail, loginForm.password);

    if (!result.user) {
      setLoginError(result.error || "Invalid admin credentials.");
      return;
    }

    const nextSession = await getSupabaseAdminSession();

    if (!nextSession) {
      await signOutAdmin();
      setLoginError("No active staff profile is linked to this user.");
      return;
    }

    window.dispatchEvent(new Event(adminAuthChangedEvent));
    setCurrentStaff(nextSession);
    setLoginError("");
    setLoginForm({
      password: "",
      username: "",
    });
  }

  async function logout() {
    await signOutAdmin();
    window.dispatchEvent(new Event(adminAuthChangedEvent));
    setCurrentStaff(null);
  }

  function selectFloorEditingShow(showId: string) {
    setSelectedShowId(showId);
    setExpandedTableId("");
    setSplitMergeReview(null);
    setMergeSelections(getBlankMergeSelections());
  }

  function persistDashboardLayout(updates: Partial<DashboardLayoutState>) {
    if (!currentStaff) {
      return;
    }

    const nextLayout = normalizeDashboardLayout({
      hidden: updates.hidden ?? hiddenDashboardWidgets,
      minimized: updates.minimized ?? minimizedDashboardWidgets,
      order: updates.order ?? dashboardWidgetOrder,
    });

    let storedLayouts: Record<string, DashboardLayoutState> = {};

    try {
      storedLayouts = JSON.parse(
        window.localStorage.getItem(dashboardLayoutStorageKey) ?? "{}",
      ) as Record<string, DashboardLayoutState>;
    } catch {
      storedLayouts = {};
    }

    window.localStorage.setItem(
      dashboardLayoutStorageKey,
      JSON.stringify({
        ...storedLayouts,
        [currentStaff.id]: nextLayout,
      }),
    );
  }

  function applyDashboardLayout(layout: DashboardLayoutState) {
    const normalizedLayout = normalizeDashboardLayout(layout);

    setDashboardWidgetOrder(normalizedLayout.order);
    setHiddenDashboardWidgets(normalizedLayout.hidden);
    setMinimizedDashboardWidgets(normalizedLayout.minimized);
  }

  function moveDashboardWidget(
    widgetId: DashboardWidgetId,
    direction: -1 | 1,
  ) {
    setDashboardWidgetOrder((currentOrder) => {
      const currentIndex = currentOrder.indexOf(widgetId);
      const nextIndex = currentIndex + direction;

      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= currentOrder.length
      ) {
        return currentOrder;
      }

      const nextOrder = [...currentOrder];
      [nextOrder[currentIndex], nextOrder[nextIndex]] = [
        nextOrder[nextIndex],
        nextOrder[currentIndex],
      ];

      persistDashboardLayout({ order: nextOrder });

      return nextOrder;
    });
  }

  function placeDashboardWidget(
    draggedWidget: DashboardWidgetId,
    targetWidget: DashboardWidgetId,
  ) {
    if (draggedWidget === targetWidget) {
      return;
    }

    setDashboardWidgetOrder((currentOrder) => {
      const nextOrder = currentOrder.filter(
        (widget) => widget !== draggedWidget,
      );
      const targetIndex = nextOrder.indexOf(targetWidget);

      nextOrder.splice(targetIndex, 0, draggedWidget);

      persistDashboardLayout({ order: nextOrder });

      return nextOrder;
    });
  }

  function hideDashboardWidget(widgetId: DashboardWidgetId) {
    setHiddenDashboardWidgets((currentHidden) => {
      const nextHidden = Array.from(new Set([...currentHidden, widgetId]));

      persistDashboardLayout({ hidden: nextHidden });

      return nextHidden;
    });
  }

  function showDashboardWidget(widgetId: DashboardWidgetId) {
    setHiddenDashboardWidgets((currentHidden) => {
      const nextHidden = currentHidden.filter(
        (hiddenWidget) => hiddenWidget !== widgetId,
      );

      persistDashboardLayout({ hidden: nextHidden });

      return nextHidden;
    });
  }

  function toggleDashboardWidgetMinimized(widgetId: DashboardWidgetId) {
    setMinimizedDashboardWidgets((currentMinimized) => {
      const nextMinimized = currentMinimized.includes(widgetId)
        ? currentMinimized.filter((widget) => widget !== widgetId)
        : [...currentMinimized, widgetId];

      persistDashboardLayout({ minimized: nextMinimized });

      return nextMinimized;
    });
  }

  function resetDashboardLayout() {
    const defaultLayout = getDefaultDashboardLayout();

    applyDashboardLayout(defaultLayout);
    persistDashboardLayout(defaultLayout);
  }

  function updateShowOperationalStatus(
    showId: string,
    operationalStatus: NonNullable<DemoShow["operationalStatus"]>,
  ) {
    if (!canManageShows) {
      return;
    }

    saveShows(
      shows.map((show) =>
        show.id === showId
          ? {
              ...show,
              operationalStatus,
            }
          : show,
      ),
    );
  }

  function openShowEditor(show: DemoShow) {
    setEditingShowId(show.id);
    setShowEditForm(getShowEditForm(show, venueConfig.venueName));
  }

  function closeShowEditor() {
    setEditingShowId("");
    setShowDeleteConfirmationId("");
    setShowEditForm({
      date: "",
      description: "",
      internalNotes: "",
      label: "",
      operationalStatus: "active",
      time: "",
      venueName: venueConfig.venueName,
    });
  }

  function saveEditedShow() {
    console.log("[Zingara show management] save button clicked", {
      editingShowId,
      form: showEditForm,
    });

    if (
      !canManageShows ||
      !editingShowId ||
      !showEditForm.date ||
      !showEditForm.time ||
      !showEditForm.label.trim()
    ) {
      console.log("[Zingara show management] save blocked", {
        canManageShows,
        editingShowId,
        hasDate: Boolean(showEditForm.date),
        hasLabel: Boolean(showEditForm.label.trim()),
        hasTime: Boolean(showEditForm.time),
      });
      return;
    }

    const updatedShow = {
      date: showEditForm.date,
      description: showEditForm.description.trim(),
      internalNotes: showEditForm.internalNotes.trim(),
      label: showEditForm.label.trim(),
      operationalStatus: showEditForm.operationalStatus,
      time: showEditForm.time,
      venueName:
        showEditForm.venueName.trim() || venueConfig.venueName,
    };
    const nextShows = shows.map((show) =>
      show.id === editingShowId
        ? {
            ...show,
            ...updatedShow,
          }
        : show,
    );
    const nextBookings = bookings.map((booking) =>
      booking.showId === editingShowId
        ? {
            ...booking,
            bookingDate: `${updatedShow.date} ${getSouthAfricaShowTime(updatedShow)}`,
          }
        : booking,
    );

    saveShows(nextShows);
    saveBookings(nextBookings);
    closeShowEditor();
  }

  function duplicateEditedShow() {
    if (
      !canManageShows ||
      !editingShowId ||
      !showEditForm.date ||
      !showEditForm.time
    ) {
      return;
    }

    const duplicateId = `show-${showEditForm.date}-${showEditForm.time.replace(":", "")}-${Date.now()}`;
    const duplicateShow: DemoShow = {
      id: duplicateId,
      date: showEditForm.date,
      description: showEditForm.description.trim(),
      internalNotes: showEditForm.internalNotes.trim(),
      label: `${showEditForm.label.trim()} Copy`,
      operationalStatus: showEditForm.operationalStatus,
      time: showEditForm.time,
      venueName: showEditForm.venueName.trim() || venueConfig.venueName,
    };

    saveShows([...shows, duplicateShow]);
    saveTables([...tables, ...createTablesForShow(duplicateId)]);
    setSelectedShowId(duplicateId);
    closeShowEditor();
  }

  function archiveEditedShow() {
    if (!canManageShows || !editingShowId) {
      return;
    }

    saveShows(
      shows.map((show) =>
        show.id === editingShowId
          ? {
              ...show,
              archivedAt: new Date().toISOString(),
              operationalStatus: "inactive",
            }
          : show,
      ),
    );
    closeShowEditor();
  }

  function deleteEditedShow() {
    if (!canManageShows || !editingShowId) {
      return;
    }

    const hasLinkedBookings = bookings.some(
      (booking) => booking.showId === editingShowId,
    );

    if (hasLinkedBookings) {
      setShowDeleteConfirmationId(editingShowId);
      return;
    }

    deleteShowById(editingShowId);
  }

  function deleteShowById(showId: string) {
    if (!canManageShows) {
      return;
    }

    const remainingShows = shows.filter(
      (show) => show.id !== showId,
    );

    saveShows(remainingShows);
    saveTables(
      tables.filter((table) => table.showId !== showId),
    );
    setSelectedShowId((currentShowId) =>
      currentShowId === showId
        ? remainingShows[0]?.id ?? ""
        : currentShowId,
    );
    setWorkflowShowId((currentShowId) =>
      currentShowId === showId
        ? remainingShows[0]?.id ?? ""
        : currentShowId,
    );
    closeShowEditor();
  }

  async function refreshStaffManagement() {
    const [nextProfiles, nextRoles] = await Promise.all([
      getStaffProfiles(),
      getAvailableRoles(),
    ]);

    setStaffProfiles(nextProfiles);
    setStaffRoles(nextRoles);
  }

  async function changeStaffProfileRole(
    profile: StaffManagementProfile,
    role: AdminRole,
  ) {
    if (currentStaff?.role !== "super-admin") {
      return;
    }

    setStaffManagementStatus("");
    const updatedProfile = await updateStaffRole(profile.id, role);
    if (!updatedProfile) {
      showWorkflowToast("⚠ Could not save");
      setStaffManagementStatus("Staff role could not be updated.");
      return;
    }
    await refreshStaffManagement();
    setStaffManagementStatus("Staff role updated.");
    showWorkflowToast("✓ Saved · Staff role updated");
  }

  async function toggleStaffProfileActive(
    profile: StaffManagementProfile,
  ) {
    if (currentStaff?.role !== "super-admin") {
      return;
    }

    setStaffManagementStatus("");
    const updatedProfile = await updateStaffActive(profile.id, !profile.active);
    if (!updatedProfile) {
      showWorkflowToast("⚠ Could not save");
      setStaffManagementStatus("Staff profile could not be updated.");
      return;
    }
    await refreshStaffManagement();
    setStaffManagementStatus(
      profile.active ? "Staff profile deactivated." : "Staff profile activated.",
    );
    showWorkflowToast(
      profile.active
        ? "✓ Saved · Staff deactivated"
        : "✓ Saved · Staff activated",
    );
  }

  async function submitStaffInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (currentStaff?.role !== "super-admin") {
      return;
    }

    const venueScope = staffInviteForm.venueScope
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean);

    setStaffManagementStatus("");
    const result = await createStaffUser({
      email: staffInviteForm.email,
      fullName: staffInviteForm.fullName,
      role: staffInviteForm.role,
      venueScope,
    });

    if (result.error) {
      setStaffManagementStatus(result.error);
      showWorkflowToast("⚠ Could not save");
      return;
    }

    await refreshStaffManagement();
    setStaffInviteForm({
      email: "",
      fullName: "",
      role: "venue-manager",
      venueScope: currentStaff.venueId,
    });
    setIsStaffInviteOpen(false);
    setStaffManagementStatus("Staff user created.");
    showWorkflowToast("✓ Saved · User created");
  }

  function openStaffDeleteModal(profile: StaffManagementProfile) {
    if (currentStaff?.role !== "super-admin") {
      return;
    }

    setStaffDeleteProfileId(profile.id);
    const replacement = staffProfiles.find(
      (staffProfile) =>
        staffProfile.id !== profile.id && staffProfile.active,
    );
    setStaffDeleteReplacementUserId(replacement?.userId ?? "");
    setStaffManagementStatus("");
  }

  function closeStaffDeleteModal() {
    setStaffDeleteProfileId("");
    setStaffDeleteReplacementUserId("");
  }

  async function confirmStaffDelete() {
    if (currentStaff?.role !== "super-admin") {
      return;
    }

    if (!staffDeleteProfileId || !staffDeleteReplacementUserId) {
      setStaffManagementStatus("Select a replacement owner before deleting.");
      showWorkflowToast("⚠ Could not save");
      return;
    }

    const deleted = await deleteStaffProfile(
      staffDeleteProfileId,
      staffDeleteReplacementUserId,
    );

    if (!deleted) {
      setStaffManagementStatus("Staff user could not be deleted.");
      showWorkflowToast("⚠ Could not save");
      return;
    }

    await refreshStaffManagement();
    closeStaffDeleteModal();
    setStaffManagementStatus("Staff user deleted.");
    showWorkflowToast("✓ Saved · User deleted");
  }

  function saveTables(nextTables: DemoTable[]) {
    setTables(nextTables);
    storeDemoTables(nextTables);
  }

  function saveBookings(nextBookings: DemoBooking[]) {
    setBookings(nextBookings);
    void persistBookings(nextBookings)
      .then((persistedBookings) => {
        setBookings(persistedBookings);
        showWorkflowToast("✓ Saved · Booking updated");
        void Promise.all(
          persistedBookings.flatMap((booking) => [
            updatePayment(booking),
            updateTicket(booking),
          ]),
        );
      })
      .catch(() => showWorkflowToast("⚠ Could not save"));
    void Promise.all(
      nextBookings.map((booking) => upsertCustomerFromInfo(booking.customer)),
    );
  }

  function saveCorporateRequests(nextRequests: CorporateRequest[]) {
    setCorporateRequests(nextRequests);
    void persistCorporateRequests(nextRequests)
      .then((persistedRequests) => {
        setCorporateRequests(persistedRequests);
        showWorkflowToast("✓ Saved · Corporate request updated");
      })
      .catch(() => showWorkflowToast("⚠ Could not save"));
    void Promise.all(
      nextRequests.map((request) =>
        syncCorporateRequestCommunications(request),
      ),
    );
  }

  function updateCorporateRequestStatus(
    requestId: string,
    status: CorporateRequestStatus,
  ) {
    if (!canManageBookings) {
      return;
    }

    saveCorporateRequests(
      corporateRequests.map((request) =>
        request.id === requestId
          ? {
              ...request,
              status,
              updatedAt: new Date().toISOString(),
            }
          : request,
      ),
    );
  }

  function archiveCorporateRequest(requestId: string) {
    if (!canManageBookings) {
      return;
    }

    const archivedAt = new Date().toISOString();

    saveCorporateRequests(
      corporateRequests.map((request) =>
        request.id === requestId
          ? {
              ...request,
              archivedAt,
              updatedAt: archivedAt,
            }
          : request,
      ),
    );
  }

  function openDeleteCorporateRequest(requestId: string) {
    if (!canManageBookings) {
      return;
    }

    setDeleteCorporateRequestId(requestId);
  }

  function confirmDeleteCorporateRequest() {
    if (currentStaff?.role !== "super-admin") {
      showWorkflowToast("⚠ Could not save");
      return;
    }

    saveCorporateRequests(
      corporateRequests.filter(
        (request) => request.id !== deleteCorporateRequestId,
      ),
    );
    if (openCorporateRequestId === deleteCorporateRequestId) {
      setOpenCorporateRequestId("");
    }
    setDeleteCorporateRequestId("");
  }

  function getCorporateConversionShows(request: CorporateRequest) {
    return shows.filter(
      (show) =>
        !show.archivedAt &&
        show.date === request.preferredDate &&
        (show.operationalStatus ?? "active") === "active",
    );
  }

  function getCorporateRequestZoneId(request: CorporateRequest) {
    const normalizedPreference = request.seatingPreference
      .trim()
      .toLowerCase();
    const matchedZone =
      seatingZones.find(
        (zone) => zone.title.toLowerCase() === normalizedPreference,
      ) ??
      seatingZones.find((zone) =>
        normalizedPreference.includes(zone.title.toLowerCase()),
      ) ??
      seatingZones[1];

    return matchedZone.id;
  }

  function openConvertedCorporateBooking(reference: string) {
    setOpenCorporateRequestId("");
    setActiveAdminTab("bookings");
    setBookingSearch(reference);
    setBookingPage(1);
    setExpandedBookingReference(reference);
  }

  function convertCorporateRequestToBooking(
    request: CorporateRequest,
    showId?: string,
  ) {
    if (
      !canManageBookings ||
      request.status !== "confirmed" ||
      request.archivedAt ||
      request.linkedBookingReference
    ) {
      return;
    }

    const matchingShows = getCorporateConversionShows(request);

    if (matchingShows.length === 0) {
      setCorporateConversionStatusRequestId(request.id);
      setCorporateConversionStatus(
        "No active show exists for this date.",
      );
      return;
    }

    if (matchingShows.length > 1 && !showId) {
      setCorporateConversionShowSelections((currentSelections) => ({
        ...currentSelections,
        [request.id]:
          currentSelections[request.id] ?? matchingShows[0].id,
      }));
      setCorporateConversionStatusRequestId(request.id);
      setCorporateConversionStatus(
        "Select a show before converting this request.",
      );
      return;
    }

    const selectedConversionShow =
      matchingShows.find((show) => show.id === showId) ??
      matchingShows[0];
    const zoneId = getCorporateRequestZoneId(request);
    const zone = getZoneById(zoneId) ?? seatingZones[1];
    const allocation = findBestTableAllocation(
      tables,
      selectedConversionShow.id,
      zoneId,
      request.guestCount,
    );

    if (!allocation) {
      setCorporateConversionStatusRequestId(request.id);
      setCorporateConversionStatus(
        "No suitable table is available for this request.",
      );
      return;
    }

    const bookingReference = createBookingReference();
    const now = new Date().toISOString();
    const pricePerPerson =
      venueSettings.zonePricing[zoneId]?.price ?? zone.price;
    const subtotalPrice = pricePerPerson * request.guestCount;
    const serviceFeeAmount =
      request.guestCount >= 6 ? Math.round(subtotalPrice * 0.125) : 0;
    const totalPrice = subtotalPrice + serviceFeeAmount;
    const corporateAddons = request.addons.map((addon, index) => ({
      id: `${request.id}-addon-${index + 1}`,
      name: addon,
      price: 0,
    }));
    const corporateNotes = [
      request.notes,
      request.dietaryRequirements.length > 0
        ? `Dietary: ${request.dietaryRequirements.join(", ")}`
        : "",
      request.otherDietaryRequirement
        ? `Other dietary notes: ${request.otherDietaryRequirement}`
        : "",
      request.addons.length > 0
        ? `Corporate add-ons: ${request.addons.join(", ")}`
        : "",
      `Company: ${request.companyName}`,
    ]
      .filter(Boolean)
      .join("\n");
    const booking: DemoBooking = {
      reference: bookingReference,
      showId: selectedConversionShow.id,
      zoneId,
      zoneTitle: zone.title,
      tableId: allocation.table.id,
      tableNumber: allocation.table.tableNumber,
      partySize: request.guestCount,
      bookingDate: getShowLabel(selectedConversionShow),
      addons: corporateAddons,
      addonsTotal: 0,
      subtotalPrice,
      discountAmount: 0,
      serviceFeeAmount,
      totalPrice,
      pricePerPerson,
      paymentOption: "deposit",
      paymentStatus: "pending-payment",
      depositPercentage: 0,
      amountPaid: 0,
      balanceDue: totalPrice,
      source: "corporate-direct",
      ticketCode: createTicketCode(bookingReference),
      ticketIssuedAt: now,
      customer: {
        email: request.email,
        name: request.contactName,
        phone: request.contactNumber,
      },
      status: "pending-payment",
      lifecycleHistory: [
        {
          id: `${bookingReference}-created`,
          toStatus: "new",
          note: "Created from corporate request",
          createdAt: now,
        },
        {
          id: `${bookingReference}-pending-payment`,
          fromStatus: "new",
          toStatus: "pending-payment",
          note: "Converted from confirmed corporate request",
          createdAt: now,
        },
      ],
      operationalNotes: corporateNotes,
      cancellationReason: "",
      refundNotes: "",
      communicationHistory: [],
      createdAt: now,
    };
    const confirmationRecord = createWorkflowCommunication(
      booking,
      "reservation-pending",
      "email",
    );

    saveBookings([
      {
        ...booking,
        communicationHistory: [confirmationRecord],
      },
      ...bookings,
    ]);
    saveTables(
      applyTableAllocation(
        tables,
        allocation,
        bookingReference,
        corporateNotes,
      ),
    );
    saveCorporateRequests(
      corporateRequests.map((corporateRequest) =>
        corporateRequest.id === request.id
          ? {
              ...corporateRequest,
              linkedBookingReference: bookingReference,
              status: "converted",
              updatedAt: now,
            }
          : corporateRequest,
      ),
    );
    setConvertedCorporateBookingReference(bookingReference);
    setCorporateConversionStatusRequestId(request.id);
    setCorporateConversionStatus(
      "Corporate request successfully converted to booking.",
    );
    void sendZingaraBrowserNotification("booking-confirmed");
  }

  function saveWaitlist(nextWaitlist: DemoWaitlistEntry[]) {
    setWaitlist(nextWaitlist);
    void saveWaitlistEntries(nextWaitlist)
      .then((persistedWaitlist) => {
        setWaitlist(persistedWaitlist);
        showWorkflowToast("✓ Saved · Waitlist updated");
      })
      .catch(() => showWorkflowToast("⚠ Could not save"));
  }

  function saveCustomerCrmRecords(
    nextRecords: DemoCustomerCrmRecord[],
  ) {
    setCustomerCrmRecords(nextRecords);
    void saveCustomers(nextRecords)
      .then((persistedRecords) => {
        setCustomerCrmRecords(persistedRecords);
        showWorkflowToast("✓ Saved · Customer updated");
      })
      .catch(() => showWorkflowToast("⚠ Could not save"));
  }

  function saveCommunicationTemplates(
    nextTemplates: CommunicationTemplate[],
  ) {
    setCommunicationTemplates(nextTemplates);
    void saveTemplates(nextTemplates)
      .then((persistedTemplates) => {
        setCommunicationTemplates(persistedTemplates);
        showWorkflowToast("✓ Saved · Template saved");
      })
      .catch(() => showWorkflowToast("⚠ Could not save"));
  }

  function saveVenueSettings(nextSettings: DemoVenueSettings) {
    setVenueSettings(nextSettings);
    void persistVenueSettings(nextSettings)
      .then((persistedSettings) => {
        setVenueSettings(persistedSettings);
        showWorkflowToast("✓ Saved · Venue settings saved");
      })
      .catch(() => showWorkflowToast("⚠ Could not save"));
  }

  function updateVenueSettings(
    updates: Partial<DemoVenueSettings>,
  ) {
    if (!canManageSettings) {
      return;
    }

    saveVenueSettings({
      ...venueSettings,
      ...updates,
    });
  }

  function uploadBrandingAsset(
    file: File | undefined,
    applyAsset: (dataUrl: string) => void,
  ) {
    if (!file || !canManageSettings) {
      return;
    }

    const isSupportedImage = [
      "image/svg+xml",
      "image/png",
      "image/jpeg",
    ].includes(file.type);

    if (!isSupportedImage) {
      return;
    }

    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        applyAsset(reader.result);
      }
    });
    reader.readAsDataURL(file);
  }

  function updateVenueSettingsSection<
    Section extends keyof DemoVenueSettings,
  >(
    section: Section,
    updates: Partial<DemoVenueSettings[Section]>,
  ) {
    if (!canManageSettings) {
      return;
    }

    saveVenueSettings({
      ...venueSettings,
      [section]: {
        ...(venueSettings[section] as Record<string, unknown>),
        ...updates,
      },
    });
  }

  function updateZonePricing(
    zoneId: SeatingZoneId,
    updates: Partial<{
      depositPercentage: number;
      price: number;
    }>,
  ) {
    if (!canManageSettings) {
      return;
    }

    saveVenueSettings({
      ...venueSettings,
      zonePricing: {
        ...venueSettings.zonePricing,
        [zoneId]: {
          depositPercentage:
            venueSettings.zonePricing[zoneId]?.depositPercentage ??
            venueSettings.operationalSettings
              .defaultDepositPercentage,
          price:
            venueSettings.zonePricing[zoneId]?.price ??
            seatingZones.find((zone) => zone.id === zoneId)?.price ??
            0,
          ...updates,
        },
      },
    });
  }

  function saveShows(nextShows: DemoShow[]) {
    console.log("[Zingara show management] show updated", {
      showCount: nextShows.length,
      shows: nextShows.map((show) => ({
        date: show.date,
        id: show.id,
        label: show.label,
        status: show.operationalStatus ?? "active",
        time: getSouthAfricaShowTime(show),
      })),
    });
    setShows(nextShows);
    void replaceShows(nextShows)
      .then((persistedShows) => {
        setShows(persistedShows);
        showWorkflowToast("✓ Saved · Show updated");
        console.log("[Zingara show management] show persisted", {
          persistedShows: persistedShows.map((show) => ({
            date: show.date,
            id: show.id,
            label: show.label,
            status: show.operationalStatus ?? "active",
            time: getSouthAfricaShowTime(show),
          })),
        });
      })
      .catch(() => {
        showWorkflowToast("⚠ Could not save");
      });
  }

  function getBookingShow(booking: DemoBooking) {
    return shows.find((show) => show.id === booking.showId);
  }

  function createWorkflowCommunication(
    booking: DemoBooking,
    trigger: CommunicationTrigger,
    channel: CommunicationChannel = "email",
    extras: Record<string, string | number | undefined> = {},
  ) {
    const template = getCommunicationTemplate(
      communicationTemplates,
      trigger,
      channel,
    );
    const show = getBookingShow(booking);
    const subject = extras.subject
      ? String(extras.subject)
      : template
      ? renderCommunicationTemplate(
          template.subject,
          booking,
          show,
          extras,
        )
      : communicationTriggerLabels[trigger];
    const message = template
      ? renderCommunicationTemplate(
          template.body,
          booking,
          show,
          extras,
        )
      : String(extras.message ?? communicationTriggerLabels[trigger]);

    return createCommunicationRecord({
      booking,
      channel: template?.channel ?? channel,
      message,
      subject,
      templateId: template?.id,
      trigger,
    });
  }

  function createTemplateCommunication(
    booking: DemoBooking,
    template: CommunicationTemplate,
    extras: Record<string, string | number | undefined> = {},
  ) {
    const show = getBookingShow(booking);

    return createCommunicationRecord({
      booking,
      channel: template.channel,
      message: renderCommunicationTemplate(
        template.body,
        booking,
        show,
        extras,
      ),
      subject: renderCommunicationTemplate(
        template.subject,
        booking,
        show,
        extras,
      ),
      templateId: template.id,
      trigger: template.trigger,
    });
  }

  function appendCommunicationToBookings(
    sourceBookings: DemoBooking[],
    bookingReference: string,
    recordFactory: (booking: DemoBooking) => DemoBooking["communicationHistory"][number],
  ) {
    return sourceBookings.map((booking) =>
      booking.reference === bookingReference
        ? {
            ...booking,
            communicationHistory: [
              recordFactory(booking),
              ...(booking.communicationHistory ?? []),
            ],
          }
        : booking,
    );
  }

  function sendWorkflowCommunication(
    booking: DemoBooking,
    trigger: CommunicationTrigger,
    channel: CommunicationChannel = "email",
    extras: Record<string, string | number | undefined> = {},
  ) {
    if (
      !canManageCommunications &&
      trigger !== "check-in-confirmation"
    ) {
      return;
    }

    saveBookings(
      appendCommunicationToBookings(
        bookings,
        booking.reference,
        (currentBooking) =>
          createWorkflowCommunication(
            currentBooking,
            trigger,
            channel,
            extras,
          ),
      ),
    );
  }

  function createWaitlistPromotionCommunication(
    entry: DemoWaitlistEntry,
  ) {
    const waitlistBooking: DemoBooking = {
      reference: entry.id,
      showId: entry.showId,
      zoneId: entry.desiredZoneId ?? "middle-ring",
      zoneTitle: entry.desiredZoneTitle ?? "Any preferred zone",
      tableId: "waitlist",
      tableNumber: "Pending",
      partySize: entry.partySize,
      bookingDate: getShowLabel(
        shows.find((show) => show.id === entry.showId),
      ),
      totalPrice: 0,
      pricePerPerson: 0,
      paymentStatus: "pending-payment",
      customer: entry.customer,
      status: "pending-payment",
      lifecycleHistory: [
        {
          id: `${entry.id}-waitlisted`,
          toStatus: "waitlisted",
          note: "Waitlist entry promoted",
          createdAt: entry.createdAt,
        },
      ],
      communicationHistory: entry.communicationHistory ?? [],
      createdAt: entry.createdAt,
    };

    return createWorkflowCommunication(
      waitlistBooking,
      "waitlist-promotion",
      "email",
    );
  }

  function updateCommunicationTemplate(
    templateId: string,
    updates: Partial<
      Pick<CommunicationTemplate, "body" | "channel" | "subject">
    >,
  ) {
    if (!canManageCommunications) {
      return;
    }

    const nextTemplates = communicationTemplates.map((template) =>
      template.id === templateId
        ? {
            ...template,
            ...updates,
            updatedAt: new Date().toISOString(),
          }
        : template,
    );

    saveCommunicationTemplates(nextTemplates);
    setWorkflowStatus("Template saved successfully.");
  }

  function createShow() {
    if (!canManageShows || !newShow.date || !newShow.time) {
      return;
    }

    const showId = `show-${newShow.date}-${newShow.time.replace(":", "")}`;

    if (shows.some((show) => show.id === showId)) {
      setSelectedShowId(showId);
      return;
    }

    const show: DemoShow = {
      id: showId,
      date: newShow.date,
      time: newShow.time,
      label: newShow.label.trim() || "Zingara Show",
      operationalStatus: "active",
      venueName: venueConfig.venueName,
    };

    saveShows([...shows, show]);
    saveTables([...tables, ...createTablesForShow(show.id)]);
    setSelectedShowId(show.id);
    setNewShow({
      date: "",
      time: "",
      label: "",
    });
  }

  function createTable(zoneId: SeatingZoneId) {
    const newTable = newTables[zoneId];
    const tableNumber = newTable.tableNumber.trim();

    if (
      !canManageTables ||
      !selectedShowId ||
      !tableNumber ||
      newTable.seatCapacity < 1
    ) {
      return;
    }

    saveTables([
      ...tables,
      {
        id: getNextTableId(
          tables,
          selectedShowId,
          zoneId,
          "table",
        ),
        showId: selectedShowId,
        zoneId,
        tableNumber,
        baseSeatCapacity: newTable.seatCapacity,
        baseStatus: "available",
        baseGuestNotes: "",
        baseMergeable: true,
        seatCapacity: newTable.seatCapacity,
        status: "available",
        guestNotes: "",
        mergeable: true,
      },
    ]);
    setNewTables((currentForms) => ({
      ...currentForms,
      [zoneId]: {
        tableNumber: "",
        seatCapacity: 2,
      },
    }));
  }

  function updateTable(
    tableId: string,
    updates: Partial<DemoTable>,
  ) {
    if (!canManageTables) {
      return;
    }

    saveTables(
      tables.map((table) =>
        table.id === tableId
          ? {
              ...table,
              ...updates,
              seatCapacity: Math.max(
                1,
                updates.seatCapacity ?? table.seatCapacity,
              ),
            }
          : table,
      ),
    );
  }

  function updateTableShowOverride(
    tableId: string,
    updates: Partial<NonNullable<DemoTable["showOverride"]>>,
  ) {
    if (!canManageTables) {
      return;
    }

    saveTables(
      tables.map((table) => {
        if (table.id !== tableId) {
          return table;
        }

        const baseSeatCapacity =
          table.baseSeatCapacity ?? table.seatCapacity;
        const baseStatus = table.baseStatus ?? table.status;
        const baseGuestNotes = table.baseGuestNotes ?? table.guestNotes;
        const baseMergeable = table.baseMergeable ?? table.mergeable ?? true;
        const nextOverride = {
          ...(table.showOverride ?? {}),
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        return {
          ...table,
          baseSeatCapacity,
          baseStatus,
          baseGuestNotes,
          baseMergeable,
          seatCapacity: Math.max(
            1,
            nextOverride.seatCapacity ?? table.seatCapacity,
          ),
          status: nextOverride.status ?? table.status,
          guestNotes:
            nextOverride.operationalNotes ?? table.guestNotes,
          mergeable: nextOverride.mergeable ?? table.mergeable ?? true,
          showOverride: nextOverride,
        };
      }),
    );
  }

  function resetTableShowOverride(table: DemoTable) {
    if (!canManageTables) {
      return;
    }

    saveTables(
      tables.map((currentTable) =>
        currentTable.id === table.id
          ? {
              ...currentTable,
              seatCapacity:
                currentTable.baseSeatCapacity ??
                currentTable.seatCapacity,
              status: currentTable.bookingReference
                ? "booked"
                : (currentTable.baseStatus ?? "available"),
              guestNotes:
                currentTable.bookingReference
                  ? currentTable.guestNotes
                  : (currentTable.baseGuestNotes ?? ""),
              mergeable: currentTable.baseMergeable ?? true,
              showOverride: undefined,
            }
          : currentTable,
      ),
    );
  }

  function toggleDisabled(table: DemoTable) {
    updateTableShowOverride(table.id, {
      status:
        table.status === "disabled" ? "available" : "disabled",
    });
  }

  function mergeTable(
    zoneId: SeatingZoneId,
    primaryTable: DemoTable,
  ) {
    if (!canManageTables) {
      return;
    }

    const targetTableId = mergeSelections[zoneId];
    const targetTable = tables.find(
      (table) => table.id === targetTableId,
    );

    if (
      !targetTable ||
      !selectedShowId ||
      targetTable.id === primaryTable.id ||
      targetTable.zoneId !== primaryTable.zoneId ||
      primaryTable.status !== "available" ||
      targetTable.status !== "available" ||
      primaryTable.mergeable === false ||
      targetTable.mergeable === false ||
      primaryTable.bookingReference ||
      targetTable.bookingReference ||
      primaryTable.mergedInto ||
      targetTable.mergedInto ||
      primaryTable.mergedFrom?.length ||
      targetTable.mergedFrom?.length
    ) {
      return;
    }

    const mergedTableNumber = `${primaryTable.tableNumber}+${targetTable.tableNumber}`;
    const mergedAt = new Date().toISOString();
    const mergeSummary = `Merged ${primaryTable.tableNumber} and ${targetTable.tableNumber} into ${mergedTableNumber}`;
    const mergedTable: DemoTable = {
      id: getNextTableId(
        tables,
        selectedShowId,
        zoneId,
        "merged",
      ),
      showId: selectedShowId,
      zoneId,
      tableNumber: mergedTableNumber,
      baseSeatCapacity:
        primaryTable.seatCapacity + targetTable.seatCapacity,
      baseStatus: "available",
      baseGuestNotes: `Merged from ${primaryTable.tableNumber} and ${targetTable.tableNumber}`,
      baseMergeable: true,
      seatCapacity:
        primaryTable.seatCapacity + targetTable.seatCapacity,
      status: "available",
      guestNotes: `Merged from ${primaryTable.tableNumber} and ${targetTable.tableNumber}`,
      mergeable: true,
      mergedFrom: [primaryTable.id, targetTable.id],
      mergeHistory: [
        ...(primaryTable.mergeHistory ?? []),
        ...(targetTable.mergeHistory ?? []),
        {
          id: `${mergedAt}-${mergedTableNumber}-merged`,
          at: mergedAt,
          summary: mergeSummary,
          type: "merged",
        },
      ],
    };

    saveTables([
      ...tables.map((table) =>
        table.id === primaryTable.id ||
        table.id === targetTable.id
          ? {
              ...table,
              status: "disabled" as const,
              mergedInto: mergedTable.id,
              guestNotes: `Merged into ${mergedTableNumber}`,
              mergeHistory: [
                ...(table.mergeHistory ?? []),
                {
                  id: `${mergedAt}-${table.id}-merged-child`,
                  at: mergedAt,
                  summary: mergeSummary,
                  type: "merged" as const,
                },
              ],
            }
          : table,
      ),
      mergedTable,
    ]);
    setMergeSelections((currentSelections) => ({
      ...currentSelections,
      [zoneId]: "",
    }));
  }

  function getSplitMergeReview(
    mergedTable: DemoTable,
  ): SplitMergeReview {
    const booking = bookings.find(
      (currentBooking) =>
        (currentBooking.tableId === mergedTable.id ||
          currentBooking.reference === mergedTable.bookingReference) &&
        isOccupyingBookingStatus(currentBooking.status ?? "confirmed"),
    );
    const sourceTables = tables.filter((table) =>
      mergedTable.mergedFrom?.includes(table.id),
    );
    const targetTable = booking
      ? sourceTables
          .filter((table) => table.seatCapacity >= booking.partySize)
          .sort(
            (firstTable, secondTable) =>
              firstTable.seatCapacity - secondTable.seatCapacity,
          )[0]
      : undefined;
    const sourceSummary = sourceTables
      .map((table) => `${table.tableNumber} (${table.seatCapacity})`)
      .join(", ");

    if (booking && !targetTable) {
      return {
        booking,
        table: mergedTable,
        warning: `${booking.customer.name || "This booking"} needs ${booking.partySize} seats. None of the original tables (${sourceSummary}) can hold this party after split.`,
      };
    }

    if (booking && targetTable) {
      return {
        booking,
        table: mergedTable,
        targetTableId: targetTable.id,
        warning: `${booking.customer.name || "This booking"} will be reassigned from ${mergedTable.tableNumber} to ${targetTable.tableNumber}. Confirm only if operations are ready for that smaller table.`,
      };
    }

    return {
      table: mergedTable,
      warning: `${mergedTable.tableNumber} will be restored into ${sourceSummary}. Original capacities, statuses, and table links will be recovered.`,
    };
  }

  function requestSplitMergedTable(mergedTable: DemoTable) {
    if (!canManageTables || !mergedTable.mergedFrom?.length) {
      return;
    }

    setSplitMergeReview(getSplitMergeReview(mergedTable));
  }

  function splitMergedTable(
    mergedTable: DemoTable,
    targetTableId?: string,
  ) {
    if (!canManageTables || !mergedTable.mergedFrom?.length) {
      return;
    }

    const review = getSplitMergeReview(mergedTable);

    if (review.booking && !targetTableId) {
      setSplitMergeReview(review);
      return;
    }

    const targetTable = targetTableId
      ? tables.find((table) => table.id === targetTableId)
      : undefined;

    if (
      review.booking &&
      (!targetTable || targetTable.seatCapacity < review.booking.partySize)
    ) {
      setSplitMergeReview(review);
      return;
    }

    const splitAt = new Date().toISOString();
    const sourceTableIds = new Set(mergedTable.mergedFrom);
    const splitSummary = `Split ${mergedTable.tableNumber} back into original tables`;

    const nextTables = tables
      .filter((table) => table.id !== mergedTable.id)
      .map((table) => {
        if (!sourceTableIds.has(table.id)) {
          return table;
        }

        const isBookingTarget =
          review.booking && table.id === targetTableId;

        return {
          ...table,
          status: isBookingTarget
            ? ("booked" as const)
            : (table.baseStatus ?? "available"),
          bookingReference: isBookingTarget
            ? review.booking?.reference
            : undefined,
          mergedInto: undefined,
          guestNotes: isBookingTarget
            ? review.booking?.customer.name || "Reassigned booking"
            : (table.baseGuestNotes ?? ""),
          mergeHistory: [
            ...(table.mergeHistory ?? []),
            {
              id: `${splitAt}-${table.id}-split`,
              at: splitAt,
              summary: splitSummary,
              type: "split" as const,
            },
          ],
        };
      });

    saveTables(nextTables);

    if (review.booking && targetTable) {
      saveBookings(
        bookings.map((booking) =>
          booking.reference === review.booking?.reference
            ? {
                ...booking,
                tableId: targetTable.id,
                tableNumber: targetTable.tableNumber,
                operationalNotes: [
                  booking.operationalNotes,
                  `Merged table ${mergedTable.tableNumber} split; booking reassigned to ${targetTable.tableNumber}.`,
                ]
                  .filter(Boolean)
                  .join(" "),
              }
            : booking,
        ),
      );
    }

    setSplitMergeReview(null);
  }

  function updateBookingCustomer(
    reference: string,
    field: keyof DemoBooking["customer"],
    value: string,
  ) {
    if (!canManageBookings) {
      return;
    }

    saveBookings(
      bookings.map((booking) =>
        booking.reference === reference
          ? {
              ...booking,
              customer: {
                ...booking.customer,
                [field]: value,
              },
            }
          : booking,
      ),
    );
  }

  function updateBookingOperationalField(
    reference: string,
    field:
      | "cancellationReason"
      | "operationalNotes"
      | "refundNotes",
    value: string,
  ) {
    if (!canManageBookings) {
      return;
    }

    saveBookings(
      bookings.map((booking) =>
        booking.reference === reference
          ? {
              ...booking,
              [field]: value,
            }
          : booking,
      ),
    );
  }

  function releaseBookingTableFromList(
    currentTables: DemoTable[],
    booking: DemoBooking,
  ) {
    const bookingTable = currentTables.find(
      (table) =>
        table.id === booking.tableId &&
        table.bookingReference === booking.reference,
    );

    if (bookingTable?.mergedFrom?.length) {
      const sourceTableIds = new Set(bookingTable.mergedFrom);

      return currentTables
        .filter((table) => table.id !== bookingTable.id)
        .map((table) =>
          sourceTableIds.has(table.id)
            ? {
                ...table,
                status: "available" as const,
                bookingReference: undefined,
                mergedInto: undefined,
                guestNotes: "",
              }
            : table,
        );
    }

    return currentTables.map((table) =>
      table.id === booking.tableId &&
      table.bookingReference === booking.reference
        ? {
            ...table,
            status: "available" as const,
            bookingReference: undefined,
            mergedInto: undefined,
            guestNotes: "",
          }
        : table,
    );
  }

  function releaseBookingTable(booking: DemoBooking) {
    if (!canManageBookings) {
      return;
    }

    saveTables(releaseBookingTableFromList(tables, booking));
  }

  function createLifecycleEvent(
    booking: DemoBooking,
    toStatus: BookingStatus,
    note?: string,
  ) {
    const createdAt = new Date().toISOString();

    return {
      id: `${booking.reference}-${toStatus}-${createdAt}`,
      fromStatus: booking.status,
      toStatus,
      note,
      createdAt,
    };
  }

  function getCancellationSummary() {
    const trimmedOtherReason = cancellationOtherReason.trim();

    if (cancellationReason === "Other") {
      return trimmedOtherReason
        ? `Other: ${trimmedOtherReason}`
        : "Other";
    }

    return trimmedOtherReason
      ? `${cancellationReason}: ${trimmedOtherReason}`
      : cancellationReason;
  }

  function openCancellationModal(booking: DemoBooking) {
    if (!canManageBookings) {
      return;
    }

    setCancellingBookingReference(booking.reference);
    setCancellationReason(cancellationReasons[0]);
    setCancellationOtherReason("");
  }

  function closeCancellationModal() {
    setCancellingBookingReference("");
    setCancellationReason(cancellationReasons[0]);
    setCancellationOtherReason("");
  }

  function cancelBooking(booking: DemoBooking, reason: string) {
    if (!canManageBookings) {
      return;
    }

    releaseBookingTable(booking);
    const cancelledBooking = {
      ...booking,
      cancellationReason: reason,
      lifecycleHistory: [
        createLifecycleEvent(
          booking,
          "cancelled",
          `Cancellation reason: ${reason}`,
        ),
        ...(booking.lifecycleHistory ?? []),
      ],
      status: "cancelled" as const,
    };
    const cancellationRecord = createWorkflowCommunication(
      cancelledBooking,
      "cancellation-refund",
      "email",
      {
        refundSummary:
          "This demo notice records the cancellation and marks the booking for refund review.",
      },
    );

    saveBookings(
      bookings.map((currentBooking) =>
        currentBooking.reference === booking.reference
          ? {
              ...cancelledBooking,
              communicationHistory: [
                cancellationRecord,
                ...(currentBooking.communicationHistory ?? []),
              ],
            }
          : currentBooking,
      ),
    );
    void sendZingaraBrowserNotification("booking-cancelled");
    void sendZingaraStaffPushNotification("booking-cancelled", {
      bookingReference: booking.reference,
    });
    void sendZingaraGuestPushNotification("reservation-cancelled", {
      bookingReference: booking.reference,
    });
  }

  function confirmBookingCancellation() {
    const booking = bookings.find(
      (currentBooking) =>
        currentBooking.reference === cancellingBookingReference,
    );

    if (!booking) {
      closeCancellationModal();
      return;
    }

    cancelBooking(booking, getCancellationSummary());
    closeCancellationModal();
  }

  function updateBookingStatus(
    booking: DemoBooking,
    status: BookingStatus,
  ) {
    if (!canManageBookings) {
      return;
    }

    if (status === booking.status) {
      return;
    }

    if (status === "cancelled") {
      openCancellationModal(booking);
      return;
    }

    if (
      status === "refunded" ||
      status === "completed" ||
      status === "no-show" ||
      status === "waitlisted"
    ) {
      releaseBookingTable(booking);
    }

    const arrivalTime =
      status === "checked-in"
        ? booking.arrivalTime ?? new Date().toISOString()
        : booking.arrivalTime;
    const lifecyclePaymentUpdates =
      status === "refunded"
        ? {
            amountPaid: 0,
            balanceDue: 0,
            paymentStatus: "refunded" as const,
          }
        : status === "pending-payment" || status === "new"
          ? {
              amountPaid: booking.amountPaid ?? 0,
              balanceDue:
                booking.balanceDue ??
                Math.max(
                  booking.totalPrice - (booking.amountPaid ?? 0),
                  0,
                ),
              paymentStatus:
                booking.paymentStatus ?? ("pending-payment" as const),
            }
          : {};
    const updatedBooking = {
      ...booking,
      ...lifecyclePaymentUpdates,
      arrivalTime,
      lifecycleHistory: [
        createLifecycleEvent(
          booking,
          status,
          `Status changed to ${bookingStatusLabels[status]}.`,
        ),
        ...(booking.lifecycleHistory ?? []),
      ],
      refundNotes:
        status === "refunded"
          ? booking.refundNotes || "Refund marked by box office"
          : booking.refundNotes,
      status,
    };
    const statusRecord = createWorkflowCommunication(
      updatedBooking,
      status === "checked-in"
        ? "check-in-confirmation"
        : "booking-update",
      "email",
      {
        updateSummary: `Status changed to ${bookingStatusLabels[status]}.`,
      },
    );

    saveBookings(
      bookings.map((currentBooking) =>
        currentBooking.reference === booking.reference
          ? {
              ...currentBooking,
              arrivalTime,
              communicationHistory: [
                statusRecord,
                ...(currentBooking.communicationHistory ?? []),
              ],
              lifecycleHistory: updatedBooking.lifecycleHistory,
              amountPaid: updatedBooking.amountPaid,
              balanceDue: updatedBooking.balanceDue,
              paymentStatus: updatedBooking.paymentStatus,
              refundNotes: updatedBooking.refundNotes,
              status,
            }
          : currentBooking,
      ),
    );
    void sendZingaraBrowserNotification(
      status === "checked-in"
        ? "check-in-confirmed"
        : "booking-updated",
    );
    if (status === "confirmed") {
      void sendZingaraGuestPushNotification("reservation-confirmed", {
        bookingReference: booking.reference,
      });
    }
    if (status === "pending-payment") {
      void sendZingaraGuestPushNotification("reservation-pending-payment", {
        bookingReference: booking.reference,
      });
    }
  }

  function updateBookingPayment(
    booking: DemoBooking,
    paymentStatus: PaymentStatus,
  ) {
    if (!canManageBookings) {
      return;
    }

    const financials = getBookingFinancials(booking);
    const paymentUpdates =
      paymentStatus === "fully-paid"
        ? {
            amountPaid: financials.totalPrice,
            balanceDue: 0,
          }
        : paymentStatus === "deposit-paid"
          ? {
              amountPaid: financials.depositAmount,
              balanceDue: Math.max(
                financials.totalPrice - financials.depositAmount,
                0,
              ),
            }
          : paymentStatus === "comp-vip"
            ? {
                amountPaid: 0,
                balanceDue: 0,
              }
            : paymentStatus === "refunded"
              ? {
                  amountPaid: 0,
                  balanceDue: 0,
                }
              : {
                  amountPaid: 0,
                  balanceDue: financials.totalPrice,
                };
    const nextStatus =
      paymentStatus === "refunded" ? ("refunded" as const) : booking.status;
    const paymentLifecycleNote =
      paymentStatus === "fully-paid" || paymentStatus === "deposit-paid"
        ? `Payment received: ${paymentStatusLabels[paymentStatus]}.`
        : paymentStatus === "comp-vip"
          ? "Comp booking marked by box office."
          : undefined;
    const updatedBooking = {
      ...booking,
      ...paymentUpdates,
      paymentStatus,
      lifecycleHistory:
        paymentStatus === "refunded"
          ? [
              createLifecycleEvent(
                booking,
                "refunded",
                booking.refundNotes || "Refund marked by box office",
              ),
              ...(booking.lifecycleHistory ?? []),
            ]
          : paymentLifecycleNote
            ? [
                createLifecycleEvent(
                  booking,
                  nextStatus,
                  paymentLifecycleNote,
                ),
                ...(booking.lifecycleHistory ?? []),
              ]
          : booking.lifecycleHistory,
      refundNotes:
        paymentStatus === "refunded"
          ? booking.refundNotes || "Refund marked by box office"
          : booking.refundNotes,
      status: nextStatus,
    };
    const paymentCommunicationTrigger =
      paymentStatus === "refunded"
        ? ("cancellation-refund" as const)
        : paymentStatus === "comp-vip"
          ? ("complimentary-booking" as const)
          : ("payment-confirmation" as const);
    const paymentRecord = createWorkflowCommunication(
      updatedBooking,
      paymentCommunicationTrigger,
      "email",
      {
        updateSummary: `Payment status changed to ${paymentStatusLabels[paymentStatus]}.`,
      },
    );

    if (paymentStatus === "refunded") {
      releaseBookingTable(booking);
    }

    saveBookings(
      bookings.map((currentBooking) =>
        currentBooking.reference === booking.reference
          ? {
              ...updatedBooking,
              communicationHistory: [
                paymentRecord,
                ...(currentBooking.communicationHistory ?? []),
              ],
            }
          : currentBooking,
      ),
    );
    void sendZingaraBrowserNotification("booking-updated");
    if (paymentStatus === "fully-paid" || paymentStatus === "deposit-paid") {
      void sendZingaraGuestPushNotification("payment-received", {
        bookingReference: booking.reference,
      });
      void sendZingaraStaffPushNotification("payment-received", {
        bookingReference: booking.reference,
      });
    }
  }

  function getReportBookings() {
    return bookings.filter((booking) => {
      const show = getBookingShow(booking);
      const paymentStatus = getBookingPaymentStatus(booking);

      return (
        booking.showId === selectedShowId &&
        (reportDateFilter ? show?.date === reportDateFilter : true) &&
        (reportStatusFilter === "all"
          ? true
          : (booking.status ?? "confirmed") === reportStatusFilter) &&
        (reportZoneFilter === "all"
          ? true
          : booking.zoneId === reportZoneFilter) &&
        (reportPaymentFilter === "all"
          ? true
          : paymentStatus === reportPaymentFilter)
      );
    });
  }

  function getReportRows(reportType: OperationalReportType) {
    const reportBookings = getReportBookings();

    if (reportType === "waitlist") {
      return waitlist
        .filter((entry) => entry.showId === selectedShowId)
        .map((entry) => ({
          reference: entry.id,
          customer: entry.customer.name,
          email: entry.customer.email,
          phone: entry.customer.phone,
          guests: entry.partySize,
          preferredZone: entry.desiredZoneTitle ?? "Any",
          status: waitlistStatusLabels[entry.status],
          notes: entry.notes,
        }));
    }

    if (reportType === "crm") {
      return customerProfiles.map((profile) => ({
        customer: profile.customer.name,
        email: profile.customer.email,
        phone: profile.customer.phone,
        bookings: profile.totalBookings,
        totalSpend: profile.totalSpend,
        favouriteZone: profile.favouriteZone,
        vipTags: profile.vipTags.join("; "),
        notes: profile.notes,
      }));
    }

    if (reportType === "table-allocations") {
      return tables
        .filter((table) => table.showId === selectedShowId)
        .map((table) => {
          const occupancy = getTableOccupancy(table, bookings);

          return {
            zone: getZoneById(table.zoneId)?.title ?? table.zoneId,
            table: table.tableNumber,
            seats: table.seatCapacity,
            status: tableOccupancyLabels[occupancy.state],
            booking: occupancy.booking?.reference,
            guest: occupancy.booking?.customer.name,
            notes: table.guestNotes,
          };
        });
    }

    if (reportType === "revenue") {
      return reportBookings.map((booking) => {
        const financials = getBookingFinancials(booking);

        return {
          reference: booking.reference,
          customer: booking.customer.name,
          status: bookingStatusLabels[booking.status ?? "confirmed"],
          paymentStatus: paymentStatusLabels[financials.paymentStatus],
          subtotal: financials.subtotalPrice,
          addons: financials.addonsTotal,
          discounts: financials.discountAmount,
          total: financials.totalPrice,
          paid: financials.amountPaid,
          outstanding: financials.balanceDue,
        };
      });
    }

    if (reportType === "check-ins") {
      return reportBookings.map((booking) => ({
        reference: booking.reference,
        customer: booking.customer.name,
        phone: booking.customer.phone,
        guests: booking.partySize,
        zone: booking.zoneTitle,
        table: booking.tableNumber,
        status: bookingStatusLabels[booking.status ?? "confirmed"],
        arrival: booking.arrivalTime
          ? new Date(booking.arrivalTime).toLocaleString()
          : "",
        signature: "",
      }));
    }

    if (reportType === "guest-list") {
      return reportBookings.map((booking) => ({
        customer: booking.customer.name,
        email: booking.customer.email,
        phone: booking.customer.phone,
        guests: booking.partySize,
        zone: booking.zoneTitle,
        table: booking.tableNumber,
        notes: booking.operationalNotes,
      }));
    }

    return reportBookings.map((booking) => {
      const financials = getBookingFinancials(booking);

      return {
        reference: booking.reference,
        show: getShowLabel(getBookingShow(booking)),
        customer: booking.customer.name,
        email: booking.customer.email,
        phone: booking.customer.phone,
        guests: booking.partySize,
        zone: booking.zoneTitle,
        table: booking.tableNumber,
        status: bookingStatusLabels[booking.status ?? "confirmed"],
        paymentStatus: paymentStatusLabels[financials.paymentStatus],
        total: financials.totalPrice,
        paid: financials.amountPaid,
        outstanding: financials.balanceDue,
        notes: booking.operationalNotes,
      };
    });
  }

  function downloadTextFile(
    filename: string,
    content: string,
    mimeType: string,
  ) {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportReport(reportType: OperationalReportType) {
    const csv = createCsv(getReportRows(reportType));

    downloadTextFile(
      `${reportType}-${selectedShowId || "all"}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  }

  function printReport(reportType: OperationalReportType) {
    const rows = getReportRows(reportType) as Array<
      Record<string, string | number | undefined>
    >;
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    const html = `<!doctype html><html><head><title>${operationalReportLabels[reportType]}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:24px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:12px}th{background:#eee}</style></head><body><h1>${operationalReportLabels[reportType]}</h1><p>${getShowLabel(selectedShow)}</p><table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((header) => `<td>${String(row[header] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      return;
    }

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  }

  function buildLegacyImportPreview(rows: Record<string, string>[]) {
    const errors: string[] = [];
    const crmRecordsByKey = new Map<string, DemoCustomerCrmRecord>();
    const importedBookings = rows.flatMap((row, index) => {
      const name =
        row.customer_name || row.name || row.guest_name || "";
      const email = row.email || row.email_address || "";
      const phone = row.phone || row.phone_number || "";

      if (!name && !email && !phone) {
        errors.push(`Row ${index + 2}: missing customer identity.`);
        return [];
      }

      const zone =
        seatingZones.find(
          (currentZone) =>
            currentZone.title.toLowerCase() ===
              (row.zone || row.seating_zone || "").toLowerCase() ||
            (isValidSeatingZoneId(row.zone) &&
              currentZone.id === row.zone),
        ) ?? seatingZones[1];
      const customer = { email, name: name || "Imported Guest", phone };
      const customerKey = getCustomerKey(customer);
      const vipTags = (row.vip_tags || row.tags || "")
        .split(/[;|]/)
        .map((tag) => tag.trim())
        .filter(Boolean);

      crmRecordsByKey.set(customerKey, {
        customerKey,
        notes: row.notes || row.booking_notes || "",
        vipTags,
        updatedAt: new Date().toISOString(),
      });

      const importedStatus = isValidBookingStatus(row.status)
        ? row.status
        : "completed";

      return [
        {
          reference:
            row.booking_reference ||
            row.reference ||
            `LEGACY-${Date.now()}-${index + 1}`,
          showId: selectedShowId,
          zoneId: zone.id,
          zoneTitle: zone.title,
          tableId: row.table_id || "legacy-import",
          tableNumber: row.table || row.table_number || "Legacy",
          partySize: Number(row.guests || row.party_size || 1),
          bookingDate: row.booking_date || getShowLabel(selectedShow),
          addons: [],
          addonsTotal: 0,
          subtotalPrice: Number(row.subtotal || row.total || 0),
          discountAmount: Number(row.discount || 0),
          totalPrice: Number(row.total || row.payment_total || 0),
          pricePerPerson: 0,
          paymentStatus: "fully-paid" as const,
          amountPaid: Number(row.paid || row.payment_total || row.total || 0),
          balanceDue: Number(row.balance || 0),
          source: "admin" as const,
          ticketCode: createTicketCode(
            row.booking_reference ||
              row.reference ||
              `LEGACY-${Date.now()}-${index + 1}`,
          ),
          ticketIssuedAt: new Date().toISOString(),
          customer,
          status: importedStatus,
          lifecycleHistory: [
            {
              id: `legacy-${index + 1}`,
              toStatus: importedStatus,
              note: "Imported from legacy booking data",
              createdAt: new Date().toISOString(),
            },
          ],
          operationalNotes: row.notes || row.booking_notes || "",
          cancellationReason: "",
          refundNotes: "",
          communicationHistory: [],
          createdAt: new Date().toISOString(),
        } satisfies DemoBooking,
      ];
    });

    return {
      bookings: importedBookings,
      crmRecords: Array.from(crmRecordsByKey.values()),
      errors,
    };
  }

  async function handleLegacyImportFile(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    setLegacyImportError("");
    setLegacyImportPreview(null);

    if (!file) {
      return;
    }

    if (file.name.endsWith(".xlsx")) {
      setLegacyImportError(
        "XLSX files are accepted for legacy intake, but this lightweight local demo preview currently needs the workbook exported as CSV before confirmation.",
      );
      return;
    }

    const text = await file.text();
    const rows = parseCsvRows(text);

    if (rows.length === 0) {
      setLegacyImportError("No importable rows were found.");
      return;
    }

    setLegacyImportPreview(buildLegacyImportPreview(rows));
  }

  function confirmLegacyImport() {
    if (!legacyImportPreview || !canManageBookings) {
      return;
    }

    const existingReferences = new Set(
      bookings.map((booking) => booking.reference),
    );
    const nextBookings = [
      ...legacyImportPreview.bookings.filter(
        (booking) => !existingReferences.has(booking.reference),
      ),
      ...bookings,
    ];
    const crmByKey = new Map(
      customerCrmRecords.map((record) => [record.customerKey, record]),
    );

    for (const record of legacyImportPreview.crmRecords) {
      crmByKey.set(record.customerKey, {
        ...crmByKey.get(record.customerKey),
        ...record,
        vipTags: Array.from(
          new Set([
            ...(crmByKey.get(record.customerKey)?.vipTags ?? []),
            ...record.vipTags,
          ]),
        ),
      });
    }

    saveBookings(nextBookings);
    saveCustomerCrmRecords(Array.from(crmByKey.values()));
    setLegacyImportPreview(null);
  }

  function checkInGuest(booking: DemoBooking) {
    if (
      !canCheckInGuests ||
      !isOccupyingBookingStatus(booking.status ?? "confirmed")
    ) {
      return;
    }

    const arrivalTime = new Date().toISOString();
    const checkedInBooking = {
      ...booking,
      arrivalTime,
      lifecycleHistory: [
        createLifecycleEvent(booking, "checked-in", "Guest arrived"),
        ...(booking.lifecycleHistory ?? []),
      ],
      status: "checked-in" as const,
    };
    const checkInRecord = createWorkflowCommunication(
      checkedInBooking,
      "check-in-confirmation",
      "email",
    );

    saveBookings(
      bookings.map((currentBooking) =>
        currentBooking.reference === booking.reference
          ? {
              ...currentBooking,
              arrivalTime,
              communicationHistory: [
                checkInRecord,
                ...(currentBooking.communicationHistory ?? []),
              ],
              lifecycleHistory: checkedInBooking.lifecycleHistory,
              status: "checked-in",
            }
          : currentBooking,
      ),
    );
    void createTicketValidation({
      booking: checkedInBooking,
      code: checkedInBooking.ticketCode ?? checkedInBooking.reference,
      deviceLabel: "Manual Check-In",
      notes: "Manual check-in recorded.",
      result: "checked_in",
    });
    void sendZingaraBrowserNotification("check-in-confirmed");
    void sendZingaraStaffPushNotification("guest-checked-in", {
      bookingReference: booking.reference,
    });
  }

  function findTicketRecord(code: string) {
    const normalizedCode = code.trim();

    if (!normalizedCode) {
      return {};
    }

    const booking = bookings.find(
      (currentBooking) =>
        currentBooking.reference === normalizedCode ||
        currentBooking.ticketCode === normalizedCode ||
        createTicketCode(currentBooking.reference) === normalizedCode,
    );

    if (booking) {
      return {
        booking,
      };
    }

    const waitlistEntry = waitlist.find(
      (entry) =>
        entry.id === normalizedCode ||
        createTicketCode(entry.id) === normalizedCode ||
        entry.bookingReference === normalizedCode,
    );

    return {
      waitlistEntry,
    };
  }

  function createValidationResultForState(state: TicketState | "Invalid") {
    if (state === "Active") {
      return "valid" as const;
    }

    if (state === "Checked In") {
      return "already_used" as const;
    }

    if (state === "Cancelled") {
      return "cancelled" as const;
    }

    if (state === "Refunded") {
      return "refunded" as const;
    }

    return "invalid" as const;
  }

  function validateTicketCodeValue(code: string) {
    const { booking, waitlistEntry } = findTicketRecord(code);

    if (booking) {
      const state = getBookingTicketState(booking);
      const isDuplicateCheckIn = state === "Checked In";

      setTicketValidationResult({
        booking,
        message: isDuplicateCheckIn
          ? "Already checked in. Duplicate check-in blocked."
          : state === "Cancelled"
            ? "Ticket is cancelled and cannot be checked in."
            : state === "Pending Payment"
            ? "Ticket found, but payment is still pending."
              : "Ticket is valid for check-in.",
        state,
      });
      void createTicketValidation({
        booking,
        code,
        deviceLabel: isScannerOpen ? "QR Scanner" : "Manual Validation",
        notes: isDuplicateCheckIn
          ? "Duplicate scan blocked."
          : state === "Active"
            ? "Ticket scanned and accepted for check-in."
            : `Ticket scan rejected: ${state}.`,
        result: createValidationResultForState(state),
      });
      return;
    }

    if (waitlistEntry) {
      setTicketValidationResult({
        message:
          "This code belongs to a waitlist entry and is not a confirmed admission ticket.",
        state: "Waitlist",
        waitlistEntry,
      });
      void createTicketValidation({
        code,
        deviceLabel: isScannerOpen ? "QR Scanner" : "Manual Validation",
        notes: "Waitlist ticket rejected at entrance validation.",
        result: "invalid",
      });
      return;
    }

    setTicketValidationResult({
      message: "No booking or waitlist ticket matches this code.",
      state: "Invalid",
    });
    void createTicketValidation({
      code,
      deviceLabel: isScannerOpen ? "QR Scanner" : "Manual Validation",
      notes: "Invalid ticket code scanned.",
      result: "invalid",
    });
  }

  function validateTicketCode() {
    validateTicketCodeValue(ticketValidationInput);
  }

  useEffect(() => {
    if (!isScannerOpen || !canCheckInGuests) {
      return;
    }

    let isActive = true;
    let scanTimer = 0;
    let stream: MediaStream | null = null;
    let videoElement: HTMLVideoElement | null = null;
    let lastCode = "";

    async function startCameraScanner() {
      try {
        setScannerCameraError("");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
          },
        });

        videoElement = scannerVideoRef.current;

        if (!isActive || !videoElement) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        videoElement.srcObject = stream;
        await videoElement.play();

        const BarcodeDetectorConstructor = (
          window as typeof window & {
            BarcodeDetector?: new (options?: {
              formats?: string[];
            }) => {
              detect: (
                source: HTMLVideoElement,
              ) => Promise<Array<{ rawValue?: string }>>;
            };
          }
        ).BarcodeDetector;

        if (!BarcodeDetectorConstructor) {
          setScannerCameraError(
            "Camera opened. This browser does not support automatic QR detection yet, so enter the code below.",
          );
          return;
        }

        const detector = new BarcodeDetectorConstructor({
          formats: ["qr_code"],
        });

        async function scanFrame() {
          if (!isActive || !videoElement) {
            return;
          }

          try {
            const codes = await detector.detect(videoElement);
            const nextCode = codes[0]?.rawValue?.trim();

            if (nextCode && nextCode !== lastCode) {
              lastCode = nextCode;
              setTicketValidationInput(nextCode);
              validateTicketCodeValue(nextCode);
            }
          } catch {
            // Some browsers throw while video metadata is settling.
          }

          scanTimer = window.setTimeout(scanFrame, 450);
        }

        scanFrame();
      } catch {
        setScannerCameraError(
          "Camera access was blocked or unavailable. Enter the ticket code manually below.",
        );
      }
    }

    startCameraScanner();

    return () => {
      isActive = false;
      window.clearTimeout(scanTimer);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoElement) {
        videoElement.srcObject = null;
      }
    };
    // validateTicketCodeValue reads live booking state; scanner restarts only on open/permission changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCheckInGuests, isScannerOpen]);

  function checkInValidatedTicket() {
    const booking = ticketValidationResult?.booking;

    if (!booking || !canCheckInGuests) {
      return;
    }

    const freshBooking =
      bookings.find(
        (currentBooking) =>
          currentBooking.reference === booking.reference,
      ) ?? booking;
    const freshState = getBookingTicketState(freshBooking);

    if (freshState !== "Active") {
      setTicketValidationResult({
        booking: freshBooking,
        message:
          freshState === "Checked In"
            ? "Already checked in. Duplicate check-in blocked."
            : freshState === "Cancelled"
              ? "Ticket is cancelled and cannot be checked in."
              : freshState === "Pending Payment"
                ? "Ticket found, but payment is still pending."
                : "Ticket is no longer active for check-in.",
        state: freshState,
      });
      return;
    }

    const arrivalTime = new Date().toISOString();
    const checkedInBooking = {
      ...freshBooking,
      arrivalTime,
      lifecycleHistory: [
        createLifecycleEvent(freshBooking, "checked-in", "Guest arrived"),
        ...(freshBooking.lifecycleHistory ?? []),
      ],
      status: "checked-in" as const,
    };
    const checkInRecord = createWorkflowCommunication(
      checkedInBooking,
      "check-in-confirmation",
      "email",
    );

    saveBookings(
      bookings.map((currentBooking) =>
        currentBooking.reference === freshBooking.reference
          ? {
              ...currentBooking,
              arrivalTime,
              communicationHistory: [
                checkInRecord,
                ...(currentBooking.communicationHistory ?? []),
              ],
              lifecycleHistory: checkedInBooking.lifecycleHistory,
              status: "checked-in",
            }
          : currentBooking,
      ),
    );
    void createTicketValidation({
      booking: checkedInBooking,
      code: ticketValidationInput,
      deviceLabel: "Entrance Check-In",
      notes: "Ticket accepted and guest checked in.",
      result: "checked_in",
    });
    void sendZingaraBrowserNotification("check-in-confirmed");
    void sendZingaraStaffPushNotification("guest-checked-in", {
      bookingReference: freshBooking.reference,
    });
    setTicketValidationResult({
      booking: checkedInBooking,
      message: "Guest checked in. Duplicate scans will now be blocked.",
      state: "Checked In",
    });
  }

  function overrideCheckInValidatedTicket() {
    const booking = ticketValidationResult?.booking;

    if (!booking || !canManageBookings) {
      return;
    }

    const freshBooking =
      bookings.find(
        (currentBooking) =>
          currentBooking.reference === booking.reference,
      ) ?? booking;

    if ((freshBooking.status ?? "confirmed") === "cancelled") {
      setTicketValidationResult({
        booking: freshBooking,
        message: "Manager override blocked: this booking is cancelled.",
        state: "Cancelled",
      });
      return;
    }

    const arrivalTime = new Date().toISOString();
    const checkedInBooking = {
      ...freshBooking,
      arrivalTime,
      lifecycleHistory: [
        createLifecycleEvent(
          freshBooking,
          "checked-in",
          "Manager override check-in",
        ),
        ...(freshBooking.lifecycleHistory ?? []),
      ],
      status: "checked-in" as const,
    };
    const checkInRecord = createWorkflowCommunication(
      checkedInBooking,
      "check-in-confirmation",
      "email",
    );

    saveBookings(
      bookings.map((currentBooking) =>
        currentBooking.reference === freshBooking.reference
          ? {
              ...currentBooking,
              arrivalTime,
              communicationHistory: [
                checkInRecord,
                ...(currentBooking.communicationHistory ?? []),
              ],
              lifecycleHistory: checkedInBooking.lifecycleHistory,
              status: "checked-in",
            }
          : currentBooking,
      ),
    );
    void createTicketValidation({
      booking: checkedInBooking,
      code: ticketValidationInput,
      deviceLabel: "Manager Override",
      notes: "Manager override check-in recorded.",
      result: "checked_in",
    });
    void sendZingaraBrowserNotification("check-in-confirmed");
    void sendZingaraStaffPushNotification("guest-checked-in", {
      bookingReference: freshBooking.reference,
    });
    setTicketValidationResult({
      booking: checkedInBooking,
      message: "Manager override check-in recorded.",
      state: "Checked In",
    });
  }

  function moveBooking(
    booking: DemoBooking,
    nextTableId: string,
  ) {
    if (!canManageBookings) {
      return;
    }

    const setCompatibilityWarning = (message: string) => {
      setTableCompatibilityWarnings((currentWarnings) => ({
        ...currentWarnings,
        [booking.reference]: message,
      }));
    };
    const nextTable = tables.find(
      (table) => table.id === nextTableId,
    );
    const nextZone = nextTable
      ? getZoneById(nextTable.zoneId)
      : undefined;

    if (!nextTable || !nextZone) {
      setCompatibilityWarning(
        "Select a live table before moving this booking.",
      );
      return;
    }

    if (nextTable.seatCapacity < booking.partySize) {
      setCompatibilityWarning(
        `${nextTable.tableNumber} only seats ${nextTable.seatCapacity}; this booking needs ${booking.partySize}.`,
      );
      return;
    }

    if (nextTable.status === "disabled") {
      setCompatibilityWarning(
        `${nextTable.tableNumber} is blocked and cannot accept bookings.`,
      );
      return;
    }

    if (
      nextTable.status === "booked" &&
      nextTable.id !== booking.tableId &&
      nextTable.bookingReference !== booking.reference
    ) {
      setCompatibilityWarning(
        `${nextTable.tableNumber} is already reserved for another booking.`,
      );
      return;
    }

    if (nextTable.id === booking.tableId) {
      setTableCompatibilityWarnings((currentWarnings) => {
        const nextWarnings = { ...currentWarnings };
        delete nextWarnings[booking.reference];
        return nextWarnings;
      });
      return;
    }

    const releasedTables = releaseBookingTableFromList(tables, booking);

    saveTables(
      releasedTables.map((table) => {
        if (
          table.id === booking.tableId &&
          table.bookingReference === booking.reference
        ) {
          return {
            ...table,
            status: "available" as const,
            bookingReference: undefined,
            guestNotes: "",
          };
        }

        if (table.id === nextTable.id) {
          return {
            ...table,
            status: "booked" as const,
            bookingReference: booking.reference,
            guestNotes: booking.customer.name,
          };
        }

        return table;
      }),
    );
    const movedBooking = {
      ...booking,
      status:
        booking.status === "cancelled"
          ? ("confirmed" as const)
          : booking.status,
      tableId: nextTable.id,
      tableNumber: nextTable.tableNumber,
      zoneId: nextZone.id,
      zoneTitle: nextZone.title,
    };
    const tableChangeRecord = createWorkflowCommunication(
      movedBooking,
      "table-change",
      "email",
      {
        updateSummary: `Moved from ${booking.zoneTitle}, table ${booking.tableNumber} to ${nextZone.title}, table ${nextTable.tableNumber}.`,
      },
    );

    saveBookings(
      bookings.map((currentBooking) =>
        currentBooking.reference === booking.reference
          ? {
              ...movedBooking,
              communicationHistory: [
                tableChangeRecord,
                ...(currentBooking.communicationHistory ?? []),
              ],
            }
          : currentBooking,
      ),
    );
    void sendZingaraBrowserNotification("booking-updated");
    setTableCompatibilityWarnings((currentWarnings) => {
      const nextWarnings = { ...currentWarnings };
      delete nextWarnings[booking.reference];
      return nextWarnings;
    });
  }

  function sendTicket(
    booking: DemoBooking,
    channel: CommunicationChannel,
  ) {
    sendWorkflowCommunication(booking, "ticket-resend", channel, {
      message: `${communicationChannelLabels[channel]} ticket sent to ${
        channel === "email"
          ? booking.customer.email
          : channel === "sms"
            ? booking.customer.phone
            : "registered app devices"
      } · Live ticket ${getTicketUrl(booking.reference)}`,
      updateSummary: `Ticket resent by ${currentStaff?.name ?? "staff"}.`,
    });
  }

  function resendConfirmation(booking: DemoBooking) {
    sendWorkflowCommunication(
      booking,
      "confirmation-resend",
      "email",
      {
        updateSummary: `Confirmation resent by ${currentStaff?.name ?? "staff"}.`,
      },
    );
  }

  function sendCustomGuestMessage(booking: DemoBooking) {
    const form = customMessageForms[booking.reference];
    const message = form?.message.trim();

    if (!canManageCommunications || !message) {
      return;
    }

    sendWorkflowCommunication(
      booking,
      "custom-message",
      form.channel,
      {
        message,
        subject: form.subject.trim() || "Zingara guest message",
        updateSummary: message,
      },
    );
    setCustomMessageForms((currentForms) => ({
      ...currentForms,
      [booking.reference]: {
        channel: form.channel,
        message: "",
        subject: "",
      },
    }));
  }

  function showWorkflowToast(message: string) {
    setWorkflowToast(message);
    if (workflowToastTimerRef.current) {
      window.clearTimeout(workflowToastTimerRef.current);
    }
    workflowToastTimerRef.current = window.setTimeout(() => {
      setWorkflowToast("");
    }, 2800);
  }

  function sendShowReminder() {
    if (!canManageCommunications) {
      return;
    }

    const activeBookings = workflowShowBookings.filter(
      (booking) =>
        isOccupyingBookingStatus(booking.status ?? "confirmed") &&
        (booking.status ?? "confirmed") !== "checked-in",
    );

    if (activeBookings.length === 0) {
      setWorkflowStatus(
        "No active guests are available for reminders on this show.",
      );
      return;
    }

    saveBookings(
      activeBookings.reduce(
        (nextBookings, booking) =>
          appendCommunicationToBookings(
            nextBookings,
            booking.reference,
            (currentBooking) =>
              createWorkflowCommunication(
                currentBooking,
                "show-reminder",
                "email",
              ),
          ),
        bookings,
      ),
    );
    setWorkflowStatus(
      `Show reminders sent to ${activeBookings.length} booking${activeBookings.length === 1 ? "" : "s"}.`,
    );
    void sendZingaraBrowserNotification("booking-updated", {
      body: "Show reminders have been sent successfully.",
    });
  }

  function sendSelectedTemplateCommunication() {
    if (!canManageCommunications || !selectedCommunicationTemplate) {
      return;
    }

    const activeBookings = workflowShowBookings.filter((booking) =>
      isOccupyingBookingStatus(booking.status ?? "confirmed"),
    );

    if (activeBookings.length === 0) {
      setWorkflowStatus(
        "No active bookings are available for this communication.",
      );
      return;
    }

    saveBookings(
      activeBookings.reduce(
        (nextBookings, booking) =>
          appendCommunicationToBookings(
            nextBookings,
            booking.reference,
            (currentBooking) =>
              createTemplateCommunication(
                currentBooking,
                selectedCommunicationTemplate,
              ),
          ),
        bookings,
      ),
    );
    setWorkflowStatus(
      `Communication sent successfully to ${activeBookings.length} booking${activeBookings.length === 1 ? "" : "s"}.`,
    );
    showWorkflowToast("Communication sent successfully.");
    void sendZingaraBrowserNotification("booking-updated", {
      body: "Communication sent successfully.",
    });
  }

  function broadcastOperationalUpdate() {
    const message = broadcastForm.message.trim();

    if (!canManageCommunications || !message) {
      return;
    }

    const showBookings = workflowShowBookings.filter(
      (booking) =>
        isOccupyingBookingStatus(booking.status ?? "confirmed"),
    );

    if (showBookings.length === 0) {
      setWorkflowStatus(
        "No active bookings are available for this broadcast.",
      );
      return;
    }

    saveBookings(
      showBookings.reduce(
        (nextBookings, booking) =>
          appendCommunicationToBookings(
            nextBookings,
            booking.reference,
            (currentBooking) =>
              createWorkflowCommunication(
                currentBooking,
                "operational-broadcast",
                broadcastForm.channel,
                {
                  message,
                  subject:
                    broadcastForm.subject.trim() ||
                    "Zingara operational update",
                  updateSummary: message,
                },
              ),
          ),
        bookings,
      ),
    );
    setBroadcastForm((currentForm) => ({
      ...currentForm,
      message: "",
      subject: "",
    }));
    setWorkflowStatus(
      `Operational update sent to ${showBookings.length} booking${showBookings.length === 1 ? "" : "s"}.`,
    );
    showWorkflowToast("Broadcast sent successfully.");
    void sendZingaraBrowserNotification("booking-updated", {
      body: "Operational update sent successfully.",
    });
    void sendZingaraStaffPushNotification("operational-broadcast-sent");
  }

  async function sendTestBrowserNotification() {
    const diagnostics = getBrowserNotificationDiagnostics();

    console.info(
      "[Zingara push] Test button tapped. Diagnostics:",
      diagnostics,
    );
    setNotificationTestStatus("Requesting browser permission...");

    const registrationResult = await registerZingaraPushSubscription();

    setNotificationPermission(getBrowserNotificationStatusLabel());

    if (!registrationResult.ok) {
      setNotificationTestStatus(
        registrationResult.reason ??
          (registrationResult.permission === "denied"
            ? "Notifications are blocked for this browser. Enable them in browser or PWA settings."
            : "Notification permission was not granted yet."),
      );
      return;
    }

    setNotificationTestStatus("Push subscription saved. Sending notification...");

    const result = await sendZingaraPushTestNotification();

    if (result.ok) {
      setNotificationTestStatus(
        `Test notification sent to ${result.sent ?? 1} subscription${(result.sent ?? 1) === 1 ? "" : "s"}.`,
      );
      return;
    }

    setNotificationTestStatus(
      "Push subscription was saved, but the test notification could not be delivered.",
    );
  }

  function findWaitlistConversionTable(entry: DemoWaitlistEntry) {
    const eligibleZones = entry.desiredZoneId
      ? seatingZones.filter((zone) => zone.id === entry.desiredZoneId)
      : seatingZones;

    for (const zone of eligibleZones) {
      const canSeatParty =
        entry.partySize >= zone.minGuests &&
        entry.partySize <= zone.maxGuests;
      const allocation = canSeatParty
        ? findBestTableAllocation(
            tables,
            entry.showId,
            zone.id,
            entry.partySize,
          )
        : undefined;

      if (allocation) {
        return {
          allocation,
          table: allocation.table,
          zone,
        };
      }
    }

    return null;
  }

  function updateWaitlistEntry(
    entryId: string,
    updates: Partial<DemoWaitlistEntry>,
  ) {
    if (!canManageWaitlist) {
      return;
    }

    saveWaitlist(
      waitlist.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              ...updates,
            }
          : entry,
      ),
    );
  }

  function promoteWaitlistEntry(entry: DemoWaitlistEntry) {
    if (!canManageWaitlist || entry.status !== "waiting") {
      return;
    }

    const promotionRecord =
      createWaitlistPromotionCommunication(entry);

    updateWaitlistEntry(entry.id, {
      communicationHistory: [
        promotionRecord,
        ...(entry.communicationHistory ?? []),
      ],
      promotedAt: new Date().toISOString(),
      status: "promoted",
    });
    void sendZingaraStaffPushNotification("waitlist-promotion", {
      waitlistId: entry.id,
    });
    void sendZingaraGuestPushNotification("waitlist-promoted", {
      bookingReference: entry.id,
    });
  }

  function removeWaitlistEntry(entry: DemoWaitlistEntry) {
    if (
      !canManageWaitlist ||
      entry.status === "converted" ||
      entry.status === "removed"
    ) {
      return;
    }

    updateWaitlistEntry(entry.id, {
      status: "removed",
    });
  }

  function convertWaitlistEntry(entry: DemoWaitlistEntry) {
    if (
      !canManageWaitlist ||
      entry.status === "converted" ||
      entry.status === "removed"
    ) {
      return;
    }

    const allocation = findWaitlistConversionTable(entry);

    if (!allocation) {
      return;
    }

    const bookingReference = createBookingReference();
    const show = shows.find((demoShow) => demoShow.id === entry.showId);
    const subtotalPrice = allocation.zone.price * entry.partySize;
    const now = new Date().toISOString();
    const booking: DemoBooking = {
      reference: bookingReference,
      showId: entry.showId,
      zoneId: allocation.zone.id,
      zoneTitle: allocation.zone.title,
      tableId: allocation.table.id,
      tableNumber: allocation.table.tableNumber,
      partySize: entry.partySize,
      bookingDate: getShowLabel(show),
      addons: [],
      addonsTotal: 0,
      subtotalPrice,
      discountAmount: 0,
      totalPrice: subtotalPrice,
      pricePerPerson: allocation.zone.price,
      paymentOption: "deposit",
      paymentStatus: "pending-payment",
      depositPercentage: 0,
      amountPaid: 0,
      balanceDue: subtotalPrice,
      source: "waitlist",
      ticketCode: createTicketCode(bookingReference),
      ticketIssuedAt: now,
      customer: entry.customer,
      status: "pending-payment",
      lifecycleHistory: [
        {
          id: `${bookingReference}-created`,
          toStatus: "waitlisted",
          note: "Created from waitlist",
          createdAt: now,
        },
        {
          id: `${bookingReference}-pending-payment`,
          fromStatus: "waitlisted",
          toStatus: "pending-payment",
          note: "Converted from waitlist and awaiting payment",
          createdAt: now,
        },
      ],
      operationalNotes:
        entry.notes || "Converted from waitlist into booking.",
      cancellationReason: "",
      refundNotes: "",
      communicationHistory: [],
      createdAt: now,
    };
    const confirmationRecord = createWorkflowCommunication(
      booking,
      "booking-confirmation",
      "email",
      {
        updateSummary:
          "Converted from waitlist and assigned an available table.",
      },
    );
    const paymentRecord = createWorkflowCommunication(
      booking,
      "payment-confirmation",
      "email",
    );

    saveBookings([
      {
        ...booking,
        communicationHistory: [confirmationRecord, paymentRecord],
      },
      ...bookings,
    ]);
    saveTables(
      applyTableAllocation(
        tables,
        allocation.allocation,
        bookingReference,
        entry.notes ||
          `Converted from waitlist for ${entry.customer.name}`,
      ),
    );
    saveWaitlist(
      waitlist.map((waitlistEntry) =>
        waitlistEntry.id === entry.id
          ? {
              ...waitlistEntry,
              bookingReference,
              convertedAt: now,
              promotedAt: waitlistEntry.promotedAt ?? now,
              status: "converted",
            }
          : waitlistEntry,
      ),
    );
  }

  function openCustomerProfile(customer: {
    email?: string;
    name?: string;
    phone?: string;
  }) {
    const customerKey = getCustomerKey(customer);
    const matchedProfile = customerProfiles.find(
      (profile) => profile.key === customerKey,
    );

    console.log("[Zingara CRM] Open Profile clicked", {
      customer,
      customerKey,
    });
    console.log("[Zingara CRM] customer found", {
      found: Boolean(matchedProfile),
      profile: matchedProfile?.customer.name,
    });

    setCustomerSearch("");
    setSelectedCustomerKey(customerKey);
    setActiveAdminTab("customers");

    console.log("[Zingara CRM] profile loaded", {
      customerKey,
    });
  }

  function updateCustomerCrmRecord(
    customerKey: string,
    updates: Partial<Pick<DemoCustomerCrmRecord, "notes" | "vipTags">>,
  ) {
    if (!canManageBookings) {
      return;
    }

    const existingRecord = customerCrmRecords.find(
      (record) => record.customerKey === customerKey,
    );
    const nextRecord: DemoCustomerCrmRecord = {
      customerKey,
      notes: updates.notes ?? existingRecord?.notes ?? "",
      vipTags: updates.vipTags ?? existingRecord?.vipTags ?? [],
      updatedAt: new Date().toISOString(),
    };

    saveCustomerCrmRecords(
      existingRecord
        ? customerCrmRecords.map((record) =>
            record.customerKey === customerKey ? nextRecord : record,
          )
        : [...customerCrmRecords, nextRecord],
    );
  }

  function toggleCustomerVipTag(
    profile: CustomerProfile,
    tag: string,
  ) {
    const nextTags = profile.vipTags.includes(tag)
      ? profile.vipTags.filter((currentTag) => currentTag !== tag)
      : [...profile.vipTags, tag];

    updateCustomerCrmRecord(profile.key, {
      vipTags: nextTags,
    });
  }

  function getBookingSearchText(booking: DemoBooking) {
    const status = booking.status ?? "confirmed";
    const paymentStatus = getBookingPaymentStatus(booking);
    const show = getBookingShow(booking);
    const corporateCompanyName = getCorporateBookingCompanyName(booking);

    return [
      booking.reference,
      corporateCompanyName,
      booking.customer.name,
      booking.customer.phone,
      booking.customer.email,
      booking.tableNumber,
      booking.tableId,
      booking.zoneTitle,
      booking.zoneId,
      getShowLabel(show),
      show?.label,
      booking.bookingDate,
      status,
      bookingStatusLabels[status],
      paymentStatus,
      paymentStatusLabels[paymentStatus],
      `${booking.partySize}`,
      `${booking.partySize} guest`,
      `${booking.partySize} guests`,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function getCorporateBookingCompanyName(booking: DemoBooking) {
    if (booking.source !== "corporate-direct") {
      return "";
    }

    const linkedRequest = corporateRequests.find(
      (request) =>
        request.linkedBookingReference === booking.reference,
    );

    if (linkedRequest?.companyName) {
      return linkedRequest.companyName;
    }

    const companyNote = (booking.operationalNotes ?? "")
      .split("\n")
      .find((line) => line.toLowerCase().startsWith("company:"));

    return companyNote?.replace(/^company:\s*/i, "").trim() ?? "";
  }

  const filteredBookings = bookings.filter((booking) => {
    const searchTerm = bookingSearch.trim().toLowerCase();

    if (
      bookingShowFilter !== "all" &&
      booking.showId !== bookingShowFilter
    ) {
      return false;
    }

    if (bookingDateFilter !== "all") {
      const bookingShow = shows.find(
        (show) => show.id === booking.showId,
      );

      if (bookingShow?.date !== bookingDateFilter) {
        return false;
      }
    }

    if (
      hideCancelledBookings &&
      (booking.status ?? "confirmed") === "cancelled"
    ) {
      return false;
    }

    if (
      bookingSourceFilter !== "all" &&
      (booking.source ?? "online") !== bookingSourceFilter
    ) {
      return false;
    }

    if (!searchTerm) {
      return true;
    }

    return getBookingSearchText(booking).includes(searchTerm);
  });
  const bookingPageCount = Math.max(
    1,
    Math.ceil(filteredBookings.length / bookingPageSize),
  );
  const safeBookingPage = Math.min(bookingPage, bookingPageCount);
  const paginatedBookings = filteredBookings.slice(
    (safeBookingPage - 1) * bookingPageSize,
    safeBookingPage * bookingPageSize,
  );
  const bookingFilterDates = Array.from(
    new Set(shows.map((show) => show.date).filter(Boolean)),
  ).sort();
  const bookingFilterDateSet = useMemo(
    () => new Set(bookingFilterDates),
    [bookingFilterDates],
  );
  const bookingCalendarAnchorDate =
    bookingDateFilter !== "all" && bookingFilterDateSet.has(bookingDateFilter)
      ? new Date(`${bookingDateFilter}T00:00:00`)
      : bookingFilterDates[0]
        ? new Date(`${bookingFilterDates[0]}T00:00:00`)
        : new Date();
  const bookingCalendarMonthStart = new Date(
    bookingCalendarAnchorDate.getFullYear(),
    bookingCalendarAnchorDate.getMonth(),
    1,
  );
  const bookingCalendarDaysInMonth = new Date(
    bookingCalendarMonthStart.getFullYear(),
    bookingCalendarMonthStart.getMonth() + 1,
    0,
  ).getDate();
  const bookingCalendarStartOffset = bookingCalendarMonthStart.getDay();
  const bookingCalendarCells = [
    ...Array.from({ length: bookingCalendarStartOffset }, () => null),
    ...Array.from(
      { length: bookingCalendarDaysInMonth },
      (_, index) => index + 1,
    ),
  ];
  const selectedShowBookings = bookings.filter(
    (booking) => booking.showId === selectedShowId,
  );
  const activeShowBookings = selectedShowBookings.filter(
    (booking) => (booking.status ?? "confirmed") !== "cancelled",
  );
  const checkedInBookings = activeShowBookings.filter(
    (booking) => (booking.status ?? "confirmed") === "checked-in",
  );
  const reservedGuests = activeShowBookings.reduce(
    (total, booking) => total + booking.partySize,
    0,
  );
  const arrivedGuests = checkedInBookings.reduce(
    (total, booking) => total + booking.partySize,
    0,
  );
  const selectedShowCapacity = seatingZones.reduce(
    (total, zone) =>
      total +
      getZoneStats(tables, selectedShowId, zone).totalCapacity,
    0,
  );
  const occupancyPercent =
    selectedShowCapacity > 0
      ? Math.round((arrivedGuests / selectedShowCapacity) * 100)
      : 0;
  const remainingSeats = Math.max(
    selectedShowCapacity - reservedGuests,
    0,
  );
  const remainingCheckIns = Math.max(reservedGuests - arrivedGuests, 0);
  const selectedShowBlockedTables = tables.filter(
    (table) =>
      table.showId === selectedShowId && table.status === "disabled",
  ).length;
  const selectedShowPaymentIssues = activeShowBookings.filter(
    (booking) => getBookingFinancials(booking).balanceDue > 0,
  ).length;
  const selectedShowNoShows = selectedShowBookings.filter(
    (booking) => (booking.status ?? "confirmed") === "no-show",
  ).length;
  const selectedShowVipBookings = activeShowBookings.filter((booking) =>
    (booking.customer.name + " " + (booking.operationalNotes ?? ""))
      .toLowerCase()
      .includes("vip"),
  ).length;
  const staffSearchTerm = staffSearch.trim().toLowerCase();
  const staffBookings = selectedShowBookings.filter((booking) => {
    const status = booking.status ?? "confirmed";

    if (hideCancelledConcierge && status === "cancelled") {
      return false;
    }

    if (
      conciergeStatusFilter !== "all" &&
      status !== conciergeStatusFilter
    ) {
      return false;
    }

    if (!staffSearchTerm) {
      return true;
    }

    return (
      booking.reference.toLowerCase().includes(staffSearchTerm) ||
      booking.customer.name
        .toLowerCase()
        .includes(staffSearchTerm) ||
      booking.tableNumber.toLowerCase().includes(staffSearchTerm)
    );
  });
  const selectedShow = shows.find(
    (show) => show.id === selectedShowId,
  );
  const workflowShows = shows.filter(
    (show) => {
      const status = show.operationalStatus ?? "active";

      return (
        !show.archivedAt &&
        status !== "inactive" &&
        status !== "blackout" &&
        status !== "venue-closure"
      );
    },
  );
  const workflowShow =
    workflowShows.find((show) => show.id === workflowShowId) ??
    workflowShows[0] ??
    selectedShow;
  const workflowShowBookings = workflowShow
    ? bookings.filter((booking) => booking.showId === workflowShow.id)
    : [];
  const activeWorkflowBookings = workflowShowBookings.filter((booking) =>
    isOccupyingBookingStatus(booking.status ?? "confirmed"),
  );
  const editingShow = shows.find((show) => show.id === editingShowId);
  const editingShowLinkedBookings = editingShow
    ? bookings.filter((booking) => booking.showId === editingShow.id)
        .length
    : 0;
  const floorFilterDates = Array.from(
    new Set(shows.map((show) => show.date).filter(Boolean)),
  ).sort();
  const floorDateSet = useMemo(
    () => new Set(floorFilterDates),
    [floorFilterDates],
  );
  const floorCalendarAnchorDate =
    selectedShow && floorDateSet.has(selectedShow.date)
      ? new Date(`${selectedShow.date}T00:00:00`)
      : floorFilterDates[0]
        ? new Date(`${floorFilterDates[0]}T00:00:00`)
        : new Date();
  const floorCalendarMonthStart = new Date(
    floorCalendarAnchorDate.getFullYear(),
    floorCalendarAnchorDate.getMonth(),
    1,
  );
  const floorCalendarDaysInMonth = new Date(
    floorCalendarMonthStart.getFullYear(),
    floorCalendarMonthStart.getMonth() + 1,
    0,
  ).getDate();
  const floorCalendarStartOffset = floorCalendarMonthStart.getDay();
  const floorCalendarCells = [
    ...Array.from({ length: floorCalendarStartOffset }, () => null),
    ...Array.from(
      { length: floorCalendarDaysInMonth },
      (_, index) => index + 1,
    ),
  ];
  const selectedShowDateLabel = selectedShow
    ? formatOperationalShowDate(selectedShow.date)
    : "No date selected";
  const selectedShowOverrideCount = tables.filter(
    (table) => table.showId === selectedShowId && table.showOverride,
  ).length;
  const selectedShowMergedCount = tables.filter(
    (table) =>
      table.showId === selectedShowId && table.mergedFrom?.length,
  ).length;
  const selectedShowWaitlist = hasHydrated
    ? waitlist.filter((entry) => entry.showId === selectedShowId)
    : [];
  const activeWaitlistCount = selectedShowWaitlist.filter(
    (entry) => entry.status === "waiting" || entry.status === "promoted",
  ).length;
  const operationalAlerts = [
    {
      label: "Blocked tables",
      value: selectedShowBlockedTables,
    },
    {
      label: "Merged tables",
      value: selectedShowMergedCount,
    },
    {
      label: "Overdue arrivals",
      value: remainingCheckIns,
    },
    {
      label: "Payment issues",
      value: selectedShowPaymentIssues,
    },
    {
      label: "VIP arrivals",
      value: selectedShowVipBookings,
    },
  ];
  const selectedShowFinancials = activeShowBookings.reduce(
    (report, booking) => {
      const financials = getBookingFinancials(booking);

      return {
        depositsOutstanding:
          report.depositsOutstanding + financials.balanceDue,
        refundsToday:
          report.refundsToday +
          (booking.paymentStatus === "refunded"
            ? financials.amountPaid
            : 0),
        revenue: report.revenue + financials.amountPaid,
      };
    },
    {
      depositsOutstanding: 0,
      refundsToday: 0,
      revenue: 0,
    },
  );
  const visibleDashboardWidgets = dashboardWidgetOrder.filter(
    (widgetId) => !hiddenDashboardWidgets.includes(widgetId),
  );
  const hiddenDashboardWidgetLabels = hiddenDashboardWidgets.map(
    (widgetId) => ({
      id: widgetId,
      label: dashboardWidgetLabels[widgetId],
    }),
  );
  const waitlistSearchTerm = waitlistSearch.trim().toLowerCase();
  const filteredWaitlist = selectedShowWaitlist.filter((entry) => {
    if (!waitlistSearchTerm) {
      return true;
    }

    return (
      entry.id.toLowerCase().includes(waitlistSearchTerm) ||
      entry.customer.name
        .toLowerCase()
        .includes(waitlistSearchTerm) ||
      entry.customer.email
        .toLowerCase()
        .includes(waitlistSearchTerm) ||
      entry.customer.phone
        .toLowerCase()
        .includes(waitlistSearchTerm) ||
      (entry.desiredZoneTitle ?? "")
        .toLowerCase()
        .includes(waitlistSearchTerm) ||
      waitlistStatusLabels[entry.status]
        .toLowerCase()
        .includes(waitlistSearchTerm)
    );
  });
  const waitlistReport = selectedShowWaitlist.reduce(
    (report, entry) => {
      const status = waitlistStatusLabels[entry.status]
        ? entry.status
        : "waiting";

      return {
        ...report,
        [status]: report[status] + 1,
        activeGuests:
          status === "waiting" || status === "promoted"
            ? report.activeGuests + (entry.partySize ?? 0)
            : report.activeGuests,
      };
    },
    defaultWaitlistReport,
  );
  const selectedCommunicationTemplate =
    communicationTemplates.find(
      (template) => template.id === selectedTemplateId,
    ) ?? communicationTemplates[0];
  const templatePreviewBooking =
    activeWorkflowBookings[0] ?? workflowShowBookings[0] ?? bookings[0];
  const templatePreview =
    selectedCommunicationTemplate && templatePreviewBooking
      ? {
          body: renderCommunicationTemplate(
            selectedCommunicationTemplate.body,
            templatePreviewBooking,
            getBookingShow(templatePreviewBooking) ?? workflowShow,
          ),
          subject: renderCommunicationTemplate(
            selectedCommunicationTemplate.subject,
            templatePreviewBooking,
            getBookingShow(templatePreviewBooking) ?? workflowShow,
          ),
        }
      : null;
  const workflowCommunicationHistory = workflowShowBookings
    .flatMap((booking) =>
      (booking.communicationHistory ?? []).map((record) => {
        const template = communicationTemplates.find(
          (currentTemplate) => currentTemplate.id === record.templateId,
        );

        return {
          booking,
          record,
          showLabel: getShowLabel(
            shows.find(
              (show) => show.id === (record.showId ?? booking.showId),
            ) ?? workflowShow,
          ),
          templateName:
            template?.name ??
            (record.trigger
              ? communicationTriggerLabels[record.trigger]
              : "Guest Communication"),
        };
      }),
    )
    .sort(
      (left, right) =>
        new Date(right.record.sentAt).getTime() -
        new Date(left.record.sentAt).getTime(),
    );
  const allActiveBookings = bookings.filter(
    (booking) => (booking.status ?? "confirmed") !== "cancelled",
  );
  const allActiveGuests = allActiveBookings.reduce(
    (total, booking) => total + booking.partySize,
    0,
  );
  const allFinancialReport = allActiveBookings.reduce(
    (report, booking) => {
      const financials = getBookingFinancials(booking);

      return {
        addonsTotal: report.addonsTotal + financials.addonsTotal,
        discountAmount:
          report.discountAmount + financials.discountAmount,
        netSales: report.netSales + financials.totalPrice,
      };
    },
    {
      addonsTotal: 0,
      discountAmount: 0,
      netSales: 0,
    },
  );
  const averageSpendPerGuest =
    allActiveGuests > 0
      ? Math.round(allFinancialReport.netSales / allActiveGuests)
      : 0;
  const perShowAnalytics = shows.map((show) => {
    const showBookings = allActiveBookings.filter(
      (booking) => booking.showId === show.id,
    );
    const guests = showBookings.reduce(
      (total, booking) => total + booking.partySize,
      0,
    );
    const revenue = showBookings.reduce(
      (total, booking) =>
        total + getBookingFinancials(booking).totalPrice,
      0,
    );
    const capacity = seatingZones.reduce(
      (total, zone) =>
        total + getZoneStats(tables, show.id, zone).totalCapacity,
      0,
    );
    const occupancy =
      capacity > 0 ? Math.round((guests / capacity) * 100) : 0;

    return {
      averageSpend: guests > 0 ? Math.round(revenue / guests) : 0,
      capacity,
      guests,
      occupancy,
      revenue,
      show,
    };
  });
  const maxShowRevenue = Math.max(
    1,
    ...perShowAnalytics.map((show) => show.revenue),
  );
  const addonBreakdown = Object.values(
    allActiveBookings.reduce(
      (breakdown, booking) => {
        for (const addon of booking.addons ?? []) {
          const currentAddon = breakdown[addon.id] ?? {
            count: 0,
            name: addon.name,
            revenue: 0,
          };

          breakdown[addon.id] = {
            ...currentAddon,
            count: currentAddon.count + 1,
            revenue: currentAddon.revenue + addon.price,
          };
        }

        return breakdown;
      },
      {} as Record<
        string,
        { count: number; name: string; revenue: number }
      >,
    ),
  ).sort(
    (firstAddon, secondAddon) =>
      secondAddon.revenue - firstAddon.revenue,
  );
  const maxAddonRevenue = Math.max(
    1,
    ...addonBreakdown.map((addon) => addon.revenue),
  );
  const promoAnalytics = Object.values(
    allActiveBookings.reduce(
      (analytics, booking) => {
        if (!booking.promoCode) {
          return analytics;
        }

        const financials = getBookingFinancials(booking);
        const currentPromo = analytics[booking.promoCode] ?? {
          code: booking.promoCode,
          count: 0,
          discount: 0,
          label: booking.promoLabel ?? "Promo code",
        };

        analytics[booking.promoCode] = {
          ...currentPromo,
          count: currentPromo.count + 1,
          discount: currentPromo.discount + financials.discountAmount,
        };

        return analytics;
      },
      {} as Record<
        string,
        { code: string; count: number; discount: number; label: string }
      >,
    ),
  ).sort(
    (firstPromo, secondPromo) =>
      secondPromo.count - firstPromo.count,
  );
  const convertedWaitlistReferences = new Set(
    waitlist
      .filter((entry) => entry.status === "converted")
      .map((entry) => entry.bookingReference)
      .filter(Boolean),
  );
  const sourceSummaries = Object.values(
    allActiveBookings.reduce(
      (summaries, booking) => {
        const source =
          convertedWaitlistReferences.has(booking.reference)
            ? "waitlist"
            : booking.source ?? "online";
        const currentSource = summaries[source] ?? {
          count: 0,
          guests: 0,
          revenue: 0,
          source,
        };

        summaries[source] = {
          ...currentSource,
          count: currentSource.count + 1,
          guests: currentSource.guests + booking.partySize,
          revenue:
            currentSource.revenue +
            getBookingFinancials(booking).totalPrice,
        };

        return summaries;
      },
      {} as Record<
        BookingSource,
        {
          count: number;
          guests: number;
          revenue: number;
          source: BookingSource;
        }
      >,
    ),
  ).sort(
    (firstSource, secondSource) =>
      secondSource.revenue - firstSource.revenue,
  );
  const maxSourceRevenue = Math.max(
    1,
    ...sourceSummaries.map((source) => source.revenue),
  );
  const waitlistTotal = waitlist.length;
  const convertedWaitlistCount = waitlist.filter(
    (entry) => entry.status === "converted",
  ).length;
  const waitlistConversionRate =
    waitlistTotal > 0
      ? (convertedWaitlistCount / waitlistTotal) * 100
      : 0;
  const customerProfiles = Object.values(
    bookings.reduce(
      (profiles, booking) => {
        const customerKey = getCustomerKey(booking.customer);
        const existingProfile = profiles[customerKey] ?? {
          addOns: [],
          attendanceCount: 0,
          attendanceFrequency: 0,
          bookingHistory: [],
          communicationHistory: [],
          customer: booking.customer,
          favouriteZone: "No favourite yet",
          key: customerKey,
          notes: "",
          promoUsage: [],
          totalBookings: 0,
          totalSpend: 0,
          vipTags: [],
          waitlistEntries: [],
        };

        profiles[customerKey] = {
          ...existingProfile,
          bookingHistory: [...existingProfile.bookingHistory, booking],
          communicationHistory: [
            ...existingProfile.communicationHistory,
            ...(booking.communicationHistory ?? []).map((record) => ({
              ...record,
              bookingReference: booking.reference,
            })),
          ],
          customer: {
            email:
              existingProfile.customer.email || booking.customer.email,
            name: existingProfile.customer.name || booking.customer.name,
            phone:
              existingProfile.customer.phone || booking.customer.phone,
          },
        };

        return profiles;
      },
      {} as Record<string, CustomerProfile>,
    ),
  ).map((profile) => {
    const activeBookings = profile.bookingHistory.filter(
      (booking) => (booking.status ?? "confirmed") !== "cancelled",
    );
    const zoneCounts = activeBookings.reduce(
      (counts, booking) => ({
        ...counts,
        [booking.zoneTitle]: (counts[booking.zoneTitle] ?? 0) + 1,
      }),
      {} as Record<string, number>,
    );
    const addOns = Object.values(
      activeBookings.reduce(
        (addons, booking) => {
          for (const addon of booking.addons ?? []) {
            const existingAddon = addons[addon.id] ?? {
              count: 0,
              name: addon.name,
              revenue: 0,
            };

            addons[addon.id] = {
              ...existingAddon,
              count: existingAddon.count + 1,
              revenue: existingAddon.revenue + addon.price,
            };
          }

          return addons;
        },
        {} as Record<
          string,
          { count: number; name: string; revenue: number }
        >,
      ),
    ).sort((firstAddon, secondAddon) => secondAddon.count - firstAddon.count);
    const promoUsage = Object.values(
      activeBookings.reduce(
        (promos, booking) => {
          if (!booking.promoCode) {
            return promos;
          }

          const existingPromo = promos[booking.promoCode] ?? {
            code: booking.promoCode,
            count: 0,
            discount: 0,
          };

          promos[booking.promoCode] = {
            ...existingPromo,
            count: existingPromo.count + 1,
            discount:
              existingPromo.discount +
              getBookingFinancials(booking).discountAmount,
          };

          return promos;
        },
        {} as Record<
          string,
          { code: string; count: number; discount: number }
        >,
      ),
    );
    const crmRecord = customerCrmRecords.find(
      (record) => record.customerKey === profile.key,
    );
    const waitlistEntries = waitlist.filter(
      (entry) => getCustomerKey(entry.customer) === profile.key,
    );
    const waitlistCommunicationHistory = waitlistEntries.flatMap(
      (entry) =>
        (entry.communicationHistory ?? []).map((record) => ({
          ...record,
          bookingReference: entry.bookingReference ?? entry.id,
        })),
    );
    const attendanceCount = activeBookings.filter(
      (booking) => (booking.status ?? "confirmed") === "checked-in",
    ).length;
    const favouriteZone =
      Object.entries(zoneCounts).sort(
        (firstZone, secondZone) => secondZone[1] - firstZone[1],
      )[0]?.[0] ?? "No favourite yet";

    return {
      ...profile,
      addOns,
      attendanceCount,
      attendanceFrequency:
        activeBookings.length > 0
          ? Math.round((attendanceCount / activeBookings.length) * 100)
          : 0,
      bookingHistory: profile.bookingHistory.sort(
        (firstBooking, secondBooking) =>
          new Date(secondBooking.createdAt).getTime() -
          new Date(firstBooking.createdAt).getTime(),
      ),
      communicationHistory: [
        ...profile.communicationHistory,
        ...waitlistCommunicationHistory,
      ].sort(
        (firstRecord, secondRecord) =>
          new Date(secondRecord.sentAt).getTime() -
          new Date(firstRecord.sentAt).getTime(),
      ),
      favouriteZone,
      notes: crmRecord?.notes ?? "",
      promoUsage,
      totalBookings: activeBookings.length,
      totalSpend: activeBookings.reduce(
        (total, booking) =>
          total + getBookingFinancials(booking).totalPrice,
        0,
      ),
      vipTags: crmRecord?.vipTags ?? [],
      waitlistEntries,
    };
  }).sort(
    (firstProfile, secondProfile) =>
      secondProfile.totalSpend - firstProfile.totalSpend,
  );
  const customerSearchTerm = customerSearch.trim().toLowerCase();
  const filteredCustomerProfiles = customerProfiles.filter((profile) => {
    if (!customerSearchTerm) {
      return true;
    }

    return (
      profile.customer.name.toLowerCase().includes(customerSearchTerm) ||
      profile.customer.email.toLowerCase().includes(customerSearchTerm) ||
      profile.customer.phone.toLowerCase().includes(customerSearchTerm) ||
      profile.favouriteZone.toLowerCase().includes(customerSearchTerm) ||
      profile.vipTags.some((tag) =>
        tag.toLowerCase().includes(customerSearchTerm),
      )
    );
  });
  const selectedCustomerProfile =
    customerProfiles.find(
      (profile) => profile.key === selectedCustomerKey,
    ) ?? null;
  const topCustomerProfiles = customerProfiles.slice(0, 4);
  const activeCorporateBookingRequests = corporateRequests.filter(
    (request) =>
      !request.archivedAt && request.requestType === "corporate-booking",
  );
  const activeAgentContactRequests = corporateRequests.filter(
    (request) =>
      !request.archivedAt && request.requestType === "agent-contact",
  );
  const archivedCorporateRequests = corporateRequests.filter(
    (request) => Boolean(request.archivedAt),
  );
  const corporateSearchTerm = corporateSearch.trim().toLowerCase();
  const corporateMatchesSearch = (request: CorporateRequest) =>
    !corporateSearchTerm ||
    request.companyName.toLowerCase().includes(corporateSearchTerm) ||
    request.contactName.toLowerCase().includes(corporateSearchTerm) ||
    request.email.toLowerCase().includes(corporateSearchTerm) ||
    request.contactNumber.toLowerCase().includes(corporateSearchTerm);
  const corporateMatchesStatus = (request: CorporateRequest) =>
    corporateStatusFilter === "all" ||
    (corporateStatusFilter === "archived"
      ? Boolean(request.archivedAt)
      : request.status === corporateStatusFilter);
  const filteredActiveCorporateRequests = [
    ...activeCorporateBookingRequests,
    ...activeAgentContactRequests,
  ].filter(
    (request) =>
      corporateMatchesSearch(request) && corporateMatchesStatus(request),
  );
  const filteredArchivedCorporateRequests =
    archivedCorporateRequests.filter(
      (request) =>
        corporateMatchesSearch(request) &&
        (corporateStatusFilter === "all" ||
          corporateStatusFilter === "archived"),
    );
  const openCorporateRequest =
    corporateRequests.find(
      (request) => request.id === openCorporateRequestId,
    ) ?? null;

  function renderCorporateRequestCard(
    request: CorporateRequest,
    options: { isArchived?: boolean } = {},
  ) {
    const isGrid = corporateViewMode === "grid";

    return (
      <section
        key={request.id}
        className={`rounded-[1.5rem] border border-[#8D7A2F]/25 bg-zinc-950/95 shadow-xl shadow-black/15 transition hover:border-[#D8C36A]/45 ${
          isGrid ? "p-4" : "p-4 sm:p-5"
        }`}
      >
        <div
          className={`flex gap-3 ${
            isGrid
              ? "h-full flex-col"
              : "flex-col sm:flex-row sm:items-center sm:justify-between"
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex w-fit shrink-0 items-center rounded-full border px-2.5 py-1 text-[0.56rem] font-semibold uppercase leading-none tracking-[0.06em] ${corporateRequestStatusClasses[request.status]}`}
              >
                {corporateRequestStatusLabels[request.status]}
              </span>
              {options.isArchived && (
                <span className="inline-flex w-fit rounded-full border border-zinc-500/40 px-2.5 py-1 text-[0.56rem] font-semibold uppercase tracking-[0.06em] text-zinc-400">
                  Archived
                </span>
              )}
            </div>
            <h3 className="mt-3 truncate text-xl font-bold text-white sm:text-2xl">
              {request.companyName || "Unlisted Company"}
            </h3>
            <p className="mt-1 truncate text-sm font-semibold text-zinc-300">
              {request.contactName || "No contact name"}
            </p>
            <div className="mt-3 grid gap-2 text-sm text-zinc-400 sm:grid-cols-2">
              <p>
                <span className="text-zinc-500">Date</span> · {request.preferredDate || "Not supplied"}
              </p>
              <p>
                <span className="text-zinc-500">Guests</span> · {request.guestCount}
              </p>
              <p className="sm:col-span-2">
                <span className="text-zinc-500">Seating</span> · {request.seatingPreference || "Flexible"}
              </p>
              {request.linkedBookingReference && (
                <p className="sm:col-span-2">
                  <span className="text-zinc-500">Booking</span> ·{" "}
                  {request.linkedBookingReference}
                </p>
              )}
            </div>
          </div>

          <div
            className={`flex flex-wrap gap-2 ${
              isGrid ? "mt-auto" : "sm:justify-end"
            }`}
          >
            <button
              type="button"
              onClick={() => setOpenCorporateRequestId(request.id)}
              className="rounded-full border border-[#D8C36A]/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
            >
              Open Request
            </button>
            {!options.isArchived && (
              <button
                type="button"
                onClick={() => archiveCorporateRequest(request.id)}
                disabled={!canManageBookings}
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-zinc-300 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                Archive
              </button>
            )}
            {request.linkedBookingReference && (
              <button
                type="button"
                onClick={() =>
                  openConvertedCorporateBooking(
                    request.linkedBookingReference ?? "",
                  )
                }
                className="rounded-full border border-sky-300/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-sky-200 transition hover:bg-sky-300 hover:text-black"
              >
                Open Booking
              </button>
            )}
            <button
              type="button"
              onClick={() => openDeleteCorporateRequest(request.id)}
              disabled={!canManageBookings}
              className="rounded-full border border-red-300/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-red-200 transition hover:bg-red-300 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!currentStaff) {
    return (
      <main className="relative isolate z-10 flex min-h-screen items-center justify-center bg-black px-4 py-10 text-white sm:px-6 sm:py-16">
        <section className="relative z-10 w-full max-w-3xl rounded-[1.5rem] border border-[#8D7A2F]/40 bg-[radial-gradient(circle_at_top,#2A1A0D_0%,#101010_46%,#050505_100%)] p-5 shadow-2xl shadow-[#8D7A2F]/10 sm:rounded-[2rem] sm:p-8">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.28em] text-[#D8C36A]">
            Staff Access
          </p>
          <h1 className="text-3xl font-bold sm:text-5xl">
            Zingara Admin Login
          </h1>
          <p className="mt-3 text-zinc-400">
            Staff access for venue operations.
          </p>
          <div
            aria-label={venueConfig.brandTitle}
            className="mt-5 h-16 w-44 bg-contain bg-left bg-no-repeat sm:mt-6 sm:h-20 sm:w-56"
            style={{
              backgroundImage: `url("${venueConfig.logoUrl}")`,
            }}
          />

          <form
            onSubmit={login}
            className="mt-8 grid grid-cols-1 gap-4"
          >
            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Username
              </span>
              <input
                value={loginForm.username}
                onChange={(event) =>
                  setLoginForm((currentForm) => ({
                    ...currentForm,
                    username: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-zinc-700 bg-black px-4 py-3 text-base sm:px-5 sm:py-4 sm:text-lg"
              />
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Password
              </span>
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((currentForm) => ({
                    ...currentForm,
                    password: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-zinc-700 bg-black px-4 py-3 text-base sm:px-5 sm:py-4 sm:text-lg"
              />
            </label>

            {loginError && (
              <p className="rounded-2xl border border-red-400/30 bg-red-950/30 px-5 py-4 text-red-200">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              className="rounded-full bg-white px-6 py-3 text-base font-semibold text-black transition hover:bg-zinc-300 sm:px-8 sm:py-4 sm:text-lg"
            >
              Enter Dashboard
            </button>
          </form>

        </section>
      </main>
    );
  }

  return (
    <main className="relative isolate z-10 min-h-screen overflow-x-hidden bg-black px-3 py-8 text-white sm:px-6 sm:py-14 lg:py-16">
      {workflowToast && (
        <div
          className="fixed bottom-6 right-6 z-[160] rounded-full border border-emerald-300/35 bg-emerald-950/90 px-5 py-3 text-sm font-semibold text-emerald-100 shadow-2xl shadow-emerald-950/30 backdrop-blur"
          style={{ animation: "zingara-toast 2.8s ease both" }}
        >
          {workflowToast}
        </div>
      )}
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-5 border-b border-zinc-800 pb-6 lg:mb-12 lg:flex-row lg:items-end lg:justify-between lg:pb-8">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.28em] text-zinc-500">
              Admin
            </p>

            <h1 className="text-3xl font-bold sm:text-5xl">
              {venueConfig.brandTitle} Box Office Dashboard
            </h1>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch lg:shrink-0">
            {canCheckInGuests && (
              <button
                type="button"
                onClick={() => {
                  setIsScannerOpen(true);
                  setTicketValidationResult(null);
                  setTicketValidationInput("");
                }}
                className="rounded-2xl border border-emerald-300/45 bg-emerald-300 px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-black shadow-[0_0_34px_rgba(110,231,183,0.18)] transition hover:bg-emerald-200 sm:px-6 sm:py-4 sm:text-sm sm:tracking-[0.18em]"
              >
                Scan Tickets
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsNotificationCentreOpen(
                    (currentState) => !currentState,
                  );
                  void refreshStaffNotifications();
                }}
                className="relative h-full min-h-[4.5rem] rounded-2xl border border-[#D8C36A]/30 bg-zinc-950 px-5 py-3 text-left transition hover:border-[#D8C36A]/60 sm:py-4"
              >
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">
                  Notifications
                </span>
                <span className="mt-2 block text-sm font-semibold text-white">
                  {unreadNotificationCount} unread
                </span>
                {unreadNotificationCount > 0 && (
                  <span className="absolute right-3 top-3 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#D8C36A] px-1.5 text-[0.65rem] font-bold text-black">
                    {unreadNotificationCount}
                  </span>
                )}
              </button>

              {isNotificationCentreOpen && (
                <section className="absolute right-0 top-[calc(100%+0.75rem)] z-[120] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#D8C36A]/30 bg-zinc-950 text-white shadow-2xl shadow-black/60">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">
                        Notification Centre
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {staffNotifications.length} total
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void markAllNotificationsRead()}
                      disabled={unreadNotificationCount === 0}
                      className="rounded-full border border-white/15 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-zinc-300 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Mark All Read
                    </button>
                  </div>

                  <div className="max-h-96 overflow-y-auto p-3">
                    {staffNotifications.length === 0 ? (
                      <p className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-400">
                        No notifications yet.
                      </p>
                    ) : (
                      staffNotifications.map((notification) => {
                        const isUnread = !notification.readBy?.includes(
                          notificationCentreUserId ||
                            currentStaff?.id ||
                            "",
                        );

                        return (
                          <article
                            key={notification.id}
                            className={`mb-2 rounded-2xl border p-4 ${
                              isUnread
                                ? "border-[#D8C36A]/35 bg-[#D8C36A]/10"
                                : "border-white/10 bg-black/30"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="text-sm font-semibold text-white">
                                  {notification.title}
                                </h3>
                                <p className="mt-1 text-sm leading-5 text-zinc-300">
                                  {notification.message}
                                </p>
                                <p className="mt-2 text-xs text-zinc-500">
                                  {new Date(
                                    notification.createdAt,
                                  ).toLocaleString()}
                                </p>
                              </div>
                              {isUnread && (
                                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#D8C36A]" />
                              )}
                            </div>
                            {isUnread && (
                              <button
                                type="button"
                                onClick={() =>
                                  void markNotificationRead(notification.id)
                                }
                                className="mt-3 rounded-full border border-white/15 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-zinc-300 transition hover:bg-white hover:text-black"
                              >
                                Mark as Read
                              </button>
                            )}
                          </article>
                        );
                      })
                    )}
                  </div>
                </section>
              )}
            </div>

            <div className="rounded-2xl border border-[#D8C36A]/30 bg-zinc-950 px-4 py-3 sm:px-5 sm:py-4">
              <p className="text-sm font-semibold text-white">
                {currentStaff.name}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
                {adminRoleLabels[currentStaff.role] ?? "Staff"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Venue: {currentStaff.venueId}
              </p>
              <button
                type="button"
                onClick={logout}
                className="mt-3 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300 transition hover:bg-white hover:text-black"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>

        <nav
          aria-label="Admin sections"
          className="mb-6 grid grid-cols-2 gap-2 rounded-[1.5rem] border border-[#8D7A2F]/25 bg-zinc-950/80 p-2 shadow-2xl shadow-black/25 sm:mb-8 sm:grid-cols-3 lg:grid-cols-7 lg:rounded-[2rem]"
        >
          {adminTabs.map((tab) => {
            const isActive = activeAdminTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveAdminTab(tab.id);

                  if (tab.id === "operations") {
                    if (canManageTables) {
                      setActiveOperationsTab("floor");
                    } else if (canViewStaffOperations) {
                      setActiveOperationsTab("check-in");
                    } else if (canManageWaitlist) {
                      setActiveOperationsTab("waitlist");
                    }
                  }
                }}
                className={`rounded-2xl px-2 py-2.5 text-center text-[0.68rem] font-semibold uppercase tracking-[0.08em] transition duration-300 sm:px-3 sm:py-3 sm:text-xs sm:tracking-[0.12em] ${
                  isActive
                    ? "bg-[#D8C36A] text-black shadow-[0_0_28px_rgba(216,195,106,0.22)]"
                    : "border border-white/10 bg-black/35 text-zinc-300 hover:border-[#D8C36A]/50 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {openCorporateRequest && (
          <div className="fixed inset-0 z-[94] flex items-center justify-center bg-black/75 px-3 py-6 text-white backdrop-blur-md sm:px-5">
            <section className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-[#D8C36A]/30 bg-zinc-950 shadow-2xl shadow-black/70">
              <div className="flex flex-col gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                    Corporate Request
                  </p>
                  <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
                    {openCorporateRequest.companyName || "Unlisted Company"}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    {openCorporateRequest.contactName || "No contact name"} ·{" "}
                    {openCorporateRequest.preferredDate || "No preferred date"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenCorporateRequestId("")}
                  className="w-fit rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white hover:text-black"
                >
                  Close
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="rounded-[1.5rem] border border-white/10 bg-black/35 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                      Group Details
                    </p>
                    <dl className="mt-4 grid gap-3 text-sm text-zinc-300 sm:grid-cols-2">
                      <div>
                        <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Company
                        </dt>
                        <dd className="mt-1 font-semibold text-white">
                          {openCorporateRequest.companyName || "Not supplied"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Contact Person
                        </dt>
                        <dd className="mt-1 font-semibold text-white">
                          {openCorporateRequest.contactName || "Not supplied"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Phone
                        </dt>
                        <dd className="mt-1">{openCorporateRequest.contactNumber || "Not supplied"}</dd>
                      </div>
                      <div>
                        <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Email
                        </dt>
                        <dd className="mt-1 break-all">{openCorporateRequest.email || "Not supplied"}</dd>
                      </div>
                      <div>
                        <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Preferred Date
                        </dt>
                        <dd className="mt-1">{openCorporateRequest.preferredDate || "Not supplied"}</dd>
                      </div>
                      <div>
                        <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Alternative Date
                        </dt>
                        <dd className="mt-1">{openCorporateRequest.alternativeDate || "Not supplied"}</dd>
                      </div>
                      <div>
                        <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Guest Count
                        </dt>
                        <dd className="mt-1">{openCorporateRequest.guestCount}</dd>
                      </div>
                      <div>
                        <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Seating Preference
                        </dt>
                        <dd className="mt-1">{openCorporateRequest.seatingPreference || "Flexible"}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Occasion
                        </dt>
                        <dd className="mt-1">
                          {openCorporateRequest.occasion || "Not supplied"}
                          {openCorporateRequest.otherOccasion
                            ? ` · ${openCorporateRequest.otherOccasion}`
                            : ""}
                        </dd>
                      </div>
                    </dl>
                  </section>

                  <section className="rounded-[1.5rem] border border-white/10 bg-black/35 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                      Food & Beverage
                    </p>
                    <div className="mt-4 space-y-4 text-sm text-zinc-300">
                      <div>
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Dietary Requirements
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {openCorporateRequest.dietaryRequirements.length > 0 ? (
                            openCorporateRequest.dietaryRequirements.map(
                              (requirement) => (
                                <span
                                  key={requirement}
                                  className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-zinc-200"
                                >
                                  {requirement}
                                </span>
                              ),
                            )
                          ) : (
                            <span>No dietary requirements supplied</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Other Dietary Notes
                        </p>
                        <p className="mt-1">
                          {openCorporateRequest.otherDietaryRequirement ||
                            "No additional dietary notes"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Bar Tab Selection
                        </p>
                        <p className="mt-1 font-semibold text-white">
                          {openCorporateRequest.barTab || "No Bar Tab"}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[1.5rem] border border-white/10 bg-black/35 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                      Add-ons
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {openCorporateRequest.addons.length > 0 ? (
                        openCorporateRequest.addons.map((addon) => (
                          <span
                            key={addon}
                            className="rounded-full border border-[#D8C36A]/30 px-3 py-1 text-xs font-semibold text-[#F2D66C]"
                          >
                            {addon}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm text-zinc-400">
                          No add-ons selected.
                        </p>
                      )}
                    </div>
                  </section>

                  <section className="rounded-[1.5rem] border border-white/10 bg-black/35 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                      Admin
                    </p>
                    <div className="mt-4 grid gap-3 text-sm text-zinc-300 sm:grid-cols-2">
                      <div>
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Source
                        </p>
                        <p className="mt-1">{openCorporateRequest.source}</p>
                      </div>
                      <div>
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Created Date
                        </p>
                        <p className="mt-1">
                          {new Date(openCorporateRequest.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {openCorporateRequest.linkedBookingReference && (
                        <div className="sm:col-span-2">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Linked Booking Reference
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <p className="font-semibold text-white">
                              {openCorporateRequest.linkedBookingReference}
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                openConvertedCorporateBooking(
                                  openCorporateRequest.linkedBookingReference ??
                                    "",
                                )
                              }
                              className="rounded-full border border-sky-300/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-sky-200 transition hover:bg-sky-300 hover:text-black"
                            >
                              Open Booking
                            </button>
                          </div>
                        </div>
                      )}
                      <label className="sm:col-span-2">
                        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Current Status
                        </span>
                        <select
                          value={openCorporateRequest.status}
                          onChange={(event) =>
                            updateCorporateRequestStatus(
                              openCorporateRequest.id,
                              event.target.value as CorporateRequestStatus,
                            )
                          }
                          disabled={!canManageBookings}
                          className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-[#D8C36A]/70 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {(
                            Object.keys(
                              corporateRequestStatusLabels,
                            ) as CorporateRequestStatus[]
                          ).map((status) => (
                            <option key={status} value={status}>
                              {corporateRequestStatusLabels[status]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {openCorporateRequest.notes && (
                        <div className="sm:col-span-2">
                          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Notes
                          </p>
                          <p className="mt-1 leading-6">
                            {openCorporateRequest.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                {openCorporateRequest.status === "confirmed" &&
                  !openCorporateRequest.archivedAt &&
                  !openCorporateRequest.linkedBookingReference && (
                    <div className="mt-5 rounded-[1.5rem] border border-emerald-300/20 bg-emerald-950/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">
                        Booking Conversion
                      </p>
                      {getCorporateConversionShows(openCorporateRequest)
                        .length === 0 ? (
                        <p className="mt-3 rounded-2xl border border-red-300/25 bg-red-950/20 px-4 py-3 text-sm font-semibold text-red-100">
                          No active show exists for this date.
                        </p>
                      ) : (
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                          {getCorporateConversionShows(openCorporateRequest)
                            .length > 1 && (
                            <label className="flex-1 text-sm text-zinc-400">
                              Select Show
                              <select
                                value={
                                  corporateConversionShowSelections[
                                    openCorporateRequest.id
                                  ] ??
                                  getCorporateConversionShows(
                                    openCorporateRequest,
                                  )[0]?.id ??
                                  ""
                                }
                                onChange={(event) =>
                                  setCorporateConversionShowSelections(
                                    (currentSelections) => ({
                                      ...currentSelections,
                                      [openCorporateRequest.id]:
                                        event.target.value,
                                    }),
                                  )
                                }
                                className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-[#D8C36A]/70"
                              >
                                {getCorporateConversionShows(
                                  openCorporateRequest,
                                ).map((show) => (
                                  <option key={show.id} value={show.id}>
                                    {getShowLabel(show)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              convertCorporateRequestToBooking(
                                openCorporateRequest,
                                corporateConversionShowSelections[
                                  openCorporateRequest.id
                                ] ??
                                  getCorporateConversionShows(
                                    openCorporateRequest,
                                  )[0]?.id,
                              )
                            }
                            disabled={!canManageBookings}
                            className="rounded-full bg-emerald-300 px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-black transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Convert To Booking
                          </button>
                        </div>
                      )}
                      {corporateConversionStatus &&
                        corporateConversionStatusRequestId ===
                          openCorporateRequest.id && (
                        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-zinc-200">
                          <span>{corporateConversionStatus}</span>
                          {convertedCorporateBookingReference && (
                            <button
                              type="button"
                              onClick={() =>
                                openConvertedCorporateBooking(
                                  convertedCorporateBookingReference,
                                )
                              }
                              className="rounded-full border border-sky-300/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-sky-200 transition hover:bg-sky-300 hover:text-black"
                            >
                              Open Booking
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                {corporateConversionStatus &&
                  corporateConversionStatusRequestId ===
                    openCorporateRequest.id &&
                  (!convertedCorporateBookingReference ||
                    convertedCorporateBookingReference ===
                      openCorporateRequest.linkedBookingReference) && (
                    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[1.5rem] border border-emerald-300/20 bg-emerald-950/10 px-4 py-3 text-sm text-emerald-100">
                      <span>{corporateConversionStatus}</span>
                      {convertedCorporateBookingReference && (
                        <button
                          type="button"
                          onClick={() =>
                            openConvertedCorporateBooking(
                              convertedCorporateBookingReference,
                            )
                          }
                          className="rounded-full border border-sky-300/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-sky-200 transition hover:bg-sky-300 hover:text-black"
                        >
                          Open Booking
                        </button>
                      )}
                    </div>
                  )}

                <div className="mt-5 flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-black/35 p-4 sm:flex-row sm:justify-end">
                  {!openCorporateRequest.archivedAt && (
                    <button
                      type="button"
                      onClick={() => archiveCorporateRequest(openCorporateRequest.id)}
                      disabled={!canManageBookings}
                      className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-300 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Archive
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      openDeleteCorporateRequest(openCorporateRequest.id)
                    }
                    disabled={!canManageBookings}
                    className="rounded-full border border-red-300/45 px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-red-200 transition hover:bg-red-300 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {cancellingBookingReference &&
          (() => {
            const cancellingBooking = bookings.find(
              (booking) =>
                booking.reference === cancellingBookingReference,
            );
            const requiresOtherReason = cancellationReason === "Other";

            return (
              <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/75 px-4 text-white backdrop-blur-md">
                <section className="w-full max-w-xl rounded-[2rem] border border-red-300/30 bg-zinc-950 p-6 shadow-2xl shadow-black/60">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-200">
                    Reason for cancellation
                  </p>
                  <h2 className="mt-3 text-2xl font-bold">
                    {cancellingBooking?.customer.name ?? "Cancel Booking"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Select the operational reason before cancelling{" "}
                    {cancellingBooking?.reference ?? "this booking"}.
                  </p>

                  <div className="mt-5 grid gap-2">
                    {cancellationReasons.map((reason) => (
                      <label
                        key={reason}
                        className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                          cancellationReason === reason
                            ? "border-[#D8C36A]/70 bg-[#D8C36A]/10 text-white"
                            : "border-white/10 bg-black/30 text-zinc-300 hover:border-white/25"
                        }`}
                      >
                        <input
                          type="radio"
                          name="cancellation-reason"
                          value={reason}
                          checked={cancellationReason === reason}
                          onChange={() => setCancellationReason(reason)}
                          className="h-4 w-4 accent-[#D8C36A]"
                        />
                        {reason}
                      </label>
                    ))}
                  </div>

                  {requiresOtherReason && (
                    <label className="mt-4 block">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Other cancellation notes
                      </span>
                      <textarea
                        value={cancellationOtherReason}
                        onChange={(event) =>
                          setCancellationOtherReason(event.target.value)
                        }
                        rows={3}
                        className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white outline-none transition focus:border-red-300/70"
                        placeholder="Add the cancellation context."
                      />
                    </label>
                  )}

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={closeCancellationModal}
                      className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-300 transition hover:bg-white hover:text-black"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={confirmBookingCancellation}
                      disabled={
                        requiresOtherReason &&
                        !cancellationOtherReason.trim()
                      }
                      className="rounded-full border border-red-300/45 bg-red-300 px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-black transition hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Confirm Cancellation
                    </button>
                  </div>
                </section>
              </div>
            );
          })()}

        {deleteCorporateRequestId && (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 px-4 text-white backdrop-blur-md">
            <section className="w-full max-w-lg rounded-[2rem] border border-red-300/30 bg-zinc-950 p-6 shadow-2xl shadow-black/60">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-200">
                Delete Request
              </p>
              <h2 className="mt-3 text-2xl font-bold">
                This action will permanently delete the request.
              </h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Super Admin access is required to confirm deletion.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteCorporateRequestId("")}
                  className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-300 transition hover:bg-white hover:text-black"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteCorporateRequest}
                  className="rounded-full border border-red-300/45 bg-red-300 px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-black transition hover:bg-red-200"
                >
                  Delete Request
                </button>
              </div>
            </section>
          </div>
        )}

        {isScannerOpen && canCheckInGuests && (
          <div className="fixed inset-0 z-[90] flex items-stretch justify-center bg-black/90 text-white backdrop-blur-md">
            <section className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-black sm:m-5 sm:h-[calc(100vh-2.5rem)] sm:rounded-[2rem] sm:border sm:border-[#D8C36A]/30">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#D8C36A]">
                    Entrance Operations
                  </p>
                  <h2 className="mt-2 text-3xl font-bold">
                    Scan Tickets
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Camera scan for QR tickets, with manual validation
                    fallback.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(false)}
                  className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white hover:text-black"
                >
                  Close
                </button>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.78fr)]">
                <div className="flex min-h-[420px] flex-col overflow-hidden rounded-[2rem] border border-[#D8C36A]/25 bg-zinc-950">
                  <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
                    <video
                      ref={scannerVideoRef}
                      muted
                      playsInline
                      className="h-full min-h-[360px] w-full object-cover"
                    />
                    <div className="pointer-events-none absolute inset-8 rounded-[2rem] border-2 border-[#D8C36A]/70 shadow-[0_0_55px_rgba(216,195,106,0.18)]" />
                    <div className="pointer-events-none absolute left-1/2 top-1/2 h-1 w-3/4 -translate-x-1/2 -translate-y-1/2 bg-emerald-300/70 shadow-[0_0_22px_rgba(110,231,183,0.8)]" />
                    {scannerCameraError && (
                      <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-amber-300/30 bg-black/85 p-4 text-sm text-amber-100">
                        {scannerCameraError}
                      </div>
                    )}
                  </div>
                  <div className="border-t border-white/10 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                      <input
                        value={ticketValidationInput}
                        onChange={(event) =>
                          setTicketValidationInput(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            validateTicketCode();
                          }
                        }}
                        placeholder="Scan or enter ticket code / booking reference"
                        className="w-full rounded-2xl border border-zinc-700 bg-black px-5 py-4 text-lg"
                      />

                      <button
                        type="button"
                        onClick={validateTicketCode}
                        className="rounded-full bg-white px-8 py-4 font-semibold text-black transition hover:bg-zinc-300"
                      >
                        Validate
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-[2rem] border border-white/10 bg-zinc-950 p-5">
                  {!ticketValidationResult ? (
                    <div className="flex h-full min-h-80 flex-col items-center justify-center text-center">
                      <p className="text-5xl font-black uppercase tracking-[0.18em] text-zinc-700">
                        Ready
                      </p>
                      <p className="mt-4 max-w-sm text-zinc-400">
                        Point the camera at a Zingara live ticket QR code
                        to validate entry instantly.
                      </p>
                    </div>
                  ) : (
                    <div>
                      {(() => {
                        const resultState = ticketValidationResult.state;
                        const operationalState =
                          resultState === "Active"
                            ? "VALID"
                            : resultState === "Checked In"
                              ? "ALREADY USED"
                              : resultState === "Cancelled"
                                ? "CANCELLED"
                                : resultState === "Invalid"
                                  ? "INVALID"
                                  : resultState.toUpperCase();
                        const stateClasses =
                          resultState === "Active"
                            ? "border-emerald-300/60 bg-emerald-950/35 text-emerald-200"
                            : resultState === "Checked In"
                              ? "border-sky-300/60 bg-sky-950/35 text-sky-200"
                              : resultState === "Invalid" ||
                                  resultState === "Cancelled"
                                ? "border-red-300/60 bg-red-950/35 text-red-200"
                                : "border-amber-300/60 bg-amber-950/35 text-amber-100";

                        return (
                          <div
                            className={`rounded-[2rem] border p-6 text-center ${stateClasses}`}
                          >
                            <p className="text-5xl font-black uppercase tracking-[0.16em]">
                              {operationalState}
                            </p>
                            <p className="mt-3 text-base font-semibold">
                              {ticketValidationResult.message}
                            </p>
                          </div>
                        );
                      })()}

                      {ticketValidationResult.booking && (
                        <div className="mt-5 space-y-4">
                          <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                            <h3 className="text-2xl font-bold">
                              {
                                ticketValidationResult.booking.customer
                                  .name
                              }
                            </h3>
                            <p className="mt-1 text-zinc-400">
                              {ticketValidationResult.booking.zoneTitle} ·
                              Table{" "}
                              {
                                ticketValidationResult.booking
                                  .tableNumber
                              }
                            </p>
                          </div>

                          <div className="grid grid-cols-1 gap-3 text-sm text-zinc-300 sm:grid-cols-2">
                            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                              <p className="text-zinc-500">Reference</p>
                              <p className="mt-1 font-mono text-[#D8C36A]">
                                {
                                  ticketValidationResult.booking
                                    .reference
                                }
                              </p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                              <p className="text-zinc-500">Party</p>
                              <p className="mt-1 font-semibold">
                                {
                                  ticketValidationResult.booking
                                    .partySize
                                }{" "}
                                guests
                              </p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                              <p className="text-zinc-500">Payment</p>
                              <p className="mt-1 font-semibold">
                                {
                                  paymentStatusLabels[
                                    getBookingPaymentStatus(
                                      ticketValidationResult.booking,
                                    )
                                  ]
                                }
                              </p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                              <p className="text-zinc-500">Arrival</p>
                              <p className="mt-1 font-semibold">
                                {formatArrivalTime(
                                  ticketValidationResult.booking
                                    .arrivalTime,
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col gap-3">
                            <button
                              type="button"
                              disabled={
                                getBookingTicketState(
                                  ticketValidationResult.booking,
                                ) !== "Active"
                              }
                              onClick={checkInValidatedTicket}
                              className="rounded-full border border-emerald-300/60 bg-emerald-300 px-6 py-4 text-lg font-bold uppercase tracking-[0.12em] text-black transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              Check In Guest
                            </button>
                            {canManageBookings && (
                              <button
                                type="button"
                                onClick={overrideCheckInValidatedTicket}
                                className="rounded-full border border-amber-200/50 px-6 py-3 font-semibold uppercase tracking-[0.12em] text-amber-100 transition hover:bg-amber-200 hover:text-black"
                              >
                                Manager Override
                              </button>
                            )}
                            <a
                              href={getTicketUrl(
                                ticketValidationResult.booking.reference,
                              )}
                              className="rounded-full border border-[#D8C36A]/40 px-6 py-3 text-center font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                            >
                              Open Live Ticket
                            </a>
                          </div>
                        </div>
                      )}

                      {ticketValidationResult.waitlistEntry && (
                        <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-950/20 p-5">
                          <h3 className="text-2xl font-bold">
                            {
                              ticketValidationResult.waitlistEntry
                                .customer.name
                            }
                          </h3>
                          <p className="mt-2 text-amber-100">
                            Waitlist entry. Not valid for entry.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {splitMergeReview && (
          <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 p-4 text-white backdrop-blur-md">
            <section className="w-full max-w-2xl rounded-[2rem] border border-[#D8C36A]/30 bg-zinc-950 p-6 shadow-2xl shadow-black/50">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                    Split / Restore Review
                  </p>
                  <h2 className="mt-2 text-3xl font-bold">
                    {splitMergeReview.table.tableNumber}
                  </h2>
                  <p className="mt-2 text-zinc-400">
                    {splitMergeReview.warning}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSplitMergeReview(null)}
                  className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white hover:text-black"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/35 p-4 text-sm text-zinc-300">
                <p className="font-semibold text-white">
                  Operational Validation
                </p>
                {splitMergeReview.booking ? (
                  <p className="mt-2">
                    Active booking{" "}
                    <span className="font-mono text-[#F2D66C]">
                      {splitMergeReview.booking.reference}
                    </span>{" "}
                    is attached to this merged table. The split can only
                    continue if the booking is reassigned to a source table
                    that still fits the party size.
                  </p>
                ) : (
                  <p className="mt-2">
                    No active booking is attached to this merged table.
                    Source tables can be restored to their original
                    capacities, statuses, and relationships.
                  </p>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setSplitMergeReview(null)}
                  className="rounded-full border border-white/15 px-5 py-3 font-semibold text-zinc-300 transition hover:bg-white hover:text-black"
                >
                  Keep Merged
                </button>
                <button
                  type="button"
                  disabled={
                    Boolean(splitMergeReview.booking) &&
                    !splitMergeReview.targetTableId
                  }
                  onClick={() =>
                    splitMergedTable(
                      splitMergeReview.table,
                      splitMergeReview.targetTableId,
                    )
                  }
                  className="rounded-full border border-sky-300/40 bg-sky-300 px-5 py-3 font-semibold text-black transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {splitMergeReview.targetTableId
                    ? "Reassign And Split"
                    : "Restore Original Tables"}
                </button>
              </div>
            </section>
          </div>
        )}

        <div className="transition-opacity duration-300">
        {activeAdminTab === "operations" && (
          <section className="mb-8 rounded-[2rem] border border-[#8D7A2F]/25 bg-zinc-950/70 p-2 shadow-2xl shadow-black/20">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  ["floor", "Floor", canManageTables],
                  ["check-in", "Check-In", canViewStaffOperations],
                  ["waitlist", "Waitlist", canManageWaitlist],
                ] as Array<[OperationsTab, string, boolean]>
              ).map(([tab, label, isEnabled]) => (
                <button
                  key={tab}
                  type="button"
                  disabled={!isEnabled}
                  onClick={() => setActiveOperationsTab(tab)}
                  className={`rounded-2xl px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                    activeOperationsTab === tab
                      ? "bg-[#D8C36A] text-black shadow-[0_0_24px_rgba(216,195,106,0.2)]"
                      : "border border-white/10 bg-black/35 text-zinc-300 hover:border-[#D8C36A]/50 hover:text-white"
                  } disabled:cursor-not-allowed disabled:opacity-35`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        )}

        {activeAdminTab === "settings" && canManageSettings && (
          <section className="mb-8 rounded-[2rem] border border-[#8D7A2F]/25 bg-zinc-950/70 p-2 shadow-2xl shadow-black/20">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {settingsTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSettingsTab(tab.id)}
                  className={`rounded-2xl px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                    activeSettingsTab === tab.id
                      ? "bg-[#D8C36A] text-black shadow-[0_0_24px_rgba(216,195,106,0.2)]"
                      : "border border-white/10 bg-black/35 text-zinc-300 hover:border-[#D8C36A]/50 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {activeAdminTab === "settings" &&
          activeSettingsTab === "staff" &&
          canManageSettings && (
          <section className="mb-10 rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl shadow-black/25">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                  Staff
                </p>
                <h2 className="text-2xl font-bold">
                  Staff
                </h2>
                <p className="mt-2 max-w-3xl text-zinc-400">
                  Manage authenticated staff profiles, assigned roles,
                  active states, and venue scope.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {currentStaff.role === "super-admin" && (
                  <button
                    type="button"
                    onClick={() =>
                      setIsStaffInviteOpen((currentValue) => !currentValue)
                    }
                    className="w-fit rounded-full bg-[#D8C36A] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-black transition hover:bg-[#F2D66C]"
                  >
                    Create Staff User
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void refreshStaffManagement()}
                  className="w-fit rounded-full border border-[#D8C36A]/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                >
                  Refresh Staff
                </button>
              </div>
            </div>

            {staffManagementStatus && (
              <p className="mt-5 rounded-2xl border border-emerald-300/25 bg-emerald-950/25 px-4 py-3 text-sm text-emerald-100">
                {staffManagementStatus}
              </p>
            )}

            {currentStaff.role === "super-admin" && isStaffInviteOpen && (
              <form
                onSubmit={submitStaffInvitation}
                className="mt-5 rounded-2xl border border-[#D8C36A]/25 bg-black/35 p-5"
              >
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                  <input
                    required
                    value={staffInviteForm.fullName}
                    onChange={(event) =>
                      setStaffInviteForm((form) => ({
                        ...form,
                        fullName: event.target.value,
                      }))
                    }
                    placeholder="Full Name"
                    className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm"
                  />
                  <input
                    required
                    type="email"
                    value={staffInviteForm.email}
                    onChange={(event) =>
                      setStaffInviteForm((form) => ({
                        ...form,
                        email: event.target.value,
                      }))
                    }
                    placeholder="Email"
                    className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm"
                  />
                  <select
                    value={staffInviteForm.role}
                    onChange={(event) =>
                      setStaffInviteForm((form) => ({
                        ...form,
                        role: event.target.value as AdminRole,
                      }))
                    }
                    className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm"
                  >
                    {(staffRoles.length > 0
                      ? staffRoles
                      : userManagementRoles.map((role) => ({
                          id: role,
                          name: adminRoleLabels[role],
                          role,
                        }))
                    ).map((role) => (
                      <option key={role.id} value={role.role}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={staffInviteForm.venueScope}
                    onChange={(event) =>
                      setStaffInviteForm((form) => ({
                        ...form,
                        venueScope: event.target.value,
                      }))
                    }
                    placeholder="Venue Scope"
                    className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm"
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className="rounded-full bg-[#D8C36A] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-black transition hover:bg-[#F2D66C]"
                  >
                    Create Staff User
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsStaffInviteOpen(false)}
                    className="rounded-full border border-white/15 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-300 transition hover:bg-white hover:text-black"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="mt-6 grid grid-cols-1 gap-3 xl:grid-cols-2">
              {staffProfiles.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/35 p-5 text-sm text-zinc-400">
                  No staff profiles have been created yet.
                </div>
              ) : (
                staffProfiles.map((profile) => (
                  <article
                    key={profile.id}
                    className="rounded-2xl border border-white/10 bg-black/35 p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-bold">
                            {profile.name}
                          </h3>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.12em] ${
                              profile.active
                                ? "border-emerald-300/40 bg-emerald-950/25 text-emerald-200"
                                : "border-zinc-600 bg-zinc-900 text-zinc-500"
                            }`}
                          >
                            {profile.active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-zinc-400">
                          {profile.email}
                        </p>
                        <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
                          {adminRoleLabels[profile.role] ?? "Staff"}
                        </p>
                        <p className="mt-2 text-xs text-zinc-500">
                          Venue Scope:{" "}
                          {profile.venueScope.length > 0
                            ? profile.venueScope.join(", ")
                            : "All venues"}
                        </p>
                      </div>

                      {currentStaff.role === "super-admin" && (
                        <div className="flex shrink-0 flex-col gap-2 sm:min-w-48">
                          <select
                            value={profile.role}
                            onChange={(event) =>
                              void changeStaffProfileRole(
                                profile,
                                event.target.value as AdminRole,
                              )
                            }
                            className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white"
                          >
                            {(staffRoles.length > 0
                              ? staffRoles
                              : userManagementRoles.map((role) => ({
                                  id: role,
                                  name: adminRoleLabels[role],
                                  role,
                                }))
                            ).map((role) => (
                              <option key={role.id} value={role.role}>
                                {role.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              void toggleStaffProfileActive(profile)
                            }
                            className="rounded-full border border-white/15 px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-300 transition hover:bg-white hover:text-black"
                          >
                            {profile.active
                              ? "Deactivate User"
                              : "Activate User"}
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        )}

        {activeAdminTab === "settings" &&
          activeSettingsTab === "venue" &&
          canManageSettings && (
          <section className="mb-10 rounded-2xl border border-[#D8C36A]/35 bg-[radial-gradient(circle_at_top,#21160B_0%,#101010_48%,#050505_100%)] p-6 shadow-2xl shadow-[#8D7A2F]/10">
            <div className="mb-6">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                Platform Settings
              </p>
              <h2 className="text-3xl font-bold">
                Venue Configuration
              </h2>
              <p className="mt-2 text-zinc-400">
                Local demo settings for branding, operations, ticket
                display, and seating prices.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <div className="self-start rounded-2xl border border-white/10 bg-black/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Venue Identity
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-sm text-zinc-400">
                    Venue ID
                    <input
                      value={venueConfig.venueId}
                      onChange={(event) =>
                        updateVenueSettings({
                          venueId: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Venue Name
                    <input
                      value={venueConfig.venueName}
                      onChange={(event) =>
                        updateVenueSettings({
                          venueName: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Brand Title
                    <input
                      value={venueConfig.brandTitle}
                      onChange={(event) =>
                        updateVenueSettings({
                          brandTitle: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Show Title
                    <input
                      value={venueConfig.showTitle}
                      onChange={(event) =>
                        updateVenueSettings({
                          showTitle: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Full Logo URL
                    <input
                      value={venueConfig.logoUrl}
                      onChange={(event) =>
                        updateVenueSettings({
                          logoUrl: event.target.value,
                        })
                      }
                      placeholder="https://..."
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Favicon / QR Logo URL
                    <input
                      value={venueConfig.faviconUrl}
                      onChange={(event) =>
                        updateVenueSettings({
                          faviconUrl: event.target.value,
                        })
                      }
                      placeholder="https://..."
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4 md:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Branding Asset Uploads
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                      <label className="rounded-xl border border-[#D8C36A]/30 px-4 py-3 text-sm font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black">
                        Upload Full Logo
                        <input
                          type="file"
                          accept="image/svg+xml,image/png,image/jpeg"
                          className="hidden"
                          onChange={(event) =>
                            uploadBrandingAsset(
                              event.target.files?.[0],
                              (logoUrl) =>
                                updateVenueSettings({ logoUrl }),
                            )
                          }
                        />
                      </label>
                      <label className="rounded-xl border border-[#D8C36A]/30 px-4 py-3 text-sm font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black">
                        Upload Favicon
                        <input
                          type="file"
                          accept="image/svg+xml,image/png,image/jpeg"
                          className="hidden"
                          onChange={(event) =>
                            uploadBrandingAsset(
                              event.target.files?.[0],
                              (faviconUrl) =>
                                updateVenueSettings({ faviconUrl }),
                            )
                          }
                        />
                      </label>
                      <label className="rounded-xl border border-[#D8C36A]/30 px-4 py-3 text-sm font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black">
                        Upload Ticket Logo
                        <input
                          type="file"
                          accept="image/svg+xml,image/png,image/jpeg"
                          className="hidden"
                          onChange={(event) =>
                            uploadBrandingAsset(
                              event.target.files?.[0],
                              (ticketLogoUrl) =>
                                updateVenueSettingsSection(
                                  "ticketBranding",
                                  { ticketLogoUrl },
                                ),
                            )
                          }
                        />
                      </label>
                    </div>
                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div className="rounded-xl border border-white/10 bg-zinc-950 p-4">
                        <p className="mb-3 text-xs uppercase tracking-[0.14em] text-zinc-500">
                          Full Logo
                        </p>
                        <div
                          className="h-20 bg-contain bg-left bg-no-repeat"
                          style={{
                            backgroundImage: `url("${venueConfig.logoUrl}")`,
                          }}
                        />
                      </div>
                      <div className="rounded-xl border border-white/10 bg-zinc-950 p-4">
                        <p className="mb-3 text-xs uppercase tracking-[0.14em] text-zinc-500">
                          Favicon / QR
                        </p>
                        <div
                          className="h-16 w-16 rounded-full bg-contain bg-center bg-no-repeat"
                          style={{
                            backgroundImage: `url("${venueConfig.faviconUrl}")`,
                          }}
                        />
                      </div>
                      <div className="rounded-xl border border-white/10 bg-zinc-950 p-4">
                        <p className="mb-3 text-xs uppercase tracking-[0.14em] text-zinc-500">
                          Ticket Logo
                        </p>
                        <div
                          className="h-20 bg-contain bg-left bg-no-repeat"
                          style={{
                            backgroundImage: `url("${venueConfig.ticketBranding.ticketLogoUrl}")`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <label className="md:col-span-2 text-sm text-zinc-400">
                    Booking Subtitle
                    <textarea
                      value={venueConfig.subtitle}
                      onChange={(event) =>
                        updateVenueSettings({
                          subtitle: event.target.value,
                        })
                      }
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Theme & Typography
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {(
                    [
                      ["primary", "Primary"],
                      ["accent", "Accent"],
                      ["background", "Background"],
                      ["surface", "Surface"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="text-sm text-zinc-400">
                      {label}
                      <div className="mt-2 flex gap-2">
                        <input
                          type="color"
                          value={venueConfig.theme[key]}
                          onChange={(event) =>
                            updateVenueSettingsSection("theme", {
                              [key]: event.target.value,
                            })
                          }
                          className="h-12 w-14 rounded-xl border border-zinc-700 bg-black p-1"
                        />
                        <input
                          value={venueConfig.theme[key]}
                          onChange={(event) =>
                            updateVenueSettingsSection("theme", {
                              [key]: event.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                        />
                      </div>
                    </label>
                  ))}
                  <label className="text-sm text-zinc-400">
                    Heading Font
                    <select
                      value={venueConfig.typography.headingFont}
                      onChange={(event) =>
                        updateVenueSettingsSection("typography", {
                          headingFont: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    >
                      <option>Playfair Display</option>
                      <option>Cinzel</option>
                      <option>Inter</option>
                      <option>Georgia</option>
                    </select>
                  </label>
                  <label className="text-sm text-zinc-400">
                    Body Font
                    <select
                      value={venueConfig.typography.bodyFont}
                      onChange={(event) =>
                        updateVenueSettingsSection("typography", {
                          bodyFont: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    >
                      <option>Inter</option>
                      <option>Manrope</option>
                      <option>Georgia</option>
                      <option>Arial</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Contacts, Social & Email Sender
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-sm text-zinc-400">
                    Sender Name
                    <input
                      value={venueConfig.emailSender.fromName}
                      onChange={(event) =>
                        updateVenueSettingsSection("emailSender", {
                          fromName: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Sender Email
                    <input
                      value={venueConfig.emailSender.fromEmail}
                      onChange={(event) =>
                        updateVenueSettingsSection("emailSender", {
                          fromEmail: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Reply-To
                    <input
                      value={venueConfig.emailSender.replyTo}
                      onChange={(event) =>
                        updateVenueSettingsSection("emailSender", {
                          replyTo: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Support Phone
                    <input
                      value={venueConfig.supportContact.phone}
                      onChange={(event) =>
                        updateVenueSettingsSection("supportContact", {
                          phone: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Support Email
                    <input
                      value={venueConfig.supportContact.email}
                      onChange={(event) =>
                        updateVenueSettingsSection("supportContact", {
                          email: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Website
                    <input
                      value={venueConfig.supportContact.website}
                      onChange={(event) =>
                        updateVenueSettingsSection("supportContact", {
                          website: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  {(
                    [
                      ["instagram", "Instagram"],
                      ["facebook", "Facebook"],
                      ["tiktok", "TikTok"],
                      ["x", "X"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="text-sm text-zinc-400">
                      {label}
                      <input
                        value={venueConfig.socialLinks[key]}
                        onChange={(event) =>
                          updateVenueSettingsSection("socialLinks", {
                            [key]: event.target.value,
                          })
                        }
                        className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Show, Ticket & Messaging Defaults
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-sm text-zinc-400">
                    Show Hero Image URL
                    <input
                      value={venueConfig.showBranding.heroImageUrl}
                      onChange={(event) =>
                        updateVenueSettingsSection("showBranding", {
                          heroImageUrl: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Show Poster URL
                    <input
                      value={venueConfig.showBranding.posterImageUrl}
                      onChange={(event) =>
                        updateVenueSettingsSection("showBranding", {
                          posterImageUrl: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="md:col-span-2 text-sm text-zinc-400">
                    Show Tagline
                    <input
                      value={venueConfig.showBranding.tagline}
                      onChange={(event) =>
                        updateVenueSettingsSection("showBranding", {
                          tagline: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Ticket Logo URL
                    <input
                      value={venueConfig.ticketBranding.ticketLogoUrl}
                      onChange={(event) =>
                        updateVenueSettingsSection("ticketBranding", {
                          ticketLogoUrl: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Ticket Accent Text
                    <input
                      value={venueConfig.ticketBranding.accentText}
                      onChange={(event) =>
                        updateVenueSettingsSection("ticketBranding", {
                          accentText: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="md:col-span-2 text-sm text-zinc-400">
                    Ticket Footer Note
                    <textarea
                      value={venueConfig.ticketBranding.footerNote}
                      onChange={(event) =>
                        updateVenueSettingsSection("ticketBranding", {
                          footerNote: event.target.value,
                        })
                      }
                      rows={2}
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Broadcast Prefix
                    <input
                      value={
                        venueConfig.operationalMessaging
                          .broadcastPrefix
                      }
                      onChange={(event) =>
                        updateVenueSettingsSection(
                          "operationalMessaging",
                          {
                            broadcastPrefix: event.target.value,
                          },
                        )
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Reminder Lead Hours
                    <input
                      type="number"
                      min={1}
                      value={
                        venueConfig.operationalMessaging
                          .reminderLeadHours
                      }
                      onChange={(event) =>
                        updateVenueSettingsSection(
                          "operationalMessaging",
                          {
                            reminderLeadHours: Number(
                              event.target.value,
                            ),
                          },
                        )
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="md:col-span-2 text-sm text-zinc-400">
                    Default Guest Message
                    <textarea
                      value={
                        venueConfig.operationalMessaging
                          .defaultGuestMessage
                      }
                      onChange={(event) =>
                        updateVenueSettingsSection(
                          "operationalMessaging",
                          {
                            defaultGuestMessage: event.target.value,
                          },
                        )
                      }
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-5 xl:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Operational Settings
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <label className="text-sm text-zinc-400">
                    Booking Cutoff Hours
                    <input
                      type="number"
                      min={0}
                      value={
                        venueConfig.operationalSettings
                          .bookingCutoffHours
                      }
                      onChange={(event) =>
                        updateVenueSettingsSection(
                          "operationalSettings",
                          {
                            bookingCutoffHours: Number(
                              event.target.value,
                            ),
                          },
                        )
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Default Deposit %
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={
                        venueConfig.operationalSettings
                          .defaultDepositPercentage
                      }
                      onChange={(event) =>
                        updateVenueSettingsSection(
                          "operationalSettings",
                          {
                            defaultDepositPercentage: Number(
                              event.target.value,
                            ),
                          },
                        )
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Ticket Refresh Seconds
                    <input
                      type="number"
                      min={5}
                      value={
                        venueConfig.operationalSettings
                          .ticketRefreshSeconds
                      }
                      onChange={(event) =>
                        updateVenueSettingsSection(
                          "operationalSettings",
                          {
                            ticketRefreshSeconds: Number(
                              event.target.value,
                            ),
                          },
                        )
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Check-In Grace Minutes
                    <input
                      type="number"
                      min={0}
                      value={
                        venueConfig.operationalSettings
                          .checkInGraceMinutes
                      }
                      onChange={(event) =>
                        updateVenueSettingsSection(
                          "operationalSettings",
                          {
                            checkInGraceMinutes: Number(
                              event.target.value,
                            ),
                          },
                        )
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="md:col-span-2 text-sm text-zinc-400">
                    Cancellation Rules
                    <textarea
                      value={
                        venueConfig.operationalSettings
                          .cancellationRule
                      }
                      onChange={(event) =>
                        updateVenueSettingsSection(
                          "operationalSettings",
                          {
                            cancellationRule: event.target.value,
                          },
                        )
                      }
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-950 p-4 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={
                        venueConfig.operationalSettings
                          .waitlistAutoPromotionEnabled
                      }
                      onChange={(event) =>
                        updateVenueSettingsSection(
                          "operationalSettings",
                          {
                            waitlistAutoPromotionEnabled:
                              event.target.checked,
                          },
                        )
                      }
                    />
                    Waitlist auto-promotion
                  </label>
                  <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-950 p-4 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={
                        venueConfig.operationalSettings
                          .allowDuplicateCheckIn
                      }
                      onChange={(event) =>
                        updateVenueSettingsSection(
                          "operationalSettings",
                          {
                            allowDuplicateCheckIn:
                              event.target.checked,
                          },
                        )
                      }
                    />
                    Allow duplicate check-ins
                  </label>
                  <label className="text-sm text-zinc-400">
                    Auto-Promotion Party Threshold
                    <input
                      type="number"
                      min={1}
                      value={
                        venueConfig.operationalSettings
                          .waitlistAutoPromotionThreshold
                      }
                      onChange={(event) =>
                        updateVenueSettingsSection(
                          "operationalSettings",
                          {
                            waitlistAutoPromotionThreshold: Number(
                              event.target.value,
                            ),
                          },
                        )
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-5 xl:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Seating Zone Pricing
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {seatingZones.map((zone) => (
                    <div
                      key={`settings-${zone.id}`}
                      className="rounded-xl border border-white/10 bg-zinc-950 p-4"
                    >
                      <p className="font-semibold text-white">
                        {zone.title}
                      </p>
                      <label className="mt-3 block text-sm text-zinc-400">
                        Price
                        <input
                          type="number"
                          min={0}
                          value={
                            venueConfig.zonePricing[zone.id]?.price ??
                            zone.price
                          }
                          onChange={(event) =>
                            updateZonePricing(zone.id, {
                              price: Number(event.target.value),
                            })
                          }
                          className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                        />
                      </label>
                      <label className="mt-3 block text-sm text-zinc-400">
                        Deposit %
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={
                            venueConfig.zonePricing[zone.id]
                              ?.depositPercentage ??
                            zone.depositPercentage
                          }
                          onChange={(event) =>
                            updateZonePricing(zone.id, {
                              depositPercentage: Number(
                                event.target.value,
                              ),
                            })
                          }
                          className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </section>
        )}

        {activeAdminTab === "overview" && (
          <section className="mb-10">
            <div className="mb-5 flex flex-col gap-4 lg:mb-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                  Dashboard
                </p>
                <h2 className="text-3xl font-bold sm:text-4xl">
                  Operational Command Centre
                </h2>
                <p className="mt-2 text-sm text-zinc-400 sm:text-base">
                  Live venue control for shows, guests, revenue,
                  floor alerts, and availability.
                </p>
              </div>

              <select
                value={selectedShowId}
                onChange={(event) => {
                  setSelectedShowId(event.target.value);
                  setBookingPage(1);
                }}
                className="w-full rounded-2xl border border-zinc-700 bg-black px-4 py-3 text-base sm:max-w-md sm:px-5 sm:py-4 sm:text-lg"
              >
                {shows.map((show) => (
                  <option key={show.id} value={show.id}>
                    {getShowLabel(show)}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-6 overflow-hidden rounded-[1.5rem] border border-[#8D7A2F]/25 bg-[radial-gradient(circle_at_top,#17120A_0%,#080808_58%,#030303_100%)] p-3 shadow-2xl shadow-black/30 sm:mb-8 sm:rounded-[2rem] sm:p-5">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                    Widget Canvas
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Drag, drop, or nudge operational widgets into the
                    working order your team prefers.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                    Modular Layout
                  </span>
                  {currentStaff?.role === "super-admin" && (
                    <button
                      type="button"
                      onClick={resetDashboardLayout}
                      className="rounded-full border border-[#D8C36A]/25 bg-[#D8C36A]/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                    >
                      Reset Dashboard Layout
                    </button>
                  )}
                </div>
              </div>

              {currentStaff?.role === "super-admin" &&
                hiddenDashboardWidgetLabels.length > 0 && (
                  <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/25 p-3">
                    <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Hidden Widgets
                    </span>
                    {hiddenDashboardWidgetLabels.map((widget) => (
                      <button
                        key={`show-${widget.id}`}
                        type="button"
                        onClick={() => showDashboardWidget(widget.id)}
                        className="rounded-full border border-white/10 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-zinc-300 transition hover:border-[#D8C36A]/50 hover:text-[#F2D66C]"
                      >
                        Show {widget.label}
                      </button>
                    ))}
                  </div>
                )}

            <div className="grid grid-cols-1 gap-3 rounded-[1.5rem] border border-white/10 bg-[linear-gradient(rgba(216,195,106,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(216,195,106,0.07)_1px,transparent_1px)] bg-[size:28px_28px] p-3 md:grid-cols-2 xl:gap-5 xl:p-4">
              {visibleDashboardWidgets.map((widgetId) => {
                const isMinimized =
                  minimizedDashboardWidgets.includes(widgetId);

                return (
                <article
                  key={widgetId}
                  draggable={currentStaff?.role === "super-admin"}
                  onDragStart={() => setDraggedDashboardWidget(widgetId)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedDashboardWidget) {
                      placeDashboardWidget(
                        draggedDashboardWidget,
                        widgetId,
                      );
                    }
                    setDraggedDashboardWidget(null);
                  }}
                  className={`cursor-grab rounded-2xl border border-[#8D7A2F]/25 bg-zinc-950/90 p-4 shadow-2xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-[#D8C36A]/45 active:cursor-grabbing sm:p-5 ${
                    widgetId === "quick-actions"
                      ? "xl:col-span-2"
                      : ""
                  }`}
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">
                        {dashboardWidgetLabels[widgetId]}
                      </p>
                      <p className="mt-1 text-[0.65rem] uppercase tracking-[0.16em] text-zinc-600">
                        Drag Handle
                      </p>
                    </div>
                    {currentStaff?.role === "super-admin" && (
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => moveDashboardWidget(widgetId, -1)}
                          className="rounded-full border border-white/10 px-2 py-1 text-xs text-zinc-400 transition hover:bg-white hover:text-black"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveDashboardWidget(widgetId, 1)}
                          className="rounded-full border border-white/10 px-2 py-1 text-xs text-zinc-400 transition hover:bg-white hover:text-black"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            toggleDashboardWidgetMinimized(widgetId)
                          }
                          className="rounded-full border border-white/10 px-2 py-1 text-xs text-zinc-400 transition hover:bg-white hover:text-black"
                        >
                          {isMinimized ? "Restore" : "Min"}
                        </button>
                        <button
                          type="button"
                          onClick={() => hideDashboardWidget(widgetId)}
                          className="rounded-full border border-red-300/20 px-2 py-1 text-xs text-red-200 transition hover:bg-red-200 hover:text-black"
                        >
                          Hide
                        </button>
                      </div>
                    )}
                  </div>

                  {isMinimized && (
                    <p className="rounded-2xl border border-white/10 bg-black/35 p-4 text-sm text-zinc-500">
                      Widget minimised. Restore it when this view is
                      needed again.
                    </p>
                  )}

                  {!isMinimized && widgetId === "tonight" && (
                    <div>
                      <h3 className="text-2xl font-bold sm:text-3xl">
                        {selectedShow?.label ?? "No show selected"}
                      </h3>
                      <p className="mt-2 text-sm text-zinc-400 sm:text-base">
                        {selectedShowDateLabel} ·{" "}
                        {selectedShow?.venueName ?? venueConfig.venueName}
                      </p>
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                        {[
                          ["Occupancy", `${occupancyPercent}%`],
                          ["Sold Seats", reservedGuests],
                          ["Remaining", remainingSeats],
                          [
                            "Status",
                            showOperationalStatusLabels[
                              selectedShow?.operationalStatus ?? "active"
                            ],
                          ],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-2xl border border-white/10 bg-black/35 p-3 sm:p-4"
                          >
                            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                              {label}
                            </p>
                            <p className="mt-2 text-xl font-bold text-white sm:text-2xl">
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isMinimized && widgetId === "guest-ops" && (
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                      {[
                        ["Arrived", arrivedGuests],
                        ["Remaining", remainingCheckIns],
                        ["Waitlist", activeWaitlistCount],
                        ["No Show", selectedShowNoShows],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="rounded-2xl border border-white/10 bg-black/35 p-3 sm:p-4"
                        >
                          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                            {label}
                          </p>
                          <p className="mt-2 text-2xl font-bold sm:text-3xl">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {!isMinimized && widgetId === "alerts" && (
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                      {operationalAlerts.map((alert) => (
                        <div
                          key={alert.label}
                          className="rounded-2xl border border-white/10 bg-black/35 p-3 sm:p-4"
                        >
                          <p className="text-2xl font-bold text-[#F2D66C]">
                            {alert.value}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.12em] text-zinc-500">
                            {alert.label}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {!isMinimized && widgetId === "quick-actions" && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
                      {[
                        ["Scan Tickets", () => setIsScannerOpen(true)],
                        ["Open Bookings", () => setActiveAdminTab("bookings")],
                        [
                          "Floor Operations",
                          () => {
                            setActiveAdminTab("operations");
                            setActiveOperationsTab("floor");
                          },
                        ],
                        ["Create Booking", undefined],
                        [
                          "Tonight's Show",
                          () => setActiveAdminTab("overview"),
                        ],
                        [
                          "Waitlist",
                          () => {
                            setActiveAdminTab("operations");
                            setActiveOperationsTab("waitlist");
                          },
                        ],
                        ["Customers", () => setActiveAdminTab("customers")],
                      ].map((actionItem) => {
                        const label = actionItem[0] as string;
                        const action = actionItem[1] as
                          | (() => void)
                          | undefined;

                        return label === "Create Booking" ? (
                          <a
                            key={label}
                            href="/book"
                            className="rounded-2xl border border-[#D8C36A]/25 bg-[#D8C36A]/10 p-4 text-center text-sm font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                          >
                            {label}
                          </a>
                        ) : (
                          <button
                            key={label}
                            type="button"
                            onClick={action}
                            className="rounded-2xl border border-[#D8C36A]/25 bg-[#D8C36A]/10 p-4 text-sm font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {!isMinimized && widgetId === "upcoming" && (
                    <div className="grid grid-cols-1 gap-3">
                      {shows.slice(0, 4).map((show) => (
                        <button
                          key={show.id}
                          type="button"
                          onClick={() => setSelectedShowId(show.id)}
                          className="rounded-2xl border border-white/10 bg-black/35 p-4 text-left transition hover:border-[#D8C36A]/50"
                        >
                          <p className="font-semibold text-white">
                            {show.label}
                          </p>
                          <p className="mt-1 text-sm text-zinc-400">
                            {formatOperationalShowDate(show.date)} ·{" "}
                            {getSouthAfricaShowTime(show)} ·{" "}
                            {
                              showOperationalStatusLabels[
                                show.operationalStatus ?? "active"
                              ]
                            }
                          </p>
                        </button>
                      ))}
                    </div>
                  )}

                  {!isMinimized && widgetId === "revenue" && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {[
                        [
                          "Tonight Revenue",
                          formatCurrency(selectedShowFinancials.revenue),
                        ],
                        [
                          "Deposits Outstanding",
                          formatCurrency(
                            selectedShowFinancials.depositsOutstanding,
                          ),
                        ],
                        [
                          "Refunds Today",
                          formatCurrency(
                            selectedShowFinancials.refundsToday,
                          ),
                        ],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="rounded-2xl border border-white/10 bg-black/35 p-4"
                        >
                          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                            {label}
                          </p>
                          <p className="mt-2 text-2xl font-bold text-white">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {!isMinimized &&
                    widgetId === "occupancy-trends" && (
                      <div className="space-y-3">
                        {perShowAnalytics.slice(0, 4).map((showReport) => (
                          <button
                            key={`dashboard-occupancy-${showReport.show.id}`}
                            type="button"
                            onClick={() =>
                              setSelectedShowId(showReport.show.id)
                            }
                            className="w-full rounded-2xl border border-white/10 bg-black/35 p-4 text-left transition hover:border-[#D8C36A]/50"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-semibold text-white">
                                {showReport.show.label}
                              </p>
                              <span className="text-sm font-semibold text-[#F2D66C]">
                                {showReport.occupancy}%
                              </span>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-[#D8C36A] shadow-[0_0_18px_rgba(216,195,106,0.35)]"
                                style={{
                                  width: `${Math.min(
                                    showReport.occupancy,
                                    100,
                                  )}%`,
                                }}
                              />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                  {!isMinimized &&
                    widgetId === "sales-performance" && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {[
                          [
                            "Net Sales",
                            formatCurrency(allFinancialReport.netSales),
                          ],
                          [
                            "Avg Spend / Guest",
                            formatCurrency(averageSpendPerGuest),
                          ],
                          [
                            "Add-On Revenue",
                            formatCurrency(
                              allFinancialReport.addonsTotal,
                            ),
                          ],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-2xl border border-white/10 bg-black/35 p-4"
                          >
                            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                              {label}
                            </p>
                            <p className="mt-2 text-2xl font-bold text-white">
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                </article>
                );
              })}
            </div>
            </div>

            <section className="rounded-[2rem] border border-[#8D7A2F]/25 bg-zinc-950/80 p-5 shadow-2xl shadow-black/25">
              <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                    Detailed Operations
                  </p>
                  <h3 className="zingara-heading mt-2 text-2xl font-bold">
                    Show & Availability Management
                  </h3>
                  <p className="mt-1 text-sm text-zinc-400">
                    Create shows and mark dates as active, inactive, sold
                    out, blackout, venue closure, or special event.
                  </p>
                </div>
              </div>

              {canManageShows && (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[180px_160px_1fr_auto]">
                          <input
                            type="date"
                            value={newShow.date}
                            onChange={(event) =>
                              setNewShow((currentShow) => ({
                                ...currentShow,
                                date: event.target.value,
                              }))
                            }
                            className="rounded-xl border border-white/15 bg-black px-4 py-3"
                          />
                          <input
                            type="time"
                            value={newShow.time}
                            onChange={(event) =>
                              setNewShow((currentShow) => ({
                                ...currentShow,
                                time: event.target.value,
                              }))
                            }
                            className="rounded-xl border border-white/15 bg-black px-4 py-3"
                          />
                          <input
                            value={newShow.label}
                            onChange={(event) =>
                              setNewShow((currentShow) => ({
                                ...currentShow,
                                label: event.target.value,
                              }))
                            }
                            placeholder="Show label"
                            className="rounded-xl border border-white/15 bg-black px-4 py-3"
                          />
                          <button
                            type="button"
                            onClick={createShow}
                            className="rounded-full bg-white px-6 py-3 font-semibold text-black transition hover:bg-zinc-300"
                          >
                            Create Show
                          </button>
                </div>
              )}

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                        {shows.map((show) => {
                          const linkedBookingCount = bookings.filter(
                            (booking) => booking.showId === show.id,
                          ).length;

                          return (
                          <div
                            key={`dashboard-show-${show.id}`}
                            className="rounded-2xl border border-white/10 bg-black/35 p-4"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-white">
                                  {show.label}
                                </p>
                                  {show.archivedAt && (
                                    <span className="rounded-full border border-zinc-600 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                                      Archived
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 text-sm text-zinc-400">
                                  {formatOperationalShowDate(show.date)} ·{" "}
                                  {getSouthAfricaShowTime(show)} ·{" "}
                                  {show.venueName ?? venueConfig.venueName}
                                </p>
                                {(show.description ||
                                  show.internalNotes ||
                                  linkedBookingCount > 0) && (
                                  <p className="mt-2 text-xs text-zinc-500">
                                    {show.description ||
                                      show.internalNotes ||
                                      `${linkedBookingCount} linked bookings`}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={show.operationalStatus ?? "active"}
                                onChange={(event) =>
                                  updateShowOperationalStatus(
                                    show.id,
                                    event.target
                                      .value as NonNullable<
                                      DemoShow["operationalStatus"]
                                    >,
                                  )
                                }
                                className="rounded-full border border-white/15 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-300"
                              >
                                {(
                                  Object.keys(
                                    showOperationalStatusLabels,
                                  ) as Array<
                                    NonNullable<
                                      DemoShow["operationalStatus"]
                                    >
                                  >
                                ).map((status) => (
                                  <option key={status} value={status}>
                                    {showOperationalStatusLabels[status]}
                                  </option>
                                ))}
                              </select>
                              {canManageShows && (
                                <button
                                  type="button"
                                  onClick={() => openShowEditor(show)}
                                  className="rounded-full border border-[#D8C36A]/30 px-4 py-2 text-sm font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                                >
                                  Edit Show
                                </button>
                              )}
                              </div>
                            </div>
                          </div>
                          );
                        })}
              </div>
            </section>
          </section>
        )}

        {editingShow && canManageShows && (
          <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/75 p-3 backdrop-blur-md sm:items-center sm:p-6">
            <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-[#8D7A2F]/30 bg-[#070707] shadow-2xl shadow-black">
              <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#070707]/95 p-5 backdrop-blur">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                    Edit Show
                  </p>
                  <h3 className="mt-2 text-2xl font-bold text-white">
                    {editingShow.label}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    {editingShowLinkedBookings} linked bookings preserved
                    by show ID.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeShowEditor}
                  className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white hover:text-black"
                >
                  Close
                </button>
              </div>

              <div className="space-y-5 p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="md:col-span-2 text-sm text-zinc-400">
                    Show Title
                    <input
                      value={showEditForm.label}
                      onChange={(event) =>
                        setShowEditForm((currentForm) => ({
                          ...currentForm,
                          label: event.target.value,
                        }))
                      }
                      className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Date
                    <input
                      type="date"
                      value={showEditForm.date}
                      onChange={(event) =>
                        setShowEditForm((currentForm) => ({
                          ...currentForm,
                          date: event.target.value,
                        }))
                      }
                      className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Time
                    <input
                      type="time"
                      value={showEditForm.time}
                      onChange={(event) =>
                        setShowEditForm((currentForm) => ({
                          ...currentForm,
                          time: event.target.value,
                        }))
                      }
                      className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Venue / Location
                    <input
                      value={showEditForm.venueName}
                      onChange={(event) =>
                        setShowEditForm((currentForm) => ({
                          ...currentForm,
                          venueName: event.target.value,
                        }))
                      }
                      className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Operational Status
                    <select
                      value={showEditForm.operationalStatus}
                      onChange={(event) =>
                        setShowEditForm((currentForm) => ({
                          ...currentForm,
                          operationalStatus: event.target
                            .value as NonNullable<
                            DemoShow["operationalStatus"]
                          >,
                        }))
                      }
                      className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white"
                    >
                      {(
                        Object.keys(showOperationalStatusLabels) as Array<
                          NonNullable<DemoShow["operationalStatus"]>
                        >
                      ).map((status) => (
                        <option key={status} value={status}>
                          {showOperationalStatusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="md:col-span-2 text-sm text-zinc-400">
                    Show Description / Tagline
                    <textarea
                      value={showEditForm.description}
                      onChange={(event) =>
                        setShowEditForm((currentForm) => ({
                          ...currentForm,
                          description: event.target.value,
                        }))
                      }
                      rows={3}
                      className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="md:col-span-2 text-sm text-zinc-400">
                    Internal Notes
                    <textarea
                      value={showEditForm.internalNotes}
                      onChange={(event) =>
                        setShowEditForm((currentForm) => ({
                          ...currentForm,
                          internalNotes: event.target.value,
                        }))
                      }
                      rows={3}
                      className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white"
                    />
                  </label>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-sm text-zinc-400">
                  Editing preserves the existing show ID, so bookings,
                  tickets, table overrides, floor layouts, CRM history, and
                  analytics remain linked. Archive keeps historical records
                  while hiding the show from active booking operations.
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={duplicateEditedShow}
                      className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white hover:text-black"
                    >
                      Duplicate Show
                    </button>
                    <button
                      type="button"
                      onClick={archiveEditedShow}
                      className="rounded-full border border-amber-300/35 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-300 hover:text-black"
                    >
                      Archive Show
                    </button>
                    <button
                      type="button"
                      onClick={deleteEditedShow}
                      className="rounded-full border border-red-300/35 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-300 hover:text-black"
                    >
                      Delete Show
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={saveEditedShow}
                    className="rounded-full bg-[#D8C36A] px-6 py-3 font-bold text-black shadow-[0_0_24px_rgba(216,195,106,0.2)] transition hover:bg-[#F2D66C]"
                  >
                    Save Show
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {showDeleteConfirmationId && editingShow && canManageShows && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
            <section className="w-full max-w-lg rounded-[2rem] border border-[#8D7A2F]/35 bg-[#070707] p-6 text-white shadow-2xl shadow-black">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-200">
                Linked Bookings
              </p>
              <h3 className="mt-3 text-2xl font-bold">
                This show has linked bookings.
              </h3>
              <p className="mt-4 text-sm leading-6 text-zinc-300">
                Deleting it may affect tickets, CRM history,
                communications and reporting.
              </p>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                Would you like to archive the show instead?
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirmationId("")}
                  className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white hover:text-black"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={archiveEditedShow}
                  className="rounded-full border border-amber-300/35 bg-amber-300 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#F2D66C]"
                >
                  Archive Show
                </button>
              </div>
            </section>
          </div>
        )}

        {activeAdminTab === "analytics" && canViewAnalytics && (
          <section className="mb-10 rounded-2xl border border-[#D8C36A]/35 bg-[radial-gradient(circle_at_top,#251909_0%,#101010_48%,#050505_100%)] p-6 shadow-2xl shadow-[#8D7A2F]/10">
            <div className="mb-6 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                  Advanced Analytics
                </p>
                <h2 className="text-3xl font-bold">
                  Revenue & Demand Reporting
                </h2>
                <p className="mt-2 text-zinc-400">
                  Per-show revenue, occupancy trends, add-on
                  performance, promo usage, waitlist conversion, and
                  booking source mix.
                </p>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-[#D8C36A]/25 bg-black/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
                  Net Revenue
                </p>
                <p className="mt-2 text-3xl font-bold">
                  {formatCurrency(allFinancialReport.netSales)}
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-400/25 bg-emerald-950/20 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                  Avg Spend / Guest
                </p>
                <p className="mt-2 text-3xl font-bold">
                  {formatCurrency(averageSpendPerGuest)}
                </p>
              </div>

              <div className="rounded-2xl border border-sky-300/25 bg-sky-950/20 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">
                  Add-On Revenue
                </p>
                <p className="mt-2 text-3xl font-bold">
                  {formatCurrency(allFinancialReport.addonsTotal)}
                </p>
              </div>

              <div className="rounded-2xl border border-amber-300/25 bg-amber-950/20 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
                  Waitlist Conversion
                </p>
                <p className="mt-2 text-3xl font-bold">
                  {formatPercent(waitlistConversionRate)}
                </p>
              </div>
            </div>

            <div className="mb-6 rounded-2xl border border-white/10 bg-black/35 p-5">
              <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Operational Reports & Exports
                  </p>
                  <h3 className="zingara-heading mt-1 text-2xl font-bold">
                    Manifests, Check-In Sheets & Floor Reports
                  </h3>
                </div>
              </div>

              <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-5">
                <label className="text-sm text-zinc-400">
                  Date
                  <input
                    type="date"
                    value={reportDateFilter}
                    onChange={(event) =>
                      setReportDateFilter(event.target.value)
                    }
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                  />
                </label>
                <label className="text-sm text-zinc-400">
                  Booking Status
                  <select
                    value={reportStatusFilter}
                    onChange={(event) =>
                      setReportStatusFilter(
                        event.target.value as BookingStatus | "all",
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                  >
                    <option value="all">All statuses</option>
                    {bookingStatuses.map((status) => (
                      <option key={status} value={status}>
                        {bookingStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-zinc-400">
                  Seating Zone
                  <select
                    value={reportZoneFilter}
                    onChange={(event) =>
                      setReportZoneFilter(
                        event.target.value as SeatingZoneId | "all",
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                  >
                    <option value="all">All zones</option>
                    {seatingZones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-zinc-400">
                  Payment Status
                  <select
                    value={reportPaymentFilter}
                    onChange={(event) =>
                      setReportPaymentFilter(
                        event.target.value as PaymentStatus | "all",
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                  >
                    <option value="all">All payment states</option>
                    {(
                      Object.keys(paymentStatusLabels) as PaymentStatus[]
                    ).map((status) => (
                      <option key={status} value={status}>
                        {paymentStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setReportDateFilter("");
                    setReportStatusFilter("all");
                    setReportZoneFilter("all");
                    setReportPaymentFilter("all");
                  }}
                  className="mt-7 rounded-full border border-white/20 px-4 py-3 font-semibold text-zinc-200 transition hover:bg-white hover:text-black"
                >
                  Clear Filters
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {(
                  Object.keys(
                    operationalReportLabels,
                  ) as OperationalReportType[]
                ).map((reportType) => (
                  <div
                    key={reportType}
                    className="rounded-2xl border border-white/10 bg-zinc-950 p-4"
                  >
                    <p className="font-semibold text-white">
                      {operationalReportLabels[reportType]}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => exportReport(reportType)}
                        className="rounded-full border border-[#D8C36A]/40 px-4 py-2 text-sm font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                      >
                        CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => printReport(reportType)}
                        className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white hover:text-black"
                      >
                        Printable View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Per-Show Revenue
                    </p>
                    <h3 className="zingara-heading mt-1 text-2xl font-bold">
                      Revenue By Show
                    </h3>
                  </div>
                  <span className="rounded-full border border-[#D8C36A]/25 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#D8C36A]">
                    {shows.length} Shows
                  </span>
                </div>

                <div className="space-y-4">
                  {perShowAnalytics.map((showReport) => (
                    <div key={`revenue-${showReport.show.id}`}>
                      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                        <span className="font-semibold text-zinc-200">
                          {showReport.show.label}
                        </span>
                        <span className="text-[#D8C36A]">
                          {formatCurrency(showReport.revenue)}
                        </span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-zinc-900">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#8D7A2F] to-[#F3DA78]"
                          style={{
                            width: `${getBarWidth(
                              showReport.revenue,
                              maxShowRevenue,
                            )}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {showReport.guests} guests ·{" "}
                        {formatCurrency(showReport.averageSpend)} avg
                        spend
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Occupancy Trends
                </p>
                <h3 className="zingara-heading mt-1 text-2xl font-bold">
                  Reserved Capacity By Show
                </h3>

                <div className="mt-5 grid grid-cols-1 gap-4">
                  {perShowAnalytics.map((showReport) => (
                    <div
                      key={`occupancy-${showReport.show.id}`}
                      className="rounded-2xl border border-white/10 bg-zinc-950 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold text-white">
                            {showReport.show.date} ·{" "}
                            {getSouthAfricaShowTime(showReport.show)}
                          </p>
                          <p className="text-sm text-zinc-500">
                            {showReport.guests} of{" "}
                            {showReport.capacity} seats reserved
                          </p>
                        </div>
                        <span className="text-2xl font-bold text-emerald-300">
                          {formatPercent(showReport.occupancy)}
                        </span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-zinc-900">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-[#D8C36A]"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(4, showReport.occupancy),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Add-On Revenue Breakdown
                </p>
                <h3 className="zingara-heading mt-1 text-2xl font-bold">
                  Premium Upsells
                </h3>

                <div className="mt-5 space-y-4">
                  {addonBreakdown.length === 0 ? (
                    <p className="rounded-2xl border border-white/10 bg-zinc-950 p-4 text-zinc-400">
                      No add-on revenue recorded yet.
                    </p>
                  ) : (
                    addonBreakdown.map((addon) => (
                      <div key={addon.name}>
                        <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                          <span className="font-semibold text-zinc-200">
                            {addon.name}
                          </span>
                          <span className="text-sky-200">
                            {formatCurrency(addon.revenue)}
                          </span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-zinc-900">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-200"
                            style={{
                              width: `${getBarWidth(
                                addon.revenue,
                                maxAddonRevenue,
                              )}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-zinc-500">
                          {addon.count} selections
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Promo Code Usage
                </p>
                <h3 className="zingara-heading mt-1 text-2xl font-bold">
                  Discounts & Redemptions
                </h3>

                <div className="mt-5 grid grid-cols-1 gap-3">
                  {promoAnalytics.length === 0 ? (
                    <p className="rounded-2xl border border-white/10 bg-zinc-950 p-4 text-zinc-400">
                      No promo codes have been used yet.
                    </p>
                  ) : (
                    promoAnalytics.map((promo) => (
                      <div
                        key={promo.code}
                        className="rounded-2xl border border-white/10 bg-zinc-950 p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-semibold text-white">
                              {promo.code}
                            </p>
                            <p className="text-sm text-zinc-500">
                              {promo.label}
                            </p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-lg font-bold text-amber-200">
                              {promo.count} uses
                            </p>
                            <p className="text-sm text-zinc-500">
                              {formatCurrency(promo.discount)} saved
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Booking Source Summary
                </p>
                <h3 className="zingara-heading mt-1 text-2xl font-bold">
                  Channel Mix
                </h3>

                <div className="mt-5 space-y-4">
                  {sourceSummaries.length === 0 ? (
                    <p className="rounded-2xl border border-white/10 bg-zinc-950 p-4 text-zinc-400">
                      No active bookings to summarize yet.
                    </p>
                  ) : (
                    sourceSummaries.map((source) => (
                      <div key={source.source}>
                        <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                          <span className="font-semibold text-zinc-200">
                            {bookingSourceLabels[source.source]}
                          </span>
                          <span className="text-[#D8C36A]">
                            {formatCurrency(source.revenue)}
                          </span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-zinc-900">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#A34063] to-[#D8C36A]"
                            style={{
                              width: `${getBarWidth(
                                source.revenue,
                                maxSourceRevenue,
                              )}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-zinc-500">
                          {source.count} bookings · {source.guests}{" "}
                          guests
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Waitlist Funnel
                </p>
                <h3 className="zingara-heading mt-1 text-2xl font-bold">
                  Conversion Health
                </h3>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-950/15 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-amber-200">
                      Total Entries
                    </p>
                    <p className="mt-2 text-3xl font-bold">
                      {waitlistTotal}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-emerald-300/20 bg-emerald-950/15 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-emerald-300">
                      Converted
                    </p>
                    <p className="mt-2 text-3xl font-bold">
                      {convertedWaitlistCount}
                    </p>
                  </div>
                </div>

                <div className="mt-5 h-4 overflow-hidden rounded-full bg-zinc-900">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-300"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(4, waitlistConversionRate),
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-3 text-sm text-zinc-400">
                  {formatPercent(waitlistConversionRate)} of waitlist
                  demand has been converted into confirmed bookings.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Customer Value
                </p>
                <h3 className="zingara-heading mt-1 text-2xl font-bold">
                  Top CRM Profiles
                </h3>

                <div className="mt-5 grid grid-cols-1 gap-3">
                  {topCustomerProfiles.length === 0 ? (
                    <p className="rounded-2xl border border-white/10 bg-zinc-950 p-4 text-zinc-400">
                      Customer profiles will appear after bookings are
                      created.
                    </p>
                  ) : (
                    topCustomerProfiles.map((profile) => (
                      <button
                        key={`analytics-${profile.key}`}
                        type="button"
                        onClick={() => setSelectedCustomerKey(profile.key)}
                        className="rounded-2xl border border-white/10 bg-zinc-950 p-4 text-left transition hover:border-[#D8C36A]/50 hover:bg-[#1C1408]"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-white">
                              {profile.customer.name || "Unnamed Guest"}
                            </p>
                            <p className="mt-1 text-sm text-zinc-500">
                              {profile.totalBookings} bookings ·{" "}
                              {profile.favouriteZone}
                            </p>
                          </div>
                          <p className="font-bold text-[#D8C36A]">
                            {formatCurrency(profile.totalSpend)}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeAdminTab === "customers" && canViewCrm && (
          <section className="mb-10 rounded-2xl border border-[#D8C36A]/35 bg-[radial-gradient(circle_at_top,#211507_0%,#101010_48%,#050505_100%)] p-6 shadow-2xl shadow-[#8D7A2F]/10">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                  Customer CRM
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-3xl font-bold">
                    Customer Relationship Profiles
                  </h2>

                  <label className="group relative block w-10 shrink-0 transition-all duration-300 focus-within:w-full sm:focus-within:w-80">
                    <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-[#F2D66C] transition-all duration-300 group-focus-within:left-4 group-focus-within:translate-x-0">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-4.35-4.35" />
                      </svg>
                    </span>
                    <input
                      value={customerSearch}
                      onChange={(event) =>
                        setCustomerSearch(event.target.value)
                      }
                      aria-label="Search customers"
                      className="h-10 w-full rounded-full border border-[#D8C36A]/35 bg-black/45 pl-10 pr-0 text-sm text-transparent shadow-[0_0_18px_rgba(216,195,106,0.1)] transition-all duration-300 focus:border-[#D8C36A]/70 focus:pr-4 focus:text-white focus:outline-none"
                    />
                  </label>
                </div>
                <p className="mt-2 text-zinc-400">
                  Reusable guest profiles with spend, attendance,
                  favourite zones, add-ons, promo usage, notes, VIP
                  tags, and communication history.
                </p>
              </div>
            </div>

            {canManageBookings && (
              <div className="mb-6 rounded-2xl border border-white/10 bg-black/35 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Legacy Import
                    </p>
                    <h3 className="zingara-heading mt-1 text-2xl font-bold">
                      Dineplan / Historical Booking Import
                    </h3>
                    <p className="mt-2 text-sm text-zinc-400">
                      Upload CSV exports from legacy systems. XLSX files
                      are accepted for intake, with validation guidance
                      shown before any data is confirmed.
                    </p>
                  </div>
                  <label className="rounded-full border border-[#D8C36A]/40 px-5 py-3 text-sm font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black">
                    Choose CSV/XLSX
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt,.xls,.xlsx"
                      onChange={handleLegacyImportFile}
                      className="hidden"
                    />
                  </label>
                </div>

                {legacyImportError && (
                  <div className="mt-4 rounded-2xl border border-red-300/30 bg-red-950/20 p-4 text-sm text-red-100">
                    {legacyImportError}
                  </div>
                )}

                {legacyImportPreview && (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-zinc-950 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-white">
                          Import Preview
                        </p>
                        <p className="mt-1 text-sm text-zinc-400">
                          {legacyImportPreview.bookings.length} bookings ·{" "}
                          {legacyImportPreview.crmRecords.length} CRM
                          profiles · {legacyImportPreview.errors.length}{" "}
                          validation notices
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={confirmLegacyImport}
                        disabled={legacyImportPreview.bookings.length === 0}
                        className="rounded-full bg-white px-5 py-3 font-semibold text-black transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Confirm Import
                      </button>
                    </div>
                    {legacyImportPreview.errors.length > 0 && (
                      <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-950/20 p-4 text-sm text-amber-100">
                        {legacyImportPreview.errors.slice(0, 5).map(
                          (error) => (
                            <p key={error}>{error}</p>
                          ),
                        )}
                      </div>
                    )}
                    <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-white/10">
                      {legacyImportPreview.bookings.slice(0, 8).map(
                        (booking) => (
                          <div
                            key={booking.reference}
                            className="border-b border-white/10 px-4 py-3 text-sm last:border-b-0"
                          >
                            <span className="font-semibold text-white">
                              {booking.reference}
                            </span>{" "}
                            <span className="text-zinc-400">
                              {booking.customer.name} ·{" "}
                              {booking.zoneTitle} ·{" "}
                              {formatCurrency(booking.totalPrice)}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[420px_1fr]">
              <div className="flex h-[620px] flex-col self-start rounded-2xl border border-white/10 bg-black/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Profile Directory
                </p>
                <div className="mt-4 grid flex-1 content-start grid-cols-1 gap-3 overflow-y-auto pr-1">
                  {filteredCustomerProfiles.length === 0 ? (
                    <p className="rounded-2xl border border-white/10 bg-zinc-950 p-4 text-zinc-400">
                      No customer profiles match that search.
                    </p>
                  ) : (
                    filteredCustomerProfiles.map((profile) => (
                      <button
                        key={profile.key}
                        type="button"
                        onClick={() => setSelectedCustomerKey(profile.key)}
                        className={`rounded-2xl border p-4 text-left transition ${
                          selectedCustomerKey === profile.key
                            ? "border-[#D8C36A]/70 bg-[#211708]"
                            : "border-white/10 bg-zinc-950 hover:border-[#D8C36A]/45 hover:bg-[#171109]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-white">
                              {profile.customer.name || "Unnamed Guest"}
                            </p>
                            <p className="mt-1 text-sm text-zinc-500">
                              {profile.customer.email ||
                                profile.customer.phone ||
                                "No contact details"}
                            </p>
                          </div>
                          <p className="font-semibold text-[#D8C36A]">
                            {formatCurrency(profile.totalSpend)}
                          </p>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {profile.vipTags.length > 0 ? (
                            profile.vipTags.map((tag) => (
                              <span
                                key={`${profile.key}-${tag}`}
                                className="rounded-full border border-[#D8C36A]/30 bg-black/40 px-3 py-1 text-xs text-[#F2D66C]"
                              >
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-zinc-500">
                              No VIP tags
                            </span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {selectedCustomerProfile && (
              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                  <div>
                    <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">
                          Customer Profile
                        </p>
                        <h3 className="mt-2 text-4xl font-bold">
                          {selectedCustomerProfile.customer.name ||
                            "Unnamed Guest"}
                        </h3>
                        <p className="mt-2 text-zinc-400">
                          {selectedCustomerProfile.customer.email ||
                            "No email"}{" "}
                          ·{" "}
                          {selectedCustomerProfile.customer.phone ||
                            "No phone"}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]">
                        <div className="rounded-2xl border border-[#D8C36A]/20 bg-zinc-950 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-[#D8C36A]">
                            Spend
                          </p>
                          <p className="mt-2 text-xl font-bold">
                            {formatCurrency(
                              selectedCustomerProfile.totalSpend,
                            )}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-zinc-950 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                            Bookings
                          </p>
                          <p className="mt-2 text-xl font-bold">
                            {selectedCustomerProfile.totalBookings}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-950/15 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-emerald-300">
                            Attendance
                          </p>
                          <p className="mt-2 text-xl font-bold">
                            {formatPercent(
                              selectedCustomerProfile.attendanceFrequency,
                            )}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-sky-400/20 bg-sky-950/15 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-sky-200">
                            Arrivals
                          </p>
                          <p className="mt-2 text-xl font-bold">
                            {selectedCustomerProfile.attendanceCount}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                          Relationship Notes
                        </p>
                        <textarea
                          value={selectedCustomerProfile.notes}
                          disabled={!canManageBookings}
                          onChange={(event) =>
                            updateCustomerCrmRecord(
                              selectedCustomerProfile.key,
                              {
                                notes: event.target.value,
                              },
                            )
                          }
                          className="mt-3 min-h-32 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-zinc-100 disabled:opacity-60"
                          placeholder="Add guest preferences, service notes, allergies, or relationship context."
                        />

                        <div className="mt-5">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            VIP Tags
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {[
                              "VIP",
                              "High Value",
                              "Birthday Guest",
                              "Wine Lover",
                              "Corporate Host",
                            ].map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                disabled={!canManageBookings}
                                onClick={() =>
                                  toggleCustomerVipTag(
                                    selectedCustomerProfile,
                                    tag,
                                  )
                                }
                                className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                  selectedCustomerProfile.vipTags.includes(
                                    tag,
                                  )
                                    ? "border-[#D8C36A]/60 bg-[#D8C36A] text-black"
                                    : "border-white/15 text-zinc-300 hover:bg-white hover:text-black"
                                }`}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                          Preferences
                        </p>
                        <div className="mt-4 grid grid-cols-1 gap-3">
                          <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                              Favourite Seating
                            </p>
                            <p className="mt-2 font-semibold text-white">
                              {selectedCustomerProfile.favouriteZone}
                            </p>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                              Add-Ons Purchased
                            </p>
                            {selectedCustomerProfile.addOns.length === 0 ? (
                              <p className="mt-2 text-sm text-zinc-400">
                                No add-ons purchased yet.
                              </p>
                            ) : (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {selectedCustomerProfile.addOns.map(
                                  (addon) => (
                                    <span
                                      key={`${selectedCustomerProfile.key}-${addon.name}`}
                                      className="rounded-full border border-sky-300/25 bg-sky-950/20 px-3 py-1 text-xs text-sky-200"
                                    >
                                      {addon.name} · {addon.count}
                                    </span>
                                  ),
                                )}
                              </div>
                            )}
                          </div>
                          <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                              Promo Usage
                            </p>
                            {selectedCustomerProfile.promoUsage.length ===
                            0 ? (
                              <p className="mt-2 text-sm text-zinc-400">
                                No promo codes used.
                              </p>
                            ) : (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {selectedCustomerProfile.promoUsage.map(
                                  (promo) => (
                                    <span
                                      key={`${selectedCustomerProfile.key}-${promo.code}`}
                                      className="rounded-full border border-amber-300/25 bg-amber-950/20 px-3 py-1 text-xs text-amber-200"
                                    >
                                      {promo.code} · {promo.count}
                                    </span>
                                  ),
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                          Booking History
                        </p>
                        <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
                          {selectedCustomerProfile.bookingHistory.map(
                            (booking) => {
                              const paymentStatus =
                                getBookingPaymentStatus(booking);

                              return (
                              <div
                                key={`profile-${booking.reference}`}
                                className="rounded-xl border border-white/10 bg-black/35 p-4"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="font-semibold text-white">
                                      {booking.reference}
                                    </p>
                                    <p className="mt-1 text-sm text-zinc-400">
                                      {booking.bookingDate} ·{" "}
                                      {booking.zoneTitle} · Table{" "}
                                      {booking.tableNumber}
                                    </p>
                                    {(booking.status ?? "confirmed") ===
                                      "cancelled" &&
                                      booking.cancellationReason && (
                                        <p className="mt-2 rounded-xl border border-red-300/20 bg-red-950/20 px-3 py-2 text-xs font-semibold text-red-100">
                                          Cancellation:{" "}
                                          {booking.cancellationReason}
                                        </p>
                                      )}
                                  </div>
                                  <span
                                    className={`inline-flex min-w-max shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.54rem] font-semibold uppercase leading-none tracking-[0.06em] ${
                                      bookingStatusClasses[
                                        booking.status ?? "confirmed"
                                      ]
                                    }`}
                                  >
                                    {
                                      bookingStatusLabels[
                                        booking.status ?? "confirmed"
                                      ]
                                    }
                                  </span>
                                  <span
                                    className={`inline-flex min-w-max shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.54rem] font-semibold uppercase leading-none tracking-[0.06em] ${paymentStatusClasses[paymentStatus]}`}
                                  >
                                    {paymentStatusLabels[paymentStatus]}
                                  </span>
                                </div>
                              </div>
                              );
                            },
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                          Communication History
                        </p>
                        <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
                          {selectedCustomerProfile.communicationHistory
                            .length === 0 ? (
                            <p className="rounded-xl border border-white/10 bg-black/35 p-4 text-sm text-zinc-400">
                              No customer communications recorded yet.
                            </p>
                          ) : (
                            selectedCustomerProfile.communicationHistory.map(
                              (record) => (
                                <div
                                  key={`${record.bookingReference}-${record.id}`}
                                  className="rounded-xl border border-white/10 bg-black/35 p-4"
                                >
                                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#D8C36A]">
                                    {
                                      communicationChannelLabels[
                                        record.channel
                                      ]
                                    }{" "}
                                    ·{" "}
                                    {record.bookingReference}
                                    {record.trigger
                                      ? ` · ${communicationTriggerLabels[record.trigger]}`
                                      : ""}
                                  </p>
                                  {record.subject && (
                                    <p className="mt-2 font-semibold text-white">
                                      {record.subject}
                                    </p>
                                  )}
                                  <p className="mt-2 text-sm text-zinc-300">
                                    {record.message}
                                  </p>
                                  <p className="mt-2 text-xs text-zinc-500">
                                    {new Date(
                                      record.sentAt,
                                    ).toLocaleString()}
                                  </p>
                                </div>
                              ),
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
              </div>
              )}
            </div>
          </section>
        )}

        {activeAdminTab === "operations" &&
          activeOperationsTab === "waitlist" &&
          canManageWaitlist && (
          <section className="mb-10 rounded-2xl border border-[#8D7A2F]/35 bg-[radial-gradient(circle_at_top,#22170C_0%,#101010_48%,#050505_100%)] p-6 shadow-2xl shadow-[#8D7A2F]/10">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                  Waitlist & Over-Capacity
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-3xl font-bold">
                    Guest Demand Queue
                  </h2>

                  <label className="flex min-w-[260px] flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Selected Show
                    </span>
                    <select
                      value={selectedShowId}
                      onChange={(event) => {
                        setSelectedShowId(event.target.value);
                        setWaitlistSearch("");
                      }}
                      className="rounded-full border border-[#D8C36A]/35 bg-black/45 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_18px_rgba(216,195,106,0.1)] outline-none transition focus:border-[#D8C36A]/70"
                    >
                      {shows.map((show) => (
                        <option key={show.id} value={show.id}>
                          {getShowLabel(show)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="mt-2 text-zinc-400">
                  Track waitlisted guests for{" "}
                  <span className="font-semibold text-white">
                    {getShowLabel(selectedShow)}
                  </span>{" "}
                  and convert them when a suitable table opens.
                </p>
                <label className="group relative mt-4 block w-full max-w-md">
                  <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[#F2D66C]">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-4.35-4.35" />
                    </svg>
                  </span>
                  <input
                    value={waitlistSearch}
                    onChange={(event) =>
                      setWaitlistSearch(event.target.value)
                    }
                    aria-label="Search selected show waitlist"
                    placeholder="Search guests or references"
                    className="h-11 w-full rounded-full border border-white/10 bg-black/45 pl-12 pr-4 text-sm text-white shadow-[0_0_18px_rgba(216,195,106,0.08)] transition placeholder:text-zinc-600 focus:border-[#D8C36A]/55 focus:outline-none"
                  />
                </label>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-5">
              <div className="rounded-2xl border border-amber-300/25 bg-amber-950/20 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
                  Waiting
                </p>
                <p className="mt-2 text-3xl font-bold">
                  {waitlistReport.waiting}
                </p>
              </div>

              <div className="rounded-2xl border border-sky-300/25 bg-sky-950/20 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">
                  Promoted
                </p>
                <p className="mt-2 text-3xl font-bold">
                  {waitlistReport.promoted}
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-400/25 bg-emerald-950/20 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                  Converted
                </p>
                <p className="mt-2 text-3xl font-bold">
                  {waitlistReport.converted}
                </p>
              </div>

              <div className="rounded-2xl border border-red-400/25 bg-red-950/20 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-300">
                  Removed
                </p>
                <p className="mt-2 text-3xl font-bold">
                  {waitlistReport.removed}
                </p>
              </div>

              <div className="rounded-2xl border border-[#D8C36A]/25 bg-black/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
                  Active Guests
                </p>
                <p className="mt-2 text-3xl font-bold">
                  {waitlistReport.activeGuests}
                </p>
              </div>
            </div>

            {selectedShowWaitlist.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-zinc-400">
                No waitlist entries have been created for this show.
              </div>
            ) : filteredWaitlist.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-zinc-400">
                No waitlist entries match that search.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredWaitlist.map((entry) => {
                  const allocation =
                    findWaitlistConversionTable(entry);
                  const canConvert =
                    Boolean(allocation) &&
                    entry.status !== "converted" &&
                    entry.status !== "removed";

                  return (
                    <article
                      key={entry.id}
                      className="rounded-2xl border border-white/10 bg-black/35 p-5"
                    >
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">
                              {entry.id}
                            </p>
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                                waitlistStatusClasses[entry.status]
                              }`}
                            >
                              {waitlistStatusLabels[entry.status]}
                            </span>
                            {entry.bookingReference && (
                              <span className="rounded-full border border-emerald-400/30 bg-emerald-950/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
                                {entry.bookingReference}
                              </span>
                            )}
                          </div>

                          <h3 className="mt-3 text-2xl font-bold">
                            {entry.customer.name || "Unnamed Guest"}
                          </h3>
                          <p className="mt-1 text-zinc-400">
                            {entry.partySize} guests ·{" "}
                            {entry.desiredZoneTitle ??
                              "Any eligible seating zone"}
                          </p>
                          <p className="mt-2 text-sm text-zinc-500">
                            {entry.customer.email || "No email"} ·{" "}
                            {entry.customer.phone || "No phone"}
                          </p>
                          {entry.notes && (
                            <p className="mt-3 rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
                              {entry.notes}
                            </p>
                          )}
                          <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-zinc-500">
                            <span>
                              Joined{" "}
                              {new Date(
                                entry.createdAt,
                              ).toLocaleString()}
                            </span>
                            {entry.promotedAt && (
                              <span>
                                Promoted{" "}
                                {new Date(
                                  entry.promotedAt,
                                ).toLocaleString()}
                              </span>
                            )}
                            {entry.convertedAt && (
                              <span>
                                Converted{" "}
                                {new Date(
                                  entry.convertedAt,
                                ).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="w-full rounded-2xl border border-white/10 bg-zinc-950 p-4 lg:max-w-sm">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            Conversion Availability
                          </p>
                          {allocation ? (
                            <p className="mt-2 text-sm text-emerald-300">
                              {allocation.zone.title} · Table{" "}
                              {allocation.table.tableNumber} ·{" "}
                              {allocation.table.seatCapacity} seats
                            </p>
                          ) : (
                            <p className="mt-2 text-sm text-amber-200">
                              No valid table is currently available
                              for this party size.
                            </p>
                          )}

                          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
                            <button
                              type="button"
                              disabled={entry.status !== "waiting"}
                              onClick={() =>
                                promoteWaitlistEntry(entry)
                              }
                              className="rounded-full border border-sky-300/40 px-4 py-2 text-sm font-semibold text-sky-200 transition hover:bg-sky-300 hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              Promote
                            </button>
                            <button
                              type="button"
                              disabled={!canConvert}
                              onClick={() =>
                                convertWaitlistEntry(entry)
                              }
                              className="rounded-full border border-emerald-300/50 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-300 hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              Convert To Booking
                            </button>
                            <button
                              type="button"
                              disabled={
                                entry.status === "converted" ||
                                entry.status === "removed"
                              }
                              onClick={() =>
                                removeWaitlistEntry(entry)
                              }
                              className="rounded-full border border-red-300/40 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-300 hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeAdminTab === "settings" &&
          activeSettingsTab === "workflows" &&
          canManageCommunications && (
          <section className="mb-10 rounded-2xl border border-[#D8C36A]/35 bg-[radial-gradient(circle_at_top,#22170C_0%,#101010_48%,#050505_100%)] p-6 shadow-2xl shadow-[#8D7A2F]/10">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                  Guest Communications
                </p>
                <h2 className="text-3xl font-bold">
                  Automated Workflows
                </h2>
                <p className="mt-2 text-zinc-400">
                  Manage templates, trigger reminders, and broadcast
                  operational updates for{" "}
                  <span className="font-semibold text-white">
                    {getShowLabel(workflowShow)}
                  </span>
                  .
                </p>
              </div>

              <div className="flex flex-col items-start gap-3">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Selected Show
                  <span className="relative mt-2 block min-w-[280px]">
                    <span className="pointer-events-none absolute inset-y-0 left-4 right-10 z-10 flex items-center truncate text-sm font-semibold normal-case tracking-normal text-white">
                      {workflowShow
                        ? `${workflowShow.date} · ${getSouthAfricaShowTime(workflowShow)}`
                        : "Select show"}
                    </span>
                    <select
                      value={workflowShow?.id ?? ""}
                      onChange={(event) => {
                        setWorkflowShowId(event.target.value);
                        setWorkflowStatus("");
                      }}
                      className="block w-full rounded-full border border-[#D8C36A]/35 bg-black px-4 py-3 text-sm font-semibold normal-case tracking-normal text-transparent"
                    >
                      {workflowShows.map((show) => (
                        <option
                          key={show.id}
                          value={show.id}
                          className="bg-black text-white"
                        >
                          {show.label} · {show.date} ·{" "}
                          {getSouthAfricaShowTime(show)}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>

                <button
                  type="button"
                  onClick={sendShowReminder}
                  disabled={activeWorkflowBookings.length === 0}
                  className="inline-flex min-w-[220px] max-w-full items-center justify-center whitespace-nowrap rounded-full border border-[#D8C36A]/40 px-5 py-3 text-center text-sm font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Send Show Reminders
                </button>
              </div>
            </div>

            {workflowStatus && (
              <div className="mb-5 rounded-2xl border border-emerald-300/30 bg-emerald-950/20 p-4 text-sm font-semibold text-emerald-200">
                {workflowStatus}
              </div>
            )}

            <div className="mb-5 rounded-2xl border border-[#D8C36A]/25 bg-black/35 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
                  Guest Notification Preview
                </p>
                  <p className="mt-2 text-sm text-zinc-400">
                    Preview the guest-facing browser notification
                    experience for installed PWAs and supported
                    browsers. Current permission:{" "}
                    <span className="font-semibold text-white">
                      {notificationPermission}
                    </span>
                    .
                  </p>
                  {notificationTestStatus && (
                    <p className="mt-2 text-sm text-emerald-300">
                      {notificationTestStatus}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={sendTestBrowserNotification}
                  className="min-w-[220px] whitespace-nowrap rounded-full bg-[#D8C36A] px-5 py-3 text-center text-sm font-bold text-black shadow-[0_0_24px_rgba(216,195,106,0.18)] transition hover:bg-[#F2D66C]"
                >
                  Send Test Notification
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Template Management
                    </p>
                    <p className="mt-2 text-sm text-zinc-400">
                      Email, push, and future SMS templates use
                      variables like{" "}
                      <span className="font-mono text-[#F2D66C]">
                        {"{{guest_name}}"}
                      </span>{" "}
                      and{" "}
                      <span className="font-mono text-[#F2D66C]">
                        {"{{outstanding_balance}}"}
                      </span>
                      .
                    </p>
                  </div>
                  <select
                    value={selectedTemplateId}
                    onChange={(event) =>
                      setSelectedTemplateId(event.target.value)
                    }
                    className="rounded-full border border-zinc-700 bg-black px-4 py-3 text-sm"
                  >
                    {communicationTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedCommunicationTemplate && (
                  <div className="mt-5 space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="text-sm text-zinc-400">
                        Channel
                        <select
                          value={selectedCommunicationTemplate.channel}
                          onChange={(event) =>
                            updateCommunicationTemplate(
                              selectedCommunicationTemplate.id,
                              {
                                channel: event.target
                                  .value as CommunicationChannel,
                              },
                            )
                          }
                          className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                        >
                          {(
                            [
                              "email",
                              "push",
                              "sms",
                            ] as CommunicationChannel[]
                          ).map((channel) => (
                            <option key={channel} value={channel}>
                              {communicationChannelLabels[channel]}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="text-sm text-zinc-400">
                        Trigger
                        <p className="mt-2 rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-white">
                          {
                            communicationTriggerLabels[
                              selectedCommunicationTemplate.trigger
                            ]
                          }
                        </p>
                      </div>
                    </div>

                    <label className="block text-sm text-zinc-400">
                      Subject
                      <input
                        value={selectedCommunicationTemplate.subject}
                        onChange={(event) =>
                          updateCommunicationTemplate(
                            selectedCommunicationTemplate.id,
                            {
                              subject: event.target.value,
                            },
                          )
                        }
                        className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                      />
                    </label>

                    <label className="block text-sm text-zinc-400">
                      Body
                      <textarea
                        value={selectedCommunicationTemplate.body}
                        onChange={(event) =>
                          updateCommunicationTemplate(
                            selectedCommunicationTemplate.id,
                            {
                              body: event.target.value,
                            },
                          )
                        }
                        rows={5}
                        className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      {communicationVariableHints.map((variable) => (
                        <span
                          key={variable}
                          className="rounded-full border border-[#D8C36A]/25 bg-black px-3 py-1 font-mono text-xs text-[#F2D66C]"
                        >
                          {"{{"}
                          {variable}
                          {"}}"}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setWorkflowStatus("Template saved successfully.");
                          showWorkflowToast("Template saved successfully.");
                        }}
                        className="inline-flex min-w-[130px] items-center justify-center whitespace-nowrap rounded-full border border-[#D8C36A]/40 px-5 py-2.5 text-sm font-bold uppercase tracking-[0.1em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setTemplatePreviewVisible(true)}
                        disabled={!templatePreview}
                        className="inline-flex min-w-[130px] items-center justify-center whitespace-nowrap rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold uppercase tracking-[0.1em] text-zinc-200 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Preview
                      </button>
                    </div>

                    {templatePreviewVisible && templatePreview && (
                      <div className="rounded-2xl border border-white/10 bg-zinc-950 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Preview
                        </p>
                        <p className="mt-3 text-sm font-semibold text-white">
                          {templatePreview.subject}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-zinc-300">
                          {templatePreview.body}
                        </p>
                      </div>
                    )}

                    <div className="rounded-2xl border border-[#D8C36A]/20 bg-[#D8C36A]/10 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F2D66C]">
                            Send Workflow
                          </p>
                          <p className="mt-2 text-sm text-zinc-300">
                            Send this template to{" "}
                            <span className="font-semibold text-white">
                              {activeWorkflowBookings.length}
                            </span>{" "}
                            active booking
                            {activeWorkflowBookings.length === 1
                              ? ""
                              : "s"}{" "}
                            for {getShowLabel(workflowShow)}.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={sendSelectedTemplateCommunication}
                          disabled={activeWorkflowBookings.length === 0}
                          className="inline-flex min-w-[210px] max-w-full items-center justify-center whitespace-nowrap rounded-full bg-[#D8C36A] px-5 py-3 text-center text-sm font-bold text-black transition hover:bg-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Send Communication
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Operational Broadcast
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  Send show-wide guest updates for active bookings on
                  the selected show.
                </p>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr]">
                  <select
                    value={broadcastForm.channel}
                    onChange={(event) =>
                      setBroadcastForm((currentForm) => ({
                        ...currentForm,
                        channel: event.target
                          .value as CommunicationChannel,
                      }))
                    }
                    className="rounded-xl border border-zinc-700 bg-black px-4 py-3"
                  >
                    {(
                      ["email", "push", "sms"] as CommunicationChannel[]
                    ).map((channel) => (
                      <option key={channel} value={channel}>
                        {communicationChannelLabels[channel]}
                      </option>
                    ))}
                  </select>
                  <input
                    value={broadcastForm.subject}
                    onChange={(event) =>
                      setBroadcastForm((currentForm) => ({
                        ...currentForm,
                        subject: event.target.value,
                      }))
                    }
                    placeholder="Broadcast subject"
                    className="rounded-xl border border-zinc-700 bg-black px-4 py-3"
                  />
                </div>
                <textarea
                  value={broadcastForm.message}
                  onChange={(event) =>
                    setBroadcastForm((currentForm) => ({
                      ...currentForm,
                      message: event.target.value,
                    }))
                  }
                  rows={5}
                  placeholder="Operational message for all active guests on this show"
                  className="mt-3 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3"
                />
                <button
                  type="button"
                  onClick={broadcastOperationalUpdate}
                  disabled={!broadcastForm.message.trim()}
                  className="mt-4 inline-flex min-w-[230px] max-w-full items-center justify-center whitespace-nowrap rounded-full bg-white px-6 py-3 text-center text-sm font-semibold text-black transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Broadcast To Show Guests
                </button>

              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/35 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Communication History
                  </p>
                  <p className="mt-2 text-sm text-zinc-400">
                    Recent workflow activity for {getShowLabel(workflowShow)}.
                  </p>
                </div>
                <p className="text-sm font-semibold text-[#D8C36A]">
                  {workflowCommunicationHistory.length} record
                  {workflowCommunicationHistory.length === 1 ? "" : "s"}
                </p>
              </div>

              {workflowCommunicationHistory.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-white/10 bg-zinc-950 p-4 text-sm text-zinc-400">
                  No communications have been sent for this show yet.
                </p>
              ) : (
                <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
                  {workflowCommunicationHistory.map(
                    ({ booking, record, showLabel, templateName }) => (
                      <div
                        key={`workflow-history-${record.id}`}
                        className="rounded-2xl border border-white/10 bg-zinc-950 p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
                              {templateName}
                            </p>
                            <p className="mt-1 font-semibold text-white">
                              {record.subject ?? "Guest communication"}
                            </p>
                            <p className="mt-1 text-sm text-zinc-400">
                              {booking.customer.name || "Guest"} ·{" "}
                              {booking.reference} ·{" "}
                              {communicationChannelLabels[record.channel]}
                            </p>
                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                              {showLabel}
                            </p>
                          </div>
                          <p className="text-xs text-zinc-500">
                            {new Date(record.sentAt).toLocaleString()}
                          </p>
                        </div>
                        <p className="mt-3 line-clamp-2 text-sm text-zinc-300">
                          {record.message}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {activeAdminTab === "operations" &&
          activeOperationsTab === "check-in" &&
          canViewStaffOperations && (
        <section className="mb-10 rounded-2xl border border-[#D8C36A]/35 bg-[radial-gradient(circle_at_top,#24180D_0%,#111_42%,#050505_100%)] p-6 shadow-2xl shadow-[#8D7A2F]/10">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                Concierge Operations
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-3xl font-bold">
                  Guest Arrivals
                </h2>

                <label className="group relative block w-10 shrink-0 transition-all duration-300 focus-within:w-full sm:focus-within:w-80">
                  <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-[#F2D66C] transition-all duration-300 group-focus-within:left-4 group-focus-within:translate-x-0">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-4.35-4.35" />
                    </svg>
                  </span>
                  <input
                    value={staffSearch}
                    onChange={(event) =>
                      setStaffSearch(event.target.value)
                    }
                    aria-label="Search guest arrivals"
                    className="h-10 w-full rounded-full border border-[#D8C36A]/35 bg-black/45 pl-10 pr-0 text-sm text-transparent shadow-[0_0_18px_rgba(216,195,106,0.1)] transition-all duration-300 focus:border-[#D8C36A]/70 focus:pr-4 focus:text-white focus:outline-none"
                  />
                </label>
              </div>
              <p className="mt-2 text-zinc-400">
                Live arrivals for{" "}
                <span className="font-semibold text-white">
                  {getShowLabel(selectedShow)}
                </span>
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 lg:max-w-2xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <label className="flex cursor-pointer items-center gap-3 rounded-full border border-white/15 bg-black/35 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-[#D8C36A]/50 hover:text-white">
                  <input
                    type="checkbox"
                    checked={hideCancelledConcierge}
                    onChange={(event) =>
                      setHideCancelledConcierge(event.target.checked)
                    }
                    className="h-4 w-4 accent-[#D8C36A]"
                  />
                  Hide Cancelled
                </label>
                <select
                  value={conciergeStatusFilter}
                  onChange={(event) =>
                    setConciergeStatusFilter(
                      event.target.value as BookingStatus | "all",
                    )
                  }
                  className="rounded-full border border-white/15 bg-black/35 px-4 py-2 text-sm font-semibold text-zinc-300"
                >
                  <option value="all">All Statuses</option>
                  {bookingStatuses.map((status) => (
                    <option key={status} value={status}>
                      {bookingStatusLabels[status]}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 rounded-full border border-white/15 bg-black/35 p-1">
                  {(
                    [
                      ["list", "List View"],
                      ["grid", "Grid View"],
                    ] as Array<[BookingViewMode, string]>
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setConciergeViewMode(mode)}
                      className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                        conciergeViewMode === mode
                          ? "bg-[#D8C36A] text-black"
                          : "text-zinc-300 hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Show Capacity
              </p>
              <p className="mt-2 text-3xl font-bold">
                {selectedShowCapacity}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Reserved Guests
              </p>
              <p className="mt-2 text-3xl font-bold">
                {reservedGuests}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-950/20 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                Arrived Guests
              </p>
              <p className="mt-2 text-3xl font-bold">
                {arrivedGuests}
              </p>
            </div>

            <div className="rounded-2xl border border-[#D8C36A]/30 bg-black/35 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">
                Live Occupancy
              </p>
              <p className="mt-2 text-3xl font-bold">
                {occupancyPercent}%
              </p>
            </div>
          </div>

          {staffBookings.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-zinc-400">
              No bookings match this staff search.
            </div>
          ) : (
            <div
              className={
                conciergeViewMode === "grid"
                  ? "grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3"
                  : "grid grid-cols-1 gap-3"
              }
            >
              {staffBookings.map((booking) => {
                const status = booking.status ?? "confirmed";
                const isCheckedIn = status === "checked-in";
                const isCancelled = status === "cancelled";
                const ticketState = getBookingTicketState(booking);

                return (
                  <div
                    key={`staff-${booking.reference}`}
                    className="rounded-2xl border border-white/10 bg-black/35 p-5"
                  >
                    <div
                      className={
                        conciergeViewMode === "grid"
                          ? "flex flex-col gap-4"
                          : "flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
                      }
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">
                            {booking.reference}
                          </p>
                          <span
                            className={`inline-flex min-w-max shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.54rem] font-semibold uppercase leading-none tracking-[0.06em] ${bookingStatusClasses[status]}`}
                          >
                            {bookingStatusLabels[status]}
                          </span>
                          <span
                            className={`inline-flex min-w-max shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.54rem] font-semibold uppercase leading-none tracking-[0.06em] ${
                              ticketState === "Active"
                                ? "border-emerald-400/40 bg-emerald-950/30 text-emerald-300"
                                : ticketState === "Checked In"
                                  ? "border-sky-300/40 bg-sky-950/30 text-sky-200"
                                  : ticketState === "Cancelled"
                                    ? "border-red-400/40 bg-red-950/30 text-red-300"
                                    : "border-amber-300/40 bg-amber-950/30 text-amber-200"
                            }`}
                          >
                            {ticketState}
                          </span>
                        </div>

                        <h3 className="mt-2 text-2xl font-bold">
                          {booking.customer.name || "Unnamed Guest"}
                        </h3>
                        <p className="mt-1 text-zinc-400">
                          Table {booking.tableNumber || "Unassigned"} ·{" "}
                          {booking.zoneTitle} · {booking.partySize}{" "}
                          guests
                        </p>
                        <p className="mt-2 text-sm text-zinc-500">
                          Arrival:{" "}
                          <span className="text-zinc-300">
                            {formatArrivalTime(booking.arrivalTime)}
                          </span>
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={isCheckedIn || isCancelled}
                        onClick={() => checkInGuest(booking)}
                        className="rounded-full border border-emerald-300/50 px-5 py-2.5 font-semibold text-emerald-200 transition hover:bg-emerald-300 hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        {isCheckedIn
                          ? "Guest Arrived"
                          : "Check In Guest"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        )}

        {activeAdminTab === "operations" &&
          activeOperationsTab === "floor" &&
          canManageTables && (
        <div className="grid grid-cols-1 gap-8">
          <section className="overflow-hidden rounded-[2rem] border border-[#D8C36A]/25 bg-[radial-gradient(circle_at_top,#221808_0%,#090909_48%,#030303_100%)] p-5 shadow-2xl shadow-black/35 sm:p-7">
            <div className="mb-6 rounded-[1.5rem] border border-[#D8C36A]/25 bg-black/45 p-5 shadow-[0_0_35px_rgba(216,195,106,0.08)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#D8C36A]">
                    Editing Layout
                  </p>
                  <div className="mt-3 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
                    <label className="relative inline-flex">
                      <span className="sr-only">
                        Select show layout context
                      </span>
                      <select
                        value={selectedShowId}
                        onChange={(event) =>
                          selectFloorEditingShow(event.target.value)
                        }
                        className="appearance-none rounded-full border border-white/15 bg-black/35 py-2 pl-4 pr-8 text-sm font-semibold text-zinc-300 transition hover:border-[#D8C36A]/50 hover:text-white"
                      >
                        {shows.map((show) => (
                          <option key={show.id} value={show.id}>
                            {show.label}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.6rem] text-zinc-500">
                        ▾
                      </span>
                    </label>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setIsFloorCalendarOpen((isOpen) => !isOpen)
                        }
                        className="rounded-full border border-white/15 bg-black/35 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-[#D8C36A]/50 hover:text-white"
                      >
                        {selectedShowDateLabel}
                      </button>

                      {isFloorCalendarOpen && (
                        <div className="absolute left-0 top-12 z-30 w-72 rounded-[1.5rem] border border-[#D8C36A]/25 bg-zinc-950 p-4 shadow-2xl shadow-black/50">
                          <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold text-white">
                              {
                                bookingCalendarMonths[
                                  floorCalendarMonthStart.getMonth()
                                ]
                              }{" "}
                              {floorCalendarMonthStart.getFullYear()}
                            </p>
                          </div>
                          <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                            {bookingCalendarWeekdays.map(
                              (weekday, index) => (
                                <span key={`${weekday}-${index}`}>
                                  {weekday}
                                </span>
                              ),
                            )}
                          </div>
                          <div className="mt-2 grid grid-cols-7 gap-1">
                            {floorCalendarCells.map((day, index) => {
                              if (!day) {
                                return (
                                  <span
                                    key={`floor-empty-${index}`}
                                    className="aspect-square"
                                  />
                                );
                              }

                              const dateValue = `${floorCalendarMonthStart.getFullYear()}-${String(
                                floorCalendarMonthStart.getMonth() + 1,
                              ).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                              const showForDate = shows.find(
                                (show) => show.date === dateValue,
                              );
                              const isAvailable = Boolean(showForDate);
                              const isSelected =
                                selectedShow?.date === dateValue;

                              return (
                                <button
                                  key={`floor-${dateValue}`}
                                  type="button"
                                  disabled={!isAvailable}
                                  onClick={() => {
                                    if (showForDate) {
                                      selectFloorEditingShow(
                                        showForDate.id,
                                      );
                                      setIsFloorCalendarOpen(false);
                                    }
                                  }}
                                  className={`aspect-square rounded-xl text-sm font-semibold transition ${
                                    isSelected
                                      ? "bg-[#D8C36A] text-black"
                                      : isAvailable
                                        ? "border border-[#D8C36A]/25 bg-[#D8C36A]/10 text-[#F2D66C] hover:bg-[#D8C36A]/20"
                                        : "bg-white/[0.03] text-zinc-700"
                                  }`}
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">
                    {selectedShowDateLabel} · {venueConfig.venueName}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-[#D8C36A]/35 bg-[#D8C36A]/10 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[#F2D66C]">
                    Per-Show Layout
                  </span>
                  <span className="rounded-full border border-sky-300/30 bg-sky-950/20 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-sky-200">
                    Temporary Overrides
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-300">
                    Base Venue Preserved
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-zinc-300 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Scope
                  </p>
                  <p className="mt-2">
                    Table changes below apply only to this selected
                    show/date.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Show Overrides
                  </p>
                  <p className="mt-2">
                    <span className="font-semibold text-[#F2D66C]">
                      {selectedShowOverrideCount}
                    </span>{" "}
                    temporary table override
                    {selectedShowOverrideCount === 1 ? "" : "s"} active.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Merged Units
                  </p>
                  <p className="mt-2">
                    <span className="font-semibold text-sky-200">
                      {selectedShowMergedCount}
                    </span>{" "}
                    custom combined table
                    {selectedShowMergedCount === 1 ? "" : "s"} for this
                    show.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                  Floor Operations
                </p>
                <h2 className="mt-2 text-3xl font-bold">
                  Visual Venue Map
                </h2>
                <p className="mt-2 max-w-2xl text-zinc-400">
                  Select a seating zone to focus table operations and
                  reduce long scrolling.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { id: "all" as const, title: "All Tables" },
                  ...floorManagementZones,
                ].map((zone) => {
                  const isActive = floorZoneFilter === zone.id;
                  const zoneLabel =
                    floorZoneFilterLabels[zone.id] ?? zone.title;

                  return (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => {
                        setFloorZoneFilter(zone.id);
                        setExpandedTableId("");
                      }}
                      className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                        isActive
                          ? "border-[#D8C36A] bg-[#D8C36A] text-black shadow-[0_0_26px_rgba(216,195,106,0.18)]"
                          : "border-white/15 bg-black/35 text-zinc-300 hover:border-[#D8C36A]/60 hover:text-white"
                      }`}
                    >
                      {zoneLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(320px,0.9fr)_1fr]">
              <div className="relative mx-auto aspect-square w-full max-w-[560px] rounded-[2rem] border border-white/10 bg-black/45 p-5 shadow-inner shadow-black">
                <div className="absolute inset-5 rounded-full border border-[#D8C36A]/15 bg-[radial-gradient(circle,#4D4213_0_11%,#4A0D2B_12%_33%,#0F5C4D_34%_57%,#5B001B_58%_76%,transparent_77%)] opacity-90" />
                <div className="absolute left-1/2 top-1/2 z-10 flex h-[18%] w-[18%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#D8C36A]/45 bg-[#4D4213] text-xs font-semibold uppercase tracking-[0.16em] text-white shadow-[0_0_30px_rgba(216,195,106,0.24)]">
                  Stage
                </div>

                {floorManagementZones.map((zone) => {
                  const stats = getZoneStats(
                    tables,
                    selectedShowId,
                    zone,
                  );
                  const zoneTables = getZoneTables(
                    tables,
                    selectedShowId,
                    zone.id,
                  );
                  const activeTables = zoneTables.filter(
                    (table) =>
                      getTableOccupancy(table, bookings).state !==
                      "available",
                  ).length;
                  const isActive =
                    floorZoneFilter === "all" ||
                    floorZoneFilter === zone.id;

                  return (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => {
                        setFloorZoneFilter(zone.id);
                        setExpandedTableId("");
                      }}
                      className={`absolute z-20 flex flex-col items-center justify-center border text-center text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-white transition duration-300 sm:text-xs ${zone.colour} ${zone.mapClass} ${
                        isActive
                          ? "opacity-95 shadow-[0_0_34px_rgba(216,195,106,0.22)]"
                          : "opacity-45 grayscale"
                      } hover:scale-[1.015] hover:opacity-100`}
                    >
                      <span>{zone.title}</span>
                      <span className="mt-1 text-[0.58rem] font-normal normal-case tracking-normal text-white/75 sm:text-[0.68rem]">
                        {activeTables}/{zoneTables.length} tables ·{" "}
                        {stats.remainingSeats} seats open
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {floorManagementZones.map((zone) => {
                  const stats = getZoneStats(
                    tables,
                    selectedShowId,
                    zone,
                  );
                  const zoneTables = getZoneTables(
                    tables,
                    selectedShowId,
                    zone.id,
                  );
                  const zoneOccupancyCounts = zoneTables.reduce(
                    (counts, table) => {
                      const { state } = getTableOccupancy(
                        table,
                        bookings,
                      );

                      return {
                        ...counts,
                        [state]: counts[state] + 1,
                      };
                    },
                    {
                      available: 0,
                      blocked: 0,
                      "checked-in": 0,
                      reserved: 0,
                    } as Record<TableOccupancyState, number>,
                  );

                  return (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => {
                        setFloorZoneFilter(zone.id);
                        setExpandedTableId("");
                      }}
                      className={`rounded-2xl border bg-black/35 p-4 text-left transition hover:-translate-y-0.5 hover:border-[#D8C36A]/50 ${
                        floorZoneFilter === zone.id
                          ? "border-[#D8C36A]/70 shadow-[0_0_24px_rgba(216,195,106,0.12)]"
                          : "border-white/10"
                      }`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
                        {zone.title}
                      </p>
                      <p className="mt-2 text-2xl font-bold">
                        {stats.remainingSeats}
                      </p>
                      <p className="text-xs text-zinc-500">
                        seats remaining
                      </p>
                      <p className="mt-3 text-xs leading-5 text-zinc-300">
                        {zoneOccupancyCounts.available} available ·{" "}
                        {zoneOccupancyCounts.reserved} reserved ·{" "}
                        {zoneOccupancyCounts.blocked} blocked
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {floorManagementZones
            .filter(
              (zone) =>
                floorZoneFilter === "all" ||
                floorZoneFilter === zone.id,
            )
            .map((zone) => {
            const zoneTables = getZoneTables(
              tables,
              selectedShowId,
              zone.id,
            );
            const stats = getZoneStats(
              tables,
              selectedShowId,
              zone,
            );
            const availableMergeTargets = zoneTables.filter(
              (table) =>
                table.status === "available" &&
                table.mergeable !== false &&
                !table.bookingReference &&
                !table.mergedFrom?.length &&
                !table.mergedInto,
            );
            const zoneOccupancyCounts = zoneTables.reduce(
              (counts, table) => {
                const { state } = getTableOccupancy(table, bookings);

                return {
                  ...counts,
                  [state]: counts[state] + 1,
                };
              },
              {
                available: 0,
                blocked: 0,
                "checked-in": 0,
                reserved: 0,
              } as Record<TableOccupancyState, number>,
            );

            return (
              <section
                key={zone.id}
                className={`${zone.adminColour} rounded-2xl border p-6 shadow-2xl shadow-black/30`}
              >
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-3xl font-semibold">
                      {zone.title}
                    </h2>

                    <p className="mt-2 text-zinc-200">
                      {zone.subtitle}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:min-w-[680px] lg:grid-cols-4">
                    <div className="rounded-xl border border-white/15 bg-black/30 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                        Total Capacity
                      </p>
                      <p className="mt-2 text-3xl font-bold">
                        {stats.totalCapacity}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/15 bg-black/30 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                        Booked Seats
                      </p>
                      <p className="mt-2 text-3xl font-bold">
                        {stats.bookedSeats}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/15 bg-black/30 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                        Remaining Seats
                      </p>
                      <p className="mt-2 text-3xl font-bold">
                        {stats.remainingSeats}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/15 bg-black/30 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                        Table Occupancy
                      </p>
                      <p className="mt-2 text-sm leading-6 text-zinc-300">
                        <span className="text-emerald-300">
                          {zoneOccupancyCounts.available}
                        </span>{" "}
                        available ·{" "}
                        <span className="text-amber-200">
                          {zoneOccupancyCounts.reserved}
                        </span>{" "}
                        reserved ·{" "}
                        <span className="text-sky-200">
                          {zoneOccupancyCounts["checked-in"]}
                        </span>{" "}
                        arrived ·{" "}
                        <span className="text-red-300">
                          {zoneOccupancyCounts.blocked}
                        </span>{" "}
                        blocked
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-5">
                  <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">
                        Table Management
                      </p>
                      <p className="mt-1 text-zinc-300">
                        Create, edit, merge, and disable tables
                        inside this seating zone.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_auto]">
                      <input
                        value={newTables[zone.id].tableNumber}
                        onChange={(event) =>
                          setNewTables((currentForms) => ({
                            ...currentForms,
                            [zone.id]: {
                              ...currentForms[zone.id],
                              tableNumber: event.target.value,
                            },
                          }))
                        }
                        placeholder="Table number"
                        className="rounded-xl border border-white/15 bg-zinc-950 px-4 py-3"
                      />

                      <input
                        type="number"
                        min={1}
                        value={newTables[zone.id].seatCapacity}
                        onChange={(event) =>
                          setNewTables((currentForms) => ({
                            ...currentForms,
                            [zone.id]: {
                              ...currentForms[zone.id],
                              seatCapacity: Number(
                                event.target.value,
                              ),
                            },
                          }))
                        }
                        className="rounded-xl border border-white/15 bg-zinc-950 px-4 py-3"
                      />

                      <button
                        type="button"
                        onClick={() => createTable(zone.id)}
                        className="rounded-full bg-white px-6 py-3 font-semibold text-black transition hover:bg-zinc-300"
                      >
                        Create
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {zoneTables.map((table) => {
                      const tableOccupancy = getTableOccupancy(
                        table,
                        bookings,
                      );
                      const isExpanded = expandedTableId === table.id;
                      const hasOverride = Boolean(table.showOverride);
                      const baseSeatCapacity =
                        table.baseSeatCapacity ?? table.seatCapacity;
                      const baseStatus = table.baseStatus ?? table.status;
                      const baseMergeable = table.baseMergeable ?? true;
                      const linkedParent = table.mergedInto
                        ? zoneTables.find(
                            (zoneTable) =>
                              zoneTable.id === table.mergedInto,
                          )
                        : undefined;
                      const linkedChildren = table.mergedFrom?.length
                        ? zoneTables.filter((zoneTable) =>
                            table.mergedFrom?.includes(zoneTable.id),
                          )
                        : [];
                      const linkedTableNumbers = linkedChildren
                        .map((linkedTable) => linkedTable.tableNumber)
                        .join(" + ");
                      const tableSplitReview = table.mergedFrom?.length
                        ? getSplitMergeReview(table)
                        : undefined;
                      const splitTargetName =
                        tableSplitReview?.targetTableId
                          ? linkedChildren.find(
                              (linkedTable) =>
                                linkedTable.id ===
                                tableSplitReview.targetTableId,
                            )?.tableNumber
                          : undefined;

                      return (
                      <div
                        key={table.id}
                        className={`rounded-2xl border bg-black/35 p-4 transition ${
                          tableOccupancy.state === "available"
                            ? "border-emerald-400/20"
                            : tableOccupancy.state === "reserved"
                            ? "border-amber-300/25"
                            : tableOccupancy.state === "checked-in"
                            ? "border-sky-300/25"
                            : "border-red-400/25 opacity-75"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTableId((currentTableId) =>
                              currentTableId === table.id
                                ? ""
                                : table.id,
                            )
                          }
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-2xl font-bold">
                                {table.tableNumber}
                              </p>
                              <p className="mt-1 text-sm text-zinc-400">
                                {table.seatCapacity} seats
                                {hasOverride &&
                                  table.seatCapacity !==
                                    baseSeatCapacity &&
                                  ` · default ${baseSeatCapacity}`}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <span
                                className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] ${tableOccupancyClasses[tableOccupancy.state]}`}
                              >
                                {
                                  tableOccupancyLabels[
                                    tableOccupancy.state
                                  ]
                                }
                              </span>
                              {hasOverride && (
                                <span className="rounded-full border border-[#D8C36A]/35 bg-[#D8C36A]/10 px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-[#F2D66C]">
                                  Override
                                </span>
                              )}
                              {table.mergeable === false && (
                                <span className="rounded-full border border-purple-300/30 bg-purple-950/20 px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-purple-200">
                                  Merge Off
                                </span>
                              )}
                              {table.mergedFrom?.length && (
                                <span className="rounded-full border border-sky-300/30 bg-sky-950/20 px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-sky-200">
                                  Merged Parent
                                </span>
                              )}
                              {linkedParent && (
                                <span className="rounded-full border border-zinc-500/40 bg-zinc-900 px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-zinc-300">
                                  Linked Child
                                </span>
                              )}
                            </div>
                          </div>

                          <p className="mt-4 min-h-10 text-sm text-zinc-300">
                            {linkedParent
                              ? `Linked into ${linkedParent.tableNumber}`
                              : tableOccupancy.booking
                              ? `${tableOccupancy.booking.customer.name || "Guest"} · ${tableOccupancy.booking.partySize} pax`
                              : table.guestNotes ||
                                "Available for allocation"}
                          </p>

                          {table.mergedFrom?.length && (
                            <p className="mt-2 rounded-xl border border-sky-300/20 bg-sky-950/10 px-3 py-2 text-xs text-sky-100">
                              Combined unit: {linkedTableNumbers} ·{" "}
                              {table.seatCapacity} total seats
                            </p>
                          )}

                          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#D8C36A]">
                            {isExpanded
                              ? "Hide Details"
                              : "Open Details"}
                          </p>
                        </button>

                        {isExpanded && (
                        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-white/10 pt-4">
                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Table Number
                            </span>
                            <input
                              value={table.tableNumber}
                              onChange={(event) =>
                                updateTable(table.id, {
                                  tableNumber:
                                    event.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-white/15 bg-zinc-950 px-4 py-3"
                            />
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Seats For Selected Show
                            </span>
                            <input
                              type="number"
                              min={1}
                              value={table.seatCapacity}
                              onChange={(event) =>
                                updateTableShowOverride(table.id, {
                                  seatCapacity: Number(
                                    event.target.value,
                                  ),
                                })
                              }
                              className="w-full rounded-xl border border-white/15 bg-zinc-950 px-4 py-3"
                            />
                            {table.seatCapacity !== baseSeatCapacity && (
                              <p className="mt-2 text-xs text-[#F2D66C]">
                                Venue default: {baseSeatCapacity} seats
                              </p>
                            )}
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Status For Selected Show
                            </span>
                            <select
                              value={table.status}
                              onChange={(event) =>
                                updateTableShowOverride(table.id, {
                                  status: event.target
                                    .value as DemoTable["status"],
                                })
                              }
                              className="w-full rounded-xl border border-white/15 bg-zinc-950 px-4 py-3"
                            >
                              <option value="available">
                                Available
                              </option>
                              <option value="booked">
                                Reserved
                              </option>
                              <option value="disabled">
                                Blocked
                              </option>
                            </select>
                            {table.status !== baseStatus && (
                              <p className="mt-2 text-xs text-[#F2D66C]">
                                Venue default:{" "}
                                {baseStatus === "booked"
                                  ? "Reserved"
                                  : baseStatus === "disabled"
                                    ? "Blocked"
                                    : "Available"}
                              </p>
                            )}
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Temporary Operational Notes
                            </span>
                            <input
                              value={table.guestNotes}
                              onChange={(event) =>
                                updateTableShowOverride(table.id, {
                                  operationalNotes:
                                    event.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-white/15 bg-zinc-950 px-4 py-3"
                            />
                          </label>

                          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                                  Merge Compatibility
                                </p>
                                <p className="mt-1 text-sm text-zinc-400">
                                  Default:{" "}
                                  {baseMergeable ? "Mergeable" : "Fixed"}
                                </p>
                              </div>
                              <label className="flex items-center gap-3 text-sm font-semibold text-zinc-300">
                                <input
                                  type="checkbox"
                                  checked={table.mergeable !== false}
                                  onChange={(event) =>
                                    updateTableShowOverride(table.id, {
                                      mergeable:
                                        event.target.checked,
                                    })
                                  }
                                  className="h-4 w-4 accent-[#D8C36A]"
                                />
                                Allow merging
                              </label>
                            </div>
                          </div>

                          {hasOverride && (
                            <button
                              type="button"
                              onClick={() =>
                                resetTableShowOverride(table)
                              }
                              className="rounded-full border border-[#D8C36A]/35 px-4 py-2 text-sm font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                            >
                              Reset To Venue Default
                            </button>
                          )}
                        </div>
                        )}

                        {isExpanded && (
                        <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4">
                          <div className="flex flex-wrap gap-2 text-sm text-zinc-300">
                            {(table.bookingReference ||
                              tableOccupancy.booking) && (
                              <span className="rounded-full border border-emerald-400/30 bg-emerald-950/30 px-3 py-1 text-emerald-300">
                                {table.bookingReference ??
                                  tableOccupancy.booking?.reference}
                              </span>
                            )}
                            {table.mergedFrom && (
                              <span className="rounded-full border border-[#D8C36A]/30 bg-black/40 px-3 py-1">
                                Merged Table · {linkedTableNumbers}
                              </span>
                            )}
                            {linkedParent && (
                              <span className="rounded-full border border-zinc-500/40 bg-zinc-900 px-3 py-1 text-zinc-300">
                                Child of {linkedParent.tableNumber}
                              </span>
                            )}
                          </div>

                          {table.mergedFrom?.length && (
                            <div className="rounded-2xl border border-sky-300/20 bg-sky-950/10 p-4 text-sm text-sky-100">
                              <p className="font-semibold text-white">
                                Operational Merge Summary
                              </p>
                              <p className="mt-1">
                                {table.tableNumber} behaves as one
                                operational table combining{" "}
                                {linkedTableNumbers}. Capacity is{" "}
                                {table.seatCapacity} seats and occupancy is
                                tracked only on this merged parent.
                              </p>
                              {tableSplitReview && (
                                <p className="mt-2 rounded-xl border border-amber-300/20 bg-amber-950/15 px-3 py-2 text-amber-100">
                                  Split review:{" "}
                                  {tableSplitReview.warning}
                                </p>
                              )}
                              {(table.mergeHistory ?? []).length > 0 && (
                                <div className="mt-3 border-t border-white/10 pt-3">
                                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">
                                    Merge Lifecycle
                                  </p>
                                  <div className="mt-2 space-y-1 text-xs text-zinc-300">
                                    {(table.mergeHistory ?? [])
                                      .slice(-3)
                                      .map((event) => (
                                        <p key={event.id}>
                                          {event.type.toUpperCase()} ·{" "}
                                          {event.summary}
                                        </p>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex flex-col gap-3">
                            <select
                              value={mergeSelections[zone.id]}
                              onChange={(event) =>
                                setMergeSelections(
                                  (currentSelections) => ({
                                    ...currentSelections,
                                    [zone.id]: event.target.value,
                                  }),
                                )
                              }
                              className="rounded-xl border border-white/15 bg-zinc-950 px-4 py-3"
                            >
                              <option value="">
                                Merge with...
                              </option>
                              {availableMergeTargets
                                .filter(
                                  (targetTable) =>
                                    targetTable.id !== table.id,
                                )
                                .map((targetTable) => (
                                  <option
                                    key={targetTable.id}
                                    value={targetTable.id}
                                  >
                                    {targetTable.tableNumber}
                                  </option>
                                ))}
                            </select>

                            <button
                              type="button"
                              disabled={
                                table.status !== "available" ||
                                table.mergeable === false ||
                                Boolean(table.mergedInto) ||
                                Boolean(table.mergedFrom?.length) ||
                                !mergeSelections[zone.id]
                              }
                              onClick={() =>
                                mergeTable(zone.id, table)
                              }
                              className="rounded-full border border-white/20 px-5 py-3 font-semibold transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              Merge
                            </button>

                            {table.mergedFrom?.length && (
                              <button
                                type="button"
                                disabled={
                                  Boolean(tableSplitReview?.booking) &&
                                  !tableSplitReview?.targetTableId
                                }
                                onClick={() =>
                                  requestSplitMergedTable(table)
                                }
                                className="rounded-full border border-sky-300/40 px-5 py-3 font-semibold text-sky-100 transition hover:bg-sky-300 hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
                              >
                                {splitTargetName
                                  ? `Review Split to ${splitTargetName}`
                                  : "Review Split / Restore"}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => toggleDisabled(table)}
                              className="rounded-full border border-white/20 px-5 py-3 font-semibold transition hover:bg-white hover:text-black"
                            >
                              {table.status === "disabled"
                                ? "Enable"
                                : "Disable"}
                            </button>
                          </div>
                        </div>
                        )}
                      </div>
                    );
                    })}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
        )}

        {activeAdminTab === "corporate" && canViewBookingManagement && (
          <div className="mt-12 space-y-8 border-t border-zinc-800 pt-10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                  Corporate Enquiries
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-3xl font-bold">Corporate Requests</h2>
                  <label className="group relative block w-10 shrink-0 transition-all duration-300 focus-within:w-full sm:focus-within:w-80">
                    <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-[#F2D66C] transition-all duration-300 group-focus-within:left-4 group-focus-within:translate-x-0">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-4.35-4.35" />
                      </svg>
                    </span>
                    <input
                      value={corporateSearch}
                      onChange={(event) =>
                        setCorporateSearch(event.target.value)
                      }
                      aria-label="Search corporate requests"
                      className="h-10 w-full rounded-full border border-[#D8C36A]/35 bg-black/45 pl-10 pr-0 text-sm text-transparent shadow-[0_0_18px_rgba(216,195,106,0.1)] transition-all duration-300 focus:border-[#D8C36A]/70 focus:pr-4 focus:text-white focus:outline-none"
                    />
                  </label>
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                  Track tentative group enquiries, agent contact requests,
                  quote status, payment readiness, and corporate direct source
                  information.
                </p>
              </div>
              <div className="rounded-2xl border border-[#D8C36A]/25 bg-black/35 px-4 py-3 text-sm text-zinc-300">
                <span className="font-semibold text-white">
                  {filteredActiveCorporateRequests.length}
                </span>{" "}
                active request
                {filteredActiveCorporateRequests.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <label className="relative inline-flex w-full sm:w-auto">
                <select
                  value={corporateStatusFilter}
                  onChange={(event) =>
                    setCorporateStatusFilter(
                      event.target.value as
                        | CorporateRequestStatus
                        | "archived"
                        | "all",
                    )
                  }
                  className="w-full appearance-none rounded-full border border-white/15 bg-black/35 py-2 pl-4 pr-8 text-sm font-semibold text-zinc-300 sm:w-auto"
                >
                  <option value="all">All Statuses</option>
                  {(
                    Object.keys(
                      corporateRequestStatusLabels,
                    ) as CorporateRequestStatus[]
                  ).map((status) => (
                    <option key={status} value={status}>
                      {corporateRequestStatusLabels[status]}
                    </option>
                  ))}
                  <option value="archived">Archived</option>
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.6rem] text-zinc-500">
                  ▾
                </span>
              </label>

              <div className="inline-flex w-full rounded-full border border-white/10 bg-black/35 p-1 sm:w-auto">
                {(["list", "grid"] as BookingViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setCorporateViewMode(mode)}
                    className={`flex-1 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition sm:flex-none ${
                      corporateViewMode === mode
                        ? "bg-[#D8C36A] text-black"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    {mode === "list" ? "List View" : "Grid View"}
                  </button>
                ))}
              </div>
            </div>

            <section>
              <h3 className="text-xl font-bold uppercase">Active Requests</h3>
              {filteredActiveCorporateRequests.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-zinc-400">
                  No active corporate requests match the current filters.
                </div>
              ) : (
                <div
                  className={`mt-4 grid gap-4 ${
                    corporateViewMode === "grid"
                      ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                      : "grid-cols-1"
                  }`}
                >
                  {filteredActiveCorporateRequests.map((request) =>
                    renderCorporateRequestCard(request),
                  )}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-xl font-bold uppercase">Archived Requests</h3>
              {filteredArchivedCorporateRequests.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-zinc-400">
                  No archived corporate records match the current filters.
                </div>
              ) : (
                <div
                  className={`mt-4 grid gap-4 ${
                    corporateViewMode === "grid"
                      ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                      : "grid-cols-1"
                  }`}
                >
                  {filteredArchivedCorporateRequests.map((request) =>
                    renderCorporateRequestCard(request, {
                      isArchived: true,
                    }),
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {activeAdminTab === "bookings" && canViewBookingManagement && (
        <div className="mt-12 border-t border-zinc-800 pt-10">
          <div className="mb-4">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                Booking Management
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-3xl font-bold">
                  Bookings
                </h2>

                <label className="group relative block w-10 shrink-0 transition-all duration-300 focus-within:w-full sm:focus-within:w-80">
                  <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-[#F2D66C] transition-all duration-300 group-focus-within:left-4 group-focus-within:translate-x-0">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-4.35-4.35" />
                    </svg>
                  </span>
                  <input
                    value={bookingSearch}
                    onChange={(event) => {
                      setBookingSearch(event.target.value);
                      setBookingPage(1);
                    }}
                    aria-label="Search bookings"
                    className="h-10 w-full rounded-full border border-[#D8C36A]/35 bg-black/45 pl-10 pr-0 text-sm text-transparent shadow-[0_0_18px_rgba(216,195,106,0.1)] transition-all duration-300 focus:border-[#D8C36A]/70 focus:pr-4 focus:text-white focus:outline-none"
                  />
                </label>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
	                <label className="relative inline-flex">
	                  <select
	                    value={bookingShowFilter}
                    onChange={(event) => {
                      setBookingShowFilter(event.target.value);
                      setBookingPage(1);
                    }}
                    className="appearance-none rounded-full border border-white/15 bg-black/35 py-2 pl-4 pr-8 text-sm font-semibold text-zinc-300"
                  >
                    <option value="all">All Shows</option>
                    {shows.map((show) => (
                      <option key={show.id} value={show.id}>
                        {getShowLabel(show)}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.6rem] text-zinc-500">
                    ▾
	                  </span>
	                </label>

	                <label className="relative inline-flex">
	                  <select
	                    value={bookingSourceFilter}
	                    onChange={(event) => {
	                      setBookingSourceFilter(
	                        event.target.value as BookingSource | "all",
	                      );
	                      setBookingPage(1);
	                    }}
	                    className="appearance-none rounded-full border border-white/15 bg-black/35 py-2 pl-4 pr-8 text-sm font-semibold text-zinc-300"
	                  >
	                    <option value="all">All Sources</option>
	                    {(
	                      Object.keys(bookingSourceLabels) as BookingSource[]
	                    ).map((source) => (
	                      <option key={source} value={source}>
	                        {bookingSourceLabels[source]}
	                      </option>
	                    ))}
	                  </select>
	                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.6rem] text-zinc-500">
	                    ▾
	                  </span>
	                </label>

	                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setIsBookingCalendarOpen((isOpen) => !isOpen)
                    }
                    className="rounded-full border border-white/15 bg-black/35 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-[#D8C36A]/50 hover:text-white"
                  >
                    {bookingDateFilter === "all"
                      ? "All Dates"
                      : bookingDateFilter}
                  </button>

                  {isBookingCalendarOpen && (
                    <div className="absolute left-0 top-12 z-30 w-72 rounded-[1.5rem] border border-[#D8C36A]/25 bg-zinc-950 p-4 shadow-2xl shadow-black/50">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">
                          {
                            bookingCalendarMonths[
                              bookingCalendarMonthStart.getMonth()
                            ]
                          }{" "}
                          {bookingCalendarMonthStart.getFullYear()}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setBookingDateFilter("all");
                            setBookingPage(1);
                            setIsBookingCalendarOpen(false);
                          }}
                          className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-zinc-300 transition hover:bg-white hover:text-black"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                        {bookingCalendarWeekdays.map((weekday, index) => (
                          <span key={`${weekday}-${index}`}>
                            {weekday}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 grid grid-cols-7 gap-1">
                        {bookingCalendarCells.map((day, index) => {
                          if (!day) {
                            return (
                              <span
                                key={`empty-${index}`}
                                className="aspect-square"
                              />
                            );
                          }

                          const dateValue = `${bookingCalendarMonthStart.getFullYear()}-${String(
                            bookingCalendarMonthStart.getMonth() + 1,
                          ).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                          const isAvailable =
                            bookingFilterDateSet.has(dateValue);
                          const isSelected =
                            bookingDateFilter === dateValue;

                          return (
                            <button
                              key={dateValue}
                              type="button"
                              disabled={!isAvailable}
                              onClick={() => {
                                setBookingDateFilter(dateValue);
                                setBookingPage(1);
                                setIsBookingCalendarOpen(false);
                              }}
                              className={`aspect-square rounded-xl text-sm font-semibold transition ${
                                isSelected
                                  ? "bg-[#D8C36A] text-black"
                                  : isAvailable
                                    ? "border border-[#D8C36A]/25 bg-[#D8C36A]/10 text-[#F2D66C] hover:bg-[#D8C36A]/20"
                                    : "bg-white/[0.03] text-zinc-700"
                              }`}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="flex cursor-pointer items-center gap-3 rounded-full border border-white/15 bg-black/35 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-[#D8C36A]/50 hover:text-white">
                  <input
                    type="checkbox"
                    checked={hideCancelledBookings}
                    onChange={(event) => {
                      setHideCancelledBookings(event.target.checked);
                      setBookingPage(1);
                    }}
                    className="h-4 w-4 accent-[#D8C36A]"
                  />
                  Hide Cancelled
                </label>

                <div className="grid grid-cols-2 rounded-full border border-white/15 bg-black/35 p-1">
                  {(
                    [
                      ["list", "List View"],
                      ["grid", "Grid View"],
                    ] as Array<[BookingViewMode, string]>
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setBookingViewMode(mode);
                        setExpandedBookingReference("");
                      }}
                      className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                        bookingViewMode === mode
                          ? "bg-[#D8C36A] text-black"
                          : "text-zinc-300 hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-[#8D7A2F]/25 bg-black/35 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-zinc-400">
                Showing{" "}
                <span className="font-semibold text-white">
                  {filteredBookings.length}
                </span>{" "}
                matching bookings
              </p>
	              {(bookingSearch || bookingSourceFilter !== "all") && (
	                <button
	                  type="button"
	                  onClick={() => {
	                    setBookingSearch("");
	                    setBookingSourceFilter("all");
	                    setBookingPage(1);
	                  }}
                  className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white hover:text-black"
                >
	                  Clear Filters
	                </button>
	              )}
            </div>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            {bookingStatuses.map((status) => (
              <span
                key={status}
                className={`inline-flex min-w-max shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.54rem] font-semibold uppercase leading-none tracking-[0.06em] ${bookingStatusClasses[status]}`}
              >
                {bookingStatusLabels[status]}
              </span>
            ))}
          </div>

          {bookings.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-zinc-400">
              No demo bookings have been confirmed yet.
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-zinc-400">
              No bookings match that search.
            </div>
          ) : (
            <>
            <div
              className={
                bookingViewMode === "grid"
                  ? "grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3"
                  : "grid grid-cols-1 gap-3 sm:gap-4"
              }
            >
              {paginatedBookings.map((booking) => {
                const financials = getBookingFinancials(booking);
                const currentTable = tables.find(
                  (table) => table.id === booking.tableId,
                );
                const wastedSeats = currentTable
                  ? currentTable.seatCapacity - booking.partySize
                  : 0;
                const betterFitTable = getBetterFitTableSuggestion(
                  tables,
                  booking,
                );
	                const tableCompatibilityWarning =
	                  tableCompatibilityWarnings[booking.reference];
	                const isBookingExpanded =
	                  expandedBookingReference === booking.reference;
	                const corporateCompanyName =
	                  getCorporateBookingCompanyName(booking);
	                const isCorporateBooking =
	                  booking.source === "corporate-direct";
	                const moveTables = tables.filter(
                  (table) =>
                    table.showId === selectedShowId &&
                    table.seatCapacity >= booking.partySize &&
                    table.status !== "disabled" &&
                    canUseTableForBooking(table, booking),
                );

                return (
                  <section
                    key={booking.reference}
                    className={`min-w-0 self-start overflow-hidden rounded-2xl border border-[#8D7A2F]/25 bg-zinc-950/95 p-3 shadow-xl shadow-black/15 transition hover:border-[#D8C36A]/45 sm:p-4 ${
                      bookingViewMode === "grid"
                        ? "min-h-[245px]"
                        : "sm:p-5"
                    }`}
                  >
                    <div
                      className={
                        bookingViewMode === "grid"
                          ? "grid grid-cols-1 gap-4"
                          : "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-center"
                      }
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedBookingReference(
                            (currentReference) =>
                              currentReference === booking.reference
                                ? ""
                                : booking.reference,
                          )
                        }
                        className="min-w-0 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex min-w-max shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.54rem] font-semibold uppercase leading-none tracking-[0.06em] ${
                              bookingStatusClasses[
                                booking.status ?? "confirmed"
                              ]
                            }`}
                          >
                            {
                              bookingStatusLabels[
                                booking.status ?? "confirmed"
                              ]
                            }
                          </span>
                          <span
                            className={`inline-flex min-w-max shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.54rem] font-semibold uppercase leading-none tracking-[0.06em] ${paymentStatusClasses[financials.paymentStatus]}`}
                          >
                            {
                              paymentStatusLabels[
                                financials.paymentStatus
                              ]
                            }
                          </span>
	                          {financials.paymentStatus === "comp-vip" && (
	                            <span className="inline-flex min-w-max shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-purple-300/40 bg-purple-950/30 px-2.5 py-1 text-[0.54rem] font-semibold uppercase leading-none tracking-[0.06em] text-purple-200">
	                              VIP
	                            </span>
	                          )}
	                          {isCorporateBooking && (
	                            <span className="inline-flex min-w-max shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-[#D8C36A]/35 bg-[#D8C36A]/10 px-2.5 py-1 text-[0.54rem] font-semibold uppercase leading-none tracking-[0.06em] text-[#F2D66C]">
	                              Corporate
	                            </span>
	                          )}
	                          {(wastedSeats >= 4 || betterFitTable) && (
                            <span className="inline-flex min-w-max shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-amber-300/35 bg-amber-950/25 px-2.5 py-1 text-[0.54rem] font-semibold uppercase leading-none tracking-[0.06em] text-amber-100">
                              Optimise
                            </span>
                          )}
                        </div>

                        <h3
                          className={`mt-3 font-bold leading-tight ${
                            bookingViewMode === "grid"
                              ? "text-xl sm:text-2xl"
                              : "text-2xl sm:text-3xl"
                          }`}
                        >
	                          {booking.customer.name || "Unnamed Guest"}
	                        </h3>

	                        {isCorporateBooking && corporateCompanyName && (
	                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#F2D66C] sm:text-sm">
	                            Corporate Booking · {corporateCompanyName}
	                          </p>
	                        )}

	                        <p className="mt-1 text-sm font-semibold text-zinc-200 sm:text-base">
                          {booking.zoneTitle} ·{" "}
                          {booking.tableNumber || "Unassigned"}
                        </p>

                        <p className="mt-2 break-words text-xs text-zinc-500 sm:text-sm">
                          {booking.partySize} guests ·{" "}
                          {booking.reference} · {booking.bookingDate} ·{" "}
                          {formatCurrency(financials.totalPrice)}
                        </p>
                        {bookingViewMode === "grid" && (
                          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                            <span className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                              {booking.partySize} pax
                            </span>
                            <span className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                              {booking.status === "checked-in"
                                ? "Checked In"
                                : "Not Arrived"}
                            </span>
                          </div>
                        )}
                      </button>

                      <div
                        className={`flex flex-col gap-2 min-[420px]:flex-row min-[420px]:flex-wrap ${
                          bookingViewMode === "grid"
                            ? ""
                            : "lg:justify-end"
                        }`}
                      >
                        <a
                          href={getTicketUrl(booking.reference)}
                          className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/15 px-3 py-2 text-center text-xs font-semibold text-zinc-200 transition hover:bg-white hover:text-black sm:px-4 sm:text-sm"
                        >
                          Ticket
                        </a>
                        {canViewCrm && (
                          <button
                            type="button"
                            onClick={() =>
                              openCustomerProfile(booking.customer)
                            }
                            className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-full border border-[#D8C36A]/40 px-3 py-2 text-xs font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black sm:px-4 sm:text-sm"
                          >
                            Open Profile
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedBookingReference(
                              booking.reference,
                            )
                          }
                          className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-full border border-[#D8C36A]/35 px-3 py-2 text-xs font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black sm:px-4 sm:text-sm"
                        >
                          View Booking
                        </button>

                        {canManageBookings && (
                          <button
                            type="button"
                            disabled={
                              (booking.status ?? "confirmed") ===
                              "cancelled"
                            }
                            onClick={() =>
                              openCancellationModal(booking)
                            }
                            className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-full border border-red-300/40 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-300 hover:text-black disabled:cursor-not-allowed disabled:opacity-35 sm:px-4 sm:text-sm"
                          >
                            Cancel Booking
                          </button>
                        )}
                      </div>
                    </div>

                    {isBookingExpanded && (
                      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-0 backdrop-blur-sm md:p-4 xl:p-6">
                        <button
                          type="button"
                          aria-label="Close booking details"
                          onClick={() => setExpandedBookingReference("")}
                          className="absolute inset-0 cursor-default"
                        />
                        <aside className="relative z-10 flex h-full w-full max-w-5xl flex-col overflow-hidden border border-[#D8C36A]/25 bg-zinc-950 text-white shadow-2xl shadow-black/50 md:h-[min(94vh,920px)] md:w-[min(96vw,1040px)] md:rounded-[2rem] xl:h-[min(92vh,920px)]">
                          <div className="flex items-start justify-between gap-3 border-b border-white/10 p-3 sm:p-4 lg:p-5">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">
                                Booking Details
                              </p>
	                              <h3 className="mt-2 truncate text-xl font-bold sm:text-2xl">
	                                {booking.customer.name ||
	                                  "Unnamed Guest"}
	                              </h3>
	                              {isCorporateBooking &&
	                                corporateCompanyName && (
	                                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#F2D66C]">
	                                    Corporate Booking ·{" "}
	                                    {corporateCompanyName}
	                                  </p>
	                                )}
	                              <p className="mt-1 break-words text-xs text-zinc-400 sm:text-sm">
                                {booking.zoneTitle} ·{" "}
                                {booking.tableNumber || "Unassigned"} ·{" "}
                                {booking.reference}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedBookingReference("")
                              }
                              className="shrink-0 rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white hover:text-black sm:px-4 sm:text-sm"
                            >
                              Close
                            </button>
                          </div>
                          <div className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5">
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-zinc-400">
                      <p>
                        Ticket{" "}
                        {formatCurrency(financials.ticketAmount)}
                        {" · "}Booking Fee{" "}
                        {formatCurrency(financials.bookingFeeAmount)}
                        {" · "}Subtotal{" "}
                        {formatCurrency(financials.subtotalPrice)}
                        {" · "}Add-ons{" "}
                        {formatCurrency(financials.addonsTotal)}
                        {" · "}Discounts{" "}
                        {formatCurrency(financials.discountAmount)}
                        {financials.serviceFeeAmount > 0 &&
                          ` · Service Fee ${formatCurrency(financials.serviceFeeAmount)}`}
                        {" · "}Deposit{" "}
                        {formatCurrency(financials.depositAmount)}
                        {" · "}Paid{" "}
                        {formatCurrency(financials.amountPaid)}
                        {" · "}Outstanding{" "}
                        {formatCurrency(financials.balanceDue)}
                      </p>
                      {(booking.addons ?? []).length > 0 && (
                        <p className="mt-2 text-[#D8C36A]">
                          Add-ons:{" "}
                          {(booking.addons ?? [])
                            .map((addon) => addon.name)
                            .join(", ")}
                        </p>
                      )}
                    </div>

                    {(wastedSeats >= 4 || betterFitTable) &&
                      canManageBookings && (
                        <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-950/20 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
                            Optimisation Warning
                          </p>
                          <p className="mt-2 text-sm text-amber-100">
                            {currentTable
                              ? `${booking.partySize} guests are seated at ${currentTable.tableNumber}, a ${currentTable.seatCapacity}-seat table. ${Math.max(wastedSeats, 0)} seats are unused.`
                              : "This booking is not currently attached to a live table record."}
                          </p>
                          {betterFitTable && (
                            <button
                              type="button"
                              onClick={() =>
                                moveBooking(
                                  booking,
                                  betterFitTable.id,
                                )
                              }
                                className="mt-3 rounded-full border border-amber-200/50 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-200 hover:text-black"
                            >
                              Move to better fit:{" "}
                              {betterFitTable.tableNumber} ·{" "}
                              {betterFitTable.seatCapacity} seats
                            </button>
                          )}
                        </div>
                      )}

                    <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.82fr)] xl:mt-5 xl:gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
                      <div className="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-3 sm:p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Digital Ticket
                            </p>
                            <p className="mt-2 break-words font-mono text-sm leading-6 text-zinc-300">
                              {booking.ticketCode ??
                                createTicketCode(booking.reference)}{" "}
                              ·{" "}
                              {booking.customer.name} ·{" "}
                              {booking.zoneTitle} · Table{" "}
                              {booking.tableNumber}
                            </p>
                            <a
                              href={getTicketUrl(booking.reference)}
                              className="mt-3 inline-flex rounded-full border border-[#D8C36A]/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                            >
                              Open Live Ticket
                            </a>
                            <p className="mt-2 text-sm text-zinc-400">
                              Total{" "}
                              {formatCurrency(financials.totalPrice)}
                              {" · "}Paid{" "}
                              {formatCurrency(financials.amountPaid)}
                              {financials.balanceDue > 0 &&
                                ` · Balance ${formatCurrency(financials.balanceDue)}`}
                            </p>
                            {booking.promoCode && (
                              <p className="mt-1 text-sm text-emerald-300">
                                Promo {booking.promoCode}: -
                                {formatCurrency(
                                  financials.discountAmount,
                                )}
                              </p>
                            )}
                            {(booking.addons ?? []).length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {(booking.addons ?? []).map(
                                  (addon) => (
                                    <span
                                      key={addon.id}
                                      className="rounded-full border border-[#D8C36A]/30 bg-black/40 px-3 py-1 text-xs text-[#F2D66C]"
                                    >
                                      {addon.name} ·{" "}
                                      {formatCurrency(addon.price)}
                                    </span>
                                  ),
                                )}
                              </div>
                            )}
                          </div>

                          {canManageCommunications && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  sendTicket(booking, "email")
                                }
                                className="rounded-full border border-[#D8C36A]/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                              >
                                Resend Ticket
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  resendConfirmation(booking)
                                }
                                className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition hover:bg-white hover:text-black"
                              >
                                Resend Confirmation
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  sendTicket(booking, "push")
                                }
                                className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition hover:bg-white hover:text-black"
                              >
                                Push Ticket
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="min-w-0 rounded-2xl border border-white/10 bg-black/30 p-3 sm:p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Communication History
                        </p>
                        {(booking.communicationHistory ?? [])
                          .length === 0 ? (
                          <p className="mt-2 text-sm text-zinc-400">
                            No ticket sends yet.
                          </p>
                        ) : (
                          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1 md:max-h-72">
                            {(booking.communicationHistory ?? [])
                              .slice(0, 3)
                              .map((record) => (
                                <div
                                  key={record.id}
                                  className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm"
                                >
                                  <p className="font-semibold uppercase tracking-[0.12em] text-[#D8C36A]">
                                    {
                                      communicationChannelLabels[
                                        record.channel
                                      ]
                                    }{" "}
                                    {record.trigger
                                      ? `· ${communicationTriggerLabels[record.trigger]}`
                                      : ""}
                                  </p>
                                  {record.subject && (
                                    <p className="mt-1 font-semibold text-white">
                                      {record.subject}
                                    </p>
                                  )}
                                  <p className="mt-1 text-zinc-300">
                                    {record.message}
                                  </p>
                                  <p className="mt-1 text-xs text-zinc-500">
                                    {new Date(
                                      record.sentAt,
                                    ).toLocaleString()}
                                  </p>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {canManageCommunications && (
                      <div className="mt-3 min-w-0 rounded-2xl border border-white/10 bg-black/30 p-3 sm:p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Custom Guest Message
                        </p>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[auto_1fr]">
                          <select
                            value={
                              customMessageForms[booking.reference]
                                ?.channel ?? "email"
                            }
                            onChange={(event) =>
                              setCustomMessageForms((currentForms) => ({
                                ...currentForms,
                                [booking.reference]: {
                                  channel: event.target
                                    .value as CommunicationChannel,
                                  message:
                                    currentForms[booking.reference]
                                      ?.message ?? "",
                                  subject:
                                    currentForms[booking.reference]
                                      ?.subject ?? "",
                                },
                              }))
                            }
                            className="rounded-xl border border-zinc-700 bg-black px-4 py-3"
                          >
                            {(
                              [
                                "email",
                                "push",
                                "sms",
                              ] as CommunicationChannel[]
                            ).map((channel) => (
                              <option key={channel} value={channel}>
                                {communicationChannelLabels[channel]}
                              </option>
                            ))}
                          </select>
                          <input
                            value={
                              customMessageForms[booking.reference]
                                ?.subject ?? ""
                            }
                            onChange={(event) =>
                              setCustomMessageForms((currentForms) => ({
                                ...currentForms,
                                [booking.reference]: {
                                  channel:
                                    currentForms[booking.reference]
                                      ?.channel ?? "email",
                                  message:
                                    currentForms[booking.reference]
                                      ?.message ?? "",
                                  subject: event.target.value,
                                },
                              }))
                            }
                            placeholder="Subject"
                            className="rounded-xl border border-zinc-700 bg-black px-4 py-3"
                          />
                        </div>
                        <textarea
                          value={
                            customMessageForms[booking.reference]
                              ?.message ?? ""
                          }
                          onChange={(event) =>
                            setCustomMessageForms((currentForms) => ({
                              ...currentForms,
                              [booking.reference]: {
                                channel:
                                  currentForms[booking.reference]
                                    ?.channel ?? "email",
                                message: event.target.value,
                                subject:
                                  currentForms[booking.reference]
                                    ?.subject ?? "",
                              },
                            }))
                          }
                          rows={3}
                          placeholder="Write a personal guest message"
                          className="mt-3 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            sendCustomGuestMessage(booking)
                          }
                          disabled={
                            !customMessageForms[
                              booking.reference
                            ]?.message.trim()
                          }
                          className="mt-3 rounded-full bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-black transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          Send Custom Message
                        </button>
                      </div>
                    )}

                    {canManageBookings ? (
                      <>
                        <div className="mt-4 min-w-0 rounded-2xl border border-white/10 bg-black/30 p-3 sm:p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                                Payment Controls
                              </p>
                              <p className="mt-2 text-sm text-zinc-300">
                                Paid{" "}
                                {formatCurrency(financials.amountPaid)}
                                {" · "}Outstanding{" "}
                                {formatCurrency(financials.balanceDue)}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  updateBookingPayment(
                                    booking,
                                    "deposit-paid",
                                  )
                                }
                                className="rounded-full border border-amber-300/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-amber-100 transition hover:bg-amber-300 hover:text-black"
                              >
                                Mark Deposit Paid
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateBookingPayment(
                                    booking,
                                    "fully-paid",
                                  )
                                }
                                className="rounded-full border border-emerald-300/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-100 transition hover:bg-emerald-300 hover:text-black"
                              >
                                Mark Paid
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateBookingPayment(
                                    booking,
                                    "comp-vip",
                                  )
                                }
                                className="rounded-full border border-purple-300/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-purple-100 transition hover:bg-purple-300 hover:text-black"
                              >
                                Comp Booking
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateBookingPayment(
                                    booking,
                                    "refunded",
                                  )
                                }
                                className="rounded-full border border-red-300/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-red-100 transition hover:bg-red-300 hover:text-black"
                              >
                                Refund Booking
                              </button>
                            </div>
                          </div>
                        </div>

	                        {isCorporateBooking && corporateCompanyName && (
	                          <div className="mt-6 rounded-2xl border border-[#D8C36A]/25 bg-[#D8C36A]/10 px-4 py-3">
	                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F2D66C]">
	                              Company Name
	                            </p>
	                            <p className="mt-1 text-lg font-semibold text-white">
	                              {corporateCompanyName}
	                            </p>
	                          </div>
	                        )}

	                        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
	                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Customer Name
                            </span>
                            <input
                              value={booking.customer.name}
                              onChange={(event) =>
                                updateBookingCustomer(
                                  booking.reference,
                                  "name",
                                  event.target.value,
                                )
                              }
                              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3"
                            />
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Email
                            </span>
                            <input
                              value={booking.customer.email}
                              onChange={(event) =>
                                updateBookingCustomer(
                                  booking.reference,
                                  "email",
                                  event.target.value,
                                )
                              }
                              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3"
                            />
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Phone
                            </span>
                            <input
                              value={booking.customer.phone}
                              onChange={(event) =>
                                updateBookingCustomer(
                                  booking.reference,
                                  "phone",
                                  event.target.value,
                                )
                              }
                              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3"
                            />
                          </label>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr_220px]">
                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Booking Status
                            </span>
                            <select
                              value={booking.status ?? "confirmed"}
                              onChange={(event) =>
                                updateBookingStatus(
                                  booking,
                                  event.target.value as BookingStatus,
                                )
                              }
                              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3"
                            >
                              {bookingStatuses.map((status) => (
                                <option key={status} value={status}>
                                  {bookingStatusLabels[status]}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Move To Table / Zone
                            </span>
                            <select
                              value={booking.tableId || ""}
                              onChange={(event) =>
                                moveBooking(
                                  booking,
                                  event.target.value,
                                )
                              }
                              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3"
                            >
                              <option value="">
                                Select a table
                              </option>
                              {moveTables.map((table) => {
                                const zone = getZoneById(table.zoneId);

                                return (
                                  <option
                                    key={table.id}
                                    value={table.id}
                                  >
                                    {zone?.title} ·{" "}
                                    {table.tableNumber} ·{" "}
                                    {table.seatCapacity} seats
                                  </option>
                                );
                              })}
                            </select>
                          </label>

                          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Current Table
                            </p>
                            <p className="mt-2 font-bold">
                              {booking.tableNumber || "Unassigned"}
                            </p>
                            <p className="mt-1 text-sm text-zinc-400">
                              {currentTable
                                ? `${currentTable.seatCapacity} seats · ${Math.max(wastedSeats, 0)} open after this party`
                                : "No matching live table record"}
                            </p>
                          </div>
                        </div>
                        {tableCompatibilityWarning && (
                          <div className="mt-4 rounded-2xl border border-red-300/30 bg-red-950/20 p-4 text-sm text-red-100">
                            {tableCompatibilityWarning}
                          </div>
                        )}
                        {moveTables.length === 0 && (
                          <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-950/20 p-4 text-sm text-amber-100">
                            No compatible table is currently available
                            for this {booking.partySize}-guest booking.
                            Keep the current assignment, open
                            capacity, or place the guest on waitlist
                            review before moving.
                          </div>
                        )}
                        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                          <label
                            className="rounded-2xl border border-white/10 bg-black/30 p-4 lg:col-span-3"
                          >
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Booking Notes / Dietary Requirements
                            </span>
                            <textarea
                              value={booking.operationalNotes ?? ""}
                              onChange={(event) =>
                                updateBookingOperationalField(
                                  booking.reference,
                                  "operationalNotes",
                                  event.target.value,
                                )
                              }
                              rows={3}
                              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3"
                              placeholder="Dietary requirements, celebration notes, access needs, seating preferences, or internal context."
                            />
                          </label>
                          <label className="rounded-2xl border border-white/10 bg-black/30 p-4">
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Cancellation Reason
                            </span>
                            <textarea
                              value={booking.cancellationReason ?? ""}
                              onChange={(event) =>
                                updateBookingOperationalField(
                                  booking.reference,
                                  "cancellationReason",
                                  event.target.value,
                                )
                              }
                              rows={3}
                              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3"
                            />
                          </label>
                          <label className="rounded-2xl border border-white/10 bg-black/30 p-4">
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Refund Notes
                            </span>
                            <textarea
                              value={booking.refundNotes ?? ""}
                              onChange={(event) =>
                                updateBookingOperationalField(
                                  booking.reference,
                                  "refundNotes",
                                  event.target.value,
                                )
                              }
                              rows={3}
                              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3"
                            />
                          </label>
                          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Timeline
                            </p>
                            <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1 text-sm">
                              {(booking.lifecycleHistory ?? []).length ===
                              0 ? (
                                <p className="text-zinc-500">
                                  No status history recorded yet.
                                </p>
                              ) : (
                                (booking.lifecycleHistory ?? []).map(
                                  (event) => (
                                    <div
                                      key={event.id}
                                      className="rounded-xl border border-white/10 bg-zinc-950 p-3"
                                    >
                                      <p className="font-semibold text-white">
                                        {event.fromStatus
                                          ? `${bookingStatusLabels[event.fromStatus]} → `
                                          : ""}
                                        {
                                          bookingStatusLabels[
                                            event.toStatus
                                          ]
                                        }
                                      </p>
                                      {event.note && (
                                        <p className="mt-1 text-zinc-400">
                                          {event.note}
                                        </p>
                                      )}
                                      <p className="mt-1 text-xs text-zinc-500">
                                        {new Date(
                                          event.createdAt,
                                        ).toLocaleString()}
                                      </p>
                                    </div>
                                  ),
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
                        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Customer
                          </p>
                          <p className="mt-2 font-bold">
                            {booking.customer.name || "Unnamed Guest"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Email
                          </p>
                          <p className="mt-2 text-zinc-300">
                            {booking.customer.email}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Phone
                          </p>
                          <p className="mt-2 text-zinc-300">
                            {booking.customer.phone}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Current Table
                          </p>
                          <p className="mt-2 font-bold">
                            {booking.tableNumber || "Unassigned"}
                          </p>
                        </div>
                      </div>
                    )}
                          </div>
                        </aside>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
            <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/35 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-zinc-400">
                Page{" "}
                <span className="font-semibold text-white">
                  {safeBookingPage}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-white">
                  {bookingPageCount}
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={safeBookingPage <= 1}
                  onClick={() =>
                    setBookingPage((currentPage) =>
                      Math.max(1, currentPage - 1),
                    )
                  }
                  className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={safeBookingPage >= bookingPageCount}
                  onClick={() =>
                    setBookingPage((currentPage) =>
                      Math.min(bookingPageCount, currentPage + 1),
                    )
                  }
                  className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Next
                </button>
              </div>
            </div>
            </>
          )}
        </div>
        )}
        </div>
      </div>
    </main>
  );
}
