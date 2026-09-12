import {
  analyticsTimezone,
  getJohannesburgDateKey,
} from "./managementAnalytics.ts";

export const dailyAnalyticsSeriesStart = "2026-09-01";
export const dailyAnalyticsReportType = "Daily Analytics Workbook";

export type DailyAnalyticsBookingCandidate = {
  archivedAt: string | null;
  bookingReference: string;
  bookingSource: string;
  bookingOrigin: string | null;
  createdAt: string;
  customerCreatedAt: string;
  customerHasCompleteContact: boolean;
  customerId: string;
  customerIsSynthetic: boolean;
  guestCount: number;
  id: string;
  section: string | null;
  showId: string;
  totalAmount: number;
};

export type DailyAnalyticsPaymentEvidence = {
  amount: number;
  bookingCreatedAt: string;
  bookingId: string;
  bookingReference: string;
  createdAt: string;
  id: string;
  method: string | null;
  paymentStatus: string;
  paymentType: string;
  processedAt: string | null;
  providerGrossAmount: number;
  transactionFeeAmount: number;
};

export type DailyAnalyticsLifecycleEvidence = {
  bookingId: string;
  createdAt: string;
  reason: string | null;
  toStatus: string;
};

export type DailyAnalyticsBookingAuditEvidence = {
  beforeValues: Record<string, unknown>;
  bookingId: string;
  changedFields: string[];
  createdAt: string;
};

export type DailyAnalyticsShow = {
  date: string;
  id: string;
  name: string;
  time: string;
  venue: string;
};

export type DailyAnalyticsInput = {
  audits: DailyAnalyticsBookingAuditEvidence[];
  bookings: DailyAnalyticsBookingCandidate[];
  communications: number;
  excludedOtherActivity: number;
  lifecycleEvents: DailyAnalyticsLifecycleEvidence[];
  payments: DailyAnalyticsPaymentEvidence[];
  receivedPayments: DailyAnalyticsPaymentEvidence[];
  reportDate: string;
  shows: DailyAnalyticsShow[];
  tickets: number;
  walletRegistrations: number;
};

export type DailyAnalyticsBookingRow = {
  amountPaid: number;
  bookingReference: string;
  bookingStatus: "Cancelled" | "Confirmed" | "Pending Payment";
  completeContact: "No" | "Yes";
  createdAt: string;
  customerCohort: "New" | "Returning";
  customerId: string;
  grossValue: number;
  location: string;
  outstanding: number;
  pax: number;
  paymentStatus: "Deposit Paid" | "Fully Paid" | "Pending Payment";
  performanceDate: string;
  performanceName: string;
  performanceTime: string;
  seatingZone: string;
  showId: string;
};

export type DailyAnalyticsPaymentRow = {
  appliedAmount: number;
  bookingReference: string;
  createdAt: string;
  paymentStatus: "Deposit Paid" | "Fully Paid" | "Pending Payment" | "Refunded";
  paymentType: string;
  providerGross: number;
  storedMethod: string;
  transactionFee: number;
};

export type DailyAnalyticsSeatingRow = {
  amountPaid: number;
  bookingShare: number;
  bookings: number;
  grossValue: number;
  outstanding: number;
  pax: number;
  zone: string;
};

export type DailyAnalyticsShowRow = {
  amountPaid: number;
  bookings: number;
  grossValue: number;
  location: string;
  outstanding: number;
  pax: number;
  performanceDate: string;
  performanceName: string;
  performanceTime: string;
  showId: string;
};

export type DailyAnalyticsReport = {
  bookingRows: DailyAnalyticsBookingRow[];
  cutoffExclusive: string;
  dayNumber: number;
  excluded: {
    otherActivity: number;
    synthetic: number;
    checkoutResidues: number;
  };
  operations: {
    communications: number;
    tickets: number;
    walletRegistrations: number;
  };
  paymentRows: DailyAnalyticsPaymentRow[];
  payments: {
    averageSuccessfulPayment: number;
    depositPayments: number;
    depositValue: number;
    fullPayments: number;
    fullPaymentValue: number;
    largestSuccessfulPayment: number;
    olderBookingPaymentsReceived: number;
    olderBookingPaymentsReceivedValue: number;
    paymentsReceivedOnReportDate: number;
    pendingAttempts: number;
    providerGross: number;
    refunds: number;
    successfulApplied: number;
    successfulPayments: number;
    transactionFees: number;
  };
  reportDate: string;
  seatingRows: DailyAnalyticsSeatingRow[];
  showRows: DailyAnalyticsShowRow[];
  summary: {
    activeBookingValue: number;
    cancelled: number;
    completeContactCustomers: number;
    confirmed: number;
    distinctCustomers: number;
    grossValue: number;
    guests: number;
    newCustomers: number;
    outstanding: number;
    pending: number;
    returningCustomers: number;
    totalBookings: number;
  };
  timezone: typeof analyticsTimezone;
};

