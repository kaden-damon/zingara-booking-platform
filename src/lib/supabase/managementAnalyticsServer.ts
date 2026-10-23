import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnalyticsVenue,
  ManagementAnalyticsBooking,
  ManagementAnalyticsCustomer,
  ManagementAnalyticsDataset,
  ManagementAnalyticsPayment,
  ManagementAnalyticsShow,
} from "@/lib/managementAnalytics";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import {
  defaultVenueSettings,
  normalizeShowLocation,
  normalizeVenueSettings,
  seatingZones,
} from "@/lib/zingaraDemo";

const pageSize = 1000;
const pageConcurrency = 8;

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

async function loadAllRowsBounded<Row>(
  loadPage: (
    from: number,
    to: number,
    count: "exact" | undefined,
  ) => PromiseLike<{
    count: number | null;
    data: unknown[] | null;
    error: { message?: string } | null;
  }>,
) {
  const first = await loadPage(0, pageSize - 1, "exact");
  if (first.error) throw first.error;

  const rows = [...((first.data ?? []) as Row[])];
  const pageCount = Math.ceil((first.count ?? rows.length) / pageSize);

  for (let page = 1; page < pageCount; page += pageConcurrency) {
    const batch = await Promise.all(
      Array.from(
        { length: Math.min(pageConcurrency, pageCount - page) },
        (_, offset) => {
          const currentPage = page + offset;
          return loadPage(
            currentPage * pageSize,
            (currentPage + 1) * pageSize - 1,
            undefined,
          );
        },
      ),
    );

    for (const result of batch) {
      if (result.error) throw result.error;
      rows.push(...((result.data ?? []) as Row[]));
    }
  }

  return rows;
}

type BookingRow = {
  amount_paid: number | string | null;
  archived_at: string | null;
  balance_outstanding: number | string | null;
  booking_origin: string | null;
  booking_reference: string;
  booking_source: string;
  booking_status: string;
  corporate_request_id: string | null;
  created_at: string;
  customer_id: string;
  guest_count: number;
  id: string;
  payment_status: string;
  section: string | null;
  show_id: string;
  total_amount: number | string | null;
  zone_entitlements: Array<{
    pax?: number | string;
    zoneId?: string;
  }> | null;
  customers: CustomerRow | CustomerRow[] | null;
  payments: PaymentRow[] | null;
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
  payment_status: string;
  payment_type: string;
  processed_at: string | null;
  provider_gross_amount: number | string | null;
  transaction_fee_amount: number | string | null;
};

type ShowRow = {
  date: string;
  id: string;
  name: string;
  status: string;
  time: string;
  venue: string;
};

