import { calculateXeroDocumentTotals, type XeroDocumentLineInput, type XeroLineAmountType } from "@/lib/xero/documentMath";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { canCreateXeroInvoice, canCreateXeroQuote } from "@/lib/xero/access";

export const dynamic = "force-dynamic";

type DocumentInput = {
  accountNumber?: string;
  billingAddress?: string;
  companyId?: string | null;
  contactCustomerId?: string | null;
  customerEmail?: string;
  customerName?: string;
  customerNotes?: string;
  documentDate?: string;
  guestCount?: number | null;
  internalNotes?: string;
  kind?: "invoice" | "quote";
  lineAmountType?: XeroLineAmountType;
  lines?: XeroDocumentLineInput[];
  paymentTerms?: string;
  performanceDate?: string;
  performanceTime?: string;
  seatingSummary?: string;
  sourceBookingId?: string | null;
  sourceBookingReference?: string;
  sourceCorporateRequestId?: string | null;
  validUntil?: string;
  venue?: "cape-town" | "johannesburg" | null;
};

type DraftUpdateInput = DocumentInput & { documentId?: string; version?: number };

function rolePermissions(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  if (!auth.staffProfile) return [];
  const role = Array.isArray(auth.staffProfile.roles) ? auth.staffProfile.roles[0] : auth.staffProfile.roles;
  return getRolePermissions(role);
}

function roleName(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  const role = Array.isArray(auth.staffProfile?.roles) ? auth.staffProfile?.roles[0] : auth.staffProfile?.roles;
  return role?.name ?? "Staff";
}

function canCreateInvoice(auth: Awaited<ReturnType<typeof requireActiveStaff>>, permissions: string[]) {
  return canCreateXeroInvoice({ permissions, roleName: roleName(auth) });
}

function allowedVenues(scope: string[]) {
  const normalized = normalizeStaffVenueScope(scope ?? []);
  return normalized.includes("all")
    ? ["cape-town", "johannesburg"]
    : normalized.filter((venue) => venue === "cape-town" || venue === "johannesburg");
}

function cleanText(value: string | undefined, maxLength: number) {
  return value?.trim().slice(0, maxLength) ?? "";
}

