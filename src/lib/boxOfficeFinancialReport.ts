export const boxOfficeReportTimezone = "Africa/Johannesburg";

export type BoxOfficeLocation = "cape-town" | "johannesburg";
export type BoxOfficeBookingType = "corporate" | "standard";

export type BoxOfficeReportFilters = {
  bookingType: "all" | BoxOfficeBookingType;
  from: string;
  location: "all" | BoxOfficeLocation;
  to: string;
};

export type BoxOfficeBookingRow = {
  addonsTotal: number;
  amountPaid: number;
  archivedAt: string | null;
  balanceOutstanding: number;
  bookingOrigin: string | null;
  bookingReference: string;
  bookingSource: string;
  bookingStatus: string;
  corporateRequestId: string | null;
  createdAt: string;
  customerId: string;
  customerName: string;
  discountAmount: number;
  guestCount: number;
  id: string;
  location: BoxOfficeLocation;
  serviceFee: number;
  showId: string;
  subtotalAmount: number;
  totalAmount: number;
};

export type BoxOfficePaymentRow = {
  amount: number;
  bookingId: string;
  createdAt: string;
  id: string;
  method: string | null;
  paymentStatus: string;
  paymentType: string;
  processedAt: string | null;
  providerGrossAmount: number;
  providerTransactionId: string | null;
  transactionFeeAmount: number;
};

export type BoxOfficeAuditRow = {
  afterValues: Record<string, unknown>;
  beforeValues: Record<string, unknown>;
  createdAt: string;
  entityReference: string;
  id: string;
  reason: string | null;
};

export type BoxOfficeRefundRow = {
  bookingId: string;
  bookingReference: string;
  completedAt: string | null;
  createdAt: string;
  id: string;
  refundAmount: number;
  refundStatus: string;
};

export type BoxOfficeReceipt = {
  amount: number;
  bookingFee: number;
  bookingReference: string;
  bookingType: BoxOfficeBookingType;
  classification: string;
  customerName: string;
  date: string;
  grossCash: number;
  id: string;
  location: BoxOfficeLocation;
  method: string;
  requiresReview: boolean;
  reviewReason?: string;
};

type MoneySummary = {
  bookingValue: number;
  bookings: number;
  cashReceived: number;
  guests: number;
  netReceipts: number;
  refunds: number;
};

export type BoxOfficeFinancialReport = {
  bookings: BoxOfficeBookingRow[];
  bookingTypes: Record<BoxOfficeBookingType, MoneySummary>;
  generatedAt: string;
  locations: Record<BoxOfficeLocation | "total", MoneySummary>;
  paymentClassifications: Array<{ amount: number; count: number; label: string }>;
  paymentMethods: Array<{ amount: number; count: number; label: string }>;
  receipts: BoxOfficeReceipt[];
  reconciliation: { difference: number; warning: boolean };
  refunds: BoxOfficeRefundRow[];
  requiresReview: BoxOfficeReceipt[];
  revenue: {
    addons: number;
    bookingFees: number;
    discounts: number;
    serviceCharge: number;
    ticketSubtotal: number;
  };
  sales: {
    amountPaid: number;
    bookingValue: number;
    bookings: number;
    guests: number;
    outstanding: number;
  };
  cash: {
    bookingAppliedReceipts: number;
    bookingFees: number;
    grossCashReceived: number;
    netReceipts: number;
    refunds: number;
  };
};

const successfulPaymentStatuses = new Set(["deposit_paid", "fully_paid"]);

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

