import { calculateXeroDocumentTotals } from "@/lib/xero/documentMath";
import {
  buildAuthoritativeBookingInvoiceDraft,
  directBookingInvoiceRevenueCategory,
} from "@/lib/xero/bookingInvoice";
import {
  bulkInvoiceBatchLimit,
  bulkInvoiceBlockers,
  bulkInvoiceChunkSize,
  bulkInvoiceEligibleBookingStatuses,
  bulkInvoicePostingEnabled,
  canManageBulkInvoices,
  paymentPosition,
} from "@/lib/xero/bulkInvoicing";
import { requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type BookingRow = {
  addons_total: number | null;
  amount_paid: number | null;
  archived_at: string | null;
  balance_outstanding: number | null;
  booking_origin: string | null;
  booking_reference: string;
  booking_source: string | null;
  booking_status: string;
  company_id: string | null;
  company_name: string | null;
  corporate_request_id: string | null;
  created_at: string;
  customer_id: string | null;
  discount_amount: number | null;
  guest_count: number;
  id: string;
  payment_status: string;
  section: string | null;
  service_fee: number | null;
  show_id: string;
  subtotal_amount: number | null;
  total_amount: number | null;
};

type RelatedData = {
  companies: Map<string, { address: string; email: string; name: string }>;
  customers: Map<string, { email: string; name: string }>;
  existingInvoices: Map<string, { id: string; localReference: string; status: string }>;
  shows: Map<string, { date: string; time: string; venue: string }>;
};

function validDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)));
}

