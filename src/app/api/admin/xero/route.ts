import { calculateXeroDocumentTotals, type XeroDocumentLineInput, type XeroLineAmountType } from "@/lib/xero/documentMath";
import { createXeroDocumentPdf } from "@/lib/xero/documentPdf";
import { createBrandedCustomerEmail } from "@/lib/email/customerEmail";
import { sendOperationalCustomerEmail, sendZingaraEmail } from "@/lib/email/smtp";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { canCreateXeroInvoice, canCreateXeroQuote } from "@/lib/xero/access";
import {
  buildAuthoritativeBookingInvoiceDraft,
  directBookingInvoiceRevenueCategory,
} from "@/lib/xero/bookingInvoice";
import { canConvertRequestedQuote } from "@/lib/xero/invoiceRequests";
import {
  assertDirectBookingInvoiceSyncEligibility,
  assertInitialInvoiceSyncEligibility,
} from "@/lib/xero/activation";
import { downloadBankingDocument, loadActiveBankingDocument } from "@/lib/xero/bankingDocuments";
import { getXeroConfiguration } from "@/lib/xero/config";
import { runLiveXeroSyncWorker } from "@/lib/xero/liveSync";
import { createQuoteAcceptanceToken, hashQuoteAcceptanceToken, quoteAcceptanceExpiry } from "@/lib/xero/quoteAcceptance";
import { buildXeroDocumentSyncPayload, documentMappingCategory, type QueueableXeroDocument } from "@/lib/xero/queue";

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

