import { createHash } from "crypto";
import {
  isSuperAdminProfile,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  pickAuditFields,
  recordAuditEvent,
  tryRecordAuditEvent,
} from "@/lib/supabase/serverAudit";
import {
  type BookingStatus,
  type DemoBooking,
  type EntryLocationKey,
  type PaymentStatus,
  createTicketCode,
  getShowLocationOption,
  getZoneSectionLookupTitles,
  seatingZones,
} from "@/lib/zingaraDemo";
import {
  enforceCorporateBookingSource,
  isCorporateBookingSource,
  isCorporatePartySize,
} from "@/lib/bookingClassification";

export const dynamic = "force-dynamic";

type DataPortabilityEntity = "bookings" | "customers";
type ImportAction = "Create" | "Skip" | "Update";
type PreviewRow = {
  action: ImportAction;
  errors?: string[];
  rowNumber: number;
  valid: boolean;
  values: Record<string, string>;
  warnings?: string[];
};
type ImportRequestBody =
  | {
      action: "execute";
      dataset: DataPortabilityEntity;
      fileName: string;
      rows: PreviewRow[];
    }
  | {
      action: "restore-preview" | "restore";
      importId: string;
    };

type ShowRow = {
  date: string;
  id: string;
  name: string;
  notes: string | null;
  time: string;
  venue: string;
};
type TableRow = {
  availability_scope?: "operational" | "public" | null;
  capacity: number | null;
  capacity_configured?: boolean;
  booking_id: string | null;
  id: string;
  is_override?: boolean;
  is_physical?: boolean;
  section: string;
  show_id: string;
  status: string;
  table_code: string;
};

type MutableImportTableRow = TableRow & {
  reservedByImportRow?: number;
};
type ImportTableResolution = {
  overflowCapacity?: number;
  overflowTableCode?: string;
  table: MutableImportTableRow | null;
  type: "existing" | "overflow" | "unallocated";
};

const bookingMetadataPrefix = "__zingara_booking_meta__:";
const showMetadataPrefix = "__zingara_show_meta__:";
const dataPortabilityOperatorEmail = "kaden@kaden.co.za";
const controlledDineplanImportShowId = "8ff85be9-8604-4ae7-b746-46f8f310f4b4";
const controlledDineplanImportDate = "2026-09-18";
const controlledDineplanImportLocation = "johannesburg";
const controlledDineplanImportReferenceSet = new Set([
  "7qq5nc",
  "c2j4nc",
  "l2j4nc",
  "sr87nc",
  "kr1lpc",
  "kj53nc",
  "h264nc",
  "5h29nc",
  "rrn3nc",
  "5sd3mc",
  "07bznc",
  "8ws1nc",
  "04t7nc",
  "kf88nc",
  "4fh3pc",
  "87ytpc",
  "b6j1nc",
  "6hv4nc",
  "cfgwpc",
  "f458nc",
  "90kypc",
  "g3r5nc",
  "1z70nc",
  "km0spc",
  "3tw4nc",
  "0mx1nc",
  "rqhypc",
  "1qkwnc",
  "63v1nc",
  "ylnznc",
  "l2l3pc",
  "jkkznc",
  "xr37nc",
  "chh3pc",
  "184bpc",
  "3j64nc",
  "0fk7nc",
  "xh8vnc",
  "4ny9nc",
  "qfpgpc",
  "wwvfpc",
  "0m06nc",
  "cy7ypc",
  "xsbgpc",
  "dh9zpc",
  "zxggpc",
  "2jbfpc",
  "wcbcpc",
  "pm5fpc",
  "n4y2pc",
  "sylxnc",
  "7q6fpc",
  "zzlgpc",
  "qsz9nc",
  "2792pc",
  "0v97nc",
  "xs69nc",
]);

function isAllowedDataPortabilityOperator(
  staffProfile: { email?: string | null } | null,
) {
  return (
    staffProfile?.email?.trim().toLowerCase() === dataPortabilityOperatorEmail
  );
}

async function recordBlockedDataPortabilityOperator(
  serviceClient: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
  staffProfile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
  request: Request,
) {
  await tryRecordAuditEvent(serviceClient, staffProfile, null, {
    action: "data-portability.access",
    entityReference: "imports",
    entityType: "data-portability-import",
    outcome: "blocked",
    reason:
      "Data Portability execution is temporarily restricted to the designated migration operator.",
    request,
    sourceArea: "Data Portability",
  });
}

