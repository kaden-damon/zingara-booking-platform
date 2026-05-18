"use client";

import { type FormEvent, useEffect, useState } from "react";

import {
  type AdminRole,
  type StaffSession,
  adminRoleLabels,
  hasPermission,
  rolePermissions,
} from "../../lib/zingaraAccess";
import {
  type BookingStatus,
  type BookingSource,
  type CommunicationChannel,
  type CommunicationTemplate,
  type CommunicationTrigger,
  type DemoBooking,
  type DemoCustomerCrmRecord,
  type DemoShow,
  type DemoTable,
  type DemoVenueSettings,
  type DemoWaitlistEntry,
  type SeatingZone,
  type SeatingZoneId,
  type TicketState,
  type WaitlistStatus,
  communicationVariableHints,
  createCommunicationRecord,
  createTablesForShow,
  createTicketCode,
  defaultCommunicationTemplates,
  defaultVenueSettings,
  defaultShows,
  findBestAvailableTable,
  getBookingTicketState,
  getCommunicationTemplate,
  getStoredCommunicationTemplates,
  getStoredDemoCustomerCrm,
  getStoredVenueSettings,
  getShowLabel,
  getZoneById,
  getStoredDemoBookings,
  getStoredDemoShows,
  getStoredDemoTables,
  getStoredDemoWaitlist,
  getTicketStateClasses,
  getTicketUrl,
  renderCommunicationTemplate,
  seatingZones,
  storeDemoBookings,
  storeDemoCustomerCrm,
  storeCommunicationTemplates,
  storeDemoShows,
  storeDemoTables,
  storeDemoWaitlist,
  storeVenueSettings,
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
type DemoStaffAccount = {
  email: string;
  id: string;
  name: string;
  password: string;
  role: AdminRole;
  username: string;
  venueId: string;
};
type AdminSession = StaffSession;
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

const adminSessionStorageKey = "zingara-demo-admin-session";

const demoStaffAccounts: DemoStaffAccount[] = [
  {
    email: "super@zingara.example",
    id: "staff-super-admin",
    name: "Tracy Maltman",
    password: "super-demo",
    role: "super-admin",
    username: "super",
    venueId: "zingara-cape-town",
  },
  {
    email: "manager@zingara.example",
    id: "staff-venue-manager",
    name: "Venue Manager",
    password: "manager-demo",
    role: "venue-manager",
    username: "manager",
    venueId: "zingara-cape-town",
  },
  {
    email: "boxoffice@zingara.example",
    id: "staff-box-office",
    name: "Richard Griffin",
    password: "box-demo",
    role: "box-office-staff",
    username: "boxoffice",
    venueId: "zingara-cape-town",
  },
  {
    email: "floor@zingara.example",
    id: "staff-floor-manager",
    name: "Craig Leo",
    password: "floor-demo",
    role: "floor-manager",
    username: "floor",
    venueId: "zingara-cape-town",
  },
];

const bookingStatuses: BookingStatus[] = [
  "confirmed",
  "pending",
  "cancelled",
  "checked-in",
];

const bookingStatusLabels: Record<BookingStatus, string> = {
  cancelled: "Cancelled",
  confirmed: "Confirmed",
  pending: "Pending",
  "checked-in": "Checked In",
};

const bookingStatusClasses: Record<BookingStatus, string> = {
  cancelled: "border-red-400/40 bg-red-950/30 text-red-300",
  confirmed:
    "border-emerald-400/40 bg-emerald-950/30 text-emerald-300",
  pending: "border-amber-300/40 bg-amber-950/30 text-amber-200",
  "checked-in":
    "border-sky-300/40 bg-sky-950/30 text-sky-200",
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
  online: "Online Booking",
  waitlist: "Waitlist Conversion",
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
  "confirmation-resend": "Confirmation Resend",
  "custom-message": "Custom Guest Message",
  "operational-broadcast": "Operational Broadcast",
  "payment-confirmation": "Payment Confirmation",
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
    table.id === booking.tableId
  );
}

function formatArrivalTime(arrivalTime?: string) {
  return arrivalTime
    ? new Date(arrivalTime).toLocaleString()
    : "Awaiting arrival";
}

function formatCurrency(amount: number) {
  return `R${amount.toLocaleString()}`;
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
  return {
    addonsTotal: booking.addonsTotal ?? 0,
    amountPaid: booking.amountPaid ?? booking.totalPrice,
    balanceDue: booking.balanceDue ?? 0,
    discountAmount: booking.discountAmount ?? 0,
    paymentOption: booking.paymentOption ?? "full",
    subtotalPrice: booking.subtotalPrice ?? booking.totalPrice,
    totalPrice: booking.totalPrice,
  };
}