function validateDocument(input: DocumentInput) {
  const kind = input.kind === "invoice" ? "invoice" : "quote";
  const lineAmountType = input.lineAmountType ?? "no-tax";
  const customerName = cleanText(input.customerName, 200);
  if (Array.isArray(input.lines) && input.lines.length > 100) throw new Error("Use no more than 100 lines.");
  const lines = Array.isArray(input.lines) ? input.lines.map((line) => ({
    description: cleanText(line.description, 2_000),
    quantity: cleanText(line.quantity, 32),
    taxCode: line.taxCode ? cleanText(line.taxCode, 100) : null,
    taxRatePercent: line.taxRatePercent ? cleanText(line.taxRatePercent, 16) : null,
    unitPrice: cleanText(line.unitPrice, 32),
  })) : [];
  if (!customerName) throw new Error("Add a customer or Company name.");
  const customerEmail = cleanText(input.customerEmail, 320);
  if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error("Add a valid billing email.");
  const billingAddress = cleanText(input.billingAddress, 2_000);
  if (!billingAddress) throw new Error("Add a billing address.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.documentDate ?? "")) throw new Error("Choose a document date.");
  if (input.guestCount !== null && input.guestCount !== undefined && (!Number.isInteger(input.guestCount) || input.guestCount < 0)) throw new Error("Enter a valid guest count.");
  if (lines.length === 0) throw new Error("Add at least one line.");
  const totals = calculateXeroDocumentTotals(lines, lineAmountType);
  return { billingAddress, customerEmail, customerName, kind, lineAmountType, lines, totals };
}

function documentRow(input: DocumentInput, validated: ReturnType<typeof validateDocument>, staffProfileId: string) {
  return {
    account_number: cleanText(input.accountNumber, 100) || null,
    billing_address: validated.billingAddress,
    company_id: input.companyId ?? null,
    contact_customer_id: input.contactCustomerId ?? null,
    currency_code: "ZAR",
    customer_email: validated.customerEmail,
    customer_name: validated.customerName,
    customer_notes: cleanText(input.customerNotes, 4_000) || null,
    document_date: input.documentDate,
    guest_count: input.guestCount ?? null,
    internal_notes: cleanText(input.internalNotes, 4_000) || null,
    kind: validated.kind,
    line_amount_type: validated.lineAmountType,
    lines: validated.totals.lines,
    payment_terms: cleanText(input.paymentTerms, 2_000) || null,
    performance_date: input.performanceDate || null,
    performance_time: input.performanceTime || null,
    seating_summary: cleanText(input.seatingSummary, 500) || null,
    source_booking_id: input.sourceBookingId ?? null,
    source_booking_reference: cleanText(input.sourceBookingReference, 100) || null,
    source_corporate_request_id: input.sourceCorporateRequestId ?? null,
    subtotal_cents: validated.totals.subtotalCents,
    tax_cents: validated.totals.taxCents,
    total_cents: validated.totals.totalCents,
    updated_by_staff_profile_id: staffProfileId,
    valid_until: input.validUntil || null,
    venue: input.venue ?? null,
  };
}

function cleanSearch(value: string | null) {
  return value?.normalize("NFKC").replace(/[^\p{L}\p{N}\s@.+-]/gu, "").trim().slice(0, 100) ?? "";
}

async function resolveSourceBooking(
  auth: Awaited<ReturnType<typeof requireActiveStaff>>,
  input: DocumentInput,
) {
  if (!auth.serviceClient || (!input.sourceBookingId && !input.sourceBookingReference)) return;
  let query = auth.serviceClient.from("bookings").select("id,booking_reference,show_id");
  query = input.sourceBookingId ? query.eq("id", input.sourceBookingId) : query.eq("booking_reference", cleanText(input.sourceBookingReference, 100));
  const { data: booking, error } = await query.maybeSingle();
  if (error) throw error;
  if (!booking) throw new Error("The linked booking could not be found.");
  const { data: show, error: showError } = await auth.serviceClient.from("shows").select("venue").eq("id", booking.show_id).single();
  if (showError || !show) throw new Error("The linked performance could not be found.");
  if (!auth.staffProfile || !allowedVenues(auth.staffProfile.venue_scope).includes(show.venue) || input.venue !== show.venue) {
    throw new Error("The linked booking is outside this venue.");
  }
  input.sourceBookingId = booking.id;
  input.sourceBookingReference = booking.booking_reference;
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  const permissions = rolePermissions(auth);
  if (!permissions.includes("bookings:manage") && !permissions.includes("bookings:reconcile") && !permissions.includes("analytics:read") && !permissions.includes("settings:manage")) {
    return Response.json({ error: "Quote and accounting access is required." }, { status: 403 });
  }
  const venues = allowedVenues(auth.staffProfile.venue_scope);
  const url = new URL(request.url);
  const prefillBookingReference = cleanText(url.searchParams.get("prefillBookingReference") ?? undefined, 100);
  if (prefillBookingReference) {
    const { data: booking, error: bookingError } = await auth.serviceClient
      .from("bookings")
      .select("id,booking_reference,company_id,customer_id,company_name,guest_count,section,show_id,total_amount,amount_paid,balance_outstanding,payment_status")
      .eq("booking_reference", prefillBookingReference)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return Response.json({ error: "The booking could not be found." }, { status: 404 });
    const [showResult, customerResult, companyResult] = await Promise.all([
      auth.serviceClient.from("shows").select("id,date,time,venue").eq("id", booking.show_id).single(),
      booking.customer_id ? auth.serviceClient.from("customers").select("id,first_name,surname,email").eq("id", booking.customer_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      booking.company_id ? auth.serviceClient.from("companies").select("id,legal_name,trading_name,billing_email,billing_address_line_1,billing_address_line_2,billing_suburb,billing_city,billing_province,billing_postal_code,billing_country").eq("id", booking.company_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (showResult.error || !showResult.data) return Response.json({ error: "The booking performance could not be loaded." }, { status: 404 });
    if (!venues.includes(showResult.data.venue)) return Response.json({ error: "This venue is outside your access." }, { status: 403 });
    if (customerResult.error) throw customerResult.error;
    if (companyResult.error) throw companyResult.error;
    const customer = customerResult.data;
    const company = companyResult.data;
    return Response.json({
      booking: {
        billingAddress: company ? [company.billing_address_line_1, company.billing_address_line_2, company.billing_suburb, company.billing_city, company.billing_province, company.billing_postal_code, company.billing_country].filter(Boolean).join(", ") : "",
        bookingReference: booking.booking_reference,
        bookingValue: Number(booking.total_amount) || 0,
        companyId: booking.company_id,
        contactCustomerId: booking.customer_id,
        customerEmail: company?.billing_email || customer?.email || "",
        customerName: company?.trading_name || company?.legal_name || booking.company_name || [customer?.first_name, customer?.surname].filter(Boolean).join(" "),
        guestCount: booking.guest_count,
        outstanding: Number(booking.balance_outstanding) || 0,
        paid: Number(booking.amount_paid) || 0,
        paymentStatus: booking.payment_status,
        performanceDate: showResult.data.date,
        performanceTime: showResult.data.time,
        seatingSummary: booking.section,
        sourceBookingId: booking.id,
        venue: showResult.data.venue,
      },
    });
  }
  const documentId = url.searchParams.get("documentId")?.trim();
  if (documentId) {
    if (!/^[0-9a-f-]{36}$/i.test(documentId)) {
      return Response.json({ error: "Invalid document." }, { status: 400 });
    }
    const { data: document, error: documentError } = await auth.serviceClient
      .from("xero_documents")
      .select("*")
      .eq("id", documentId)
      .single();
    if (documentError || !document) return Response.json({ error: "The document could not be found." }, { status: 404 });
    if (!venues.includes(document.venue)) return Response.json({ error: "This venue is outside your access." }, { status: 403 });
    const versionsPromise = auth.serviceClient
      .from("xero_document_versions")
      .select("version,created_at,created_by_staff_profile_id")
      .eq("document_id", documentId)
      .order("version", { ascending: false });
    const bookingPromise = document.source_booking_id
      ? auth.serviceClient.from("bookings").select("booking_reference,total_amount,amount_paid,balance_outstanding,payment_status").eq("id", document.source_booking_id).maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const [{ data: versions, error: versionsError }, { data: booking, error: bookingError }] = await Promise.all([versionsPromise, bookingPromise]);
    if (versionsError) throw versionsError;
    if (bookingError) throw bookingError;
    return Response.json({
      bookingFinancials: booking ? {
        amountPaid: Number(booking.amount_paid) || 0,
        bookingReference: booking.booking_reference,
        bookingValue: Number(booking.total_amount) || 0,
        outstanding: Number(booking.balance_outstanding) || 0,
        paymentStatus: booking.payment_status,
      } : null,
      document,
      versions: versions ?? [],
    });
  }
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get("pageSize") ?? "20") || 20));
  const from = (page - 1) * pageSize;
  let query = auth.serviceClient
    .from("xero_documents")
    .select("id,kind,local_reference,source_booking_reference,venue,status,version,customer_name,document_date,valid_until,subtotal_cents,tax_cents,total_cents,xero_document_number,xero_status,sync_status,created_at,updated_at", { count: "exact" })
    .in("venue", venues.length ? venues : ["__none__"])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);
  const venue = url.searchParams.get("venue");
  if (venue && venue !== "all") query = query.eq("venue", venue);
  const kind = url.searchParams.get("kind");
  if (kind === "quote" || kind === "invoice") query = query.eq("kind", kind);
  const status = url.searchParams.get("status");
  if (status && ["draft", "revised", "accepted", "converted", "expired", "superseded"].includes(status)) query = query.eq("status", status);
  const search = cleanSearch(url.searchParams.get("search"));
  if (search) query = query.or(`local_reference.ilike.%${search}%,customer_name.ilike.%${search}%,source_booking_reference.ilike.%${search}%`);
  const [documentsResult, connectionResult, mappingResult, outboxResult] = await Promise.all([
    query,
    auth.serviceClient.from("xero_connections").select("tenant_name,status,sync_paused,last_sync_at").limit(1).maybeSingle(),
    permissions.includes("bookings:reconcile") || permissions.includes("settings:manage")
      ? auth.serviceClient.from("xero_account_mappings").select("category,account_code,tax_code,approved_at").order("category")
      : Promise.resolve({ data: [], error: null }),
    auth.serviceClient.from("xero_sync_outbox").select("status", { count: "exact", head: true }).in("status", ["paused", "pending", "failed", "blocked"]),
  ]);
  if (documentsResult.error) {
    if (documentsResult.error.code === "42P01") {
      return Response.json({ error: "Xero foundation is not available yet." }, { status: 503 });
    }
    throw documentsResult.error;
  }
  return Response.json({
    canCreateInvoice: canCreateInvoice(auth, permissions),
    canCreateQuote: canCreateXeroQuote(permissions),
    canManageConnection: permissions.includes("settings:manage"),
    connection: connectionResult.data ?? { last_sync_at: null, status: "not_connected", sync_paused: true, tenant_name: null },
    documents: documentsResult.data ?? [],
    mappings: mappingResult.data ?? [],
    outboxAttentionCount: outboxResult.count ?? 0,
    page,
    pageSize,
    total: documentsResult.count ?? 0,
  });
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  const permissions = rolePermissions(auth);
  try {
    const input = (await request.json()) as DocumentInput;
    await resolveSourceBooking(auth, input);
    const validated = validateDocument(input);
    if (validated.kind === "quote" && !canCreateXeroQuote(permissions)) {
      return Response.json({ error: "Booking management access is required for quotes." }, { status: 403 });
    }
    if (validated.kind === "invoice" && !canCreateInvoice(auth, permissions)) {
      return Response.json({ error: "Accounts approval is required for invoice drafts." }, { status: 403 });
    }
    const venue = input.venue ?? null;
    if (!venue || !allowedVenues(auth.staffProfile.venue_scope).includes(venue)) {
      return Response.json({ error: "This venue is outside your access." }, { status: 403 });
    }
    const row = {
      ...documentRow(input, validated, auth.staffProfile.id),
      created_by_staff_profile_id: auth.staffProfile.id,
      status: "draft",
      sync_status: "local_only",
    };
    const { data, error } = await auth.serviceClient.rpc("create_xero_document_draft_atomic", {
      p_actor_auth_user_id: auth.user.id,
      p_actor_location_scope: auth.staffProfile.venue_scope,
      p_actor_name: auth.staffProfile.full_name,
      p_actor_role: roleName(auth),
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_document: row,
    });
    if (error) throw error;
    return Response.json({ document: data }, { status: 201 });
  } catch (error) {
    console.error("[Xero Foundation] Draft could not be created", error);
    return Response.json({ error: error instanceof Error ? error.message : "The draft could not be created." }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  const permissions = rolePermissions(auth);
  try {
    const input = (await request.json()) as DraftUpdateInput;
    if (!input.documentId || !Number.isInteger(input.version)) return Response.json({ error: "Refresh the document and try again." }, { status: 400 });
    const validated = validateDocument(input);
    if (validated.kind === "quote" && !canCreateXeroQuote(permissions)) return Response.json({ error: "Quote access is required." }, { status: 403 });
    if (validated.kind === "invoice" && !canCreateInvoice(auth, permissions)) return Response.json({ error: "Accounts access is required." }, { status: 403 });
    const { data: current, error: currentError } = await auth.serviceClient.from("xero_documents").select("id,kind,venue,status,version,source_booking_id,source_booking_reference").eq("id", input.documentId).single();
    if (currentError || !current) return Response.json({ error: "The document could not be found." }, { status: 404 });
    if (!allowedVenues(auth.staffProfile.venue_scope).includes(current.venue)) return Response.json({ error: "This venue is outside your access." }, { status: 403 });
    if (!input.venue || !allowedVenues(auth.staffProfile.venue_scope).includes(input.venue)) return Response.json({ error: "This venue is outside your access." }, { status: 403 });
    if ((input.sourceBookingId ?? null) !== (current.source_booking_id ?? null) || cleanText(input.sourceBookingReference, 100) !== (current.source_booking_reference ?? "")) return Response.json({ error: "The linked booking cannot be changed on this draft." }, { status: 409 });
    if (current.kind !== validated.kind || !["draft", "revised"].includes(current.status)) return Response.json({ error: "This document is read-only." }, { status: 409 });
    const { data, error } = await auth.serviceClient.rpc("update_xero_document_draft_atomic", {
      p_actor_auth_user_id: auth.user.id,
      p_actor_location_scope: auth.staffProfile.venue_scope,
      p_actor_name: auth.staffProfile.full_name,
      p_actor_role: roleName(auth),
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_document: documentRow(input, validated, auth.staffProfile.id),
      p_document_id: input.documentId,
      p_expected_version: input.version,
    });
    if (error) return Response.json({ error: "This document changed. Refresh and try again." }, { status: 409 });
    return Response.json({ document: data });
  } catch (error) {
    console.error("[Xero Foundation] Draft could not be revised", error);
    return Response.json({ error: error instanceof Error ? error.message : "The draft could not be updated." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  const permissions = rolePermissions(auth);
  if (!permissions.includes("bookings:manage") && !canCreateInvoice(auth, permissions)) {
    return Response.json({ error: "Quote or Accounts access is required." }, { status: 403 });
  }
  const body = (await request.json()) as { action?: "accept" | "convert"; acceptedBy?: string; evidence?: string; documentId?: string; version?: number };
  if (!body.documentId || !body.action) return Response.json({ error: "Choose a document action." }, { status: 400 });
  const { data: current, error } = await auth.serviceClient.from("xero_documents").select("*").eq("id", body.documentId).single();
  if (error || !current) return Response.json({ error: "The document could not be found." }, { status: 404 });
  if (!allowedVenues(auth.staffProfile.venue_scope).includes(current.venue)) return Response.json({ error: "This venue is outside your access." }, { status: 403 });
  if (body.version !== current.version) return Response.json({ error: "This document has changed. Refresh and try again." }, { status: 409 });

  if (body.action === "accept") {
    if (!canCreateXeroQuote(permissions)) return Response.json({ error: "Quote access is required." }, { status: 403 });
    if (current.kind !== "quote" || !["draft", "revised", "issued", "sent"].includes(current.status)) return Response.json({ error: "This quote cannot be accepted." }, { status: 409 });
    const acceptedBy = cleanText(body.acceptedBy, 200);
    const evidence = cleanText(body.evidence, 2_000);
    if (!acceptedBy || !evidence) return Response.json({ error: "Record who accepted and the acceptance evidence." }, { status: 400 });
    const { data, error: updateError } = await auth.serviceClient.rpc("accept_xero_quote_atomic", {
      p_accepted_by: acceptedBy,
      p_actor_auth_user_id: auth.user.id,
      p_actor_location_scope: auth.staffProfile.venue_scope,
      p_actor_name: auth.staffProfile.full_name,
      p_actor_role: roleName(auth),
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_document_id: current.id,
      p_evidence: evidence,
      p_expected_version: current.version,
    });
    if (updateError) return Response.json({ error: "This quote has already changed or been accepted." }, { status: 409 });
    return Response.json({ document: data });
  }

  if (current.kind !== "quote" || current.status !== "accepted" || current.accepted_version !== current.version) return Response.json({ error: "Only the accepted quote version can be converted." }, { status: 409 });
  if (!canCreateInvoice(auth, permissions)) return Response.json({ error: "Accounts access is required to create an invoice draft." }, { status: 403 });
  const { data, error: insertError } = await auth.serviceClient.rpc("convert_xero_quote_to_invoice_draft_atomic", {
    p_actor_auth_user_id: auth.user.id,
    p_actor_location_scope: auth.staffProfile.venue_scope,
    p_actor_name: auth.staffProfile.full_name,
    p_actor_role: roleName(auth),
    p_actor_staff_profile_id: auth.staffProfile.id,
    p_document_id: current.id,
    p_expected_version: current.version,
  });
  if (insertError) return Response.json({ error: "An invoice draft already exists or the quote changed." }, { status: 409 });
  return Response.json({ document: data });
}