const bookingStatusMap: Record<string, BookingStatus> = {
  cancelled: "cancelled",
  completed: "completed",
  confirmed: "confirmed",
  "checked in": "checked-in",
  checked_in: "checked-in",
  new: "new",
  "new booking": "new",
  "no show": "no-show",
  no_show: "no-show",
  pending: "pending",
  "pending payment": "pending-payment",
  pending_payment: "pending-payment",
  refunded: "refunded",
  waitlisted: "waitlisted",
};

const paymentStatusMap: Record<string, PaymentStatus> = {
  "comp/vip": "comp-vip",
  comp_vip: "comp-vip",
  "deposit paid": "deposit-paid",
  deposit_paid: "deposit-paid",
  "fully paid": "fully-paid",
  fully_paid: "fully-paid",
  "pending payment": "pending-payment",
  pending_payment: "pending-payment",
  refunded: "refunded",
};

function normalizeValue(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function getLegacyShowId(notes: string | null) {
  if (!notes?.startsWith(showMetadataPrefix)) {
    return "";
  }

  try {
    const parsed = JSON.parse(notes.slice(showMetadataPrefix.length)) as {
      legacyId?: string;
    };

    return parsed.legacyId?.trim() ?? "";
  } catch {
    return "";
  }
}

function normalizeImportTimeValue(value?: string | null) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return "";
  }

  const directMatch = trimmedValue.match(/\b(\d{1,2})[:hH](\d{2})\b/);

  if (directMatch) {
    return `${directMatch[1].padStart(2, "0")}:${directMatch[2]}`;
  }

  const hourOnlyMatch = trimmedValue.match(/\b(\d{1,2})\b/);

  if (
    hourOnlyMatch &&
    trimmedValue.replace(/\D/g, "") === hourOnlyMatch[1]
  ) {
    return `${hourOnlyMatch[1].padStart(2, "0")}:00`;
  }

  const parsedDate = new Date(trimmedValue);

  if (!Number.isNaN(parsedDate.getTime())) {
    return `${String(parsedDate.getHours()).padStart(2, "0")}:${String(
      parsedDate.getMinutes(),
    ).padStart(2, "0")}`;
  }

  return "";
}

function normalizeShowTime(value: string) {
  return normalizeImportTimeValue(value) || value.slice(0, 5);
}

function getSourceTime(values: Record<string, string>) {
  return normalizeImportTimeValue(
    values.show_time ||
      values.time ||
      values.showtime ||
      values.performance_time ||
      values.session_time ||
      values.reservation_time ||
      "",
  );
}

function getZoneAliases(zone: (typeof seatingZones)[number]) {
  return [zone.id, ...getZoneSectionLookupTitles(zone.id, zone.title)].map(
    normalizeValue,
  );
}

function getTableSortValue(value: string) {
  return value.replace(/\d+/g, (match) => match.padStart(6, "0"));
}

function findBestImportTable(
  tableRows: MutableImportTableRow[],
  showId: string,
  zone: (typeof seatingZones)[number],
  partySize: number,
) {
  return tableRows
    .filter(
      (table) =>
        table.show_id === showId &&
        getZoneAliases(zone).includes(normalizeValue(table.section)) &&
        table.capacity_configured !== false &&
        (table.is_physical === true || table.is_override === true) &&
        !table.booking_id &&
        !table.reservedByImportRow &&
        normalizeValue(table.status) !== "booked" &&
        normalizeValue(table.status) !== "blocked" &&
        normalizeValue(table.status) !== "unavailable" &&
        Number(table.capacity) >= partySize,
    )
    .sort(
      (left, right) =>
        Number(left.capacity) - Number(right.capacity) ||
        getTableSortValue(left.table_code).localeCompare(
          getTableSortValue(right.table_code),
        ),
    )[0] ?? null;
}

function getImportTableCodeParts(tableCode: string) {
  const match = tableCode.match(/^([A-Z]+)(\d+)$/i);

  return match
    ? {
        prefix: match[1].toUpperCase(),
        sequence: Number(match[2]),
      }
    : null;
}

function getNextOverflowTableCode(
  tableRows: MutableImportTableRow[],
  showId: string,
  zone: (typeof seatingZones)[number],
) {
  const zoneRows = tableRows.filter(
    (table) =>
      table.show_id === showId &&
      getZoneAliases(zone).includes(normalizeValue(table.section)),
  );
  const prefixCounts = new Map<string, number>();
  let highestSequence = 0;

  zoneRows.forEach((table) => {
    const parts = getImportTableCodeParts(table.table_code);

    if (!parts) {
      return;
    }

    prefixCounts.set(parts.prefix, (prefixCounts.get(parts.prefix) ?? 0) + 1);
  });

  const prefix =
    [...prefixCounts.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )[0]?.[0] ??
    zone.id
      .split("-")
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") ??
    "T";

  zoneRows.forEach((table) => {
    const parts = getImportTableCodeParts(table.table_code);

    if (parts?.prefix === prefix) {
      highestSequence = Math.max(highestSequence, parts.sequence);
    }
  });

  return `${prefix}${highestSequence + 1}`;
}

