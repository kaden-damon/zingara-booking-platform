export const analyticsTimezone = "Africa/Johannesburg";

export type AnalyticsVenue = "cape-town" | "johannesburg";
export type AnalyticsSource =
  | "corporate"
  | "imported"
  | "public"
  | "staff";

export type ManagementAnalyticsBooking = {
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
  guestCount: number;
  id: string;
  paymentStatus: string;
  section: string | null;
  showId: string;
  totalAmount: number;
};

export type ManagementAnalyticsCustomer = {
  createdAt: string;
  hasCompleteContact: boolean;
  id: string;
};

export type ManagementAnalyticsPayment = {
  amount: number;
  bookingId: string;
  createdAt: string;
  id: string;
  paymentStatus: string;
  paymentType: string;
  processedAt: string | null;
  providerGrossAmount: number;
  transactionFeeAmount: number;
};

export type ManagementAnalyticsShow = {
  date: string;
  id: string;
  name: string;
  status: string;
  time: string;
  venue: AnalyticsVenue;
};

export type ManagementAnalyticsDataset = {
  asOf: string;
  bookings: ManagementAnalyticsBooking[];
  capacityByVenue: Record<AnalyticsVenue, number>;
  customers: ManagementAnalyticsCustomer[];
  payments: ManagementAnalyticsPayment[];
  shows: ManagementAnalyticsShow[];
};

export type ManagementAnalyticsFilters = {
  bookingCreatedFrom: string;
  bookingCreatedTo: string;
  bookingStatus: string;
  bookingType: "all" | "corporate" | "standard";
  dayOfWeek: number[];
  paymentStatus: string;
  performanceFrom: string;
  performanceTo: string;
  seatingZone: string;
  source: "all" | AnalyticsSource;
  venue: "all" | AnalyticsVenue;
};

export const defaultManagementAnalyticsFilters: ManagementAnalyticsFilters = {
  bookingCreatedFrom: "",
  bookingCreatedTo: "",
  bookingStatus: "all",
  bookingType: "all",
  dayOfWeek: [],
  paymentStatus: "all",
  performanceFrom: "",
  performanceTo: "",
  seatingZone: "all",
  source: "all",
  venue: "all",
};

export const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const activeBookingStatuses = new Set(["confirmed", "pending_payment"]);
const successfulPaymentStatuses = new Set(["fully_paid", "deposit_paid"]);

export function getJohannesburgDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: analyticsTimezone,
    year: "numeric",
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
}