function endExclusive(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function documentDate() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Johannesburg",
    year: "numeric",
  }).format(new Date());
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function loadRelated(
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  bookings: BookingRow[],
): Promise<RelatedData> {
  const showIds = unique(bookings.map((booking) => booking.show_id));
  const customerIds = unique(bookings.map((booking) => booking.customer_id));
  const companyIds = unique(bookings.map((booking) => booking.company_id));
  const bookingIds = bookings.map((booking) => booking.id);
  const [showsResult, customersResult, companiesResult, documentsResult] = await Promise.all([
    showIds.length
      ? serviceClient.from("shows").select("id,date,time,venue").in("id", showIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? serviceClient.from("customers").select("id,first_name,surname,email").in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    companyIds.length
      ? serviceClient.from("companies").select("id,legal_name,trading_name,billing_email,billing_address_line_1,billing_address_line_2,billing_suburb,billing_city,billing_province,billing_postal_code,billing_country").in("id", companyIds)
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length
      ? serviceClient.from("xero_documents").select("id,source_booking_id,local_reference,status").eq("kind", "invoice").in("source_booking_id", bookingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const error = showsResult.error || customersResult.error || companiesResult.error || documentsResult.error;
  if (error) throw error;
  return {
    companies: new Map((companiesResult.data ?? []).map((company) => [company.id, {
      address: [company.billing_address_line_1, company.billing_address_line_2, company.billing_suburb, company.billing_city, company.billing_province, company.billing_postal_code, company.billing_country].filter(Boolean).join(", "),
      email: company.billing_email ?? "",
      name: company.trading_name || company.legal_name || "",
    }])),
    customers: new Map((customersResult.data ?? []).map((customer) => [customer.id, {
      email: customer.email ?? "",
      name: [customer.first_name, customer.surname].filter(Boolean).join(" "),
    }])),
    existingInvoices: new Map((documentsResult.data ?? []).map((document) => [document.source_booking_id, {
      id: document.id,
      localReference: document.local_reference,
      status: document.status,
    }])),
    shows: new Map((showsResult.data ?? []).map((show) => [show.id, show])),
  };
}

function candidate(booking: BookingRow, related: RelatedData) {
  const company = booking.company_id ? related.companies.get(booking.company_id) : null;
  const customer = booking.customer_id ? related.customers.get(booking.customer_id) : null;
  const show = related.shows.get(booking.show_id) ?? null;
  const existingInvoice = related.existingInvoices.get(booking.id) ?? null;
  const customerName = company?.name || booking.company_name || customer?.name || "";
  const customerEmail = company?.email || customer?.email || "";
  const billingAddress = company?.address || "";
  const position = paymentPosition({
    amountPaid: Number(booking.amount_paid) || 0,
    outstanding: Number(booking.balance_outstanding) || 0,
    total: Number(booking.total_amount) || 0,
  });
  const blockers = bulkInvoiceBlockers({
    billingAddress,
    customerEmail,
    customerName,
    existingInvoice: Boolean(existingInvoice),
    paymentPosition: position,
    venue: show?.venue ?? null,
  });
  return {
    billingAddress,
    blockers,
    booking,
    customerEmail,
    customerName,
    existingInvoice,
    paymentPosition: position,
    show,
  };
}

async function requireBulkAccess(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return { error: auth.error };
  if (!canManageBulkInvoices(auth.staffProfile.id)) {
    return { error: Response.json({ error: "Only Tristan or Rachelle can manage bulk invoice drafts." }, { status: 403 }) };
  }
  return { auth };
}

async function processBatch(
  auth: NonNullable<Awaited<ReturnType<typeof requireBulkAccess>>["auth"]>,
  batchId: string,
) {
  const { data: batch } = await auth.serviceClient
    .from("xero_bulk_invoice_batches")
    .select("id,status,requested_by_staff_profile_id")
    .eq("id", batchId)
    .eq("requested_by_staff_profile_id", auth.staffProfile.id)
    .maybeSingle();
  if (!batch) throw new Error("The invoice batch could not be found.");
  const { data: items, error: itemsError } = await auth.serviceClient
    .from("xero_bulk_invoice_items")
    .select("id,booking_id,status")
    .eq("batch_id", batchId)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(bulkInvoiceChunkSize);
  if (itemsError) throw itemsError;

  for (const item of items ?? []) {
    const { data: claimed } = await auth.serviceClient
      .from("xero_bulk_invoice_items")
      .update({ status: "preparing", updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    try {
      const { data: booking, error: bookingError } = await auth.serviceClient
        .from("bookings")
        .select("id,booking_reference,booking_origin,booking_source,booking_status,corporate_request_id,company_id,company_name,customer_id,guest_count,section,show_id,subtotal_amount,discount_amount,addons_total,service_fee,total_amount,amount_paid,balance_outstanding,payment_status,archived_at,created_at")
        .eq("id", item.booking_id)
        .in("booking_status", [...bulkInvoiceEligibleBookingStatuses])
        .is("archived_at", null)
        .maybeSingle();
      if (bookingError) throw bookingError;
      if (!booking) throw new Error("BOOKING_NO_LONGER_ELIGIBLE");
      const related = await loadRelated(auth.serviceClient, [booking as BookingRow]);
      const resolved = candidate(booking as BookingRow, related);
      if (resolved.blockers.length) throw new Error(resolved.blockers.join("; "));
      if (!resolved.show) throw new Error("PERFORMANCE_NOT_FOUND");
      const draft = buildAuthoritativeBookingInvoiceDraft({
        addonsTotal: Number(booking.addons_total) || 0,
        bookingReference: booking.booking_reference,
        discountAmount: Number(booking.discount_amount) || 0,
        revenueCategory: directBookingInvoiceRevenueCategory({
          bookingOrigin: booking.booking_origin,
          bookingSource: booking.booking_source,
          corporateRequestId: booking.corporate_request_id,
        }),
        serviceFee: Number(booking.service_fee) || 0,
        subtotalAmount: Number(booking.subtotal_amount) || 0,
        totalAmount: Number(booking.total_amount) || 0,
      });
      const totals = calculateXeroDocumentTotals(draft.lines, draft.lineAmountType);
      const row = {
        account_number: null,
        billing_address: resolved.billingAddress,
        company_id: booking.company_id,
        contact_customer_id: booking.customer_id,
        currency_code: "ZAR",
        customer_email: resolved.customerEmail,
        customer_name: resolved.customerName,
        customer_notes: null,
        document_date: documentDate(),
        guest_count: booking.guest_count,
        internal_notes: `Prepared in bulk batch ${batchId}`,
        kind: "invoice",
        line_amount_type: draft.lineAmountType,
        lines: totals.lines,
        payment_terms: Number(booking.balance_outstanding) === 0
          ? "Paid in full"
          : `Outstanding balance: R${Number(booking.balance_outstanding).toFixed(2)}`,
        performance_date: resolved.show.date,
        performance_time: resolved.show.time,
        seating_summary: booking.section,
        source_booking_id: booking.id,
        source_booking_reference: booking.booking_reference,
        source_corporate_request_id: booking.corporate_request_id,
        status: "draft",
        subtotal_cents: totals.subtotalCents,
        sync_status: "local_only",
        tax_cents: totals.taxCents,
        total_cents: totals.totalCents,
        updated_by_staff_profile_id: auth.staffProfile.id,
        valid_until: null,
        venue: resolved.show.venue,
      };
      const { data: document, error: documentError } = await auth.serviceClient.rpc("create_xero_document_draft_atomic", {
        p_actor_auth_user_id: auth.user.id,
        p_actor_location_scope: auth.staffProfile.venue_scope,
        p_actor_name: auth.staffProfile.full_name,
        p_actor_role: "Accounts",
        p_actor_staff_profile_id: auth.staffProfile.id,
        p_document: row,
      });
      if (documentError) throw documentError;
      await auth.serviceClient.from("xero_bulk_invoice_items").update({
        document_id: document.id,
        error_code: null,
        error_message: null,
        status: "draft_ready",
        updated_at: new Date().toISOString(),
      }).eq("id", item.id).eq("status", "preparing");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Draft preparation failed.";
      const blocked = message.includes("Missing ") || message.includes("already exists") || message.includes("reconcile") || message.includes("NO_LONGER_ELIGIBLE");
      await auth.serviceClient.from("xero_bulk_invoice_items").update({
        error_code: blocked ? "BOOKING_BLOCKED" : "DRAFT_FAILED",
        error_message: message.slice(0, 1_000),
        status: blocked ? "blocked" : "failed",
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
    }
  }

  const { data: allItems, error: allItemsError } = await auth.serviceClient
    .from("xero_bulk_invoice_items")
    .select("status")
    .eq("batch_id", batchId);
  if (allItemsError) throw allItemsError;
  const counts = (allItems ?? []).reduce<Record<string, number>>((result, item) => {
    result[item.status] = (result[item.status] ?? 0) + 1;
    return result;
  }, {});
  const queued = (counts.queued ?? 0) + (counts.preparing ?? 0);
  const failed = counts.failed ?? 0;
  const blocked = counts.blocked ?? 0;
  const ready = counts.draft_ready ?? 0;
  const status = queued > 0 ? "preparing" : failed || blocked ? "partially_failed" : "drafts_ready";
  await auth.serviceClient.from("xero_bulk_invoice_batches").update({
    blocked_count: blocked,
    completed_at: queued === 0 ? new Date().toISOString() : null,
    failed_count: failed,
    ready_count: ready,
    status,
    updated_at: new Date().toISOString(),
  }).eq("id", batchId);
  return { batchId, blocked, failed, pending: queued, ready, status };
}

export async function GET(request: Request) {
  const access = await requireBulkAccess(request);
  if (access.error || !access.auth) return access.error;
  const { auth } = access;
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!validDate(from) || !validDate(to) || from! > to!) {
    return Response.json({ error: "Choose a valid booking creation date range." }, { status: 400 });
  }
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = 50;
  const payment = url.searchParams.get("payment") ?? "all";
  let query = auth.serviceClient
    .from("bookings")
    .select("id,booking_reference,booking_origin,booking_source,booking_status,corporate_request_id,company_id,company_name,customer_id,guest_count,section,show_id,subtotal_amount,discount_amount,addons_total,service_fee,total_amount,amount_paid,balance_outstanding,payment_status,archived_at,created_at", { count: "exact" })
    .in("booking_status", [...bulkInvoiceEligibleBookingStatuses])
    .is("archived_at", null)
    .gt("total_amount", 0)
    .gte("created_at", `${from}T00:00:00.000Z`)
    .lt("created_at", endExclusive(to!))
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (payment !== "all") query = query.eq("payment_status", payment);
  const { data, error, count } = await query;
  if (error) throw error;
  const bookings = (data ?? []) as BookingRow[];
  const related = await loadRelated(auth.serviceClient, bookings);
  const candidates = bookings.map((booking) => {
    const resolved = candidate(booking, related);
    return {
      amountPaid: Number(booking.amount_paid) || 0,
      blockers: resolved.blockers,
      bookingId: booking.id,
      bookingReference: booking.booking_reference,
      createdAt: booking.created_at,
      customerName: resolved.customerName || "Missing customer",
      existingInvoice: resolved.existingInvoice,
      guestCount: booking.guest_count,
      outstanding: Number(booking.balance_outstanding) || 0,
      paymentPosition: resolved.paymentPosition,
      paymentStatus: booking.payment_status,
      performanceDate: resolved.show?.date ?? null,
      selectable: resolved.blockers.length === 0,
      total: Number(booking.total_amount) || 0,
      venue: resolved.show?.venue ?? null,
    };
  });
  const { data: batches } = await auth.serviceClient
    .from("xero_bulk_invoice_batches")
    .select("id,date_from,date_to,status,selected_count,ready_count,blocked_count,failed_count,posted_count,created_at,updated_at")
    .eq("requested_by_staff_profile_id", auth.staffProfile.id)
    .order("created_at", { ascending: false })
    .limit(10);
  return Response.json({
    batches: batches ?? [],
    bulkPostingEnabled: bulkInvoicePostingEnabled(),
    candidates,
    page,
    pageSize,
    total: count ?? 0,
  });
}

export async function POST(request: Request) {
  const access = await requireBulkAccess(request);
  if (access.error || !access.auth) return access.error;
  const { auth } = access;
  const body = await request.json() as {
    action?: "continue" | "post" | "prepare";
    batchId?: string;
    bookingIds?: string[];
    confirmation?: string;
    from?: string;
    to?: string;
  };
  if (body.action === "post") {
    if (!bulkInvoicePostingEnabled()) {
      return Response.json({ error: "Bulk Xero posting is awaiting separate accounting approval." }, { status: 409 });
    }
    return Response.json({ error: "Bulk posting requires a separately approved activation release." }, { status: 409 });
  }
  if (body.action === "continue") {
    if (!body.batchId || !/^[0-9a-f-]{36}$/i.test(body.batchId)) return Response.json({ error: "Choose a valid batch." }, { status: 400 });
    return Response.json(await processBatch(auth, body.batchId));
  }
  if (body.action !== "prepare" || body.confirmation !== "PREPARE DRAFTS") {
    return Response.json({ error: "Confirm PREPARE DRAFTS before creating local invoice drafts." }, { status: 400 });
  }
  const bookingIds = unique(body.bookingIds ?? []);
  if (!bookingIds.length || bookingIds.length > bulkInvoiceBatchLimit || bookingIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
    return Response.json({ error: `Select between 1 and ${bulkInvoiceBatchLimit} eligible bookings.` }, { status: 400 });
  }
  if (!validDate(body.from ?? null) || !validDate(body.to ?? null) || body.from! > body.to!) {
    return Response.json({ error: "Choose a valid booking creation date range." }, { status: 400 });
  }
  const { data: bookings, error: bookingsError } = await auth.serviceClient
    .from("bookings")
    .select("id,booking_status,archived_at,created_at")
    .in("id", bookingIds)
    .in("booking_status", [...bulkInvoiceEligibleBookingStatuses])
    .is("archived_at", null)
    .gte("created_at", `${body.from}T00:00:00.000Z`)
    .lt("created_at", endExclusive(body.to!));
  if (bookingsError) throw bookingsError;
  if ((bookings ?? []).length !== bookingIds.length) {
    return Response.json({ error: "One or more bookings changed and are no longer eligible. Refresh the list." }, { status: 409 });
  }
  const { data: batch, error: batchError } = await auth.serviceClient.from("xero_bulk_invoice_batches").insert({
    date_from: body.from,
    date_to: body.to,
    requested_by_staff_profile_id: auth.staffProfile.id,
    selected_count: bookingIds.length,
    status: "preparing",
  }).select("id").single();
  if (batchError) throw batchError;
  const { error: itemsError } = await auth.serviceClient.from("xero_bulk_invoice_items").insert(
    bookingIds.map((bookingId) => ({ batch_id: batch.id, booking_id: bookingId, status: "queued" })),
  );
  if (itemsError) throw itemsError;
  await auth.serviceClient.from("audit_events").insert({
    action: "xero_bulk_invoice_draft_batch_started",
    actor_auth_user_id: auth.user.id,
    actor_location_scope: auth.staffProfile.venue_scope,
    actor_name: auth.staffProfile.full_name,
    actor_role: "Accounts",
    actor_staff_profile_id: auth.staffProfile.id,
    after_values: { bookingCount: bookingIds.length, dateFrom: body.from, dateTo: body.to },
    before_values: {},
    changed_fields: ["status"],
    entity_id: batch.id,
    entity_location: "all",
    entity_reference: batch.id,
    entity_type: "xero-bulk-invoice-batch",
    outcome: "success",
    source_area: "xero-bulk-invoicing",
  });
  return Response.json(await processBatch(auth, batch.id), { status: 201 });
}