const successfulPaymentStatuses = new Set(["deposit_paid", "fully_paid"]);
const seatingOrder = [
  "Middle Ring",
  "Golden Circle",
  "Private Booths",
  "Royal Balcony",
];

function dateOnlyToUtc(date: string) {
  return new Date(`${date}T00:00:00+02:00`);
}

export function getDailyAnalyticsWindow(reportDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    throw new Error("Select a valid reporting date.");
  }

  const start = dateOnlyToUtc(reportDate);
  if (Number.isNaN(start.getTime()) || getJohannesburgDateKey(start) !== reportDate) {
    throw new Error("Select a valid reporting date.");
  }

  if (reportDate < dailyAnalyticsSeriesStart) {
    throw new Error("Daily Analytics reporting begins on 1 September 2026.");
  }

  const today = getJohannesburgDateKey(new Date());
  if (reportDate >= today) {
    throw new Error("Select a completed reporting day.");
  }

  const end = new Date(start.getTime() + 86_400_000);
  return {
    dayNumber:
      Math.round(
        (start.getTime() - dateOnlyToUtc(dailyAnalyticsSeriesStart).getTime()) /
          86_400_000,
      ) + 1,
    endExclusive: end.toISOString(),
    startInclusive: start.toISOString(),
  };
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function restoreDailyAnalyticsBookingAtCutoff(
  booking: DailyAnalyticsBookingCandidate,
  audits: DailyAnalyticsBookingAuditEvidence[],
  cutoffExclusive: string,
) {
  const restored = { ...booking };
  const matchingAudits = audits
    .filter(
      (audit) =>
        audit.bookingId === booking.id && audit.createdAt >= cutoffExclusive,
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  for (const audit of matchingAudits) {
    const before = audit.beforeValues;
    const fields = new Set(audit.changedFields);
    if (fields.has("show_id")) {
      restored.showId = stringValue(before.show_id) ?? restored.showId;
    }
    if (fields.has("section")) {
      restored.section = stringValue(before.section) ?? restored.section;
    }
    if (fields.has("guest_count") || fields.has("pax")) {
      restored.guestCount =
        numberValue(before.guest_count ?? before.pax) ?? restored.guestCount;
    }
    // Reconciled obligations are corrections to the booking's authoritative
    // commercial value. The daily series applies those corrected values
    // historically while keeping payment recognition cutoff-bound.
  }

  return restored;
}

function isSyntheticBooking(
  booking: DailyAnalyticsBookingCandidate,
  lifecycleEvents: DailyAnalyticsLifecycleEvidence[],
  cutoffExclusive: string,
) {
  const exactTestIdentity = booking.customerIsSynthetic;
  const hasTestLifecycle = lifecycleEvents.some(
    (event) =>
      event.bookingId === booking.id &&
      event.createdAt < cutoffExclusive &&
      /\b(test|qa|demo|synthetic)\b/i.test(event.reason ?? ""),
  );
  return exactTestIdentity || hasTestLifecycle;
}

function latestLifecycleStatus(
  bookingId: string,
  lifecycleEvents: DailyAnalyticsLifecycleEvidence[],
  cutoffExclusive: string,
) {
  const priority: Record<string, number> = {
    cancelled: 4,
    completed: 3,
    checked_in: 3,
    confirmed: 3,
    pending_payment: 2,
    new: 1,
  };
  return lifecycleEvents
    .filter(
      (event) =>
        event.bookingId === bookingId && event.createdAt < cutoffExclusive,
    )
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        (priority[right.toStatus] ?? 0) - (priority[left.toStatus] ?? 0),
    )[0]?.toStatus;
}

function isSuccessfulAtCutoff(
  payment: DailyAnalyticsPaymentEvidence,
  cutoffExclusive: string,
) {
  const completedAt = payment.processedAt ?? payment.createdAt;
  return (
    successfulPaymentStatuses.has(payment.paymentStatus) &&
    completedAt < cutoffExclusive
  );
}