function getStoredAdminSession() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedSession = window.localStorage.getItem(
      adminSessionStorageKey,
    );

    if (!storedSession) {
      return null;
    }

    const session = JSON.parse(storedSession) as AdminSession;
    const matchingAccount = demoStaffAccounts.find(
      (account) => account.username === session.username,
    );

    if (matchingAccount) {
      return {
        email: matchingAccount.email,
        id: matchingAccount.id,
        name: matchingAccount.name,
        role: matchingAccount.role,
        username: matchingAccount.username,
        venueId: matchingAccount.venueId,
      };
    }

    if (!session.role || !adminRoleLabels[session.role]) {
      return null;
    }

    return {
      email: session.email,
      id: session.id ?? session.username,
      name: session.name || session.username || "Staff Member",
      role: session.role,
      username: session.username || session.email || session.id,
      venueId: session.venueId || defaultVenueSettings.venueId,
    };
  } catch {
    return null;
  }
}

export default function AdminDashboardPage() {
  const [bookings, setBookings] = useState<DemoBooking[]>([]);
  const [customerCrmRecords, setCustomerCrmRecords] = useState<
    DemoCustomerCrmRecord[]
  >([]);
  const [waitlist, setWaitlist] = useState<DemoWaitlistEntry[]>(
    [],
  );
  const [bookingSearch, setBookingSearch] = useState("");
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
  const [loginForm, setLoginForm] = useState<LoginForm>({
    password: "",
    username: "",
  });
  const [loginError, setLoginError] = useState("");
  const [shows, setShows] = useState<DemoShow[]>(defaultShows);
  const [selectedShowId, setSelectedShowId] = useState(
    defaultShows[0]?.id ?? "",
  );
  const [newShow, setNewShow] = useState<NewShowForm>({
    date: "",
    time: "",
    label: "",
  });
  const [tables, setTables] = useState<DemoTable[]>(() =>
    defaultShows.flatMap((show) => createTablesForShow(show.id)),
  );
  const [newTables, setNewTables] =
    useState<NewTablesByZone>(getBlankNewTables);
  const [mergeSelections, setMergeSelections] =
    useState<MergeSelection>(
      seatingZones.reduce(
        (selections, zone) => ({
          ...selections,
          [zone.id]: "",
        }),
        {} as MergeSelection,
      ),
    );

  useEffect(() => {
    function loadDemoData() {
      const nextShows = getStoredDemoShows();
      const nextBookings = getStoredDemoBookings();
      const nextCommunicationTemplates =
        getStoredCommunicationTemplates();
      const nextCustomerCrm = getStoredDemoCustomerCrm();
      const nextVenueSettings = getStoredVenueSettings();
      const nextWaitlist = getStoredDemoWaitlist();
      const nextTables = getStoredDemoTables();

      setHasHydrated(true);
      setCurrentStaff(getStoredAdminSession());
      setShows(nextShows);
      setSelectedShowId((currentShowId) =>
        nextShows.some((show) => show.id === currentShowId)
          ? currentShowId
          : nextShows[0]?.id ?? "",
      );
      setBookings(nextBookings);
      setCommunicationTemplates(nextCommunicationTemplates);
      setCustomerCrmRecords(nextCustomerCrm);
      setVenueSettings(nextVenueSettings);
      setWaitlist(nextWaitlist);
      setTables(nextTables);
    }

    const hydrationTimer = window.setTimeout(loadDemoData, 0);

    window.addEventListener("storage", loadDemoData);
    window.addEventListener(
      "zingara-demo-bookings-updated",
      loadDemoData,
    );
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
      window.removeEventListener("storage", loadDemoData);
      window.removeEventListener(
        "zingara-demo-bookings-updated",
        loadDemoData,
      );
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

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const account = demoStaffAccounts.find(
      (staffAccount) =>
        staffAccount.username === loginForm.username.trim() &&
        staffAccount.password === loginForm.password,
    );

    if (!account) {
      setLoginError("Invalid demo credentials.");
      return;
    }

    const nextSession: AdminSession = {
      email: account.email,
      id: account.id,
      name: account.name,
      role: account.role,
      username: account.username,
      venueId: account.venueId,
    };

    window.localStorage.setItem(
      adminSessionStorageKey,
      JSON.stringify(nextSession),
    );
    setCurrentStaff(nextSession);
    setLoginError("");
    setLoginForm({
      password: "",
      username: "",
    });
  }

  function logout() {
    window.localStorage.removeItem(adminSessionStorageKey);
    setCurrentStaff(null);
  }

  function saveTables(nextTables: DemoTable[]) {
    setTables(nextTables);
    storeDemoTables(nextTables);
  }

  function saveBookings(nextBookings: DemoBooking[]) {
    setBookings(nextBookings);
    storeDemoBookings(nextBookings);
  }

  function saveWaitlist(nextWaitlist: DemoWaitlistEntry[]) {
    setWaitlist(nextWaitlist);
    storeDemoWaitlist(nextWaitlist);
  }

  function saveCustomerCrmRecords(
    nextRecords: DemoCustomerCrmRecord[],
  ) {
    setCustomerCrmRecords(nextRecords);
    storeDemoCustomerCrm(nextRecords);
  }

  function saveCommunicationTemplates(
    nextTemplates: CommunicationTemplate[],
  ) {
    setCommunicationTemplates(nextTemplates);
    storeCommunicationTemplates(nextTemplates);
  }

  function saveVenueSettings(nextSettings: DemoVenueSettings) {
    setVenueSettings(nextSettings);
    storeVenueSettings(nextSettings);
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
    setShows(nextShows);
    storeDemoShows(nextShows);
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
      customer: entry.customer,
      status: "pending",
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

    saveCommunicationTemplates(
      communicationTemplates.map((template) =>
        template.id === templateId
          ? {
              ...template,
              ...updates,
              updatedAt: new Date().toISOString(),
            }
          : template,
      ),
    );
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
        seatCapacity: newTable.seatCapacity,
        status: "available",
        guestNotes: "",
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

  function toggleDisabled(table: DemoTable) {
    updateTable(table.id, {
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
      targetTable.status !== "available"
    ) {
      return;
    }

    const mergedTableNumber = `${primaryTable.tableNumber}+${targetTable.tableNumber}`;
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
      seatCapacity:
        primaryTable.seatCapacity + targetTable.seatCapacity,
      status: "available",
      guestNotes: `Merged from ${primaryTable.tableNumber} and ${targetTable.tableNumber}`,
      mergedFrom: [primaryTable.id, targetTable.id],
    };

    saveTables([
      ...tables.map((table) =>
        table.id === primaryTable.id ||
        table.id === targetTable.id
          ? {
              ...table,
              status: "disabled" as const,
              guestNotes: `Merged into ${mergedTableNumber}`,
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

  function releaseBookingTable(booking: DemoBooking) {
    if (!canViewCrm) {
      return;
    }

    saveTables(
      tables.map((table) =>
        table.id === booking.tableId &&
        table.bookingReference === booking.reference
          ? {
              ...table,
              status: "available",
              bookingReference: undefined,
              guestNotes: "",
            }
          : table,
      ),
    );
  }

  function cancelBooking(booking: DemoBooking) {
    if (!canManageBookings) {
      return;
    }

    releaseBookingTable(booking);
    const cancelledBooking = {
      ...booking,
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
  }

  function updateBookingStatus(
    booking: DemoBooking,
    status: BookingStatus,
  ) {
    if (!canManageBookings) {
      return;
    }

    if (status === "cancelled") {
      cancelBooking(booking);
      return;
    }

    const arrivalTime =
      status === "checked-in"
        ? booking.arrivalTime ?? new Date().toISOString()
        : booking.arrivalTime;
    const updatedBooking = {
      ...booking,
      arrivalTime,
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
              status,
            }
          : currentBooking,
      ),
    );
  }

  function checkInGuest(booking: DemoBooking) {
    if (
      !canCheckInGuests ||
      (booking.status ?? "confirmed") === "cancelled"
    ) {
      return;
    }

    const arrivalTime = new Date().toISOString();
    const checkedInBooking = {
      ...booking,
      arrivalTime,
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
              status: "checked-in",
            }
          : currentBooking,
      ),
    );
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

  function validateTicketCode() {
    const { booking, waitlistEntry } = findTicketRecord(
      ticketValidationInput,
    );

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
      return;
    }

    if (waitlistEntry) {
      setTicketValidationResult({
        message:
          "This code belongs to a waitlist entry and is not a confirmed admission ticket.",
        state: "Waitlist",
        waitlistEntry,
      });
      return;
    }

    setTicketValidationResult({
      message: "No booking or waitlist ticket matches this code.",
      state: "Invalid",
    });
  }

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
              status: "checked-in",
            }
          : currentBooking,
      ),
    );
    setTicketValidationResult({
      booking: checkedInBooking,
      message: "Guest checked in. Duplicate scans will now be blocked.",
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

    const nextTable = tables.find(
      (table) => table.id === nextTableId,
    );
    const nextZone = nextTable
      ? getZoneById(nextTable.zoneId)
      : undefined;

    if (
      !nextTable ||
      !nextZone ||
      nextTable.seatCapacity < booking.partySize ||
      nextTable.status === "disabled" ||
      (nextTable.status === "booked" &&
        nextTable.id !== booking.tableId)
    ) {
      return;
    }

    saveTables(
      tables.map((table) => {
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

  function sendShowReminder() {
    if (!canManageCommunications) {
      return;
    }

    const activeBookings = selectedShowBookings.filter(
      (booking) =>
        (booking.status ?? "confirmed") !== "cancelled" &&
        (booking.status ?? "confirmed") !== "checked-in",
    );

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
  }

  function broadcastOperationalUpdate() {
    const message = broadcastForm.message.trim();

    if (!canManageCommunications || !message) {
      return;
    }

    const showBookings = selectedShowBookings.filter(
      (booking) =>
        (booking.status ?? "confirmed") !== "cancelled",
    );

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
  }

  function findWaitlistConversionTable(entry: DemoWaitlistEntry) {
    const eligibleZones = entry.desiredZoneId
      ? seatingZones.filter((zone) => zone.id === entry.desiredZoneId)
      : seatingZones;

    for (const zone of eligibleZones) {
      const canSeatParty =
        entry.partySize >= zone.minGuests &&
        entry.partySize <= zone.maxGuests;
      const table = canSeatParty
        ? findBestAvailableTable(
            tables,
            entry.showId,
            zone.id,
            entry.partySize,
          )
        : undefined;

      if (table) {
        return {
          table,
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
      depositPercentage: 0,
      amountPaid: 0,
      balanceDue: subtotalPrice,
      source: "waitlist",
      ticketCode: createTicketCode(bookingReference),
      ticketIssuedAt: now,
      customer: entry.customer,
      status: "confirmed",
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
      tables.map((table) =>
        table.id === allocation.table.id
          ? {
              ...table,
              status: "booked" as const,
              bookingReference,
              guestNotes:
                entry.notes ||
                `Converted from waitlist for ${entry.customer.name}`,
            }
          : table,
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
    setSelectedCustomerKey(getCustomerKey(customer));
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

  const filteredBookings = bookings.filter((booking) => {
    const searchTerm = bookingSearch.trim().toLowerCase();

    if (booking.showId !== selectedShowId) {
      return false;
    }

    if (!searchTerm) {
      return true;
    }

    return (
      booking.reference.toLowerCase().includes(searchTerm) ||
      booking.customer.name.toLowerCase().includes(searchTerm) ||
      booking.tableNumber.toLowerCase().includes(searchTerm)
    );
  });
  const selectedShowBookings = bookings.filter(
    (booking) => booking.showId === selectedShowId,
  );
  const activeShowBookings = selectedShowBookings.filter(
    (booking) => (booking.status ?? "confirmed") !== "cancelled",
  );
  const checkedInBookings = activeShowBookings.filter(
    (booking) => (booking.status ?? "confirmed") === "checked-in",
  );
  const financialReport = activeShowBookings.reduce(
    (report, booking) => {
      const financials = getBookingFinancials(booking);

      return {
        amountPaid: report.amountPaid + financials.amountPaid,
        addonsTotal: report.addonsTotal + financials.addonsTotal,
        balanceDue: report.balanceDue + financials.balanceDue,
        discountAmount:
          report.discountAmount + financials.discountAmount,
        grossSales: report.grossSales + financials.subtotalPrice,
        netSales: report.netSales + financials.totalPrice,
      };
    },
    {
      addonsTotal: 0,
      amountPaid: 0,
      balanceDue: 0,
      discountAmount: 0,
      grossSales: 0,
      netSales: 0,
    },
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
  const staffSearchTerm = staffSearch.trim().toLowerCase();
  const staffBookings = selectedShowBookings.filter((booking) => {
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
  const selectedShowWaitlist = hasHydrated
    ? waitlist.filter((entry) => entry.showId === selectedShowId)
    : [];
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

  if (!currentStaff) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 py-16 text-white">
        <section className="w-full max-w-3xl rounded-[2rem] border border-[#8D7A2F]/40 bg-[radial-gradient(circle_at_top,#2A1A0D_0%,#101010_46%,#050505_100%)] p-8 shadow-2xl shadow-[#8D7A2F]/10">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.28em] text-[#D8C36A]">
            Staff Access
          </p>
          <h1 className="text-5xl font-bold">
            Zingara Admin Login
          </h1>
          <p className="mt-3 text-zinc-400">
            Staff access for venue operations using local demo
            accounts.
          </p>

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
                className="w-full rounded-2xl border border-zinc-700 bg-black px-5 py-4 text-lg"
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
                className="w-full rounded-2xl border border-zinc-700 bg-black px-5 py-4 text-lg"
              />
            </label>

            {loginError && (
              <p className="rounded-2xl border border-red-400/30 bg-red-950/30 px-5 py-4 text-red-200">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              className="rounded-full bg-white px-8 py-4 text-lg font-semibold text-black transition hover:bg-zinc-300"
            >
              Enter Dashboard
            </button>
          </form>

          <div className="mt-8 grid grid-cols-1 gap-3 border-t border-white/10 pt-6 md:grid-cols-4">
            {demoStaffAccounts.map((account) => (
              <div
                key={account.username}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <p className="text-sm font-semibold text-white">
                  {account.name}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#D8C36A]">
                  {adminRoleLabels[account.role]}
                </p>
                <p className="mt-3 font-mono text-sm text-zinc-400">
                  {account.username} / {account.password}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-16 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 flex flex-col gap-6 border-b border-zinc-800 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.28em] text-zinc-500">
              Admin
            </p>

            <h1 className="text-5xl font-bold">
              {venueConfig.brandTitle} Box Office Dashboard
            </h1>
          </div>

          <div className="rounded-2xl border border-[#D8C36A]/30 bg-zinc-950 px-5 py-4">
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

        <section className="mb-10 rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl shadow-black/25">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                Access Control
              </p>
              <h2 className="text-2xl font-bold">
                Staff Role Access
              </h2>
              <p className="mt-2 max-w-3xl text-zinc-400">
                Staff capabilities are controlled by the local demo
                role permissions for this dashboard.
              </p>
            </div>
            <div className="rounded-2xl border border-[#D8C36A]/25 bg-black/40 px-5 py-4 text-sm">
              <p className="font-semibold text-white">
                {currentStaff.name}
              </p>
              <p className="mt-1 text-[#F2D66C]">
                {adminRoleLabels[currentStaff.role] ?? "Staff"}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {(rolePermissions[currentStaff.role] ?? []).map((permission) => (
              <span
                key={permission}
                className="rounded-full border border-[#D8C36A]/25 bg-black px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#F2D66C]"
              >
                {permission}
              </span>
            ))}
          </div>
        </section>

        {canManageSettings && (
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
              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
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
                    Logo Initial
                    <input
                      value={venueConfig.logoInitial}
                      onChange={(event) =>
                        updateVenueSettings({
                          logoInitial: event.target.value,
                        })
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-white"
                    />
                  </label>
                  <label className="text-sm text-zinc-400">
                    Logo URL
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

        <section className="mb-10 rounded-2xl border border-[#8D7A2F]/35 bg-zinc-950 p-6 shadow-2xl shadow-black/25">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                Nightly Shows
              </p>
              <h2 className="text-3xl font-bold">
                {canManageShows
                  ? "Show Management"
                  : "Show Selection"}
              </h2>
            </div>

            <select
              value={selectedShowId}
              onChange={(event) =>
                setSelectedShowId(event.target.value)
              }
              className="w-full rounded-2xl border border-zinc-700 bg-black px-5 py-4 text-lg sm:max-w-md"
            >
              {shows.map((show) => (
                <option key={show.id} value={show.id}>
                  {getShowLabel(show)}
                </option>
              ))}
            </select>
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

          <p className="mt-4 text-zinc-400">
            Managing inventory for{" "}
            <span className="font-semibold text-white">
              {getShowLabel(selectedShow)}
            </span>
          </p>
        </section>

        {canViewAnalytics && (
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

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Per-Show Revenue
                    </p>
                    <h3 className="mt-1 text-2xl font-bold">
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
                <h3 className="mt-1 text-2xl font-bold">
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
                            {showReport.show.time}
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
                <h3 className="mt-1 text-2xl font-bold">
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
                <h3 className="mt-1 text-2xl font-bold">
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
                <h3 className="mt-1 text-2xl font-bold">
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
                <h3 className="mt-1 text-2xl font-bold">
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
                <h3 className="mt-1 text-2xl font-bold">
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

        {canViewCrm && (
          <section className="mb-10 rounded-2xl border border-[#D8C36A]/35 bg-[radial-gradient(circle_at_top,#211507_0%,#101010_48%,#050505_100%)] p-6 shadow-2xl shadow-[#8D7A2F]/10">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                  Customer CRM
                </p>
                <h2 className="text-3xl font-bold">
                  Customer Relationship Profiles
                </h2>
                <p className="mt-2 text-zinc-400">
                  Reusable guest profiles with spend, attendance,
                  favourite zones, add-ons, promo usage, notes, VIP
                  tags, and communication history.
                </p>
              </div>

              <input
                value={customerSearch}
                onChange={(event) =>
                  setCustomerSearch(event.target.value)
                }
                placeholder="Search customer, tag, or favourite zone"
                className="w-full rounded-2xl border border-zinc-700 bg-black px-5 py-4 text-lg lg:max-w-md"
              />
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Profile Directory
                </p>
                <div className="mt-4 grid max-h-[560px] grid-cols-1 gap-3 overflow-y-auto pr-1">
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

              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                {!selectedCustomerProfile ? (
                  <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/15 bg-zinc-950 p-8 text-center text-zinc-400">
                    Select a customer profile from CRM search,
                    analytics, or booking management.
                  </div>
                ) : (
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
                            (booking) => (
                              <div
                                key={`profile-${booking.reference}`}
                                className="rounded-xl border border-white/10 bg-black/35 p-4"
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <p className="font-semibold text-white">
                                      {booking.reference}
                                    </p>
                                    <p className="mt-1 text-sm text-zinc-400">
                                      {booking.bookingDate} ·{" "}
                                      {booking.zoneTitle} · Table{" "}
                                      {booking.tableNumber}
                                    </p>
                                  </div>
                                  <span
                                    className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
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
                                </div>
                              </div>
                            ),
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
                )}
              </div>
            </div>
          </section>
        )}

        {canManageWaitlist && (
          <section className="mb-10 rounded-2xl border border-[#8D7A2F]/35 bg-[radial-gradient(circle_at_top,#22170C_0%,#101010_48%,#050505_100%)] p-6 shadow-2xl shadow-[#8D7A2F]/10">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                  Waitlist & Over-Capacity
                </p>
                <h2 className="text-3xl font-bold">
                  Guest Demand Queue
                </h2>
                <p className="mt-2 text-zinc-400">
                  Track waitlisted guests for{" "}
                  <span className="font-semibold text-white">
                    {getShowLabel(selectedShow)}
                  </span>{" "}
                  and convert them when a suitable table opens.
                </p>
              </div>

              <input
                value={waitlistSearch}
                onChange={(event) =>
                  setWaitlistSearch(event.target.value)
                }
                placeholder="Search waitlist guest, reference, or zone"
                className="w-full rounded-2xl border border-zinc-700 bg-black px-5 py-4 text-lg lg:max-w-md"
              />
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

        {canManageCommunications && (
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
                  Manage demo templates, trigger reminders, and
                  broadcast operational updates for{" "}
                  <span className="font-semibold text-white">
                    {getShowLabel(selectedShow)}
                  </span>
                  .
                </p>
              </div>

              <button
                type="button"
                onClick={sendShowReminder}
                className="rounded-full border border-[#D8C36A]/40 px-5 py-3 font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
              >
                Send Show Reminders
              </button>
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
                        {"{{customerName}}"}
                      </span>{" "}
                      and{" "}
                      <span className="font-mono text-[#F2D66C]">
                        {"{{tableNumber}}"}
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
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Operational Broadcast
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  Simulate show-wide guest updates for active bookings
                  on the selected show.
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
                  className="mt-4 rounded-full bg-white px-6 py-3 font-semibold text-black transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Broadcast To Show Guests
                </button>

              </div>
            </div>
          </section>
        )}

        {canViewStaffOperations && (
          <section className="mb-10 rounded-2xl border border-[#D8C36A]/35 bg-[radial-gradient(circle_at_top,#22170C_0%,#101010_48%,#050505_100%)] p-6 shadow-2xl shadow-[#8D7A2F]/10">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                  QR Validation
                </p>
                <h2 className="text-3xl font-bold">
                  Live Ticket Scanner
                </h2>
                <p className="mt-2 text-zinc-400">
                  Validate ticket references or QR codes, prevent
                  duplicate check-ins, and view guest details before
                  arrival is recorded.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
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
                Validate Ticket
              </button>
            </div>

            {ticketValidationResult && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/35 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                        ticketValidationResult.state === "Invalid"
                          ? "border-red-400/40 bg-red-950/30 text-red-300"
                          : getTicketStateClasses(
                              ticketValidationResult.state,
                            )
                      }`}
                    >
                      {ticketValidationResult.state}
                    </span>
                    <p className="mt-4 text-lg font-semibold text-white">
                      {ticketValidationResult.message}
                    </p>
                    {ticketValidationResult.booking && (
                      <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-zinc-300 md:grid-cols-2">
                        <p>
                          <span className="text-zinc-500">
                            Guest:
                          </span>{" "}
                          {
                            ticketValidationResult.booking.customer
                              .name
                          }
                        </p>
                        <p>
                          <span className="text-zinc-500">
                            Reference:
                          </span>{" "}
                          {ticketValidationResult.booking.reference}
                        </p>
                        <p>
                          <span className="text-zinc-500">
                            Seating:
                          </span>{" "}
                          {ticketValidationResult.booking.zoneTitle}
                        </p>
                        <p>
                          <span className="text-zinc-500">
                            Table:
                          </span>{" "}
                          {ticketValidationResult.booking.tableNumber}
                        </p>
                        <p>
                          <span className="text-zinc-500">
                            Party:
                          </span>{" "}
                          {ticketValidationResult.booking.partySize} guests
                        </p>
                        <p>
                          <span className="text-zinc-500">
                            Arrival:
                          </span>{" "}
                          {formatArrivalTime(
                            ticketValidationResult.booking.arrivalTime,
                          )}
                        </p>
                      </div>
                    )}
                    {ticketValidationResult.waitlistEntry && (
                      <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-zinc-300 md:grid-cols-2">
                        <p>
                          <span className="text-zinc-500">
                            Guest:
                          </span>{" "}
                          {
                            ticketValidationResult.waitlistEntry
                              .customer.name
                          }
                        </p>
                        <p>
                          <span className="text-zinc-500">
                            Waitlist:
                          </span>{" "}
                          {ticketValidationResult.waitlistEntry.id}
                        </p>
                        <p>
                          <span className="text-zinc-500">
                            Preferred:
                          </span>{" "}
                          {ticketValidationResult.waitlistEntry
                            .desiredZoneTitle ?? "Any zone"}
                        </p>
                        <p>
                          <span className="text-zinc-500">
                            Party:
                          </span>{" "}
                          {
                            ticketValidationResult.waitlistEntry
                              .partySize
                          }{" "}
                          guests
                        </p>
                      </div>
                    )}
                  </div>

                  {ticketValidationResult.booking && (
                    <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                      <a
                        href={getTicketUrl(
                          ticketValidationResult.booking.reference,
                        )}
                        className="rounded-full border border-[#D8C36A]/40 px-5 py-3 text-center font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                      >
                        Open Live Ticket
                      </a>
                      <button
                        type="button"
                        disabled={
                          getBookingTicketState(
                            ticketValidationResult.booking,
                          ) !== "Active"
                        }
                        onClick={checkInValidatedTicket}
                        className="rounded-full border border-emerald-300/50 px-5 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-300 hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        Check In From Scan
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {canViewStaffOperations && (
        <section className="mb-10 rounded-2xl border border-[#D8C36A]/35 bg-[radial-gradient(circle_at_top,#24180D_0%,#111_42%,#050505_100%)] p-6 shadow-2xl shadow-[#8D7A2F]/10">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                Staff Operations
              </p>
              <h2 className="text-3xl font-bold">
                Check-In Management
              </h2>
              <p className="mt-2 text-zinc-400">
                Live arrivals for{" "}
                <span className="font-semibold text-white">
                  {getShowLabel(selectedShow)}
                </span>
              </p>
            </div>

            <input
              value={staffSearch}
              onChange={(event) =>
                setStaffSearch(event.target.value)
              }
              placeholder="Search guest, reference, or table"
              className="w-full rounded-2xl border border-zinc-700 bg-black px-5 py-4 text-lg lg:max-w-md"
            />
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
            <div className="grid grid-cols-1 gap-3">
              {staffBookings.map((booking) => {
                const status = booking.status ?? "confirmed";
                const isCheckedIn = status === "checked-in";
                const isCancelled = status === "cancelled";

                return (
                  <div
                    key={`staff-${booking.reference}`}
                    className="rounded-2xl border border-white/10 bg-black/35 p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">
                            {booking.reference}
                          </p>
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${bookingStatusClasses[status]}`}
                          >
                            {bookingStatusLabels[status]}
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
                        className="rounded-full border border-emerald-300/50 px-6 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-300 hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
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

        {canManageTables && (
        <div className="grid grid-cols-1 gap-8">
          {seatingZones.map((zone) => {
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
              (table) => table.status === "available",
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

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[520px]">
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

                  <div className="grid grid-cols-1 gap-4">
                    {zoneTables.map((table) => (
                      <div
                        key={table.id}
                        className="rounded-2xl border border-white/10 bg-black/35 p-4"
                      >
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[160px_120px_150px_1fr]">
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
                              Seats
                            </span>
                            <input
                              type="number"
                              min={1}
                              value={table.seatCapacity}
                              onChange={(event) =>
                                updateTable(table.id, {
                                  seatCapacity: Number(
                                    event.target.value,
                                  ),
                                })
                              }
                              className="w-full rounded-xl border border-white/15 bg-zinc-950 px-4 py-3"
                            />
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Status
                            </span>
                            <select
                              value={table.status}
                              onChange={(event) =>
                                updateTable(table.id, {
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
                                Booked
                              </option>
                              <option value="disabled">
                                Disabled
                              </option>
                            </select>
                          </label>

                          <label>
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Guest Notes
                            </span>
                            <input
                              value={table.guestNotes}
                              onChange={(event) =>
                                updateTable(table.id, {
                                  guestNotes:
                                    event.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-white/15 bg-zinc-950 px-4 py-3"
                            />
                          </label>
                        </div>

                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap gap-2 text-sm text-zinc-300">
                            {table.bookingReference && (
                              <span className="rounded-full border border-emerald-400/30 bg-emerald-950/30 px-3 py-1 text-emerald-300">
                                {table.bookingReference}
                              </span>
                            )}
                            {table.mergedFrom && (
                              <span className="rounded-full border border-[#D8C36A]/30 bg-black/40 px-3 py-1">
                                Merged Table
                              </span>
                            )}
                          </div>

                          <div className="flex flex-col gap-3 sm:flex-row">
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
                                !mergeSelections[zone.id]
                              }
                              onClick={() =>
                                mergeTable(zone.id, table)
                              }
                              className="rounded-full border border-white/20 px-5 py-3 font-semibold transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              Merge
                            </button>

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
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
        )}

        {canViewBookingManagement && (
        <div className="mt-12 border-t border-zinc-800 pt-10">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
                Booking Management
              </p>

              <h2 className="text-3xl font-bold">
                All Bookings
              </h2>
            </div>

            <input
              value={bookingSearch}
              onChange={(event) =>
                setBookingSearch(event.target.value)
              }
              placeholder="Search reference or customer"
              className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-5 py-4 text-lg sm:max-w-md"
            />
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            {bookingStatuses.map((status) => (
              <span
                key={status}
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${bookingStatusClasses[status]}`}
              >
                {bookingStatusLabels[status]}
              </span>
            ))}
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-6">
            <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Gross Sales
              </p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(financialReport.grossSales)}
              </p>
            </div>

            <div className="rounded-2xl border border-[#D8C36A]/25 bg-black/30 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
                Add-Ons
              </p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(financialReport.addonsTotal)}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-950/20 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                Paid
              </p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(financialReport.amountPaid)}
              </p>
            </div>

            <div className="rounded-2xl border border-amber-300/25 bg-amber-950/20 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
                Balance Due
              </p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(financialReport.balanceDue)}
              </p>
            </div>

            <div className="rounded-2xl border border-sky-300/25 bg-sky-950/20 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">
                Discounts
              </p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(financialReport.discountAmount)}
              </p>
            </div>

            <div className="rounded-2xl border border-[#D8C36A]/25 bg-black/30 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
                Net Sales
              </p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(financialReport.netSales)}
              </p>
            </div>
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
            <div className="grid grid-cols-1 gap-4">
              {filteredBookings.map((booking) => {
                const financials = getBookingFinancials(booking);
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
                    className="rounded-2xl border border-[#8D7A2F]/35 bg-zinc-950 p-6 shadow-2xl shadow-black/20"
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">
                            {booking.reference}
                          </p>
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
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
                        </div>

                        <h3 className="mt-2 text-2xl font-bold">
                          {booking.zoneTitle} ·{" "}
                          {booking.tableNumber || "Unassigned"}
                        </h3>

                        <p className="mt-2 text-zinc-400">
                          {booking.bookingDate} ·{" "}
                          {booking.partySize} guests ·{" "}
                          {formatCurrency(financials.totalPrice)}
                        </p>
                        <p className="mt-2 text-sm text-zinc-500">
                          {financials.paymentOption === "deposit"
                            ? "Deposit booking"
                            : "Paid in full"}{" "}
                          · Paid{" "}
                          {formatCurrency(financials.amountPaid)}
                          {financials.balanceDue > 0 &&
                            ` · Balance ${formatCurrency(financials.balanceDue)}`}
                        </p>
                        {(booking.addons ?? []).length > 0 && (
                          <p className="mt-2 text-sm text-[#D8C36A]">
                            Add-ons:{" "}
                            {(booking.addons ?? [])
                              .map((addon) => addon.name)
                              .join(", ")}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        {canViewCrm && (
                          <button
                            type="button"
                            onClick={() =>
                              openCustomerProfile(booking.customer)
                            }
                            className="rounded-full border border-[#D8C36A]/40 px-5 py-3 font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                          >
                            Open Profile
                          </button>
                        )}

                        {canManageBookings && (
                          <button
                            type="button"
                            disabled={
                              (booking.status ?? "confirmed") ===
                              "cancelled"
                            }
                            onClick={() => cancelBooking(booking)}
                            className="rounded-full border border-red-300/40 px-5 py-3 font-semibold text-red-200 transition hover:bg-red-300 hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            Cancel Booking
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
                      <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              Digital Ticket
                            </p>
                            <p className="mt-2 font-mono text-sm text-zinc-300">
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
                            <div className="flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() =>
                                  sendTicket(booking, "email")
                                }
                                className="rounded-full border border-[#D8C36A]/40 px-5 py-3 font-semibold text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
                              >
                                Resend Ticket
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  resendConfirmation(booking)
                                }
                                className="rounded-full border border-white/20 px-5 py-3 font-semibold transition hover:bg-white hover:text-black"
                              >
                                Resend Confirmation
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  sendTicket(booking, "push")
                                }
                                className="rounded-full border border-white/20 px-5 py-3 font-semibold transition hover:bg-white hover:text-black"
                              >
                                Push Ticket
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Communication History
                        </p>
                        {(booking.communicationHistory ?? [])
                          .length === 0 ? (
                          <p className="mt-2 text-sm text-zinc-400">
                            No ticket sends yet.
                          </p>
                        ) : (
                          <div className="mt-3 space-y-2">
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
                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Custom Guest Message
                        </p>
                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[auto_1fr]">
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
                          className="mt-3 rounded-full bg-white px-5 py-3 font-semibold text-black transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          Send Custom Message
                        </button>
                      </div>
                    )}

                    {canManageBookings ? (
                      <>
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
                  </section>
                );
              })}
            </div>
          )}
        </div>
        )}
      </div>
    </main>
  );
}
