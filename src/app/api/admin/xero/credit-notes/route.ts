import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { canCreateXeroInvoice } from "@/lib/xero/access";
import {
  buildCreditNoteLines,
  canManageXeroCreditNotes,
  isCreditNotePostingAuthorised,
  remainingCreditCents,
  type CreditLineSelection,
} from "@/lib/xero/creditNotes";
import type { XeroCalculatedLine, XeroLineAmountType } from "@/lib/xero/documentMath";

export const dynamic = "force-dynamic";

function role(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  return Array.isArray(auth.staffProfile?.roles)
    ? auth.staffProfile?.roles[0]
    : auth.staffProfile?.roles;
}

function canManage(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  const currentRole = role(auth);
  const permissions = getRolePermissions(currentRole);
  return canManageXeroCreditNotes(
    auth.staffProfile,
    canCreateXeroInvoice({ permissions, roleName: currentRole?.name ?? "Staff" }),
  );
}

function allowedVenues(scope: string[]) {
  const normalized = normalizeStaffVenueScope(scope ?? []);
  return normalized.includes("all")
    ? ["cape-town", "johannesburg"]
    : normalized.filter((venue) => venue === "cape-town" || venue === "johannesburg");
}

function safeUuid(value: string | null) {
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!canManage(auth)) return Response.json({ error: "Only Tristan or Rachelle can manage credit notes." }, { status: 403 });

  const bookingReference = new URL(request.url).searchParams.get("bookingReference")?.trim().slice(0, 100);
  if (!bookingReference) {
    const { data, error } = await auth.serviceClient
      .from("xero_credit_notes")
      .select("id,local_reference,source_booking_reference,reason,status,total_cents,xero_credit_note_number,xero_status,sync_status,created_at")
      .in("venue", allowedVenues(auth.staffProfile.venue_scope))
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw error;
    return Response.json({ creditNotes: data ?? [], postingAuthorised: isCreditNotePostingAuthorised() });
  }
  const { data: booking, error: bookingError } = await auth.serviceClient
    .from("bookings")
    .select("id,booking_reference,show_id,total_amount,amount_paid,balance_outstanding,payment_status,booking_status")
    .eq("booking_reference", bookingReference)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) return Response.json({ error: "The booking could not be found." }, { status: 404 });
  const { data: show, error: showError } = await auth.serviceClient.from("shows").select("venue").eq("id", booking.show_id).single();
  if (showError || !show) return Response.json({ error: "The booking performance could not be loaded." }, { status: 404 });
  if (!allowedVenues(auth.staffProfile.venue_scope).includes(show.venue)) return Response.json({ error: "This venue is outside your access." }, { status: 403 });

  const [invoicesResult, creditsResult, refundsResult, paymentsResult] = await Promise.all([
    auth.serviceClient.from("xero_documents").select("id,local_reference,xero_document_id,xero_document_number,xero_status,status,sync_status,line_amount_type,lines,subtotal_cents,tax_cents,total_cents,customer_name,source_booking_reference,venue").eq("kind", "invoice").eq("source_booking_id", booking.id).order("created_at", { ascending: false }).limit(20),
    auth.serviceClient.from("xero_credit_notes").select("id,local_reference,original_invoice_document_id,refund_id,reason,status,version,subtotal_cents,tax_cents,total_cents,xero_credit_note_id,xero_credit_note_number,xero_status,sync_status,reconciled_at,created_at,updated_at").eq("source_booking_id", booking.id).order("created_at", { ascending: false }).limit(100),
    auth.serviceClient.from("payment_refunds").select("id,payment_id,provider,provider_refund_id,refund_amount,refund_type,refund_reason,refund_status,requested_at,completed_at").eq("booking_id", booking.id).order("requested_at", { ascending: false }).limit(100),
    auth.serviceClient.from("payments").select("id,amount,payment_method,payment_status,transaction_id,paid_at,created_at").eq("booking_id", booking.id).order("created_at", { ascending: false }).limit(100),
  ]);
  for (const result of [invoicesResult, creditsResult, refundsResult, paymentsResult]) {
    if (result.error) throw result.error;
  }
  const credits = creditsResult.data ?? [];
  const invoices = (invoicesResult.data ?? []).map((invoice) => {
    const previouslyCreditedCents = credits
      .filter((credit) => credit.original_invoice_document_id === invoice.id && credit.status !== "voided")
      .reduce((total, credit) => total + Number(credit.total_cents), 0);
    return {
      ...invoice,
      creditable: Boolean(invoice.xero_document_id) && !["deleted", "voided"].includes(String(invoice.xero_status ?? "").toLowerCase()),
      previouslyCreditedCents,
      remainingCreditCents: remainingCreditCents(Number(invoice.total_cents), previouslyCreditedCents),
    };
  });
  return Response.json({
    booking,
    canCreate: true,
    credits,
    invoices,
    payments: paymentsResult.data ?? [],
    postingAuthorised: isCreditNotePostingAuthorised(),
    refunds: refundsResult.data ?? [],
  });
}

