import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateDailyAnalytics,
  getDailyAnalyticsWindow,
  restoreDailyAnalyticsBookingAtCutoff,
  type DailyAnalyticsBookingAuditEvidence,
  type DailyAnalyticsBookingCandidate,
  type DailyAnalyticsInput,
  type DailyAnalyticsLifecycleEvidence,
  type DailyAnalyticsPaymentEvidence,
  type DailyAnalyticsShow,
} from "../dailyAnalytics.ts";
import {
  normalizeStaffLocation,
  normalizeStaffVenueScope,
} from "../staffLocations.ts";

const pageSize = 1000;
const inFilterChunkSize = 180;

type BookingRow = {
  archived_at: string | null;
  booking_origin: string | null;
  booking_reference: string;
  booking_source: string;
  created_at: string;
  customer_id: string;
  guest_count: number;
  id: string;
  section: string | null;
  show_id: string;
  total_amount: number | string | null;
};

type CustomerRow = {
  created_at: string;
  email: string | null;
  first_name: string | null;
  id: string;
  mobile: string | null;
  surname: string | null;
};

type PaymentRow = {
  amount: number | string | null;
  booking_id: string;
  created_at: string;
  id: string;
  method: string | null;
  payment_status: string;
  payment_type: string;
  processed_at: string | null;
  provider_gross_amount: number | string | null;
  transaction_fee_amount: number | string | null;
};

type ReceivedPaymentRow = PaymentRow & {
  bookings:
    | { booking_reference: string; created_at: string; show_id: string }
    | Array<{ booking_reference: string; created_at: string; show_id: string }>
    | null;
};

type ShowRow = {
  date: string;
  id: string;
  name: string;
  time: string;
  venue: string;
};

type LifecycleRow = {
  booking_id: string;
  created_at: string;
  reason: string | null;
  to_status: string;
};

type AuditRow = {
  before_values: Record<string, unknown> | null;
  changed_fields: string[] | null;
  created_at: string;
  entity_id: string | null;
};

type WalletRegistrationRow = {
  id: string;
  ticket_id: string;
};

