import { calculateXeroDocumentTotals, type XeroDocumentLineInput, type XeroLineAmountType } from "@/lib/xero/documentMath";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";

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

function rolePermissions(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  if (!auth.staffProfile) return [];
  const role = Array.isArray(auth.staffProfile.roles) ? auth.staffProfile.roles[0] : auth.staffProfile.roles;
  return getRolePermissions(role);
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
  const lines = Array.isArray(input.lines) ? input.lines.slice(0, 100).map((line) => ({
    description: cleanText(line.description, 2_000),
    quantity: cleanText(line.quantity, 32),
    taxCode: line.taxCode ? cleanText(line.taxCode, 100) : null,
    taxRatePercent: line.taxRatePercent ? cleanText(line.taxRatePercent, 16) : null,
    unitPrice: cleanText(line.unitPrice, 32),
  })) : [];
  if (!customerName) throw new Error("Add a customer or Company name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.documentDate ?? "")) throw new Error("Choose a document date.");
  if (lines.length === 0) throw new Error("Add at least one line.");
  const totals = calculateXeroDocumentTotals(lines, lineAmountType);
  return { customerName, kind, lineAmountType, lines, totals };
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
    const { data: versions, error: versionsError } = await auth.serviceClient
      .from("xero_document_versions")
      .select("version,created_at,created_by_staff_profile_id")
      .eq("document_id", documentId)
      .order("version", { ascending: false });
    if (versionsError) throw versionsError;
    return Response.json({ document, versions: versions ?? [] });
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
    canCreateInvoice: permissions.includes("bookings:reconcile"),
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
    const validated = validateDocument(input);
    if (validated.kind === "quote" && !permissions.includes("bookings:manage")) {
      return Response.json({ error: "Booking management access is required for quotes." }, { status: 403 });
    }
    if (validated.kind === "invoice" && !permissions.includes("bookings:reconcile")) {
      return Response.json({ error: "Accounts approval is required for invoice drafts." }, { status: 403 });
    }
    const venue = input.venue ?? null;
    if (!venue || !allowedVenues(auth.staffProfile.venue_scope).includes(venue)) {
      return Response.json({ error: "This venue is outside your access." }, { status: 403 });
    }
    const row = {
      account_number: cleanText(input.accountNumber, 100) || null,
      billing_address: cleanText(input.billingAddress, 2_000) || null,
      company_id: input.companyId ?? null,
      contact_customer_id: input.contactCustomerId ?? null,
      created_by_staff_profile_id: auth.staffProfile.id,
      currency_code: "ZAR",
      customer_email: cleanText(input.customerEmail, 320) || null,
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
      status: "draft",
      subtotal_cents: validated.totals.subtotalCents,
      sync_status: "local_only",
      tax_cents: validated.totals.taxCents,
      total_cents: validated.totals.totalCents,
      updated_by_staff_profile_id: auth.staffProfile.id,
      valid_until: input.validUntil || null,
      venue,
    };
    const actorRole = Array.isArray(auth.staffProfile.roles)
      ? auth.staffProfile.roles[0]?.name
      : auth.staffProfile.roles?.name;
    const { data, error } = await auth.serviceClient.rpc("create_xero_document_draft_atomic", {
      p_actor_auth_user_id: auth.user.id,
      p_actor_location_scope: auth.staffProfile.venue_scope,
      p_actor_name: auth.staffProfile.full_name,
      p_actor_role: actorRole ?? "Staff",
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

export async function PATCH(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  const permissions = rolePermissions(auth);
  if (!permissions.includes("bookings:manage") && !permissions.includes("bookings:reconcile")) {
    return Response.json({ error: "Quote or Accounts access is required." }, { status: 403 });
  }
  const body = (await request.json()) as { action?: "accept" | "convert"; acceptedBy?: string; evidence?: string; documentId?: string; version?: number };
  if (!body.documentId || !body.action) return Response.json({ error: "Choose a document action." }, { status: 400 });
  const { data: current, error } = await auth.serviceClient.from("xero_documents").select("*").eq("id", body.documentId).single();
  if (error || !current) return Response.json({ error: "The document could not be found." }, { status: 404 });
  if (!allowedVenues(auth.staffProfile.venue_scope).includes(current.venue)) return Response.json({ error: "This venue is outside your access." }, { status: 403 });
  if (body.version !== current.version) return Response.json({ error: "This document has changed. Refresh and try again." }, { status: 409 });

  if (body.action === "accept") {
    if (current.kind !== "quote" || !["draft", "revised", "issued", "sent"].includes(current.status)) return Response.json({ error: "This quote cannot be accepted." }, { status: 409 });
    const acceptedBy = cleanText(body.acceptedBy, 200);
    const evidence = cleanText(body.evidence, 2_000);
    if (!acceptedBy || !evidence) return Response.json({ error: "Record who accepted and the acceptance evidence." }, { status: 400 });
    const actorRole = Array.isArray(auth.staffProfile.roles) ? auth.staffProfile.roles[0]?.name : auth.staffProfile.roles?.name;
    const { data, error: updateError } = await auth.serviceClient.rpc("accept_xero_quote_atomic", {
      p_accepted_by: acceptedBy,
      p_actor_auth_user_id: auth.user.id,
      p_actor_location_scope: auth.staffProfile.venue_scope,
      p_actor_name: auth.staffProfile.full_name,
      p_actor_role: actorRole ?? "Staff",
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_document_id: current.id,
      p_evidence: evidence,
      p_expected_version: current.version,
    });
    if (updateError) return Response.json({ error: "This quote has already changed or been accepted." }, { status: 409 });
    return Response.json({ document: data });
  }

  if (current.kind !== "quote" || current.status !== "accepted" || current.accepted_version !== current.version) return Response.json({ error: "Only the accepted quote version can be converted." }, { status: 409 });
  const actorRole = Array.isArray(auth.staffProfile.roles) ? auth.staffProfile.roles[0]?.name : auth.staffProfile.roles?.name;
  const { data, error: insertError } = await auth.serviceClient.rpc("convert_xero_quote_to_invoice_draft_atomic", {
    p_actor_auth_user_id: auth.user.id,
    p_actor_location_scope: auth.staffProfile.venue_scope,
    p_actor_name: auth.staffProfile.full_name,
    p_actor_role: actorRole ?? "Staff",
    p_actor_staff_profile_id: auth.staffProfile.id,
    p_document_id: current.id,
    p_expected_version: current.version,
  });
  if (insertError) return Response.json({ error: "An invoice draft already exists or the quote changed." }, { status: 409 });
  return Response.json({ document: data });
}