function resolveDineplanImportTable(
  tableRows: MutableImportTableRow[],
  row: PreviewRow,
  show: ShowRow,
  zone: (typeof seatingZones)[number],
  partySize: number,
): ImportTableResolution {
  const allocationState = normalizeValue(row.values.allocation_state);
  const floorAssignmentRequired =
    normalizeValue(row.values.floor_assignment_required) === "yes" ||
    allocationState === "requires floor assignment";

  if (floorAssignmentRequired) {
    return {
      table: null,
      type: "unallocated",
    };
  }

  const matchedTable = findBestImportTable(tableRows, show.id, zone, partySize);

  if (matchedTable) {
    matchedTable.reservedByImportRow = row.rowNumber;

    return {
      table: matchedTable,
      type: "existing",
    };
  }

  return {
    table: null,
    type: "unallocated",
  };
}

function hashImportRows(rows: PreviewRow[]) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        rows.map((row) => ({
          action: row.action,
          rowNumber: row.rowNumber,
          valid: row.valid,
          values: row.values,
        })),
      ),
    )
    .digest("hex");
}

function toSupabaseBookingStatus(value: string) {
  const status = bookingStatusMap[normalizeValue(value)] ?? "pending-payment";

  if (status === "pending-payment" || status === "pending") {
    return "pending_payment";
  }

  if (status === "checked-in") {
    return "checked_in";
  }

  if (status === "no-show") {
    return "no_show";
  }

  return status;
}

function toSupabasePaymentStatus(value: string) {
  const status = paymentStatusMap[normalizeValue(value)] ?? "pending-payment";

  if (status === "deposit-paid") {
    return "deposit_paid";
  }

  if (status === "fully-paid") {
    return "fully_paid";
  }

  if (status === "comp-vip") {
    return "comp_vip";
  }

  if (status === "pending-payment") {
    return "pending_payment";
  }

  return status;
}

