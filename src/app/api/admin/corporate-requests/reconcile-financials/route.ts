import {
  getImportedCorporateProvenance,
  validateImportedCorporateFinancialDraft,
} from "@/lib/corporateFinancialReconciliation";
import { normalizeShowLocation } from "@/lib/zingaraDemo";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { rolePermissions } from "@/lib/zingaraAccess";
import {
  loadCorporateRequestRecord,
} from "@/lib/supabase/corporateRequestsServer";
import {
  getAdminRoleFromName,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

function getSafeReconciliationError(message: string) {
  if (message.includes("CORPORATE_RECONCILIATION_STALE")) {
    return "This enquiry changed while you were reviewing it. Refresh and review the current evidence before saving.";
  }
  if (message.includes("PAID_EXCEEDS_TOTAL")) {
    return "Amount paid cannot exceed the reconciled total obligation.";
  }
  if (message.includes("NOT_RECONCILABLE")) {
    return "This enquiry is no longer eligible for financial reconciliation.";
  }

  return "Historical financial reconciliation could not be saved.";
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return auth.error;
  }

  const roleRow = Array.isArray(auth.staffProfile.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile.roles;
  const role = getAdminRoleFromName(roleRow?.name);

  if (!role || !rolePermissions[role].includes("bookings:reconcile")) {
    return Response.json(
      { error: "Booking financial reconciliation access is required." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    additionalAmount?: unknown;
    amountPaid?: unknown;
    expectedUpdatedAt?: unknown;
    gratuityAmount?: unknown;
    notes?: unknown;
    paymentMethod?: unknown;
    requestId?: unknown;
    ticketObligation?: unknown;
  };
  const requestId = String(body.requestId ?? "").trim();
  const expectedUpdatedAt = String(body.expectedUpdatedAt ?? "").trim();
  const draft = {
    additionalAmount: String(body.additionalAmount ?? ""),
    amountPaid: String(body.amountPaid ?? ""),
    gratuityAmount: String(body.gratuityAmount ?? ""),
    notes: String(body.notes ?? ""),
    paymentMethod: String(body.paymentMethod ?? "UNKNOWN") as
      | "CC"
      | "COMP"
      | "EFT"
      | "UNKNOWN",
    ticketObligation: String(body.ticketObligation ?? ""),
  };
  const errors = validateImportedCorporateFinancialDraft(draft);

  if (!requestId || !expectedUpdatedAt || Object.keys(errors).length > 0) {
    return Response.json(
      { error: "Complete the authoritative historical financial evidence." },
      { status: 400 },
    );
  }

  const record = await loadCorporateRequestRecord(auth.serviceClient, requestId);

  if (!record || record.row.id !== requestId) {
    return Response.json({ error: "Corporate enquiry was not found." }, { status: 404 });
  }

  const provenance = getImportedCorporateProvenance(record.request);
  const sourceLocation =
    normalizeShowLocation(record.request.locationAcknowledgement) ??
    (provenance?.sourceFile.toLowerCase().includes("cape town")
      ? "cape-town"
      : /johannesburg|\bjhb\b/i.test(provenance?.sourceFile ?? "")
        ? "johannesburg"
        : null);
  const venueScope = normalizeStaffVenueScope(
    auth.staffProfile.venue_scope ?? [],
  );

  if (
    (!sourceLocation && !venueScope.includes("all")) ||
    (sourceLocation !== null &&
      !venueScope.includes("all") &&
      !venueScope.includes(sourceLocation))
  ) {
    return Response.json(
      { error: "This Corporate enquiry is outside your assigned location." },
      { status: 403 },
    );
  }

  try {
    const { error } = await auth.serviceClient.rpc(
      "reconcile_imported_corporate_financials",
      {
        p_actor_auth_user_id: auth.user.id,
        p_actor_location_scope: auth.staffProfile.venue_scope ?? [],
        p_actor_name: auth.staffProfile.full_name ?? auth.user.email ?? "Staff",
        p_actor_role: role,
        p_actor_staff_profile_id: auth.staffProfile.id,
        p_additional_amount: Number(draft.additionalAmount || "0"),
        p_amount_paid: Number(draft.amountPaid),
        p_expected_updated_at: expectedUpdatedAt,
        p_gratuity_amount: Number(draft.gratuityAmount || "0"),
        p_notes: draft.notes.trim(),
        p_payment_method: draft.paymentMethod,
        p_request_id: requestId,
        p_request_trace_id:
          request.headers.get("x-vercel-id") ??
          request.headers.get("x-request-id") ??
          crypto.randomUUID(),
        p_ticket_obligation: Number(draft.ticketObligation),
      },
    );

    if (error) throw error;

    const updated = await loadCorporateRequestRecord(auth.serviceClient, requestId);

    if (!updated?.request.financialReconciliation) {
      throw new Error("CORPORATE_RECONCILIATION_NOT_PERSISTED");
    }

    return Response.json({ request: updated.request });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: getSafeReconciliationError(message) },
      { status: message.includes("STALE") ? 409 : 400 },
    );
  }
}