type CreateInput = {
  idempotencyKey?: string;
  invoiceId?: string;
  reason?: string;
  refundId?: string | null;
  selections?: CreditLineSelection[];
};

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  if (!canManage(auth)) return Response.json({ error: "Only Tristan or Rachelle can create credit-note drafts." }, { status: 403 });
  try {
    const input = (await request.json()) as CreateInput;
    const invoiceId = safeUuid(input.invoiceId ?? null);
    const idempotencyKey = safeUuid(input.idempotencyKey ?? null);
    const refundId = input.refundId ? safeUuid(input.refundId) : null;
    const reason = input.reason?.trim() ?? "";
    if (!invoiceId || !idempotencyKey) throw new Error("Refresh the booking and try again.");
    if (input.refundId && !refundId) throw new Error("Choose valid refund evidence.");
    if (reason.length < 3 || reason.length > 1000) throw new Error("Add a reason between 3 and 1,000 characters.");
    const { data: invoice, error: invoiceError } = await auth.serviceClient.from("xero_documents").select("id,kind,venue,xero_document_id,xero_status,line_amount_type,lines,total_cents").eq("id", invoiceId).single();
    if (invoiceError || !invoice || invoice.kind !== "invoice") return Response.json({ error: "The original invoice could not be found." }, { status: 404 });
    if (!allowedVenues(auth.staffProfile.venue_scope).includes(invoice.venue)) return Response.json({ error: "This venue is outside your access." }, { status: 403 });
    if (!invoice.xero_document_id || ["deleted", "voided"].includes(String(invoice.xero_status ?? "").toLowerCase())) return Response.json({ error: "Only an existing active Xero invoice can be credited." }, { status: 409 });
    const totals = buildCreditNoteLines({
      amountType: invoice.line_amount_type as XeroLineAmountType,
      invoiceLines: invoice.lines as XeroCalculatedLine[],
      selections: Array.isArray(input.selections) ? input.selections : [],
    });
    const { data, error } = await auth.serviceClient.rpc("create_xero_credit_note_draft_atomic", {
      p_actor_auth_user_id: auth.user.id,
      p_actor_location_scope: auth.staffProfile.venue_scope,
      p_actor_name: auth.staffProfile.full_name,
      p_actor_role: role(auth)?.name ?? "Staff",
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_idempotency_key: idempotencyKey,
      p_line_amount_type: invoice.line_amount_type,
      p_lines: totals.lines,
      p_original_invoice_document_id: invoice.id,
      p_reason: reason,
      p_refund_id: refundId,
      p_subtotal_cents: totals.subtotalCents,
      p_tax_cents: totals.taxCents,
      p_total_cents: totals.totalCents,
    });
    if (error) {
      const message = error.message.includes("XERO_CREDIT_EXCEEDS_REMAINING_VALUE")
        ? "This credit exceeds the remaining invoice value. Refresh and review existing credits."
        : error.message.includes("XERO_REFUND_EVIDENCE_INVALID")
          ? "The selected refund is not valid evidence for this invoice."
          : "The credit-note draft could not be saved.";
      return Response.json({ error: message }, { status: 409 });
    }
    return Response.json({ creditNote: data }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The credit-note draft could not be saved." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!canManage(auth)) return Response.json({ error: "Only Tristan or Rachelle can submit credit notes." }, { status: 403 });
  const body = (await request.json()) as { action?: string; creditNoteId?: string };
  if (body.action !== "create-in-xero" || !safeUuid(body.creditNoteId ?? null)) return Response.json({ error: "Choose a credit note." }, { status: 400 });
  if (!isCreditNotePostingAuthorised()) {
    return Response.json({ error: "Live Xero credit-note posting is awaiting accounting approval." }, { status: 409 });
  }
  return Response.json({ error: "Live Xero credit-note posting is not enabled in this release." }, { status: 409 });
}
