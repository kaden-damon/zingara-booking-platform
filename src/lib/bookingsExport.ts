import {
  getDisplayZoneTitle,
  type SeatingZoneId,
} from "./zingaraDemo";

export type BookingsExportRow = {
  amountPaid: number;
  archiveState: string;
  attention: string;
  bookingReference: string;
  bookingSource: string;
  bookingStatus: string;
  bookingType: string;
  bookingValue: number;
  cancellationReason: string;
  company: string;
  complimentary: string;
  createdAt: string;
  createdBy: string;
  customerName: string;
  email: string;
  floorState: string;
  guestCount: number;
  lastUpdated: string;
  mobile: string;
  outstanding: number;
  paymentStatus: string;
  performanceDate: string;
  replacementReference: string;
  seatingSection: string;
  showTime: string;
  venue: string;
};

export type BookingExportZoneEntitlement = {
  pax: number;
  zoneId: SeatingZoneId;
};

const bookingStatusLabels: Record<string, string> = {
  cancelled: "Cancelled",
  checked_in: "Checked in",
  completed: "Completed",
  confirmed: "Confirmed",
  new: "New",
  no_show: "No-show",
  pending_payment: "Awaiting payment",
  refunded: "Refunded",
  waitlisted: "Waitlisted",
};

const paymentStatusLabels: Record<string, string> = {
  cancelled: "Unpaid",
  comp_vip: "Complimentary",
  deposit_paid: "Deposit paid",
  fully_paid: "Paid",
  pending_payment: "Unpaid",
  refunded: "Refunded",
};

const bookingSourceLabels: Record<string, string> = {
  admin: "Manual/Admin",
  "box-office": "Box Office",
  "corporate-direct": "Corporate Direct",
  "external-agent": "External Agent",
  "marketing-campaign": "Marketing Campaign",
  online: "Online",
  partner: "Partner",
  referral: "Referral",
  telephone: "Telephone",
  walkin: "Walk-in",
};

export function formatBookingExportSeating(
  section: string | null,
  zoneEntitlements: BookingExportZoneEntitlement[] | null,
) {
  if (zoneEntitlements?.length) {
    return [...zoneEntitlements]
      .filter((entry) => Number(entry.pax) > 0)
      .map(
        (entry) =>
          `${getDisplayZoneTitle(entry.zoneId)}: ${Number(entry.pax)}`,
      )
      .join("; ");
  }

  return section?.trim() || "Seating not set";
}

export function formatBookingExportFloorState(input: {
  bookingStatus: string;
  hasStoredTable: boolean;
  tableCodes: string[];
}) {
  if (["cancelled", "refunded"].includes(input.bookingStatus)) {
    return "Not required";
  }

  const tableCodes = [...new Set(input.tableCodes)].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );

  if (tableCodes.length === 1) return `Table ${tableCodes[0]}`;
  if (tableCodes.length > 1) return `Tables ${tableCodes.join(" + ")}`;
  return input.hasStoredTable ? "Table issue" : "Table needed";
}

export function formatBookingExportStatus(status: string) {
  return bookingStatusLabels[status] ?? status.replaceAll("_", " ");
}

export function formatBookingExportPaymentStatus(status: string) {
  return paymentStatusLabels[status] ?? status.replaceAll("_", " ");
}

export function formatBookingExportSource(source: string | null) {
  if (!source) return "Not recorded";
  return bookingSourceLabels[source] ?? source.replaceAll("-", " ");
}

export function getBookingExportType(input: {
  bookingOrigin: string | null;
  bookingSource: string | null;
  corporateRequestId: string | null;
}) {
  return input.bookingOrigin === "corporate" ||
    input.bookingSource === "corporate-direct" ||
    Boolean(input.corporateRequestId)
    ? "Corporate"
    : "Standard";
}

export function getBookingExportAttention(input: {
  bookingStatus: string;
  floorState: string;
  outstanding: number;
  replacementReference: string;
}) {
  if (input.replacementReference) {
    return `Replaced by ${input.replacementReference}`;
  }

  if (input.bookingStatus === "cancelled") return "Cancelled record";
  if (input.bookingStatus === "refunded") return "Refunded record";
  if (input.floorState === "Table needed" || input.floorState === "Table issue") {
    return input.floorState;
  }
  if (input.outstanding > 0) return "Payment outstanding";
  return "";
}
