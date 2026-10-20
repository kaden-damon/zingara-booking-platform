import { buildTicketSalesWorkbook, ticketSalesFilename } from "@/lib/exports/ticketSalesWorkbook";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import {
  buildTicketSalesReport,
  getTicketSalesDateRange,
  type TicketSalesBooking,
  type TicketSalesBookingType,
  type TicketSalesBuyout,
  type TicketSalesPaymentFilter,
  type TicketSalesVenue,
} from "@/lib/ticketSalesReport";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { normalizeShowLocation } from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const batchSize = 500;
const maximumPageSize = 100;

async function loadAllRows<Row>(
  loadPage: (from: number, to: number) => PromiseLike<{
    data: unknown[] | null;
    error: { message?: string } | null;
  }>,
) {
  const rows: Row[] = [];
  for (let from = 0; ; from += batchSize) {
    const { data, error } = await loadPage(from, from + batchSize - 1);
    if (error) throw error;
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < batchSize) return rows;
  }
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!getRolePermissions(roleOf(auth.staffProfile)).includes("analytics:read")) {
    return Response.json({ error: "Analytics access is required." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const requestedVenue = params.get("venue") ?? "all";
  const bookingType = params.get("bookingType") ?? "all";
  const paymentStatus = params.get("paymentStatus") ?? "all";
  const performanceId = params.get("performanceId") ?? "";
  const format = params.get("format") === "xlsx" ? "xlsx" : "json";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(maximumPageSize, Math.max(1, Number.parseInt(params.get("pageSize") ?? "25", 10) || 25));
  let range: ReturnType<typeof getTicketSalesDateRange>;
  try {
    range = getTicketSalesDateRange(from, to);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Select a valid reporting range." }, { status: 400 });
  }
  if (!["all", "cape-town", "johannesburg"].includes(requestedVenue) ||
      !["all", "standard", "corporate", "buyout"].includes(bookingType) ||
      !["all", "paid", "partially-paid", "unpaid"].includes(paymentStatus)) {
    return Response.json({ error: "Select valid Ticket Sales filters." }, { status: 400 });
  }

  const scope = normalizeStaffVenueScope(auth.staffProfile.venue_scope);
  const canSeeAll = scope.includes("all");
  const permitted = new Set<TicketSalesVenue>(
    canSeeAll
      ? ["cape-town", "johannesburg"]
      : scope.filter((value): value is TicketSalesVenue => value === "cape-town" || value === "johannesburg"),
  );
  if (requestedVenue !== "all" && !permitted.has(requestedVenue as TicketSalesVenue)) {
    return Response.json({ error: "This venue is outside your staff scope." }, { status: 403 });
  }
  const effectiveVenue = requestedVenue === "all" && !canSeeAll && permitted.size === 1
    ? [...permitted][0]
    : requestedVenue;
  if (effectiveVenue === "all" && !canSeeAll) {
    return Response.json({ error: "A permitted venue is required." }, { status: 403 });
  }

  try {
    const client = auth.serviceClient;
    const [rawBookings, rawShows] = await Promise.all([
      loadAllRows<Record<string, unknown>>((fromRow, toRow) => client
        .from("bookings")
        .select("id,booking_reference,customer_id,show_id,booking_source,booking_origin,corporate_request_id,company_name,guest_count,booking_status,payment_status,zone_entitlements,total_amount,amount_paid,balance_outstanding,created_at,archived_at")
        .gte("created_at", range.start)
        .lt("created_at", range.endExclusive)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(fromRow, toRow)),
      loadAllRows<Record<string, unknown>>((fromRow, toRow) => client
        .from("shows")
        .select("id,name,date,time,venue")
        .order("date", { ascending: false })
        .range(fromRow, toRow)),
    ]);
    const showById = new Map<string, Record<string, unknown> & { venue: TicketSalesVenue }>();
    for (const show of rawShows) {
      const venue = normalizeShowLocation(String(show.venue ?? ""));
      if (venue && permitted.has(venue)) {
        showById.set(String(show.id), { ...show, venue });
      }
    }
    const scopedRows = rawBookings.filter((row) => showById.has(String(row.show_id)));
    const bookingIds = scopedRows.map((row) => String(row.id));
    const customerIds = unique(scopedRows.map((row) => String(row.customer_id ?? "")));
    const rawCustomers: Record<string, unknown>[] = [];
    const rawBuyouts: Record<string, unknown>[] = [];
    for (let index = 0; index < Math.max(customerIds.length, bookingIds.length); index += 100) {
      const customerBatch = customerIds.slice(index, index + 100);
      const bookingBatch = bookingIds.slice(index, index + 100);
      if (customerBatch.length) {
        const { data, error } = await client.from("customers").select("id,first_name,surname").in("id", customerBatch);
        if (error) throw error;
        rawCustomers.push(...((data ?? []) as Record<string, unknown>[]));
      }
      if (bookingBatch.length) {
        const { data, error } = await client.from("corporate_buyouts").select("booking_id,state,ticket_entitlement_count").in("booking_id", bookingBatch);
        if (error) throw error;
        rawBuyouts.push(...((data ?? []) as Record<string, unknown>[]));
      }
    }
    const customerById = new Map(rawCustomers.map((row) => [String(row.id), row]));
    const bookings = scopedRows.map((row): TicketSalesBooking => {
      const customer = customerById.get(String(row.customer_id));
      const show = showById.get(String(row.show_id))!;
      return {
        amountPaid: number(row.amount_paid),
        archivedAt: row.archived_at ? String(row.archived_at) : null,
        balanceOutstanding: number(row.balance_outstanding),
        bookingOrigin: row.booking_origin ? String(row.booking_origin) : null,
        bookingReference: String(row.booking_reference),
        bookingSource: String(row.booking_source ?? ""),
        bookingStatus: String(row.booking_status ?? ""),
        companyName: row.company_name ? String(row.company_name) : null,
        corporateRequestId: row.corporate_request_id ? String(row.corporate_request_id) : null,
        createdAt: String(row.created_at),
        customerName: [customer?.first_name, customer?.surname].filter(Boolean).join(" ").trim() || "Not recorded",
        guestCount: number(row.guest_count),
        id: String(row.id),
        paymentStatus: String(row.payment_status ?? ""),
        showDate: String(show.date),
        showId: String(row.show_id),
        showName: String(show.name ?? "Performance"),
        showTime: String(show.time ?? ""),
        totalAmount: number(row.total_amount),
        venue: show.venue,
        zoneEntitlements: row.zone_entitlements,
      };
    });
    const buyouts = rawBuyouts.map((row): TicketSalesBuyout => ({
      bookingId: String(row.booking_id),
      state: String(row.state),
      ticketEntitlementCount: number(row.ticket_entitlement_count),
    }));
    const report = buildTicketSalesReport({
      bookings,
      buyouts,
      filters: {
        bookingType: bookingType as "all" | TicketSalesBookingType,
        from,
        paymentStatus: paymentStatus as TicketSalesPaymentFilter,
        performanceId,
        to,
        venue: effectiveVenue as "all" | TicketSalesVenue,
      },
    });

    if (format === "xlsx") {
      const workbook = await buildTicketSalesWorkbook(report);
      return new Response(new Uint8Array(workbook), {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename="${ticketSalesFilename(report)}"`,
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      });
    }

    const totalRows = report.rows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const resolvedPage = Math.min(page, totalPages);
    const start = (resolvedPage - 1) * pageSize;
    return Response.json({
      report: {
        daily: report.daily,
        excluded: report.excluded,
        filters: report.filters,
        generatedAt: report.generatedAt,
        pagination: { page: resolvedPage, pageSize, totalPages, totalRows },
        performances: report.performances,
        rows: report.rows.slice(start, start + pageSize),
        serverTimeMs: Math.round((performance.now() - startedAt) * 10) / 10,
        summary: report.summary,
        timezone: report.timezone,
        venues: report.venues,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[Zingara Analytics] Ticket Sales report failed", error);
    return Response.json({ error: "The Ticket Sales report could not be generated. Please try again." }, { status: 500 });
  }
}
