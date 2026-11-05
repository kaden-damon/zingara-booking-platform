import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildShowCalendarOccupancySummaries,
  type ShowCalendarOccupancyBooking,
} from "@/lib/showCalendarOccupancy";
import {
  buildShowCalendarFinancialSummaries,
  type ShowCalendarFinancialBooking,
  type ShowCalendarFinancialPayment,
  type ShowCalendarFinancialRefund,
} from "@/lib/showCalendarFinancials";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import {
  managementForecastActiveBookingStatuses,
  type AnalyticsVenue,
} from "@/lib/managementAnalytics";
import { normalizeShowLocation } from "@/lib/zingaraDemo";

const bookingPageSize = 1000;

type BookingRow = {
  amount_paid: number | string;
  archived_at: string | null;
  balance_outstanding: number | string;
  booking_status: string;
  guest_count: number;
  id: string;
  section: string | null;
  show_id: string;
  zone_entitlements: Array<{
    pax?: number | string;
    zoneId?: string;
  }> | null;
};

type PaymentRow = {
  amount: number | string;
  booking_id: string;
  payment_status: string;
  payment_type: string;
};

type RefundRow = {
  booking_id: string;
  refund_amount: number | string;
  refund_status: string;
};

type ShowRow = {
  date: string;
  id: string;
  time: string;
  venue: string | null;
};

export type ShowCalendarOccupancyDataset = {
  bookingCount: number;
  financialSummaries: ReturnType<typeof buildShowCalendarFinancialSummaries>;
  month: string;
  showCount: number;
  summaries: ReturnType<typeof buildShowCalendarOccupancySummaries>;
};

function nextMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);

  return monthNumber === 12
    ? `${year + 1}-01`
    : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
}

function permittedVenues(venueScope: string[], requestedVenue: string) {
  const normalizedScope = normalizeStaffVenueScope(venueScope);
  const allowed = new Set<AnalyticsVenue>(
    normalizedScope.includes("all")
      ? ["cape-town", "johannesburg"]
      : normalizedScope.filter(
          (value): value is AnalyticsVenue =>
            value === "cape-town" || value === "johannesburg",
        ),
  );

  if (requestedVenue === "all") return allowed;

  const requested = normalizeShowLocation(requestedVenue);
  return new Set<AnalyticsVenue>(
    requested && allowed.has(requested) ? [requested] : [],
  );
}

function number(value: number | string | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(Math.trunc(parsed), 0) : 0;
}