function getNumericValue(value?: string, fallback = 0) {
  const parsedValue = Number(String(value ?? "").replace(/[^\d.-]/g, ""));

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function formatMoneyValue(value: number) {
  const normalizedValue = Math.max(
    Math.round((Number.isFinite(value) ? value : 0) * 100) / 100,
    0,
  );

  return Number.isInteger(normalizedValue)
    ? String(normalizedValue)
    : normalizedValue.toFixed(2);
}

function getDineplanFinancialValues(values: Record<string, string>) {
  const bookingTotal = getNumericValue(values.booking_total);
  const sourceTotalPaid = getNumericValue(
    values.source_total_paid,
    getNumericValue(values.amount_paid),
  );
  const sourceTotalRefunded = getNumericValue(
    values.source_total_refunded,
    0,
  );
  const netPaid = Math.max(sourceTotalPaid - sourceTotalRefunded, 0);
  const balanceDue = Math.max(bookingTotal - netPaid, 0);
  const paymentStatus =
    bookingTotal <= 0
      ? "comp-vip"
      : sourceTotalRefunded > 0 && netPaid <= 0
        ? "refunded"
        : netPaid >= bookingTotal
          ? "fully-paid"
          : netPaid > 0
            ? "deposit-paid"
            : "pending-payment";

  return {
    amountPaid: formatMoneyValue(netPaid),
    balanceDue: formatMoneyValue(balanceDue),
    bookingTotal: formatMoneyValue(bookingTotal),
    paymentStatus,
    sourceTotalPaid: formatMoneyValue(sourceTotalPaid),
    sourceTotalRefunded: formatMoneyValue(sourceTotalRefunded),
  };
}

function getBooleanValue(value?: string) {
  return ["1", "true", "yes", "y"].includes(normalizeValue(value));
}

function assertControlledDineplanExecution(rows: PreviewRow[]) {
  if (rows.length !== controlledDineplanImportReferenceSet.size) {
    throw new Error("Controlled Dineplan import is restricted to the approved 18 September batch.");
  }

  const seenReferences = new Set<string>();

  rows.forEach((row) => {
    const values = row.values;
    const reference = normalizeValue(values.booking_reference);
    const sourceFormat = normalizeValue(values.source_format);
    const location = getLocation(values.location);
    const showDate = values.show_date?.trim();

    if (!row.valid || row.action === "Skip") {
      throw new Error("Controlled Dineplan import rows must be valid executable rows.");
    }

    if (sourceFormat !== "dineplan legacy export") {
      throw new Error("Controlled import is restricted to Dineplan legacy rows.");
    }

    if (!controlledDineplanImportReferenceSet.has(reference)) {
      throw new Error(`Unexpected Dineplan source reference ${values.booking_reference}.`);
    }

    if (seenReferences.has(reference)) {
      throw new Error(`Duplicate Dineplan source reference ${values.booking_reference}.`);
    }

    seenReferences.add(reference);

    if (location !== controlledDineplanImportLocation) {
      throw new Error("Controlled Dineplan import is restricted to Johannesburg.");
    }

    if (showDate !== controlledDineplanImportDate) {
      throw new Error("Controlled Dineplan import is restricted to 2026-09-18.");
    }
  });
}

function assertControlledDineplanEnrichment(rows: PreviewRow[]) {
  rows.forEach((row) => {
    if (row.values.resolved_show_id !== controlledDineplanImportShowId) {
      throw new Error("Controlled Dineplan import resolved to an unexpected show.");
    }

    if (normalizeValue(row.values.proposed_overflow_table) === "yes") {
      throw new Error("Controlled Dineplan import cannot create overflow tables.");
    }
  });
}

function splitName(value?: string) {
  const name = value?.trim() || "Imported Guest";
  const [firstName = name, ...surnameParts] = name.split(/\s+/);

  return {
    firstName,
    surname: surnameParts.join(" "),
  };
}

function getLocation(value?: string): EntryLocationKey | null {
  const normalized = normalizeValue(value);

  if (
    normalized === "cape-town" ||
    normalized === "cape town" ||
    normalized === "cape town — the night court" ||
    normalized === "cape town - the night court"
  ) {
    return "cape-town";
  }

  if (
    normalized === "johannesburg" ||
    normalized === "joburg" ||
    normalized === "johannesburg — the spring court" ||
    normalized === "johannesburg - the spring court"
  ) {
    return "johannesburg";
  }

  return null;
}

function getShowAliases(show: ShowRow) {
  const time = normalizeShowTime(show.time);

  return [
    show.id,
    show.name,
    show.date,
    time,
    `${show.name} ${show.date}`,
    `${show.name} ${show.date} ${time}`,
  ].map(normalizeValue);
}

function getShowLabel(show: ShowRow) {
  return `${show.name} · ${show.date} · ${show.time.slice(0, 5)}`;
}

function resolveImportShow(values: Record<string, string>, showRows: ShowRow[]) {
  const isDineplanRow =
    normalizeValue(values.source_format) === "dineplan legacy export";
  const showValue = isDineplanRow ? "" : normalizeValue(values.show);
  const showDate = values.show_date?.trim();
  const location = getLocation(values.location);
  const sourceTime = getSourceTime(values);
  const baseCandidates = showRows.filter((show) => {
    const showLocation = getLocation(show.venue);

    return (
      (showValue ? getShowAliases(show).includes(showValue) : true) &&
      (showDate ? show.date === showDate : true) &&
      (location ? showLocation === location : true)
    );
  });
  const exactTimeCandidates = sourceTime
    ? baseCandidates.filter((show) => normalizeShowTime(show.time) === sourceTime)
    : baseCandidates;

  if (!showValue && !isDineplanRow) {
    throw new Error("Show is required.");
  }

  if (!showDate) {
    throw new Error("Show Date is required.");
  }

  if (!location) {
    throw new Error("Location must be Cape Town or Johannesburg.");
  }

  if (baseCandidates.length === 0) {
    throw new Error("No matching show was found for this show/date/location.");
  }

  if (sourceTime && exactTimeCandidates.length === 1) {
    return exactTimeCandidates[0];
  }

  if (sourceTime && exactTimeCandidates.length > 1) {
    throw new Error("Multiple shows match this source time.");
  }

  if (sourceTime && baseCandidates.length > 1) {
    throw new Error("Source time does not match a single available show.");
  }

  if (!sourceTime && baseCandidates.length > 1) {
    throw new Error("Multiple shows match this date/location. Add Show Time.");
  }

  return baseCandidates[0];
}

function serializeBooking(booking: DemoBooking) {
  return `${bookingMetadataPrefix}${JSON.stringify(booking)}`;
}

function buildDemoBooking(row: PreviewRow, show: ShowRow, table: TableRow | null) {
  const values = row.values;
  const reference = values.booking_reference.trim();
  const zone =
    seatingZones.find(
      (candidate) =>
        normalizeValue(candidate.title) === normalizeValue(values.seating_zone) ||
        normalizeValue(candidate.id) === normalizeValue(values.seating_zone),
    ) ?? seatingZones[0];
  const totalPrice = getNumericValue(values.booking_total);
  const amountPaid = getNumericValue(values.amount_paid);
  const balanceDue = getNumericValue(
    values.balance_due,
    Math.max(totalPrice - amountPaid, 0),
  );
  const partySize = Math.max(1, Math.round(getNumericValue(values.number_of_guests, 1)));
  const paymentStatus = getBooleanValue(values.complimentary_flag)
    ? "comp-vip"
    : paymentStatusMap[normalizeValue(values.payment_status)] ?? "pending-payment";
  const location = getLocation(values.location) ?? getLocation(show.venue);

  if (!location) {
    throw new Error("Booking location could not be resolved.");
  }

  const locationOption = getShowLocationOption(location);
  const now = new Date().toISOString();
  const tableNumber = table?.table_code ?? values.table?.trim() ?? "Not recorded";

  return {
    addons: [],
    addonsTotal: 0,
    amountPaid,
    balanceDue,
    bookingDate: getShowLabel(show),
    communicationHistory: [],
    createdAt: values.booking_date || now,
    customer: {
      email: values.customer_email?.trim() ?? "",
      name: values.customer_name?.trim() || "Imported Guest",
      phone: values.customer_phone?.trim() ?? "",
    },
    discountAmount: 0,
    lifecycleHistory: [],
    operationalNotes: values.guest_notes?.trim() ?? "",
    partySize,
    paymentOption: "deposit",
    paymentStatus,
    pricePerPerson: partySize > 0 ? Math.round(totalPrice / partySize) : 0,
    reference,
    refundNotes: "",
    serviceFeeAmount: 0,
    showId: show.id,
    source: enforceCorporateBookingSource(
      partySize,
      getBooleanValue(values.corporate_flag) ? "corporate-direct" : "admin",
    ),
    status: bookingStatusMap[normalizeValue(values.booking_status)] ?? "pending-payment",
    subtotalPrice: totalPrice,
    tableId: table?.id ?? tableNumber,
    tableNumber,
    ticketCode: createTicketCode(reference),
    ticketIssuedAt: now,
    totalPrice,
    zoneId: zone.id,
    zoneTitle: zone.title || locationOption.courtName,
  } satisfies DemoBooking;
}

async function getImportHistory(
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
) {
  const { data, error } = await serviceClient
    .from("data_portability_import_runs")
    .select(
      "id,dataset,started_at,completed_at,initiated_by,original_file_name,total_rows,valid_rows,created_count,updated_count,skipped_count,failed_count,final_status,duration_ms,restore_point_id,error_summary,result_log,staff_profiles(full_name,email)",
    )
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function enrichRowsForTransaction(
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  dataset: DataPortabilityEntity,
  rows: PreviewRow[],
) {
  if (dataset === "customers") {
    return rows.map((row) => ({
      ...row,
      values: {
        ...row.values,
        email: row.values.email?.trim().toLowerCase() ?? "",
      },
    }));
  }

  const updateReferences = rows
    .filter((row) => row.valid && row.action === "Update")
    .map((row) => row.values.booking_reference?.trim())
    .filter(Boolean);
  const existingBookingResult = updateReferences.length
    ? await serviceClient
        .from("bookings")
        .select("booking_reference,booking_source")
        .in("booking_reference", updateReferences)
    : { data: [], error: null };

  if (existingBookingResult.error) {
    throw existingBookingResult.error;
  }

  const existingBookingSources = new Map(
    (existingBookingResult.data ?? []).map((booking) => [
      booking.booking_reference,
      booking.booking_source,
    ]),
  );
  const [{ data: shows, error: showsError }, { data: tables, error: tablesError }] =
    await Promise.all([
      serviceClient.from("shows").select("id,name,date,time,venue,notes"),
      serviceClient
        .from("show_tables")
        .select("*"),
    ]);

  if (showsError) {
    throw showsError;
  }

  if (tablesError) {
    throw tablesError;
  }

  const showRows = (shows ?? []) as ShowRow[];
  const tableRows = ((tables ?? []) as TableRow[]).map((table) => ({
    ...table,
  })) satisfies MutableImportTableRow[];

  return rows.map((row) => {
    if (!row.valid || row.action === "Skip") {
      return row;
    }

    const values = row.values;
    const isDineplanRow =
      normalizeValue(values.source_format) === "dineplan legacy export";
    const matchedShow = resolveImportShow(values, showRows);
    const zone = seatingZones.find(
      (candidate) => getZoneAliases(candidate).includes(normalizeValue(values.seating_zone)),
    );

    if (!zone) {
      throw new Error(`Row ${row.rowNumber}: referenced seating zone is not valid.`);
    }

    const partySize = Math.max(1, Math.round(getNumericValue(values.number_of_guests, 1)));
    const existingBookingSource = existingBookingSources.get(
      values.booking_reference?.trim(),
    );

    if (
      row.action === "Update" &&
      isCorporatePartySize(partySize) &&
      !isCorporateBookingSource(existingBookingSource)
    ) {
      throw new Error(
        `Row ${row.rowNumber}: a Standard booking cannot be increased to 20 or more guests through import. Classify it as Corporate before importing the update.`,
      );
    }

    const tableResolution = isDineplanRow
      ? resolveDineplanImportTable(tableRows, row, matchedShow, zone, partySize)
      : {
          table:
            tableRows.find(
              (table) =>
                table.show_id === matchedShow.id &&
                getZoneAliases(zone).includes(normalizeValue(table.section)) &&
                normalizeValue(table.table_code) === normalizeValue(values.table),
            ) ?? null,
          type: "existing" as const,
        };

    if (!isDineplanRow && !tableResolution.table) {
      throw new Error(
        `Row ${row.rowNumber}: referenced table is not valid for the resolved show and seating zone.`,
      );
    }

    const dineplanFinancials = isDineplanRow
      ? getDineplanFinancialValues(values)
      : null;
    const authoritativeValues = dineplanFinancials
      ? {
          ...values,
          amount_paid: dineplanFinancials.amountPaid,
          balance_due: dineplanFinancials.balanceDue,
          booking_total: dineplanFinancials.bookingTotal,
          payment_status: dineplanFinancials.paymentStatus,
          source_total_paid: dineplanFinancials.sourceTotalPaid,
          source_total_refunded: dineplanFinancials.sourceTotalRefunded,
        }
      : values;
    const booking = buildDemoBooking(
      {
        ...row,
        values: authoritativeValues,
      },
      matchedShow,
      tableResolution.table,
    );

    return {
      ...row,
      values: {
        ...authoritativeValues,
        resolved_booking_source: booking.source ?? "admin",
        resolved_booking_status: toSupabaseBookingStatus(
          authoritativeValues.booking_status,
        ),
        resolved_payment_status: toSupabasePaymentStatus(
          authoritativeValues.payment_status,
        ),
        resolved_show_id: matchedShow.id,
        resolved_table_id:
          tableResolution.table?.id ?? "",
        resolved_table_number:
          tableResolution.table?.table_code ?? "",
        floor_assignment_required:
          tableResolution.type === "unallocated" ? "Yes" : "No",
        proposed_overflow_capacity: "",
        proposed_overflow_table: "No",
        serialized_booking: serializeBooking(booking),
      },
    };
  });
}

export async function GET(request: Request) {
  const { error, serviceClient, staffProfile } = await requireActiveStaff(request);

  if (error) {
    return error;
  }

  if (!isSuperAdminProfile(staffProfile)) {
    await tryRecordAuditEvent(serviceClient, staffProfile, null, {
      action: "data-portability.access",
      entityReference: "imports",
      entityType: "data-portability-import",
      outcome: "blocked",
      reason: "Super Admin access is required.",
      request,
      sourceArea: "Data Portability",
    });

    return Response.json({ error: "Super Admin access is required." }, { status: 403 });
  }

  if (!isAllowedDataPortabilityOperator(staffProfile)) {
    await recordBlockedDataPortabilityOperator(
      serviceClient,
      staffProfile,
      request,
    );

    return Response.json(
      {
        error:
          "Data Portability execution is temporarily restricted to the designated migration operator.",
      },
      { status: 403 },
    );
  }

  try {
    const url = new URL(request.url);
    const requestedShowIds = url.searchParams
      .getAll("showIds")
      .flatMap((value) => value.split(","))
      .map((showId) => showId.trim())
      .filter(Boolean);

    if (requestedShowIds.length > 0) {
      try {
        const uniqueShowIds = [...new Set(requestedShowIds)].slice(0, 50);
        const uuidShowIds = uniqueShowIds.filter(isUuid);
        const legacyShowIds = uniqueShowIds.filter((showId) => !isUuid(showId));
        let resolvedShowIds = uuidShowIds;
        const showMappings = uuidShowIds.map((showId) => ({
          requestedShowId: showId,
          supabaseShowId: showId,
        }));

        if (legacyShowIds.length > 0) {
          const safeLegacyShowIds = legacyShowIds
            .map((showId) => showId.replace(/[^\w-]/g, ""))
            .filter(Boolean);
          const { data: showRows, error: showsError } = await serviceClient
            .from("shows")
            .select("id,notes")
            .or(
              [
                ...safeLegacyShowIds.map(
                  (showId) => `notes.ilike.*${showId}*`,
                ),
              ].join(","),
            );

          if (showsError) {
            throw showsError;
          }

          resolvedShowIds = [
            ...resolvedShowIds,
            ...((showRows ?? []) as Array<{ id: string; notes: string | null }>)
              .flatMap((show) => {
                const legacyShowId = getLegacyShowId(show.notes);

                if (!legacyShowIds.includes(legacyShowId)) {
                  return [];
                }

                showMappings.push({
                  requestedShowId: legacyShowId,
                  supabaseShowId: show.id,
                });

                return [show.id];
              }),
          ];
        }

        resolvedShowIds = [...new Set(resolvedShowIds)];

        if (resolvedShowIds.length === 0) {
          return Response.json({ showMappings, tables: [] });
        }

        const { data, error: tablesError } = await serviceClient
          .from("show_tables")
          .select("*")
          .in("show_id", resolvedShowIds)
          .order("show_id", { ascending: true })
          .order("section", { ascending: true })
          .order("table_code", { ascending: true });

        if (tablesError) {
          throw tablesError;
        }

        return Response.json({ showMappings, tables: data ?? [] });
      } catch (tableLoadError) {
        console.error(
          "[Zingara data portability] Failed to load import table snapshot",
          tableLoadError,
        );

        return Response.json(
          { error: "Authoritative table inventory could not be loaded." },
          { status: 500 },
        );
      }
    }

    const rows = await getImportHistory(serviceClient);

    return Response.json({ rows });
  } catch (loadError) {
    console.error("[Zingara data portability] Failed to load import history", loadError);

    return Response.json(
      { error: "Import history could not be loaded." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const { error, serviceClient, staffProfile } = await requireActiveStaff(request);

  if (error) {
    return error;
  }

  if (!isSuperAdminProfile(staffProfile)) {
    await tryRecordAuditEvent(serviceClient, staffProfile, null, {
      action: "data-portability.access",
      entityReference: "imports",
      entityType: "data-portability-import",
      outcome: "blocked",
      reason: "Super Admin access is required.",
      request,
      sourceArea: "Data Portability",
    });

    return Response.json({ error: "Super Admin access is required." }, { status: 403 });
  }

  if (!isAllowedDataPortabilityOperator(staffProfile)) {
    await recordBlockedDataPortabilityOperator(
      serviceClient,
      staffProfile,
      request,
    );

    return Response.json(
      {
        error:
          "Data Portability execution is temporarily restricted to the designated migration operator.",
      },
      { status: 403 },
    );
  }

  let auditContext: {
    action?: string;
    dataset?: DataPortabilityEntity;
    entityReference: string;
    entityType: "data-portability-import" | "data-portability-restore";
    rowCount?: number;
  } = {
    entityReference: "unknown-import",
    entityType: "data-portability-import",
  };

  try {
    const body = (await request.json()) as ImportRequestBody;

    if (body.action === "execute") {
      auditContext = {
        action: body.action,
        dataset: body.dataset,
        entityReference: body.fileName,
        entityType: "data-portability-import",
        rowCount: body.rows.length,
      };
    } else {
      auditContext = {
        action: body.action,
        entityReference: body.importId,
        entityType: "data-portability-restore",
      };
    }

    if (body.action === "restore-preview") {
      const { data, error: restoreError } = await serviceClient
        .from("data_portability_restore_points")
        .select("id,import_id,dataset,created_at,restored_at,restore_count,affected_bookings,affected_customers")
        .eq("import_id", body.importId)
        .maybeSingle();

      if (restoreError) {
        throw restoreError;
      }

      return Response.json({
        restorePoint: data
          ? {
              bookingCount: Array.isArray(data.affected_bookings)
                ? data.affected_bookings.length
                : 0,
              customerCount: Array.isArray(data.affected_customers)
                ? data.affected_customers.length
                : 0,
              dataset: data.dataset,
              id: data.id,
              restoredAt: data.restored_at,
              restoreCount: data.restore_count,
            }
          : null,
      });
    }

    if (body.action === "restore") {
      const { data, error: restoreError } = await serviceClient.rpc(
        "restore_data_portability_import",
        {
          p_import_id: body.importId,
          p_staff_profile_id: staffProfile.id,
        },
      );

      if (restoreError) {
        throw restoreError;
      }

      await tryRecordAuditEvent(serviceClient, staffProfile, null, {
        action: "data-portability.restore-completed",
        afterValues: {
          result: typeof data === "string" ? data : JSON.stringify(data ?? {}),
        },
        entityReference: body.importId,
        entityType: "data-portability-restore",
        outcome: "success",
        reason: "Restore completed from import restore point.",
        request,
        sourceArea: "Data Portability",
      });

      return Response.json({ result: data });
    }

    if (body.action !== "execute") {
      return Response.json(
        { error: "Unsupported import action." },
        { status: 400 },
      );
    }

    const isControlledDineplanImport =
      body.dataset === "bookings" &&
      body.rows.every(
        (row) =>
          normalizeValue(row.values.source_format) ===
          "dineplan legacy export",
      );

    if (isControlledDineplanImport) {
      assertControlledDineplanExecution(body.rows);
    }

    const previewHash = hashImportRows(body.rows);
    const enrichedRows = await enrichRowsForTransaction(
      serviceClient,
      body.dataset,
      body.rows,
    );

    if (isControlledDineplanImport) {
      assertControlledDineplanEnrichment(enrichedRows);
    }

    const enrichedHash = hashImportRows(enrichedRows);

    if (!previewHash || enrichedRows.length !== body.rows.length) {
      return Response.json(
        { error: "Import payload could not be revalidated." },
        { status: 400 },
      );
    }

    await tryRecordAuditEvent(serviceClient, staffProfile, null, {
      action: "data-portability.import-started",
      afterValues: {
        dataset: body.dataset,
        fileName: body.fileName,
        rowCount: body.rows.length,
      },
      entityReference: body.fileName,
      entityType: "data-portability-import",
      outcome: "success",
      request,
      sourceArea: "Data Portability",
    });

    const { data, error: importError } = await serviceClient.rpc(
      "execute_data_portability_import",
      {
        p_dataset: body.dataset,
        p_file_name: body.fileName,
        p_preview_hash: enrichedHash,
        p_rows: enrichedRows,
        p_staff_profile_id: staffProfile.id,
        p_started_at: new Date().toISOString(),
      },
    );

    if (importError) {
      throw importError;
    }

    try {
      await recordAuditEvent(serviceClient, staffProfile, null, {
        action: "data-portability.import-completed",
        afterValues:
          typeof data === "object" && data
            ? (data as Record<string, never>)
            : pickAuditFields(
                {
                  result: String(data ?? "completed"),
                },
                ["result"],
              ),
        entityReference: body.fileName,
        entityType: "data-portability-import",
        outcome: "success",
        reason: `${body.dataset} import completed.`,
        request,
        sourceArea: "Data Portability",
      });
    } catch {
      return Response.json(
        {
          auditError:
            "Import completed, but the audit event could not be recorded.",
          result: data,
        },
        { status: 500 },
      );
    }

    return Response.json({ result: data });
  } catch (importError) {
    console.error("[Zingara data portability] Import request failed", importError);

    if (serviceClient && staffProfile) {
      if (auditContext.action === "execute" && auditContext.dataset) {
        const failureMessage =
          importError instanceof Error
            ? importError.message
            : "Import request failed.";
        const failureHash = createHash("sha256")
          .update(
            JSON.stringify({
              dataset: auditContext.dataset,
              error: failureMessage,
              fileName: auditContext.entityReference,
              rowCount: auditContext.rowCount ?? 0,
            }),
          )
          .digest("hex");
        const { data: failedRun } = await serviceClient
          .from("data_portability_import_runs")
          .insert({
            dataset: auditContext.dataset,
            completed_at: new Date().toISOString(),
            error_summary: failureMessage,
            failed_count: auditContext.rowCount ?? 0,
            final_status: "failed",
            initiated_by: staffProfile.id,
            original_file_name: auditContext.entityReference,
            preview_hash: failureHash,
            result_log: [
              {
                action: "Skip",
                errors: [failureMessage],
                message: "Import failed before any changes were committed.",
                status: "Failed",
              },
            ],
            total_rows: auditContext.rowCount ?? 0,
          })
          .select("id")
          .maybeSingle();

        if (failedRun?.id) {
          await serviceClient.from("data_portability_audit_events").insert({
            counts: {
              rows: auditContext.rowCount ?? 0,
            },
            dataset: auditContext.dataset,
            event_type: "import_failed",
            import_id: failedRun.id,
            outcome: "failed",
            staff_profile_id: staffProfile.id,
          });
        }
      }

      await tryRecordAuditEvent(serviceClient, staffProfile, null, {
        action:
          auditContext.action === "restore"
            ? "data-portability.restore-failed"
            : "data-portability.import-failed",
        entityReference: auditContext.entityReference,
        entityType: auditContext.entityType,
        outcome: "failed",
        reason:
          importError instanceof Error
            ? importError.message
            : "Import request failed.",
        request,
        sourceArea: "Data Portability",
      });
    }

    return Response.json(
      {
        error:
          importError instanceof Error
            ? importError.message
            : "Import could not be completed.",
      },
      { status: 500 },
    );
  }
}