export function getShowWeekday(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function getBookingSource(booking: ManagementAnalyticsBooking): AnalyticsSource {
  if (
    booking.bookingOrigin === "data_import" ||
    booking.bookingOrigin === "legacy_unknown"
  ) {
    return "imported";
  }

  if (
    booking.bookingOrigin === "corporate" ||
    booking.bookingSource === "corporate-direct" ||
    booking.corporateRequestId
  ) {
    return "corporate";
  }

  if (
    booking.bookingOrigin === "customer_public" &&
    booking.bookingSource === "online"
  ) {
    return "public";
  }

  return "staff";
}

function isCorporateBooking(booking: ManagementAnalyticsBooking) {
  return getBookingSource(booking) === "corporate";
}

function inRange(value: string, from: string, to: string) {
  return (!from || value >= from) && (!to || value <= to);
}

function matchesDimensionFilters(
  booking: ManagementAnalyticsBooking,
  show: ManagementAnalyticsShow | undefined,
  filters: ManagementAnalyticsFilters,
) {
  if (!show) return false;
  if (filters.venue !== "all" && show.venue !== filters.venue) return false;
  if (!inRange(show.date, filters.performanceFrom, filters.performanceTo)) {
    return false;
  }
  if (
    filters.dayOfWeek.length > 0 &&
    !filters.dayOfWeek.includes(getShowWeekday(show.date))
  ) {
    return false;
  }
  if (filters.seatingZone !== "all" && booking.section !== filters.seatingZone) {
    return false;
  }
  if (
    filters.bookingType === "corporate" &&
    !isCorporateBooking(booking)
  ) {
    return false;
  }
  if (
    filters.bookingType === "standard" &&
    isCorporateBooking(booking)
  ) {
    return false;
  }
  if (
    filters.bookingStatus !== "all" &&
    booking.bookingStatus !== filters.bookingStatus
  ) {
    return false;
  }
  if (
    filters.paymentStatus !== "all" &&
    booking.paymentStatus !== filters.paymentStatus
  ) {
    return false;
  }
  if (filters.source !== "all" && getBookingSource(booking) !== filters.source) {
    return false;
  }

  return true;
}

function sum<T>(values: T[], getValue: (value: T) => number) {
  return values.reduce((total, value) => total + getValue(value), 0);
}

function average(values: number[]) {
  return values.length > 0 ? sum(values, (value) => value) / values.length : 0;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function bookingSummary(bookings: ManagementAnalyticsBooking[]) {
  return {
    amountPaid: sum(bookings, (booking) => booking.amountPaid),
    bookingValue: sum(bookings, (booking) => booking.totalAmount),
    bookings: bookings.length,
    guests: sum(bookings, (booking) => booking.guestCount),
    outstanding: sum(bookings, (booking) =>
      activeBookingStatuses.has(booking.bookingStatus)
        ? booking.balanceOutstanding
        : 0,
    ),
  };
}

function getActivityBookings(
  dataset: ManagementAnalyticsDataset,
  filters: ManagementAnalyticsFilters,
  showsById: Map<string, ManagementAnalyticsShow>,
) {
  return dataset.bookings.filter((booking) => {
    const source = getBookingSource(booking);

    if (filters.source === "all" && source === "imported") return false;
    if (
      !inRange(
        getJohannesburgDateKey(booking.createdAt),
        filters.bookingCreatedFrom,
        filters.bookingCreatedTo,
      )
    ) {
      return false;
    }

    return matchesDimensionFilters(booking, showsById.get(booking.showId), filters);
  });
}

function getDemandBookings(
  dataset: ManagementAnalyticsDataset,
  filters: ManagementAnalyticsFilters,
  showsById: Map<string, ManagementAnalyticsShow>,
) {
  return dataset.bookings.filter((booking) => {
    if (
      filters.bookingStatus === "all" &&
      !activeBookingStatuses.has(booking.bookingStatus)
    ) {
      return false;
    }

    return matchesDimensionFilters(booking, showsById.get(booking.showId), filters);
  });
}

function occupancyLabel(occupancy: number) {
  if (occupancy >= 90) return "Near Capacity";
  if (occupancy >= 70) return "High Demand";
  if (occupancy >= 35) return "Healthy";
  return "Low Demand";
}

export function calculateManagementAnalytics(
  dataset: ManagementAnalyticsDataset,
  filters: ManagementAnalyticsFilters,
) {
  const showsById = new Map(dataset.shows.map((show) => [show.id, show]));
  const customersById = new Map(
    dataset.customers.map((customer) => [customer.id, customer]),
  );
  const activityBookings = getActivityBookings(dataset, filters, showsById);
  const demandBookings = getDemandBookings(dataset, filters, showsById);
  const activitySummary = bookingSummary(activityBookings);
  const activeActivityBookings = activityBookings.filter((booking) =>
    activeBookingStatuses.has(booking.bookingStatus),
  );
  const activeActivitySummary = bookingSummary(activeActivityBookings);
  const activityCustomerIds = Array.from(
    new Set(activityBookings.map((booking) => booking.customerId)),
  );
  const activityCustomers = activityCustomerIds
    .map((id) => customersById.get(id))
    .filter((customer): customer is ManagementAnalyticsCustomer => Boolean(customer));
  const newCustomers = activityCustomers.filter((customer) =>
    inRange(
      getJohannesburgDateKey(customer.createdAt),
      filters.bookingCreatedFrom,
      filters.bookingCreatedTo,
    ),
  ).length;

  const filteredShows = dataset.shows.filter((show) => {
    if (filters.venue !== "all" && show.venue !== filters.venue) return false;
    if (!inRange(show.date, filters.performanceFrom, filters.performanceTo)) {
      return false;
    }
    return (
      filters.dayOfWeek.length === 0 ||
      filters.dayOfWeek.includes(getShowWeekday(show.date))
    );
  });
  const demandByShowId = new Map<string, ManagementAnalyticsBooking[]>();

  for (const booking of demandBookings) {
    demandByShowId.set(booking.showId, [
      ...(demandByShowId.get(booking.showId) ?? []),
      booking,
    ]);
  }

  const performanceDemand = filteredShows
    .map((show) => {
      const bookings = demandByShowId.get(show.id) ?? [];
      const summary = bookingSummary(bookings);
      const capacity = dataset.capacityByVenue[show.venue] ?? 0;
      const occupancy = capacity > 0 ? (summary.guests / capacity) * 100 : 0;

      return {
        ...summary,
        capacity,
        date: show.date,
        dayOfWeek: weekdayNames[getShowWeekday(show.date)],
        id: show.id,
        occupancy,
        occupancyLabel: occupancyLabel(occupancy),
        showTime: show.time.slice(0, 5),
        status: show.status,
        venue: show.venue,
      };
    })
    .sort((left, right) =>
      `${left.date} ${left.showTime}`.localeCompare(`${right.date} ${right.showTime}`),
    );

  const dayOfWeek = weekdayNames.map((name, index) => {
    const performances = performanceDemand.filter(
      (performance) => getShowWeekday(performance.date) === index,
    );
    const bookings = sum(performances, (performance) => performance.bookings);
    const guests = sum(performances, (performance) => performance.guests);
    const bookingValue = sum(
      performances,
      (performance) => performance.bookingValue,
    );

    return {
      amountPaid: sum(performances, (performance) => performance.amountPaid),
      averageBookingValue: bookings > 0 ? bookingValue / bookings : 0,
      averageGuestsPerPerformance:
        performances.length > 0 ? guests / performances.length : 0,
      averageOccupancy: average(
        performances.map((performance) => performance.occupancy),
      ),
      averagePartySize: bookings > 0 ? guests / bookings : 0,
      bookingValue,
      bookings,
      day: name,
      dayIndex: index,
      guests,
      outstanding: sum(
        performances,
        (performance) => performance.outstanding,
      ),
      performances: performances.length,
    };
  });

  const comparisonGroups = [
    { days: [1, 2, 3, 4], label: "Midweek", definition: "Monday–Thursday" },
    { days: [5, 6, 0], label: "Weekend", definition: "Friday–Sunday" },
  ];
  const midweekVsWeekend = comparisonGroups.map((group) => {
    const rows = dayOfWeek.filter((row) => group.days.includes(row.dayIndex));
    const performances = sum(rows, (row) => row.performances);
    const bookings = sum(rows, (row) => row.bookings);
    const guests = sum(rows, (row) => row.guests);
    const bookingValue = sum(rows, (row) => row.bookingValue);

    return {
      averageBookingValue: bookings > 0 ? bookingValue / bookings : 0,
      averageGuestsPerPerformance: performances > 0 ? guests / performances : 0,
      averageOccupancy:
        performances > 0
          ? sum(rows, (row) => row.averageOccupancy * row.performances) /
            performances
          : 0,
      bookingValue,
      bookings,
      definition: group.definition,
      guests,
      label: group.label,
      performances,
    };
  });

  const monthKeys = new Set(performanceDemand.map((show) => show.date.slice(0, 7)));
  const asOfYear = Number(getJohannesburgDateKey(dataset.asOf).slice(0, 4));
  monthKeys.add(`${asOfYear + 1}-01`);
  monthKeys.add(`${asOfYear + 1}-02`);
  const performanceMonths = Array.from(monthKeys)
    .sort()
    .map((month) => {
      const performances = performanceDemand.filter(
        (performance) => performance.date.startsWith(month),
      );
      const availablePerformances = performances.filter((performance) =>
        ["active", "sold_out"].includes(performance.status),
      );
      const bookings = sum(performances, (performance) => performance.bookings);
      const guests = sum(performances, (performance) => performance.guests);

      return {
        amountPaid: sum(performances, (performance) => performance.amountPaid),
        averageGuestsPerPerformance:
          performances.length > 0 ? guests / performances.length : 0,
        averageOccupancy: average(
          performances.map((performance) => performance.occupancy),
        ),
        bookingValue: sum(
          performances,
          (performance) => performance.bookingValue,
        ),
        bookings,
        guests,
        inventoryState:
          availablePerformances.length > 0
            ? bookings > 0
              ? "Inventory Available"
              : "Inventory Available / Zero Bookings"
            : "No Inventory Available",
        month,
        outstanding: sum(
          performances,
          (performance) => performance.outstanding,
        ),
        performances: performances.length,
        performancesAvailable: availablePerformances.length,
      };
    });

  const leadTimeBookings = demandBookings.filter(
    (booking) => getBookingSource(booking) !== "imported",
  );
  const leadTimes = leadTimeBookings
    .map((booking) => {
      const show = showsById.get(booking.showId);
      if (!show) return null;
      const created = getJohannesburgDateKey(booking.createdAt);
      const days = Math.floor(
        (Date.parse(`${show.date}T12:00:00Z`) -
          Date.parse(`${created}T12:00:00Z`)) /
          86_400_000,
      );
      return Number.isFinite(days) && days >= 0 ? days : null;
    })
    .filter((days): days is number => days !== null);
  const leadTimeBuckets = [
    { label: "0–7 days", min: 0, max: 7 },
    { label: "8–14 days", min: 8, max: 14 },
    { label: "15–30 days", min: 15, max: 30 },
    { label: "31–60 days", min: 31, max: 60 },
    { label: "61+ days", min: 61, max: Number.POSITIVE_INFINITY },
  ].map((bucket) => ({
    bookings: leadTimes.filter(
      (days) => days >= bucket.min && days <= bucket.max,
    ).length,
    label: bucket.label,
  }));

  const zoneNames = [
    "Golden Circle",
    "Middle Ring",
    "Private Booths",
    "Royal Balcony",
  ];
  const demandSummary = bookingSummary(demandBookings);
  const seatingDemand = zoneNames.map((zone) => {
    const bookings = demandBookings.filter((booking) => booking.section === zone);
    const summary = bookingSummary(bookings);

    return {
      ...summary,
      averagePartySize:
        summary.bookings > 0 ? summary.guests / summary.bookings : 0,
      demandShare:
        demandSummary.guests > 0 ? summary.guests / demandSummary.guests : 0,
      zone,
    };
  });

  const sourceAnalysis = (["public", "staff", "corporate", "imported"] as const)
    .map((source) => ({
      ...bookingSummary(
        demandBookings.filter((booking) => getBookingSource(booking) === source),
      ),
      source,
    }));

  const eligiblePaymentBookingIds = new Set(
    dataset.bookings
      .filter((booking) => {
        const source = getBookingSource(booking);
        if (filters.source === "all" && source === "imported") return false;
        return matchesDimensionFilters(
          booking,
          showsById.get(booking.showId),
          filters,
        );
      })
      .map((booking) => booking.id),
  );
  const periodPayments = dataset.payments.filter((payment) => {
    const date = payment.processedAt ?? payment.createdAt;
    return (
      eligiblePaymentBookingIds.has(payment.bookingId) &&
      inRange(
        getJohannesburgDateKey(date),
        filters.bookingCreatedFrom,
        filters.bookingCreatedTo,
      )
    );
  });
  const successfulPayments = periodPayments.filter((payment) =>
    successfulPaymentStatuses.has(payment.paymentStatus),
  );
  const payments = {
    averageSuccessfulPayment:
      successfulPayments.length > 0
        ? sum(successfulPayments, (payment) => payment.amount) /
          successfulPayments.length
        : 0,
    deposits: successfulPayments.filter(
      (payment) => payment.paymentType === "deposit",
    ).length,
    depositValue: sum(
      successfulPayments.filter((payment) => payment.paymentType === "deposit"),
      (payment) => payment.amount,
    ),
    fullPaymentValue: sum(
      successfulPayments.filter(
        (payment) => payment.paymentType === "full_payment",
      ),
      (payment) => payment.amount,
    ),
    fullPayments: successfulPayments.filter(
      (payment) => payment.paymentType === "full_payment",
    ).length,
    pendingCheckouts: periodPayments.filter(
      (payment) => payment.paymentStatus === "pending_payment",
    ).length,
    providerGross: sum(
      successfulPayments,
      (payment) => payment.providerGrossAmount,
    ),
    refunds: periodPayments.filter(
      (payment) => payment.paymentStatus === "refunded",
    ).length,
    successfulPaymentCount: successfulPayments.length,
    successfullyPaid: sum(successfulPayments, (payment) => payment.amount),
    transactionFees: sum(
      successfulPayments,
      (payment) => payment.transactionFeeAmount,
    ),
  };

  const strongestPerformance = [...performanceDemand].sort(
    (left, right) => right.guests - left.guests,
  )[0];
  const highestOccupancy = [...performanceDemand].sort(
    (left, right) => right.occupancy - left.occupancy,
  )[0];
  const strongestDay = [...dayOfWeek].sort(
    (left, right) => right.guests - left.guests,
  )[0];
  const strongestMonth = [...performanceMonths]
    .filter((month) => month.bookings > 0)
    .sort((left, right) => right.guests - left.guests)[0];
  const mostPopularZone = [...seatingDemand].sort(
    (left, right) => right.guests - left.guests,
  )[0];

  return {
    activityBookings,
    core: {
      ...activitySummary,
      activeBookingValue: activeActivitySummary.bookingValue,
      averageBookingValue:
        activitySummary.bookings > 0
          ? activitySummary.bookingValue / activitySummary.bookings
          : 0,
      averagePartySize:
        activitySummary.bookings > 0
          ? activitySummary.guests / activitySummary.bookings
          : 0,
      cancelled: activityBookings.filter(
        (booking) => booking.bookingStatus === "cancelled",
      ).length,
      complimentaryBookings: activityBookings.filter(
        (booking) => booking.paymentStatus === "comp_vip",
      ).length,
      completeContactCustomers: activityCustomers.filter(
        (customer) => customer.hasCompleteContact,
      ).length,
      confirmed: activityBookings.filter(
        (booking) => booking.bookingStatus === "confirmed",
      ).length,
      corporateBookings: activityBookings.filter(isCorporateBooking).length,
      newCustomers,
      pendingPayment: activityBookings.filter(
        (booking) => booking.bookingStatus === "pending_payment",
      ).length,
      returningCustomers: Math.max(activityCustomers.length - newCustomers, 0),
    },
    dayOfWeek,
    demandBookings,
    highlights: {
      averageBookingLeadTime: average(leadTimes),
      highestOccupancy,
      mostBookedDayOfWeek: strongestDay,
      mostPopularZone,
      strongestMonth,
      strongestPerformance,
    },
    leadTime: {
      averageDaysAhead: average(leadTimes),
      buckets: leadTimeBuckets,
      includedBookings: leadTimes.length,
      medianDaysAhead: median(leadTimes),
    },
    midweekVsWeekend,
    payments,
    performanceDemand,
    performanceMonths,
    seatingDemand,
    sourceAnalysis,
  };
}

export function filtersFromSearchParams(searchParams: URLSearchParams) {
  const dayOfWeek = (searchParams.get("dayOfWeek") ?? "")
    .split(",")
    .map(Number)
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  const venue = searchParams.get("venue");
  const bookingType = searchParams.get("bookingType");
  const source = searchParams.get("source");

  return {
    ...defaultManagementAnalyticsFilters,
    bookingCreatedFrom: searchParams.get("bookingCreatedFrom") ?? "",
    bookingCreatedTo: searchParams.get("bookingCreatedTo") ?? "",
    bookingStatus: searchParams.get("bookingStatus") ?? "all",
    bookingType:
      bookingType === "corporate" || bookingType === "standard"
        ? bookingType
        : "all",
    dayOfWeek,
    paymentStatus: searchParams.get("paymentStatus") ?? "all",
    performanceFrom: searchParams.get("performanceFrom") ?? "",
    performanceTo: searchParams.get("performanceTo") ?? "",
    seatingZone: searchParams.get("seatingZone") ?? "all",
    source:
      source === "public" ||
      source === "staff" ||
      source === "corporate" ||
      source === "imported"
        ? source
        : "all",
    venue:
      venue === "cape-town" || venue === "johannesburg" ? venue : "all",
  } satisfies ManagementAnalyticsFilters;
}

export function filtersToSearchParams(filters: ManagementAnalyticsFilters) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(","));
    } else if (value && value !== "all") {
      params.set(key, value);
    }
  }

  return params;
}