function money(value: number | string | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

function toBooking(row: BookingRow): ShowCalendarOccupancyBooking {
  return {
    archivedAt: row.archived_at,
    bookingStatus: row.booking_status,
    guestCount: number(row.guest_count),
    section: row.section,
    showId: row.show_id,
    zoneEntitlements: Array.isArray(row.zone_entitlements)
      ? row.zone_entitlements.map((entitlement) => ({
          pax: number(entitlement.pax),
          zoneId: entitlement.zoneId ?? "",
        }))
      : null,
  };
}

function toFinancialBooking(row: BookingRow): ShowCalendarFinancialBooking {
  return {
    amountPaid: money(row.amount_paid),
    archivedAt: row.archived_at,
    balanceOutstanding: money(row.balance_outstanding),
    bookingStatus: row.booking_status,
    id: row.id,
    showId: row.show_id,
  };
}

async function loadBookingRows(
  serviceClient: SupabaseClient,
  showIds: string[],
) {
  const rows: BookingRow[] = [];

  for (let from = 0; ; from += bookingPageSize) {
    const { data, error } = await serviceClient
      .from("bookings")
      .select(
        "id,show_id,guest_count,booking_status,section,zone_entitlements,archived_at,amount_paid,balance_outstanding",
      )
      .in("show_id", showIds)
      .is("archived_at", null)
      .order("id", { ascending: true })
      .range(from, from + bookingPageSize - 1);

    if (error) throw error;

    const page = (data ?? []) as BookingRow[];
    rows.push(...page);
    if (page.length < bookingPageSize) break;
  }

  return rows;
}

async function loadPaymentRows(
  serviceClient: SupabaseClient,
  showIds: string[],
) {
  const rows: PaymentRow[] = [];

  for (let from = 0; ; from += bookingPageSize) {
    const { data, error } = await serviceClient
      .from("payments")
      .select(
        "booking_id,payment_type,payment_status,amount,bookings!inner(show_id,archived_at)",
      )
      .in("bookings.show_id", showIds)
      .is("bookings.archived_at", null)
      .eq("payment_type", "deposit")
      .eq("payment_status", "deposit_paid")
      .order("id", { ascending: true })
      .range(from, from + bookingPageSize - 1);

    if (error) throw error;

    const page = (data ?? []) as unknown as PaymentRow[];
    rows.push(...page);
    if (page.length < bookingPageSize) break;
  }

  return rows;
}

async function loadRefundRows(
  serviceClient: SupabaseClient,
  showIds: string[],
) {
  const rows: RefundRow[] = [];

  for (let from = 0; ; from += bookingPageSize) {
    const { data, error } = await serviceClient
      .from("payment_refunds")
      .select(
        "booking_id,refund_amount,refund_status,bookings!inner(show_id,archived_at)",
      )
      .in("bookings.show_id", showIds)
      .is("bookings.archived_at", null)
      .eq("refund_status", "accepted")
      .order("id", { ascending: true })
      .range(from, from + bookingPageSize - 1);

    if (error) throw error;

    const page = (data ?? []) as unknown as RefundRow[];
    rows.push(...page);
    if (page.length < bookingPageSize) break;
  }

  return rows;
}

export async function loadShowCalendarOccupancy(
  serviceClient: SupabaseClient,
  venueScope: string[],
  input: { month: string; venue: string },
): Promise<ShowCalendarOccupancyDataset> {
  const venues = permittedVenues(venueScope, input.venue);

  if (venues.size === 0) {
    return {
      bookingCount: 0,
      financialSummaries: [],
      month: input.month,
      showCount: 0,
      summaries: [],
    };
  }

  const { data: rawShowRows, error: showError } = await serviceClient
    .from("shows")
    .select("id,date,time,venue")
    .gte("date", `${input.month}-01`)
    .lt("date", `${nextMonth(input.month)}-01`)
    .order("date", { ascending: true })
    .order("time", { ascending: true });

  if (showError) throw showError;

  const showRows = ((rawShowRows ?? []) as ShowRow[]).filter((show) => {
    const venue = normalizeShowLocation(show.venue);
    return Boolean(venue && venues.has(venue));
  });
  const showIds = showRows.map((show) => show.id);
  const [bookingRows, paymentRows, refundRows] = showIds.length
    ? await Promise.all([
        loadBookingRows(serviceClient, showIds),
        loadPaymentRows(serviceClient, showIds),
        loadRefundRows(serviceClient, showIds),
      ])
    : [[], [], []];
  const financialBookings = bookingRows.map(toFinancialBooking);

  return {
    bookingCount: financialBookings.filter((booking) =>
      managementForecastActiveBookingStatuses.has(booking.bookingStatus),
    ).length,
    financialSummaries: buildShowCalendarFinancialSummaries(
      showIds,
      financialBookings,
      (paymentRows as PaymentRow[]).map(
        (payment): ShowCalendarFinancialPayment => ({
          amount: money(payment.amount),
          bookingId: payment.booking_id,
          paymentStatus: payment.payment_status,
          paymentType: payment.payment_type,
        }),
      ),
      (refundRows as RefundRow[]).map(
        (refund): ShowCalendarFinancialRefund => ({
          bookingId: refund.booking_id,
          refundAmount: money(refund.refund_amount),
          refundStatus: refund.refund_status,
        }),
      ),
    ),
    month: input.month,
    showCount: showIds.length,
    summaries: buildShowCalendarOccupancySummaries(
      showIds,
      bookingRows.map(toBooking),
    ),
  };
}