function formatSastTimestamp(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: analyticsTimezone,
    year: "numeric",
  })
    .formatToParts(new Date(value))
    .filter((part) => part.type !== "literal")
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function displayLocation(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("cape")) return "Cape Town";
  if (normalized.includes("johannesburg") || normalized === "jhb") {
    return "Johannesburg";
  }
  return value.trim();
}

function displaySeatingZone(value: string | null) {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replace(/\s+/g, "-");
  const canonical: Record<string, string> = {
    gc: "Golden Circle",
    "golden-circle": "Golden Circle",
    mr: "Middle Ring",
    "middle-ring": "Middle Ring",
    pb: "Private Booths",
    booth: "Private Booths",
    booths: "Private Booths",
    "private-booth": "Private Booths",
    "private-booths": "Private Booths",
    "royal-booth": "Private Booths",
    "royal-booths": "Private Booths",
    rb: "Royal Balcony",
    "royal-balcony": "Royal Balcony",
  };
  return canonical[normalized] ?? value?.trim() ?? "Not recorded";
}

function displayPaymentType(value: string) {
  if (value === "full_payment") return "Full Payment";
  if (value === "deposit") return "Deposit";
  if (value === "balance") return "Balance Payment";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayPaymentMethod(payment: DailyAnalyticsPaymentEvidence, successful: boolean) {
  if (!successful) return "Platform checkout record";
  const method = payment.method?.trim();
  if (!method) return "Stored payment";
  return method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
}

function aggregateSeating(rows: DailyAnalyticsBookingRow[]) {
  return seatingOrder.map((zone): DailyAnalyticsSeatingRow => {
    const matching = rows.filter((row) => row.seatingZone === zone);
    return {
      amountPaid: matching.reduce((sum, row) => sum + row.amountPaid, 0),
      bookingShare: rows.length ? matching.length / rows.length : 0,
      bookings: matching.length,
      grossValue: matching.reduce((sum, row) => sum + row.grossValue, 0),
      outstanding: matching.reduce((sum, row) => sum + row.outstanding, 0),
      pax: matching.reduce((sum, row) => sum + row.pax, 0),
      zone,
    };
  });
}

function aggregateShows(rows: DailyAnalyticsBookingRow[]) {
  const byShow = new Map<string, DailyAnalyticsShowRow>();
  for (const row of rows) {
    const current = byShow.get(row.showId) ?? {
      amountPaid: 0,
      bookings: 0,
      grossValue: 0,
      location: row.location,
      outstanding: 0,
      pax: 0,
      performanceDate: row.performanceDate,
      performanceName: row.performanceName,
      performanceTime: row.performanceTime,
      showId: row.showId,
    };
    current.amountPaid += row.amountPaid;
    current.bookings += 1;
    current.grossValue += row.grossValue;
    current.outstanding += row.outstanding;
    current.pax += row.pax;
    byShow.set(row.showId, current);
  }
  return Array.from(byShow.values()).sort(
    (left, right) =>
      left.performanceDate.localeCompare(right.performanceDate) ||
      left.performanceTime.localeCompare(right.performanceTime) ||
      left.location.localeCompare(right.location),
  );
}

export function calculateDailyAnalytics(
  input: DailyAnalyticsInput,
): DailyAnalyticsReport {
  const window = getDailyAnalyticsWindow(input.reportDate);
  const auditsByBooking = new Map<string, DailyAnalyticsBookingAuditEvidence[]>();
  for (const audit of input.audits) {
    const rows = auditsByBooking.get(audit.bookingId) ?? [];
    rows.push(audit);
    auditsByBooking.set(audit.bookingId, rows);
  }
  const lifecycleByBooking = new Map<
    string,
    DailyAnalyticsLifecycleEvidence[]
  >();
  for (const event of input.lifecycleEvents) {
    const rows = lifecycleByBooking.get(event.bookingId) ?? [];
    rows.push(event);
    lifecycleByBooking.set(event.bookingId, rows);
  }
  const restoredCandidates = input.bookings.map((booking) =>
    restoreDailyAnalyticsBookingAtCutoff(
      booking,
      auditsByBooking.get(booking.id) ?? [],
      window.endExclusive,
    ),
  );
  const checkoutResidues = restoredCandidates.filter(
    (booking) => booking.archivedAt && booking.archivedAt < window.endExclusive,
  ).length;
  const unarchivedCandidates = restoredCandidates.filter(
    (booking) => !booking.archivedAt || booking.archivedAt >= window.endExclusive,
  );
  const syntheticCandidates = unarchivedCandidates.filter((booking) =>
    isSyntheticBooking(
      booking,
      lifecycleByBooking.get(booking.id) ?? [],
      window.endExclusive,
    ),
  );
  const syntheticIds = new Set(syntheticCandidates.map((booking) => booking.id));
  const cohort = unarchivedCandidates.filter(
    (booking) => !syntheticIds.has(booking.id),
  );
  const showsById = new Map(input.shows.map((show) => [show.id, show]));
  const cohortIds = new Set(cohort.map((booking) => booking.id));
  const cohortPayments = input.payments.filter(
    (payment) =>
      cohortIds.has(payment.bookingId) &&
      payment.createdAt < window.endExclusive,
  );
  const paymentsByBooking = new Map<string, DailyAnalyticsPaymentEvidence[]>();
  for (const payment of cohortPayments) {
    const rows = paymentsByBooking.get(payment.bookingId) ?? [];
    rows.push(payment);
    paymentsByBooking.set(payment.bookingId, rows);
  }

  const bookingRows = cohort
    .map((booking): DailyAnalyticsBookingRow => {
      const show = showsById.get(booking.showId);
      if (!show) {
        throw new Error(
          `Historical show evidence is missing for ${booking.bookingReference}.`,
        );
      }
      const successfulPayments = (paymentsByBooking.get(booking.id) ?? []).filter(
        (payment) => isSuccessfulAtCutoff(payment, window.endExclusive),
      );
      const amountPaid = successfulPayments.reduce(
        (sum, payment) => sum + payment.amount,
        0,
      );
      const lifecycleStatus = latestLifecycleStatus(
        booking.id,
        lifecycleByBooking.get(booking.id) ?? [],
        window.endExclusive,
      );
      const bookingStatus =
        lifecycleStatus === "cancelled"
          ? "Cancelled"
          : amountPaid > 0
            ? "Confirmed"
            : "Pending Payment";
      const paymentStatus =
        amountPaid <= 0
          ? "Pending Payment"
          : amountPaid >= booking.totalAmount
            ? "Fully Paid"
            : "Deposit Paid";
      return {
        amountPaid,
        bookingReference: booking.bookingReference,
        bookingStatus,
        completeContact: booking.customerHasCompleteContact ? "Yes" : "No",
        createdAt: formatSastTimestamp(booking.createdAt),
        customerCohort:
          booking.customerCreatedAt < window.startInclusive ? "Returning" : "New",
        customerId: booking.customerId,
        grossValue: booking.totalAmount,
        location: displayLocation(show.venue),
        outstanding:
          bookingStatus === "Cancelled"
            ? 0
            : Math.max(booking.totalAmount - amountPaid, 0),
        pax: booking.guestCount,
        paymentStatus,
        performanceDate: show.date,
        performanceName: show.name,
        performanceTime: show.time.slice(0, 5),
        seatingZone: displaySeatingZone(booking.section),
        showId: show.id,
      };
    })
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.bookingReference.localeCompare(right.bookingReference),
    );

  const paymentRows = cohortPayments
    .map((payment): DailyAnalyticsPaymentRow => {
      const successful = isSuccessfulAtCutoff(payment, window.endExclusive);
      const refunded = payment.paymentStatus === "refunded";
      return {
        appliedAmount: payment.amount,
        bookingReference: payment.bookingReference,
        createdAt: formatSastTimestamp(payment.createdAt),
        paymentStatus: refunded
          ? "Refunded"
          : successful
            ? payment.paymentType === "deposit"
              ? "Deposit Paid"
              : "Fully Paid"
            : "Pending Payment",
        paymentType: displayPaymentType(payment.paymentType),
        providerGross: payment.providerGrossAmount,
        storedMethod: displayPaymentMethod(payment, successful),
        transactionFee: payment.transactionFeeAmount,
      };
    })
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.bookingReference.localeCompare(right.bookingReference),
    );

  const successfulPaymentRows = paymentRows.filter(
    (payment) =>
      payment.paymentStatus === "Fully Paid" ||
      payment.paymentStatus === "Deposit Paid",
  );
  const fullPaymentRows = successfulPaymentRows.filter(
    (payment) => payment.paymentType === "Full Payment",
  );
  const depositRows = successfulPaymentRows.filter(
    (payment) => payment.paymentType === "Deposit",
  );
  const successfulApplied = successfulPaymentRows.reduce(
    (sum, payment) => sum + payment.appliedAmount,
    0,
  );
  const receivedToday = input.receivedPayments.filter((payment) =>
    isSuccessfulAtCutoff(payment, window.endExclusive),
  );
  const olderReceived = receivedToday.filter(
    (payment) => payment.bookingCreatedAt < window.startInclusive,
  );
  const distinctCustomers = new Set(bookingRows.map((row) => row.customerId));
  const newCustomers = new Set(
    bookingRows
      .filter((row) => row.customerCohort === "New")
      .map((row) => row.customerId),
  );
  const completeContactCustomers = new Set(
    bookingRows
      .filter((row) => row.completeContact === "Yes")
      .map((row) => row.customerId),
  );

  return {
    bookingRows,
    cutoffExclusive: window.endExclusive,
    dayNumber: window.dayNumber,
    excluded: {
      checkoutResidues,
      otherActivity: input.excludedOtherActivity,
      synthetic: syntheticCandidates.length,
    },
    operations: {
      communications: input.communications,
      tickets: input.tickets,
      walletRegistrations: input.walletRegistrations,
    },
    paymentRows,
    payments: {
      averageSuccessfulPayment: successfulPaymentRows.length
        ? successfulApplied / successfulPaymentRows.length
        : 0,
      depositPayments: depositRows.length,
      depositValue: depositRows.reduce(
        (sum, payment) => sum + payment.appliedAmount,
        0,
      ),
      fullPayments: fullPaymentRows.length,
      fullPaymentValue: fullPaymentRows.reduce(
        (sum, payment) => sum + payment.appliedAmount,
        0,
      ),
      largestSuccessfulPayment: fullPaymentRows.reduce(
        (largest, payment) => Math.max(largest, payment.appliedAmount),
        0,
      ),
      olderBookingPaymentsReceived: olderReceived.length,
      olderBookingPaymentsReceivedValue: olderReceived.reduce(
        (sum, payment) => sum + payment.amount,
        0,
      ),
      paymentsReceivedOnReportDate: receivedToday.length,
      pendingAttempts: paymentRows.filter(
        (payment) => payment.paymentStatus === "Pending Payment",
      ).length,
      providerGross: successfulPaymentRows.reduce(
        (sum, payment) => sum + payment.providerGross,
        0,
      ),
      refunds: paymentRows.filter(
        (payment) => payment.paymentStatus === "Refunded",
      ).length,
      successfulApplied,
      successfulPayments: successfulPaymentRows.length,
      transactionFees: successfulPaymentRows.reduce(
        (sum, payment) => sum + payment.transactionFee,
        0,
      ),
    },
    reportDate: input.reportDate,
    seatingRows: aggregateSeating(bookingRows),
    showRows: aggregateShows(bookingRows),
    summary: {
      activeBookingValue: bookingRows
        .filter((row) => row.bookingStatus !== "Cancelled")
        .reduce((sum, row) => sum + row.grossValue, 0),
      cancelled: bookingRows.filter((row) => row.bookingStatus === "Cancelled")
        .length,
      completeContactCustomers: completeContactCustomers.size,
      confirmed: bookingRows.filter((row) => row.bookingStatus === "Confirmed")
        .length,
      distinctCustomers: distinctCustomers.size,
      grossValue: bookingRows.reduce((sum, row) => sum + row.grossValue, 0),
      guests: bookingRows.reduce((sum, row) => sum + row.pax, 0),
      newCustomers: newCustomers.size,
      outstanding: bookingRows.reduce((sum, row) => sum + row.outstanding, 0),
      pending: bookingRows.filter(
        (row) => row.bookingStatus === "Pending Payment",
      ).length,
      returningCustomers: distinctCustomers.size - newCustomers.size,
      totalBookings: bookingRows.length,
    },
    timezone: analyticsTimezone,
  };
}

export function dailyAnalyticsFilename(report: DailyAnalyticsReport) {
  return `Zingara_Day_${report.dayNumber}_Analytics_${report.reportDate}.xlsx`;
}