export function getSastDateRange(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new Error("Select a valid reporting date range.");
  }
  const end = new Date(`${to}T00:00:00+02:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    endExclusive: end.toISOString(),
    start: new Date(`${from}T00:00:00+02:00`).toISOString(),
  };
}

export function getBoxOfficeBookingType(
  booking: Pick<BoxOfficeBookingRow, "bookingOrigin" | "bookingSource" | "corporateRequestId">,
): BoxOfficeBookingType {
  return booking.bookingOrigin === "corporate" ||
    booking.bookingSource.toLowerCase().includes("corporate") ||
    Boolean(booking.corporateRequestId)
    ? "corporate"
    : "standard";
}

function isWithin(timestamp: string, start: string, endExclusive: string) {
  const value = new Date(timestamp).getTime();
  return value >= new Date(start).getTime() && value < new Date(endExclusive).getTime();
}

function parseDatedReceipts(reason: string | null) {
  const receipts: Array<{ amount: number; date: string }> = [];
  const expression = /paid\s*\(R\s*([\d,]+(?:\.\d{1,2})?)\)\s*on\s*(\d{2})\/(\d{2})\/(\d{4})/gi;
  for (const match of reason?.matchAll(expression) ?? []) {
    receipts.push({
      amount: money(match[1].replace(/,/g, "")),
      date: `${match[4]}-${match[3]}-${match[2]}T12:00:00+02:00`,
    });
  }
  return receipts;
}

function paymentClassification(type: string) {
  if (type === "deposit") return "Deposit";
  if (type === "balance") return "Balance Payment";
  if (type === "full_payment") return "Full Payment";
  return "Unclassified";
}

function paymentMethod(payment: BoxOfficePaymentRow) {
  if (payment.providerTransactionId || payment.providerGrossAmount > 0) {
    return "PayFast / Online";
  }
  const method = payment.method?.trim().toLowerCase() ?? "";
  if (method.includes("eft") || method.includes("manual")) return "EFT / Manual";
  if (method && method !== "platform") return "Other";
  return "Manual / Method Not Recorded";
}

function summarizeGroups<T>(
  values: T[],
  getLabel: (value: T) => string,
  getAmount: (value: T) => number,
) {
  const groups = new Map<string, { amount: number; count: number; label: string }>();
  for (const value of values) {
    const label = getLabel(value);
    const current = groups.get(label) ?? { amount: 0, count: 0, label };
    current.amount = money(current.amount + getAmount(value));
    current.count += 1;
    groups.set(label, current);
  }
  return [...groups.values()].sort((left, right) => right.amount - left.amount);
}

export function buildBoxOfficeFinancialReport(input: {
  audits: BoxOfficeAuditRow[];
  bookings: BoxOfficeBookingRow[];
  filters: BoxOfficeReportFilters;
  generatedAt?: string;
  payments: BoxOfficePaymentRow[];
  refunds: BoxOfficeRefundRow[];
}): BoxOfficeFinancialReport {
  const { endExclusive, start } = getSastDateRange(input.filters.from, input.filters.to);
  const bookingById = new Map(input.bookings.map((booking) => [booking.id, booking]));
  const bookingByReference = new Map(input.bookings.map((booking) => [booking.bookingReference, booking]));
  const matchesScope = (booking: BoxOfficeBookingRow) =>
    (input.filters.location === "all" || booking.location === input.filters.location) &&
    (input.filters.bookingType === "all" || getBoxOfficeBookingType(booking) === input.filters.bookingType);
  const periodBookings = input.bookings.filter(
    (booking) =>
      isWithin(booking.createdAt, start, endExclusive) &&
      !booking.archivedAt &&
      booking.bookingStatus !== "cancelled" &&
      matchesScope(booking),
  );

  const auditsByReference = new Map<string, BoxOfficeAuditRow[]>();
  for (const audit of input.audits) {
    const values = auditsByReference.get(audit.entityReference) ?? [];
    values.push(audit);
    auditsByReference.set(audit.entityReference, values);
  }

  const receipts: BoxOfficeReceipt[] = [];
  for (const payment of input.payments) {
    if (!successfulPaymentStatuses.has(payment.paymentStatus)) continue;
    const booking = bookingById.get(payment.bookingId);
    if (!booking || !matchesScope(booking)) continue;
    const method = paymentMethod(payment);
    const classification = paymentClassification(payment.paymentType);
    const isProvider = method === "PayFast / Online";
    const matchingAudits = auditsByReference.get(booking.bookingReference) ?? [];
    const evidenceAudit = isProvider
      ? undefined
      : [...matchingAudits]
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .find((audit) => parseDatedReceipts(audit.reason).length > 0);
    const datedReceipts = evidenceAudit
      ? parseDatedReceipts(evidenceAudit.reason)
      : [];

    if (datedReceipts.length > 0) {
      for (const [index, receipt] of datedReceipts.entries()) {
        if (!isWithin(receipt.date, start, endExclusive)) continue;
        receipts.push({
          amount: receipt.amount,
          bookingFee: 0,
          bookingReference: booking.bookingReference,
          bookingType: getBoxOfficeBookingType(booking),
          classification: index > 0 ? "Balance Payment" : classification,
          customerName: booking.customerName,
          date: receipt.date,
          grossCash: receipt.amount,
          id: `${payment.id}-evidence-${index}`,
          location: booking.location,
          method,
          requiresReview: method === "Manual / Method Not Recorded",
          reviewReason: method === "Manual / Method Not Recorded"
            ? "Payment received during period but payment method was not persisted."
            : undefined,
        });
      }
      continue;
    }

    const deltaAudit = isProvider
      ? undefined
      : [...matchingAudits]
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .find((audit) => {
            const before = money(audit.beforeValues.amount_paid);
            const after = money(audit.afterValues.amount_paid);
            return after > before && isWithin(audit.createdAt, start, endExclusive);
          });
    if (deltaAudit) {
      const amount = money(
        money(deltaAudit.afterValues.amount_paid) -
          money(deltaAudit.beforeValues.amount_paid),
      );
      receipts.push({
        amount,
        bookingFee: 0,
        bookingReference: booking.bookingReference,
        bookingType: getBoxOfficeBookingType(booking),
        classification,
        customerName: booking.customerName,
        date: deltaAudit.createdAt,
        grossCash: amount,
        id: `${payment.id}-audit-delta`,
        location: booking.location,
        method,
        requiresReview: method === "Manual / Method Not Recorded",
        reviewReason: method === "Manual / Method Not Recorded"
          ? "Payment received during period but payment method was not persisted."
          : undefined,
      });
      continue;
    }

    const paymentDate = payment.processedAt ?? payment.createdAt;
    if (!isWithin(paymentDate, start, endExclusive)) continue;
    const bookingFee = isProvider ? payment.transactionFeeAmount : 0;
    const grossCash = isProvider
      ? payment.providerGrossAmount || money(payment.amount + bookingFee)
      : payment.amount;
    receipts.push({
      amount: payment.amount,
      bookingFee,
      bookingReference: booking.bookingReference,
      bookingType: getBoxOfficeBookingType(booking),
      classification,
      customerName: booking.customerName,
      date: paymentDate,
      grossCash,
      id: payment.id,
      location: booking.location,
      method,
      requiresReview: method === "Manual / Method Not Recorded",
      reviewReason: method === "Manual / Method Not Recorded"
        ? "Payment received during period but payment method was not persisted."
        : undefined,
    });
  }

  const refunds = input.refunds.filter((refund) => {
    const booking = bookingById.get(refund.bookingId) ?? bookingByReference.get(refund.bookingReference);
    const date = refund.completedAt ?? refund.createdAt;
    return refund.refundStatus === "accepted" && Boolean(booking && matchesScope(booking)) && isWithin(date, start, endExclusive);
  });
  const bookingAppliedReceipts = money(receipts.reduce((sum, receipt) => sum + receipt.amount, 0));
  const bookingFees = money(receipts.reduce((sum, receipt) => sum + receipt.bookingFee, 0));
  const grossCashReceived = money(receipts.reduce((sum, receipt) => sum + receipt.grossCash, 0));
  const refundTotal = money(refunds.reduce((sum, refund) => sum + refund.refundAmount, 0));
  const sales = {
    amountPaid: money(periodBookings.reduce((sum, booking) => sum + booking.amountPaid, 0)),
    bookingValue: money(periodBookings.reduce((sum, booking) => sum + booking.totalAmount, 0)),
    bookings: periodBookings.length,
    guests: periodBookings.reduce((sum, booking) => sum + booking.guestCount, 0),
    outstanding: money(periodBookings.reduce((sum, booking) => sum + booking.balanceOutstanding, 0)),
  };
  const summarize = (location?: BoxOfficeLocation, type?: BoxOfficeBookingType): MoneySummary => {
    const bookings = periodBookings.filter((booking) =>
      (!location || booking.location === location) && (!type || getBoxOfficeBookingType(booking) === type));
    const scopedReceipts = receipts.filter((receipt) =>
      (!location || receipt.location === location) && (!type || receipt.bookingType === type));
    const scopedRefunds = refunds.filter((refund) => {
      const booking = bookingById.get(refund.bookingId) ?? bookingByReference.get(refund.bookingReference);
      return Boolean(booking && (!location || booking.location === location) && (!type || getBoxOfficeBookingType(booking) === type));
    });
    const cashReceived = money(scopedReceipts.reduce((sum, receipt) => sum + receipt.grossCash, 0));
    const refundAmount = money(scopedRefunds.reduce((sum, refund) => sum + refund.refundAmount, 0));
    return {
      bookingValue: money(bookings.reduce((sum, booking) => sum + booking.totalAmount, 0)),
      bookings: bookings.length,
      cashReceived,
      guests: bookings.reduce((sum, booking) => sum + booking.guestCount, 0),
      netReceipts: money(cashReceived - refundAmount),
      refunds: refundAmount,
    };
  };
  const detailGross = money(receipts.reduce((sum, receipt) => sum + receipt.amount + receipt.bookingFee, 0));

  return {
    bookings: periodBookings.sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    bookingTypes: { corporate: summarize(undefined, "corporate"), standard: summarize(undefined, "standard") },
    cash: {
      bookingAppliedReceipts,
      bookingFees,
      grossCashReceived,
      netReceipts: money(grossCashReceived - refundTotal),
      refunds: refundTotal,
    },
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    locations: {
      "cape-town": summarize("cape-town"),
      johannesburg: summarize("johannesburg"),
      total: summarize(),
    },
    paymentClassifications: summarizeGroups(receipts, (receipt) => receipt.classification, (receipt) => receipt.amount),
    paymentMethods: summarizeGroups(receipts, (receipt) => receipt.method, (receipt) => receipt.grossCash),
    receipts: receipts.sort((left, right) => left.date.localeCompare(right.date)),
    reconciliation: {
      difference: money(grossCashReceived - detailGross),
      warning: Math.abs(grossCashReceived - detailGross) >= 0.01,
    },
    refunds,
    requiresReview: receipts.filter((receipt) => receipt.requiresReview),
    revenue: {
      addons: money(periodBookings.reduce((sum, booking) => sum + booking.addonsTotal, 0)),
      bookingFees,
      discounts: money(periodBookings.reduce((sum, booking) => sum + booking.discountAmount, 0)),
      serviceCharge: money(periodBookings.reduce((sum, booking) => sum + booking.serviceFee, 0)),
      ticketSubtotal: money(periodBookings.reduce((sum, booking) => sum + booking.subtotalAmount - booking.addonsTotal, 0)),
    },
    sales,
  };
}

export function getLastWeekend(reference = new Date()) {
  const sastDate = new Date(reference.toLocaleString("en-US", { timeZone: boxOfficeReportTimezone }));
  const day = sastDate.getDay();
  const daysSinceSunday = day === 0 ? 7 : day;
  const sunday = new Date(sastDate);
  sunday.setDate(sastDate.getDate() - daysSinceSunday);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() - 1);
  const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { from: key(saturday), to: key(sunday) };
}