function amount(value: number | string | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nonBlank(value: string | null) {
  return Boolean(value?.trim());
}

function isSyntheticCustomer(customer: CustomerRow) {
  const name = `${customer.first_name ?? ""} ${customer.surname ?? ""}`
    .trim()
    .toLowerCase();
  const email = customer.email?.trim().toLowerCase() ?? "";
  return (
    /^(test|demo|qa)(\s+(test|demo|qa))?$/.test(name) ||
    /(^|[.+_-])(test|demo|qa)([.+_@-]|$)/.test(email) ||
    email.endsWith("@example.com")
  );
}

async function loadAllRows<Row>(
  loadPage: (from: number, to: number) => PromiseLike<{
    data: unknown[] | null;
    error: { message?: string } | null;
  }>,
) {
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function loadInChunks<Row>(
  values: string[],
  loadChunk: (values: string[]) => PromiseLike<{
    data: unknown[] | null;
    error: { message?: string } | null;
  }>,
) {
  const rows: Row[] = [];
  for (let index = 0; index < values.length; index += inFilterChunkSize) {
    const { data, error } = await loadChunk(
      values.slice(index, index + inFilterChunkSize),
    );
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
  }
  return rows;
}

function mapPayment(
  row: PaymentRow,
  booking: { booking_reference: string; created_at: string },
): DailyAnalyticsPaymentEvidence {
  return {
    amount: amount(row.amount),
    bookingCreatedAt: booking.created_at,
    bookingId: row.booking_id,
    bookingReference: booking.booking_reference,
    createdAt: row.created_at,
    id: row.id,
    method: row.method,
    paymentStatus: row.payment_status,
    paymentType: row.payment_type,
    processedAt: row.processed_at,
    providerGrossAmount: amount(row.provider_gross_amount),
    transactionFeeAmount: amount(row.transaction_fee_amount),
  };
}

function firstJoinedBooking(row: ReceivedPaymentRow) {
  return Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
}

export async function loadDailyAnalyticsReport(
  serviceClient: SupabaseClient,
  reportDate: string,
  venueScope: string[],
) {
  const window = getDailyAnalyticsWindow(reportDate);
  const bookingRows = await loadAllRows<BookingRow>((from, to) =>
    serviceClient
      .from("bookings")
      .select(
        "id,customer_id,show_id,booking_reference,booking_source,booking_origin,guest_count,section,total_amount,created_at,archived_at",
      )
      .eq("booking_origin", "customer_public")
      .eq("booking_source", "online")
      .gte("created_at", window.startInclusive)
      .lt("created_at", window.endExclusive)
      .order("created_at")
      .range(from, to),
  );
  const bookingIds = bookingRows.map((booking) => booking.id);
  const customerIds = Array.from(
    new Set(bookingRows.map((booking) => booking.customer_id)),
  );

  const [customerRows, lifecycleRows, auditRows, paymentRows] =
    await Promise.all([
      loadInChunks<CustomerRow>(customerIds, (ids) =>
        serviceClient
          .from("customers")
          .select("id,first_name,surname,email,mobile,created_at")
          .in("id", ids),
      ),
      loadInChunks<LifecycleRow>(bookingIds, (ids) =>
        serviceClient
          .from("booking_lifecycle_events")
          .select("booking_id,to_status,reason,created_at")
          .in("booking_id", ids)
          .lt("created_at", window.endExclusive)
          .order("created_at"),
      ),
      loadInChunks<AuditRow>(bookingIds, (ids) =>
        serviceClient
          .from("audit_events")
          .select("entity_id,before_values,changed_fields,created_at")
          .eq("entity_type", "booking")
          .in("entity_id", ids)
          .gte("created_at", window.endExclusive)
          .order("created_at", { ascending: false }),
      ),
      loadInChunks<PaymentRow>(bookingIds, (ids) =>
        serviceClient
          .from("payments")
          .select(
            "id,booking_id,payment_type,payment_status,amount,method,processed_at,created_at,provider_gross_amount,transaction_fee_amount",
          )
          .in("booking_id", ids)
          .lt("created_at", window.endExclusive)
          .order("created_at"),
      ),
    ]);

  const customersById = new Map(customerRows.map((row) => [row.id, row]));
  const bookingReferencesById = new Map(
    bookingRows.map((row) => [
      row.id,
      { booking_reference: row.booking_reference, created_at: row.created_at },
    ]),
  );
  const audits: DailyAnalyticsBookingAuditEvidence[] = auditRows
    .filter((row): row is AuditRow & { entity_id: string } =>
      bookingReferencesById.has(row.entity_id ?? ""),
    )
    .map((row) => ({
      beforeValues: row.before_values ?? {},
      bookingId: row.entity_id,
      changedFields: row.changed_fields ?? [],
      createdAt: row.created_at,
    }));
  const historicalShowIds = auditRows.flatMap((row) => {
    const value = row.before_values?.show_id;
    return typeof value === "string" && value ? [value] : [];
  });
  const showIds = Array.from(
    new Set([...bookingRows.map((booking) => booking.show_id), ...historicalShowIds]),
  );
  const showRows = await loadInChunks<ShowRow>(showIds, (ids) =>
    serviceClient
      .from("shows")
      .select("id,name,date,time,venue")
      .in("id", ids),
  );
  const normalizedScope = normalizeStaffVenueScope(venueScope);
  const permittedVenues = new Set(
    normalizedScope.includes("all")
      ? ["cape-town", "johannesburg"]
      : normalizedScope,
  );
  const hasAllVenueAccess =
    normalizedScope.includes("all") || permittedVenues.size === 2;
  const shows: DailyAnalyticsShow[] = showRows.flatMap((row) => {
      const venue = normalizeStaffLocation(row.venue);
      return venue && permittedVenues.has(venue)
        ? [{ date: row.date, id: row.id, name: row.name, time: row.time, venue }]
        : [];
    });
  const permittedShowIds = new Set(shows.map((show) => show.id));
  const auditsByBooking = new Map<string, DailyAnalyticsBookingAuditEvidence[]>();
  for (const audit of audits) {
    const rows = auditsByBooking.get(audit.bookingId) ?? [];
    rows.push(audit);
    auditsByBooking.set(audit.bookingId, rows);
  }
  const customerBookings: DailyAnalyticsBookingCandidate[] = bookingRows
    .filter((booking) =>
      permittedShowIds.has(
        restoreDailyAnalyticsBookingAtCutoff(
          {
            archivedAt: booking.archived_at,
            bookingOrigin: booking.booking_origin,
            bookingReference: booking.booking_reference,
            bookingSource: booking.booking_source,
            createdAt: booking.created_at,
            customerCreatedAt: "",
            customerHasCompleteContact: false,
            customerId: booking.customer_id,
            customerIsSynthetic: false,
            guestCount: booking.guest_count,
            id: booking.id,
            section: booking.section,
            showId: booking.show_id,
            totalAmount: amount(booking.total_amount),
          },
          auditsByBooking.get(booking.id) ?? [],
          window.endExclusive,
        ).showId,
      ),
    )
    .map((booking) => {
      const customer = customersById.get(booking.customer_id);
      if (!customer) {
        throw new Error(
          `Customer evidence is missing for ${booking.booking_reference}.`,
        );
      }
      return {
        archivedAt: booking.archived_at,
        bookingOrigin: booking.booking_origin,
        bookingReference: booking.booking_reference,
        bookingSource: booking.booking_source,
        createdAt: booking.created_at,
        customerCreatedAt: customer.created_at,
        customerHasCompleteContact:
          nonBlank(customer.first_name) &&
          nonBlank(customer.surname) &&
          nonBlank(customer.email) &&
          nonBlank(customer.mobile),
        customerId: customer.id,
        customerIsSynthetic: isSyntheticCustomer(customer),
        guestCount: booking.guest_count,
        id: booking.id,
        section: booking.section,
        showId: booking.show_id,
        totalAmount: amount(booking.total_amount),
      };
    });
  const permittedBookingIds = new Set(
    customerBookings.map((booking) => booking.id),
  );
  const payments = paymentRows
    .filter((payment) => permittedBookingIds.has(payment.booking_id))
    .map((payment) => {
      const booking = bookingReferencesById.get(payment.booking_id);
      if (!booking) throw new Error("Payment booking evidence is incomplete.");
      return mapPayment(payment, booking);
    });
  const lifecycleEvents: DailyAnalyticsLifecycleEvidence[] = lifecycleRows
    .filter((row) => permittedBookingIds.has(row.booking_id))
    .map((row) => ({
      bookingId: row.booking_id,
      createdAt: row.created_at,
      reason: row.reason,
      toStatus: row.to_status,
    }));

  const { data: receivedData, error: receivedError } = await serviceClient
    .from("payments")
    .select(
      "id,booking_id,payment_type,payment_status,amount,method,processed_at,created_at,provider_gross_amount,transaction_fee_amount,bookings!inner(booking_reference,created_at,show_id)",
    )
    .in("payment_status", ["deposit_paid", "fully_paid"])
    .gte("processed_at", window.startInclusive)
    .lt("processed_at", window.endExclusive)
    .order("processed_at");
  if (receivedError) throw receivedError;
  const receivedPayments = ((receivedData ?? []) as ReceivedPaymentRow[])
    .map((row) => {
      const booking = firstJoinedBooking(row);
      return booking && permittedShowIds.has(booking.show_id)
        ? mapPayment(row, booking)
        : null;
    })
    .filter((row): row is DailyAnalyticsPaymentEvidence => Boolean(row));

  const preliminaryInput: DailyAnalyticsInput = {
    audits,
    bookings: customerBookings,
    communications: 0,
    excludedOtherActivity: 0,
    lifecycleEvents,
    payments,
    receivedPayments,
    reportDate,
    shows,
    tickets: 0,
    walletRegistrations: 0,
  };
  const preliminary = calculateDailyAnalytics(preliminaryInput);
  const cohortReferences = new Set(
    preliminary.bookingRows.map((booking) => booking.bookingReference),
  );
  const cohortIds = customerBookings
    .filter((booking) => cohortReferences.has(booking.bookingReference))
    .map((booking) => booking.id);
  const [ticketRows, communicationRows] = await Promise.all([
    loadInChunks<{ id: string; booking_id: string }>(cohortIds, (ids) =>
      serviceClient
        .from("tickets")
        .select("id,booking_id")
        .in("booking_id", ids)
        .lt("issued_at", window.endExclusive),
    ),
    loadInChunks<{ id: string }>(cohortIds, (ids) =>
      serviceClient
        .from("communications")
        .select("id")
        .in("booking_id", ids)
        .lt("created_at", window.endExclusive),
    ),
  ]);
  const { data: walletData, error: walletError } = await serviceClient
    .from("apple_wallet_registrations")
    .select("id,ticket_id")
    .gte("created_at", window.startInclusive)
    .lt("created_at", window.endExclusive);
  if (walletError) throw walletError;
  const walletRows = (walletData ?? []) as WalletRegistrationRow[];
  let walletRegistrations = walletRows.length;
  if (!hasAllVenueAccess && walletRows.length) {
    const walletTicketRows = await loadInChunks<{
      booking_id: string;
      id: string;
    }>(
      Array.from(new Set(walletRows.map((row) => row.ticket_id))),
      (ids) =>
        serviceClient.from("tickets").select("id,booking_id").in("id", ids),
    );
    const walletBookingRows = await loadInChunks<{
      id: string;
      show_id: string;
    }>(
      Array.from(new Set(walletTicketRows.map((row) => row.booking_id))),
      (ids) =>
        serviceClient.from("bookings").select("id,show_id").in("id", ids),
    );
    const bookingShowById = new Map(
      walletBookingRows.map((row) => [row.id, row.show_id]),
    );
    const walletShowRows = await loadInChunks<{
      id: string;
      venue: string;
    }>(
      Array.from(new Set(walletBookingRows.map((row) => row.show_id))),
      (ids) => serviceClient.from("shows").select("id,venue").in("id", ids),
    );
    const permittedWalletShowIds = new Set(
      walletShowRows.flatMap((row) => {
        const venue = normalizeStaffLocation(row.venue);
        return venue && permittedVenues.has(venue) ? [row.id] : [];
      }),
    );
    const ticketBookingById = new Map(
      walletTicketRows.map((row) => [row.id, row.booking_id]),
    );
    walletRegistrations = walletRows.filter((row) => {
      const bookingId = ticketBookingById.get(row.ticket_id);
      return bookingId
        ? permittedWalletShowIds.has(bookingShowById.get(bookingId) ?? "")
        : false;
    }).length;
  }
  const { count: allActivityCount, error: activityCountError } =
    await serviceClient
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("show_id", Array.from(permittedShowIds))
      .gte("created_at", window.startInclusive)
      .lt("created_at", window.endExclusive);
  if (activityCountError) throw activityCountError;

  return calculateDailyAnalytics({
    ...preliminaryInput,
    communications: communicationRows.length,
    excludedOtherActivity: Math.max(
      (allActivityCount ?? 0) - bookingRows.length,
      0,
    ),
    tickets: ticketRows.length,
    walletRegistrations,
  });
}