function amount(value: number | string | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasValue(value: string | null) {
  return Boolean(value?.trim());
}

export async function loadManagementAnalyticsDataset(
  serviceClient: SupabaseClient,
  venueScope: string[],
): Promise<ManagementAnalyticsDataset> {
  const [bookingRows, showRows, venueSettingsResult] = await Promise.all([
      loadAllRowsBounded<BookingRow>((from, to, count) =>
        serviceClient
          .from("bookings")
          .select(
            "id,customer_id,show_id,corporate_request_id,booking_reference,booking_source,booking_origin,guest_count,booking_status,payment_status,section,zone_entitlements,total_amount,amount_paid,balance_outstanding,created_at,archived_at,customers(created_at,email,first_name,id,mobile,surname),payments(amount,booking_id,created_at,id,payment_status,payment_type,processed_at,provider_gross_amount,transaction_fee_amount)",
            count ? { count } : undefined,
          )
          .order("id")
          .range(from, to),
      ),
      loadAllRows<ShowRow>((from, to) =>
        serviceClient
          .from("shows")
          .select("id,name,date,time,venue,status")
          .order("id")
          .range(from, to),
      ),
      serviceClient
        .from("venue_settings")
        .select("settings")
        .eq("venue_key", defaultVenueSettings.venueId)
        .maybeSingle(),
    ]);

  if (venueSettingsResult.error) throw venueSettingsResult.error;

  const normalizedScope = normalizeStaffVenueScope(venueScope);
  const canSeeAll = normalizedScope.includes("all");
  const permittedVenues = new Set<AnalyticsVenue>(
    canSeeAll
      ? ["cape-town", "johannesburg"]
      : normalizedScope.filter(
          (value): value is AnalyticsVenue =>
            value === "cape-town" || value === "johannesburg",
        ),
  );
  const shows = showRows
    .map((show): ManagementAnalyticsShow | null => {
      const venue = normalizeShowLocation(show.venue);
      return venue && permittedVenues.has(venue)
        ? {
            date: show.date,
            id: show.id,
            name: show.name,
            status: show.status,
            time: show.time,
            venue,
          }
        : null;
    })
    .filter((show): show is ManagementAnalyticsShow => Boolean(show));
  const showIds = new Set(shows.map((show) => show.id));
  const bookings = bookingRows
    .filter((booking) => showIds.has(booking.show_id))
    .map(
      (booking): ManagementAnalyticsBooking => ({
        amountPaid: amount(booking.amount_paid),
        archivedAt: booking.archived_at,
        balanceOutstanding: amount(booking.balance_outstanding),
        bookingOrigin: booking.booking_origin,
        bookingReference: booking.booking_reference,
        bookingSource: booking.booking_source,
        bookingStatus: booking.booking_status,
        corporateRequestId: booking.corporate_request_id,
        createdAt: booking.created_at,
        customerId: booking.customer_id,
        guestCount: booking.guest_count,
        id: booking.id,
        paymentStatus: booking.payment_status,
        section: booking.section,
        showId: booking.show_id,
        totalAmount: amount(booking.total_amount),
        zoneEntitlements: booking.zone_entitlements?.map((entitlement) => ({
          pax: amount(entitlement.pax ?? null),
          zoneId: entitlement.zoneId ?? "",
        })) ?? null,
      }),
    );
  const bookingIds = new Set(bookings.map((booking) => booking.id));
  const customerIds = new Set(bookings.map((booking) => booking.customerId));
  const customerRows = new Map<string, CustomerRow>();
  const paymentRows = new Map<string, PaymentRow>();

  for (const booking of bookingRows) {
    const relatedCustomers = Array.isArray(booking.customers)
      ? booking.customers
      : booking.customers
        ? [booking.customers]
        : [];
    for (const customer of relatedCustomers) {
      customerRows.set(customer.id, customer);
    }
    for (const payment of booking.payments ?? []) {
      paymentRows.set(payment.id, payment);
    }
  }

  const customers = Array.from(customerRows.values())
    .filter((customer) => customerIds.has(customer.id))
    .map(
      (customer): ManagementAnalyticsCustomer => ({
        createdAt: customer.created_at,
        hasCompleteContact:
          hasValue(customer.first_name) &&
          hasValue(customer.surname) &&
          hasValue(customer.email) &&
          hasValue(customer.mobile),
        id: customer.id,
      }),
    );
  const payments = Array.from(paymentRows.values())
    .filter((payment) => bookingIds.has(payment.booking_id))
    .map(
      (payment): ManagementAnalyticsPayment => ({
        amount: amount(payment.amount),
        bookingId: payment.booking_id,
        createdAt: payment.created_at,
        id: payment.id,
        paymentStatus: payment.payment_status,
        paymentType: payment.payment_type,
        processedAt: payment.processed_at,
        providerGrossAmount: amount(payment.provider_gross_amount),
        transactionFeeAmount: amount(payment.transaction_fee_amount),
      }),
    );
  const venueSettings = normalizeVenueSettings(
    (venueSettingsResult.data as { settings?: unknown } | null)?.settings as never,
  );
  const configuredCapacity = seatingZones.reduce(
    (total, zone) =>
      total + (venueSettings.zonePricing[zone.id]?.maxSeats ?? 0),
    0,
  );

  return {
    asOf: new Date().toISOString(),
    bookings,
    capacityByVenue: {
      "cape-town": configuredCapacity,
      johannesburg: configuredCapacity,
    },
    customers,
    payments,
    shows,
  };
}