function canConvertQuote(auth: Awaited<ReturnType<typeof requireActiveStaff>>, permissions: string[]) {
  return canConvertRequestedQuote(auth.staffProfile, canCreateInvoice(auth, permissions));
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
    mappingCategory: line.mappingCategory ? cleanText(line.mappingCategory, 100) : null,
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

function corporateRequestVenue(notes: string | null) {
  if (!notes?.startsWith("__zingara_corporate_request_meta__:")) return null;
  try {
    const metadata = JSON.parse(notes.slice("__zingara_corporate_request_meta__:".length)) as { locationAcknowledgement?: string };
    const location = metadata.locationAcknowledgement?.toLowerCase() ?? "";
    if (location.includes("johannesburg")) return "johannesburg";
    if (location.includes("cape town")) return "cape-town";
  } catch {
    return null;
  }
  return null;
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

async function resolveSourceCorporateRequest(
  auth: Awaited<ReturnType<typeof requireActiveStaff>>,
  input: DocumentInput,
) {
  if (!auth.serviceClient || !input.sourceCorporateRequestId) return;
  const { data: request, error } = await auth.serviceClient
    .from("corporate_requests")
    .select("id,company_id,contact_customer_id,notes")
    .eq("id", input.sourceCorporateRequestId)
    .maybeSingle();
  if (error) throw error;
  if (!request) throw new Error("The linked Corporate enquiry could not be found.");
  const venue = corporateRequestVenue(request.notes);
  if (!venue || !auth.staffProfile || !allowedVenues(auth.staffProfile.venue_scope).includes(venue) || input.venue !== venue) {
    throw new Error("The linked Corporate enquiry is outside this venue.");
  }
  input.companyId = request.company_id;
  input.contactCustomerId = request.contact_customer_id;
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
  const prefillCorporateRequestId = url.searchParams.get("prefillCorporateRequestId")?.trim();
  if (prefillCorporateRequestId) {
    if (!/^[0-9a-f-]{36}$/i.test(prefillCorporateRequestId)) return Response.json({ error: "Invalid Corporate enquiry." }, { status: 400 });
    const { data: corporateRequest, error: requestError } = await auth.serviceClient
      .from("corporate_requests")
      .select("id,company_id,contact_customer_id,company_name,contact_name,email,guest_count,preferred_event_date,seating_preference,notes")
      .eq("id", prefillCorporateRequestId)
      .maybeSingle();
    if (requestError) throw requestError;
    if (!corporateRequest) return Response.json({ error: "The Corporate enquiry could not be found." }, { status: 404 });
    const venue = corporateRequestVenue(corporateRequest.notes);
    if (!venue) return Response.json({ error: "Confirm the enquiry venue before creating a quote." }, { status: 409 });
    if (!venues.includes(venue)) return Response.json({ error: "This venue is outside your access." }, { status: 403 });
    const [customerResult, companyResult] = await Promise.all([
      corporateRequest.contact_customer_id ? auth.serviceClient.from("customers").select("id,first_name,surname,email").eq("id", corporateRequest.contact_customer_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      corporateRequest.company_id ? auth.serviceClient.from("companies").select("id,legal_name,trading_name,billing_email,billing_address_line_1,billing_address_line_2,billing_suburb,billing_city,billing_province,billing_postal_code,billing_country").eq("id", corporateRequest.company_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (customerResult.error) throw customerResult.error;
    if (companyResult.error) throw companyResult.error;
    const customer = customerResult.data;
    const company = companyResult.data;
    return Response.json({ corporateRequest: {
      billingAddress: company ? [company.billing_address_line_1, company.billing_address_line_2, company.billing_suburb, company.billing_city, company.billing_province, company.billing_postal_code, company.billing_country].filter(Boolean).join(", ") : "",
      companyId: corporateRequest.company_id,
      contactCustomerId: corporateRequest.contact_customer_id,
      customerEmail: company?.billing_email || customer?.email || corporateRequest.email || "",
      customerName: company?.trading_name || company?.legal_name || corporateRequest.company_name || corporateRequest.contact_name,
      guestCount: corporateRequest.guest_count,
      performanceDate: corporateRequest.preferred_event_date,
      seatingSummary: corporateRequest.seating_preference,
      sourceCorporateRequestId: corporateRequest.id,
      venue,
    } });
  }
  const prefillBookingReference = cleanText(url.searchParams.get("prefillBookingReference") ?? undefined, 100);
  if (prefillBookingReference) {
    const { data: booking, error: bookingError } = await auth.serviceClient
      .from("bookings")
      .select("id,booking_reference,booking_origin,booking_source,corporate_request_id,company_id,customer_id,company_name,guest_count,section,show_id,subtotal_amount,discount_amount,addons_total,service_fee,total_amount,amount_paid,balance_outstanding,payment_status")
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
    const invoiceDraft = url.searchParams.get("document") === "invoice"
      ? buildAuthoritativeBookingInvoiceDraft({
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
        })
      : null;
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
        lineAmountType: invoiceDraft?.lineAmountType ?? "no-tax",
        lines: invoiceDraft?.lines ?? [],
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
  const bookingDocumentsReference = cleanText(
    url.searchParams.get("bookingDocumentsReference") ?? undefined,
    100,
  );
  if (bookingDocumentsReference) {
    const { data: booking, error: bookingError } = await auth.serviceClient
      .from("bookings")
      .select("id,booking_reference,show_id,booking_status,payment_status,total_amount,amount_paid,balance_outstanding,archived_at")
      .eq("booking_reference", bookingDocumentsReference)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) {
      return Response.json(
        { error: "The booking could not be found." },
        { status: 404 },
      );
    }

    const { data: show, error: showError } = await auth.serviceClient
      .from("shows")
      .select("venue")
      .eq("id", booking.show_id)
      .single();
    if (showError || !show) {
      return Response.json(
        { error: "The booking performance could not be loaded." },
        { status: 404 },
      );
    }
    if (!venues.includes(show.venue)) {
      return Response.json(
        { error: "This venue is outside your access." },
        { status: 403 },
      );
    }

    const { data: documents, error: documentsError } = await auth.serviceClient
      .from("xero_documents")
      .select(
        "id,kind,local_reference,status,sync_status,total_cents,document_date,version,xero_document_number,xero_status,source_booking_reference,venue,created_at,updated_at",
      )
      .eq("source_booking_reference", booking.booking_reference)
      .or(`source_booking_id.eq.${booking.id},source_booking_id.is.null`)
      .in("kind", ["quote", "invoice"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100);
    if (documentsError) throw documentsError;

    return Response.json({
      canCreateBookingInvoice:
        canConvertQuote(auth, permissions) &&
        !booking.archived_at &&
        booking.booking_status === "confirmed" &&
        booking.payment_status === "fully_paid" &&
        Math.round(Number(booking.total_amount) * 100) > 0 &&
        Math.round(Number(booking.amount_paid) * 100) === Math.round(Number(booking.total_amount) * 100) &&
        Math.round(Number(booking.balance_outstanding) * 100) === 0 &&
        !(documents ?? []).some((document) => document.kind === "invoice"),
      documents: documents ?? [],
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
    const linkedInvoicePromise = document.kind === "quote"
      ? auth.serviceClient.from("xero_documents").select("id,local_reference,status,sync_status,xero_document_number,xero_status").eq("kind", "invoice").eq("source_quote_id", document.id).maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const [{ data: versions, error: versionsError }, { data: booking, error: bookingError }, { data: linkedInvoice, error: linkedInvoiceError }] = await Promise.all([versionsPromise, bookingPromise, linkedInvoicePromise]);
    if (versionsError) throw versionsError;
    if (bookingError) throw bookingError;
    if (linkedInvoiceError) throw linkedInvoiceError;
    return Response.json({
      bookingFinancials: booking ? {
        amountPaid: Number(booking.amount_paid) || 0,
        bookingReference: booking.booking_reference,
        bookingValue: Number(booking.total_amount) || 0,
        outstanding: Number(booking.balance_outstanding) || 0,
        paymentStatus: booking.payment_status,
      } : null,
      document,
      linkedInvoice,
      versions: versions ?? [],
    });
  }
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get("pageSize") ?? "20") || 20));
  const from = (page - 1) * pageSize;
  let query = auth.serviceClient
    .from("xero_documents")
    .select("id,kind,local_reference,source_booking_reference,venue,status,version,customer_name,document_date,valid_until,subtotal_cents,tax_cents,total_cents,xero_document_number,xero_status,sync_status,invoice_requested_at,invoice_requested_by_staff_profile_id,invoice_requested_version,created_at,updated_at", { count: "exact" })
    .in("venue", venues.length ? venues : ["__none__"])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);
  const venue = url.searchParams.get("venue");
  if (venue && venue !== "all") query = query.eq("venue", venue);
  const kind = url.searchParams.get("kind");
  if (kind === "quote" || kind === "invoice") query = query.eq("kind", kind);
  const status = url.searchParams.get("status");
  if (status === "invoice-requested") {
    query = query.eq("kind", "quote").eq("status", "accepted").not("invoice_requested_at", "is", null);
  } else if (status && ["draft", "revised", "accepted", "converted", "expired", "superseded"].includes(status)) {
    query = query.eq("status", status);
  }
  const search = cleanSearch(url.searchParams.get("search"));
  if (search) query = query.or(`local_reference.ilike.%${search}%,customer_name.ilike.%${search}%,source_booking_reference.ilike.%${search}%`);
  const [documentsResult, connectionResult, mappingResult, outboxResult] = await Promise.all([
    query,
    auth.serviceClient.from("xero_connections").select("tenant_name,status,sync_paused,live_sync_activated_at,last_sync_at").limit(1).maybeSingle(),
    permissions.includes("bookings:reconcile") || permissions.includes("settings:manage")
      ? auth.serviceClient.from("xero_account_mappings").select("venue,category,account_code,account_name,tax_code,tax_name,approved_at").order("venue").order("category")
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
    canConvertQuote: canConvertQuote(auth, permissions),
    canCreateInvoice: canCreateInvoice(auth, permissions),
    canCreateQuote: canCreateXeroQuote(permissions),
    canRequestInvoice: canCreateXeroQuote(permissions),
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
    if (input.sourceBookingId && input.sourceCorporateRequestId) throw new Error("Link the document to one source only.");
    await resolveSourceCorporateRequest(auth, input);
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
    if (validated.kind === "invoice" && input.sourceBookingId && !input.sourceCorporateRequestId) {
      if (!canConvertQuote(auth, permissions)) {
        return Response.json({ error: "Only Tristan or Rachelle can create a booking invoice draft." }, { status: 403 });
      }
      const { data: existingInvoice, error: existingInvoiceError } = await auth.serviceClient
        .from("xero_documents")
        .select("id")
        .eq("kind", "invoice")
        .eq("source_booking_id", input.sourceBookingId)
        .limit(1)
        .maybeSingle();
      if (existingInvoiceError) throw existingInvoiceError;
      if (existingInvoice) {
        return Response.json({ error: "An invoice already exists for this booking." }, { status: 409 });
      }
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
    if (error) {
      if (error.code === "23505" && validated.kind === "invoice" && input.sourceBookingId) {
        return Response.json({ error: "An invoice already exists for this booking." }, { status: 409 });
      }
      throw error;
    }
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
    const { data: current, error: currentError } = await auth.serviceClient.from("xero_documents").select("id,kind,venue,status,version,source_booking_id,source_booking_reference,source_corporate_request_id").eq("id", input.documentId).single();
    if (currentError || !current) return Response.json({ error: "The document could not be found." }, { status: 404 });
    if (!allowedVenues(auth.staffProfile.venue_scope).includes(current.venue)) return Response.json({ error: "This venue is outside your access." }, { status: 403 });
    if (!input.venue || !allowedVenues(auth.staffProfile.venue_scope).includes(input.venue)) return Response.json({ error: "This venue is outside your access." }, { status: 403 });
    await resolveSourceCorporateRequest(auth, input);
    await resolveSourceBooking(auth, input);
    if ((input.sourceBookingId ?? null) !== (current.source_booking_id ?? null) || cleanText(input.sourceBookingReference, 100) !== (current.source_booking_reference ?? "")) return Response.json({ error: "The linked booking cannot be changed on this draft." }, { status: 409 });
    if ((input.sourceCorporateRequestId ?? null) !== (current.source_corporate_request_id ?? null)) return Response.json({ error: "The linked Corporate enquiry cannot be changed on this draft." }, { status: 409 });
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
  const body = (await request.json()) as { action?: "accept" | "convert" | "queue" | "request-invoice" | "send"; acceptedBy?: string; evidence?: string; documentId?: string; version?: number };
  if (!body.documentId || !body.action) return Response.json({ error: "Choose a document action." }, { status: 400 });
  const { data: current, error } = await auth.serviceClient.from("xero_documents").select("*").eq("id", body.documentId).single();
  if (error || !current) return Response.json({ error: "The document could not be found." }, { status: 404 });
  if (!allowedVenues(auth.staffProfile.venue_scope).includes(current.venue)) return Response.json({ error: "This venue is outside your access." }, { status: 403 });
  if (body.version !== current.version) return Response.json({ error: "This document has changed. Refresh and try again." }, { status: 409 });

  if (body.action === "queue") {
    const authorisedConverter = canConvertQuote(auth, permissions);
    if (!authorisedConverter) return Response.json({ error: "Only Tristan or Rachelle can create an approved Xero invoice." }, { status: 403 });
    const { data: connection } = await auth.serviceClient.from("xero_connections").select("tenant_id,status,sync_paused,live_sync_activated_at").not("tenant_id", "is", null).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!connection?.tenant_id) return Response.json({ error: "Connect and choose the approved Xero organisation first." }, { status: 409 });
    try {
      const { data: sourceQuote, error: sourceQuoteError } = current.source_quote_id
        ? await auth.serviceClient.from("xero_documents").select("id,kind,status,accepted_version,invoice_requested_at,invoice_requested_version").eq("id", current.source_quote_id).maybeSingle()
        : { data: null, error: null };
      if (sourceQuoteError) throw sourceQuoteError;
      if (current.source_quote_id) {
        assertInitialInvoiceSyncEligibility({
          activationAt: connection.live_sync_activated_at,
          canConvertRequestedQuote: authorisedConverter,
          connectionStatus: connection.status,
          invoice: current,
          liveSyncAuthorised: process.env.XERO_LIVE_SYNC_AUTHORISED === "true",
          quote: sourceQuote,
          syncPaused: connection.sync_paused,
          webhookConfigured: Boolean(getXeroConfiguration().webhookKey),
        });
      } else {
        const { data: bulkItem, error: bulkItemError } = await auth.serviceClient
          .from("xero_bulk_invoice_items")
          .select("id,status")
          .eq("document_id", current.id)
          .in("status", ["draft_ready", "posting"])
          .maybeSingle();
        if (bulkItemError) throw bulkItemError;
        const { data: booking, error: bookingError } = current.source_booking_id
          ? await auth.serviceClient
              .from("bookings")
              .select("id,booking_status,payment_status,total_amount,amount_paid,balance_outstanding,archived_at")
              .eq("id", current.source_booking_id)
              .maybeSingle()
          : { data: null, error: null };
        if (bookingError) throw bookingError;
        const { data: payments, error: paymentsError } = current.source_booking_id
          ? await auth.serviceClient
              .from("payments")
              .select("amount,payment_status")
              .eq("booking_id", current.source_booking_id)
              .in("payment_status", ["deposit_paid", "fully_paid"])
          : { data: [], error: null };
        if (paymentsError) throw paymentsError;
        assertDirectBookingInvoiceSyncEligibility({
          activationAt: connection.live_sync_activated_at,
          allowOutstanding: Boolean(bulkItem),
          booking,
          canConvertRequestedQuote: authorisedConverter,
          connectionStatus: connection.status,
          invoice: current,
          liveSyncAuthorised: process.env.XERO_LIVE_SYNC_AUTHORISED === "true",
          syncPaused: connection.sync_paused,
          verifiedPaymentTotal: (payments ?? []).reduce((total, payment) => total + Number(payment.amount), 0),
          webhookConfigured: Boolean(getXeroConfiguration().webhookKey),
        });
      }
      documentMappingCategory(current as QueueableXeroDocument);
      const categories = [...new Set((current.lines as Array<{ mappingCategory?: string | null }>).map((line) => line.mappingCategory).filter((category): category is string => Boolean(category)))];
      if (categories.length !== current.lines.length && categories.length === 0) return Response.json({ error: "Choose an approved accounting category for every invoice line." }, { status: 409 });
      const { data: mappings } = await auth.serviceClient.from("xero_account_mappings").select("venue,category,account_code,tax_code,tax_rate,approved_at").eq("tenant_id", connection.tenant_id).eq("venue", current.venue).in("category", categories).not("approved_at", "is", null);
      const payload = buildXeroDocumentSyncPayload(current as QueueableXeroDocument, mappings ?? []);
      const sourceId = current.company_id ?? current.contact_customer_id;
      if (sourceId) {
        const sourceColumn = current.company_id ? "company_id" : "customer_id";
        const { data: contactMapping } = await auth.serviceClient.from("xero_contact_mappings").select("xero_contact_id").eq("tenant_id", connection.tenant_id).eq(sourceColumn, sourceId).eq("status", "active").maybeSingle();
        if (contactMapping?.xero_contact_id) Object.assign(payload, { existingContactId: contactMapping.xero_contact_id });
      }
      const idempotencyKey = `xero:${current.kind}:${current.id}:v${current.version}`;
      const status = "pending";
      const { error: queueError } = await auth.serviceClient.rpc("queue_xero_invoice_sync_atomic", {
        p_actor_auth_user_id: auth.user.id,
        p_actor_location_scope: auth.staffProfile.venue_scope ?? [],
        p_actor_name: auth.staffProfile.full_name,
        p_actor_role: roleName(auth),
        p_actor_staff_profile_id: auth.staffProfile.id,
        p_document_id: current.id,
        p_expected_version: current.version,
        p_idempotency_key: idempotencyKey,
        p_payload: payload,
        p_tenant_id: connection.tenant_id,
      });
      if (queueError) throw queueError;
      const worker = await runLiveXeroSyncWorker(auth.serviceClient, 1);
      return Response.json({ status, worker });
    } catch (queueError) {
      return Response.json({ error: queueError instanceof Error ? queueError.message : "The document could not be prepared for Xero." }, { status: 409 });
    }
  }

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

  if (body.action === "send") {
    if (!canCreateXeroQuote(permissions)) {
      return Response.json({ error: "Quote access is required to send a quotation." }, { status: 403 });
    }
    if (
      current.kind !== "quote" ||
      !["draft", "revised", "issued", "sent"].includes(current.status) ||
      current.accepted_at
    ) {
      return Response.json({ error: "This quotation cannot be sent." }, { status: 409 });
    }
    const recipient = current.customer_email?.trim();
    if (!recipient) return Response.json({ error: "Add a valid billing email before sending." }, { status: 409 });
    if (current.valid_until && current.valid_until < new Date().toISOString().slice(0, 10)) {
      return Response.json({ error: "This quotation has expired. Revise it before sending." }, { status: 409 });
    }
    const bankingDocument = await loadActiveBankingDocument(auth.serviceClient);
    if (!bankingDocument) {
      return Response.json({ error: "Accounts must approve a Confirmation of Banking Details PDF before this quotation can be sent." }, { status: 409 });
    }
    const { data: deliveryId, error: claimError } = await auth.serviceClient.rpc("claim_xero_quote_email_delivery", {
      p_document_id: current.id,
      p_expected_version: current.version,
      p_recipient: recipient,
    });
    if (claimError) throw claimError;
    if (!deliveryId) {
      return Response.json({ error: "This quotation version has already been sent." }, { status: 409 });
    }
    try {
      const token = createQuoteAcceptanceToken();
      const { data: acceptanceLinkId, error: linkError } = await auth.serviceClient.rpc("create_xero_quote_acceptance_link", {
        p_banking_document_id: bankingDocument.id,
        p_document_id: current.id,
        p_expected_version: current.version,
        p_expires_at: quoteAcceptanceExpiry(current.valid_until),
        p_token_hash: hashQuoteAcceptanceToken(token),
      });
      if (linkError || !acceptanceLinkId) throw linkError ?? new Error("The secure quotation link could not be created.");
      const acceptanceUrl = `/quote/${encodeURIComponent(token)}`;
      const subject = `Zingara quotation ${current.local_reference}`;
      const message = `Dear ${current.customer_name},\n\nYour Zingara quotation and our approved Confirmation of Banking Details are attached.\n\nQuotation: ${current.local_reference}\nTotal: ${new Intl.NumberFormat("en-ZA", { currency: "ZAR", style: "currency" }).format(Number(current.total_cents) / 100)}\n\nUse the secure button below to view and accept your quotation.\n\nKind regards,\nZingara`;
      const branded = await createBrandedCustomerEmail({
        ctaLabel: "VIEW & ACCEPT QUOTE",
        ctaUrl: acceptanceUrl,
        heading: "YOUR ZINGARA QUOTATION",
        includeAgePolicy: false,
        message,
        subject,
      });
      const bankingPdf = await downloadBankingDocument(auth.serviceClient, bankingDocument.storage_path);
      const pdf = createXeroDocumentPdf({
        accountNumber: current.account_number,
        billingAddress: current.billing_address,
        customerEmail: current.customer_email,
        customerName: current.customer_name,
        customerNotes: current.customer_notes,
        documentDate: current.document_date,
        guestCount: current.guest_count,
        kind: "quote",
        lineAmountType: current.line_amount_type,
        lines: current.lines,
        localReference: current.local_reference,
        paymentTerms: current.payment_terms,
        performanceDate: current.performance_date,
        performanceTime: current.performance_time,
        seatingSummary: current.seating_summary,
        sourceBookingReference: current.source_booking_reference,
        status: current.status,
        subtotalCents: current.subtotal_cents,
        taxCents: current.tax_cents,
        totalCents: current.total_cents,
        validUntil: current.valid_until,
        venue: current.venue,
        xeroDocumentNumber: current.xero_document_number,
      });
      const email = {
        attachments: [
          ...branded.attachments,
          {
            cid: `${current.local_reference}@book.zingara.co.za`,
            content: Buffer.from(pdf),
            contentDisposition: "attachment" as const,
            contentType: "application/pdf",
            filename: `${current.local_reference}.pdf`,
          },
          {
            cid: `banking-confirmation-v${bankingDocument.version}@book.zingara.co.za`,
            content: bankingPdf,
            contentDisposition: "attachment" as const,
            contentType: "application/pdf",
            filename: bankingDocument.original_filename,
          },
        ],
        html: branded.html,
        message: branded.message,
        subject,
        to: recipient,
      };
      const { error: evidenceError } = await auth.serviceClient.from("xero_quote_email_deliveries").update({ acceptance_link_id: acceptanceLinkId, banking_document_id: bankingDocument.id }).eq("id", deliveryId);
      if (evidenceError) throw evidenceError;
      const result = current.contact_customer_id
        ? await sendOperationalCustomerEmail({ ...email, customerId: current.contact_customer_id, kind: "booking_update" })
        : await sendZingaraEmail(email);
      const { error: completeError } = await auth.serviceClient.rpc("complete_xero_quote_email_delivery", {
        p_actor_auth_user_id: auth.user.id,
        p_actor_location_scope: auth.staffProfile.venue_scope,
        p_actor_name: auth.staffProfile.full_name,
        p_actor_role: roleName(auth),
        p_actor_staff_profile_id: auth.staffProfile.id,
        p_delivery_id: deliveryId,
        p_error_message: result.ok ? null : result.error,
        p_status: result.ok ? "sent" : "failed",
      });
      if (completeError) throw completeError;
      if (!result.ok) {
        return Response.json({ error: result.suppressed ? "Customer emails are paused for this contact." : "The quotation email could not be submitted." }, { status: 502 });
      }
      return Response.json({ providerAccepted: true });
    } catch (sendError) {
      await auth.serviceClient.rpc("complete_xero_quote_email_delivery", {
        p_actor_auth_user_id: auth.user.id,
        p_actor_location_scope: auth.staffProfile.venue_scope,
        p_actor_name: auth.staffProfile.full_name,
        p_actor_role: roleName(auth),
        p_actor_staff_profile_id: auth.staffProfile.id,
        p_delivery_id: deliveryId,
        p_error_message: sendError instanceof Error ? sendError.message : "Unknown quotation delivery failure",
        p_status: "failed",
      });
      throw sendError;
    }
  }

  if (body.action === "request-invoice") {
    if (!canCreateXeroQuote(permissions)) {
      return Response.json({ error: "Quote access is required to request an invoice." }, { status: 403 });
    }
    if (
      current.kind !== "quote" ||
      current.status !== "accepted" ||
      current.accepted_version !== current.version ||
      current.invoice_requested_at
    ) {
      return Response.json({ error: "This quotation is not eligible for a new invoice request." }, { status: 409 });
    }
    const { data, error: requestError } = await auth.serviceClient.rpc("request_xero_invoice_atomic", {
      p_actor_auth_user_id: auth.user.id,
      p_actor_location_scope: auth.staffProfile.venue_scope,
      p_actor_name: auth.staffProfile.full_name,
      p_actor_role: roleName(auth),
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_document_id: current.id,
      p_expected_version: current.version,
    });
    if (requestError) {
      return Response.json({ error: "This invoice request already exists or the quotation changed." }, { status: 409 });
    }
    return Response.json({ document: data });
  }

  if (current.kind !== "quote" || current.status !== "accepted" || current.accepted_version !== current.version) return Response.json({ error: "Only the accepted quote version can be converted." }, { status: 409 });
  if (!current.invoice_requested_at || current.invoice_requested_version !== current.accepted_version) return Response.json({ error: "Sales must request an invoice for the accepted quotation first." }, { status: 409 });
  if (!canConvertQuote(auth, permissions)) return Response.json({ error: "Only authorised Accounts staff can convert invoice requests." }, { status: 403 });
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
