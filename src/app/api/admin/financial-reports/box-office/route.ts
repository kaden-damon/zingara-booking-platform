import {
  buildBoxOfficeFinancialReport,
  getSastDateRange,
  type BoxOfficeAuditRow,
  type BoxOfficeBookingRow,
  type BoxOfficeBookingType,
  type BoxOfficeLocation,
  type BoxOfficePaymentRow,
  type BoxOfficeRefundRow,
} from "@/lib/boxOfficeFinancialReport";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { normalizeShowLocation } from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

const pageSize = 1000;

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
    if (page.length < pageSize) return rows;
  }
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const role = Array.isArray(auth.staffProfile.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile.roles;
  if (!getRolePermissions(role).includes("analytics:read")) {
    return Response.json({ error: "Financial Reports access is required." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const requestedLocation = params.get("location") ?? "all";
  const requestedType = params.get("bookingType") ?? "all";
  let range: ReturnType<typeof getSastDateRange>;
  try {
    range = getSastDateRange(from, to);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid date range." }, { status: 400 });
  }
  if (!["all", "cape-town", "johannesburg"].includes(requestedLocation) ||
      !["all", "corporate", "standard"].includes(requestedType)) {
    return Response.json({ error: "Invalid financial report filters." }, { status: 400 });
  }

  const normalizedScope = normalizeStaffVenueScope(auth.staffProfile.venue_scope);
  const canSeeAll = normalizedScope.includes("all");
  const permittedLocations = new Set<BoxOfficeLocation>(
    canSeeAll
      ? ["cape-town", "johannesburg"]
      : normalizedScope.filter((value): value is BoxOfficeLocation =>
          value === "cape-town" || value === "johannesburg"),
  );
  if (requestedLocation === "all" && !canSeeAll && permittedLocations.size !== 1) {
    return Response.json({ error: "A permitted report location is required." }, { status: 403 });
  }
  if (requestedLocation !== "all" && !permittedLocations.has(requestedLocation as BoxOfficeLocation)) {
    return Response.json({ error: "This location is outside your staff scope." }, { status: 403 });
  }
  const effectiveLocation = requestedLocation === "all" && !canSeeAll
    ? [...permittedLocations][0]
    : requestedLocation;

  try {
    const client = auth.serviceClient;
    const [periodBookingRows, paymentRows, auditRows, refundRows, showRows] = await Promise.all([
      loadAllRows<Record<string, unknown>>((fromRow, toRow) => client
        .from("bookings")
        .select("id,booking_reference,customer_id,show_id,booking_source,booking_origin,corporate_request_id,company_name,guest_count,booking_status,subtotal_amount,discount_amount,addons_total,service_fee,total_amount,amount_paid,balance_outstanding,created_at,archived_at")
        .gte("created_at", range.start).lt("created_at", range.endExclusive)
        .order("id").range(fromRow, toRow)),
      loadAllRows<Record<string, unknown>>((fromRow, toRow) => client
        .from("payments")
        .select("id,booking_id,payment_type,payment_status,amount,method,processed_at,created_at,provider_gross_amount,provider_transaction_id,transaction_fee_amount")
        .or(`and(processed_at.gte.${range.start},processed_at.lt.${range.endExclusive}),and(processed_at.is.null,created_at.gte.${range.start},created_at.lt.${range.endExclusive})`)
        .order("id").range(fromRow, toRow)),
      loadAllRows<Record<string, unknown>>((fromRow, toRow) => client
        .from("audit_events")
        .select("id,created_at,entity_reference,reason,before_values,after_values")
        .eq("action", "booking.financial-reconciliation")
        .eq("outcome", "success")
        .order("id").range(fromRow, toRow)),
      loadAllRows<Record<string, unknown>>((fromRow, toRow) => client
        .from("payment_refunds")
        .select("id,booking_id,booking_reference,refund_amount,refund_status,completed_at,created_at")
        .eq("refund_status", "accepted")
        .gte("completed_at", range.start).lt("completed_at", range.endExclusive)
        .order("id").range(fromRow, toRow)),
      loadAllRows<Record<string, unknown>>((fromRow, toRow) => client
        .from("shows").select("id,venue").order("id").range(fromRow, toRow)),
    ]);

    const linkedBookingIds = unique([
      ...paymentRows.map((row) => String(row.booking_id ?? "")),
      ...refundRows.map((row) => String(row.booking_id ?? "")),
    ].filter(Boolean));
    const linkedReferences = unique(auditRows.map((row) => String(row.entity_reference ?? "")).filter(Boolean));
    const extraRows: Record<string, unknown>[] = [];
    for (let index = 0; index < Math.max(linkedBookingIds.length, linkedReferences.length); index += 100) {
      const ids = linkedBookingIds.slice(index, index + 100);
      const references = linkedReferences.slice(index, index + 100);
      if (ids.length > 0) {
        const { data, error } = await client.from("bookings")
          .select("id,booking_reference,customer_id,show_id,booking_source,booking_origin,corporate_request_id,company_name,guest_count,booking_status,subtotal_amount,discount_amount,addons_total,service_fee,total_amount,amount_paid,balance_outstanding,created_at,archived_at")
          .in("id", ids);
        if (error) throw error;
        extraRows.push(...((data ?? []) as Record<string, unknown>[]));
      }
      if (references.length > 0) {
        const { data, error } = await client.from("bookings")
          .select("id,booking_reference,customer_id,show_id,booking_source,booking_origin,corporate_request_id,company_name,guest_count,booking_status,subtotal_amount,discount_amount,addons_total,service_fee,total_amount,amount_paid,balance_outstanding,created_at,archived_at")
          .in("booking_reference", references);
        if (error) throw error;
        extraRows.push(...((data ?? []) as Record<string, unknown>[]));
      }
    }
    const rawBookings = [...new Map([...periodBookingRows, ...extraRows].map((row) => [String(row.id), row])).values()];
    const bookingIdByReference = new Map(
      rawBookings.map((row) => [String(row.booking_reference), String(row.id)]),
    );
    const auditBookingIds = unique(
      auditRows
        .map((row) => bookingIdByReference.get(String(row.entity_reference)))
        .filter((value): value is string => Boolean(value)),
    );
    const auditPaymentRows: Record<string, unknown>[] = [];
    for (let index = 0; index < auditBookingIds.length; index += 100) {
      const { data, error } = await client.from("payments")
        .select("id,booking_id,payment_type,payment_status,amount,method,processed_at,created_at,provider_gross_amount,provider_transaction_id,transaction_fee_amount")
        .in("booking_id", auditBookingIds.slice(index, index + 100));
      if (error) throw error;
      auditPaymentRows.push(...((data ?? []) as Record<string, unknown>[]));
    }
    const resolvedPaymentRows = [
      ...new Map([...paymentRows, ...auditPaymentRows].map((row) => [String(row.id), row])).values(),
    ];
    const customerIds = unique(rawBookings.map((row) => String(row.customer_id ?? "")).filter(Boolean));
    const customerRows: Record<string, unknown>[] = [];
    for (let index = 0; index < customerIds.length; index += 100) {
      const { data, error } = await client.from("customers")
        .select("id,first_name,surname")
        .in("id", customerIds.slice(index, index + 100));
      if (error) throw error;
      customerRows.push(...((data ?? []) as Record<string, unknown>[]));
    }
    const customerById = new Map(customerRows.map((row) => [String(row.id), row]));
    const locationByShow = new Map(
      showRows.map((show) => [
        String(show.id),
        normalizeShowLocation(String(show.venue ?? "")),
      ]),
    );
    const bookings = rawBookings.flatMap((row): BoxOfficeBookingRow[] => {
      const location = locationByShow.get(String(row.show_id));
      if (!location || !permittedLocations.has(location)) return [];
      const customer = customerById.get(String(row.customer_id));
      const customerName = String(row.company_name ?? "").trim() ||
        [customer?.first_name, customer?.surname].filter(Boolean).join(" ").trim() || "Not recorded";
      return [{
        addonsTotal: number(row.addons_total), amountPaid: number(row.amount_paid), archivedAt: row.archived_at ? String(row.archived_at) : null,
        balanceOutstanding: number(row.balance_outstanding), bookingOrigin: row.booking_origin ? String(row.booking_origin) : null,
        bookingReference: String(row.booking_reference), bookingSource: String(row.booking_source ?? ""), bookingStatus: String(row.booking_status ?? ""),
        corporateRequestId: row.corporate_request_id ? String(row.corporate_request_id) : null, createdAt: String(row.created_at), customerId: String(row.customer_id),
        customerName, discountAmount: number(row.discount_amount), guestCount: number(row.guest_count), id: String(row.id), location,
        serviceFee: number(row.service_fee), showId: String(row.show_id), subtotalAmount: number(row.subtotal_amount), totalAmount: number(row.total_amount),
      }];
    });
    const report = buildBoxOfficeFinancialReport({
      audits: auditRows.map((row): BoxOfficeAuditRow => ({
        afterValues: (row.after_values ?? {}) as Record<string, unknown>, beforeValues: (row.before_values ?? {}) as Record<string, unknown>,
        createdAt: String(row.created_at), entityReference: String(row.entity_reference), id: String(row.id), reason: row.reason ? String(row.reason) : null,
      })),
      bookings,
      filters: { bookingType: requestedType as "all" | BoxOfficeBookingType, from, location: effectiveLocation as "all" | BoxOfficeLocation, to },
      payments: resolvedPaymentRows.map((row): BoxOfficePaymentRow => ({
        amount: number(row.amount), bookingId: String(row.booking_id), createdAt: String(row.created_at), id: String(row.id), method: row.method ? String(row.method) : null,
        paymentStatus: String(row.payment_status), paymentType: String(row.payment_type), processedAt: row.processed_at ? String(row.processed_at) : null,
        providerGrossAmount: number(row.provider_gross_amount), providerTransactionId: row.provider_transaction_id ? String(row.provider_transaction_id) : null,
        transactionFeeAmount: number(row.transaction_fee_amount),
      })),
      refunds: refundRows.map((row): BoxOfficeRefundRow => ({
        bookingId: String(row.booking_id), bookingReference: String(row.booking_reference), completedAt: row.completed_at ? String(row.completed_at) : null,
        createdAt: String(row.created_at), id: String(row.id), refundAmount: number(row.refund_amount), refundStatus: String(row.refund_status),
      })),
    });
    return Response.json({ permittedLocations: [...permittedLocations], report }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[Zingara Financial Reports] Box Office report failed", error);
    return Response.json({ error: "Box Office financial report could not be generated." }, { status: 500 });
  }
}
