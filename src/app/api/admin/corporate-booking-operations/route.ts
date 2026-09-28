import { getActorRoleLabel } from "@/lib/auditTrail";
import { normalizeCorporateBookingOperations, type CorporateOperationsDocument } from "@/lib/corporateBookingOperations";
import { buildCorporateOperationsPdf, loadCorporateOperationsContext } from "@/lib/corporateBookingOperationsServer";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { getAdminRoleFromName, getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { normalizeShowLocation } from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

async function authorize(request: Request, requireWrite = false) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return { auth, error: auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  const roleRow = Array.isArray(auth.staffProfile.roles) ? auth.staffProfile.roles[0] : auth.staffProfile.roles;
  const permissions = getRolePermissions(roleRow);
  if (!permissions.includes("bookings:manage") || (requireWrite && !permissions.includes("bookings:manage"))) {
    return { auth, error: Response.json({ error: "Booking management access is required." }, { status: 403 }) };
  }
  return { auth, error: null };
}

async function loadScopedContext(request: Request, requireWrite = false) {
  const { auth, error } = await authorize(request, requireWrite);
  if (error || !auth.serviceClient || !auth.staffProfile) return { auth, context: null, error };
  const url = new URL(request.url);
  const reference = url.searchParams.get("reference")?.trim().toUpperCase() ?? "";
  if (!reference) return { auth, context: null, error: Response.json({ error: "Booking reference is required." }, { status: 400 }) };
  try {
    const context = await loadCorporateOperationsContext(auth.serviceClient, reference);
    if (!context) return { auth, context: null, error: Response.json({ error: "Booking could not be resolved." }, { status: 404 }) };
    const location = normalizeShowLocation(context.location);
    const scope = normalizeStaffVenueScope(auth.staffProfile.venue_scope ?? []);
    if (!location || (!scope.includes("all") && !scope.includes(location))) {
      return { auth, context: null, error: Response.json({ error: "This booking is outside your assigned location." }, { status: 403 }) };
    }
    return { auth, context, error: null };
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_CORPORATE_BOOKING") {
      return { auth, context: null, error: Response.json({ error: "Function and event details are available for Corporate bookings only." }, { status: 409 }) };
    }
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    const { context, error } = await loadScopedContext(request);
    if (error || !context) {
      return error ?? Response.json({ error: "Corporate function details could not be loaded." }, { status: 500 });
    }
    const document = new URL(request.url).searchParams.get("document") as CorporateOperationsDocument | null;
    if (document) {
      if (!["function-brief", "bar-brief", "checklist"].includes(document)) {
        return Response.json({ error: "Unknown Corporate document." }, { status: 400 });
      }
      const pdf = buildCorporateOperationsPdf(document, context);
      const filename = `${context.snapshot.bookingReference}_${document.replaceAll("-", "_")}.pdf`;
      return new Response(pdf, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Type": "application/pdf",
        },
      });
    }
    return Response.json({ operations: context.operations, snapshot: context.snapshot });
  } catch (error) {
    console.error("[Zingara API] Failed to load Corporate operations", error);
    return Response.json({ error: "Corporate function details could not be loaded." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { auth, context, error } = await loadScopedContext(request, true);
    if (error || !context || !auth.serviceClient || !auth.staffProfile || !auth.user) {
      return error ?? Response.json({ error: "Corporate function details could not be saved." }, { status: 500 });
    }
    const body = await request.json().catch(() => ({})) as { operations?: unknown };
    const operations = normalizeCorporateBookingOperations(body.operations);
    if (operations.revision !== context.operations.revision) {
      return Response.json({ code: "OPERATIONS_CHANGED", error: "These details changed after you opened them. Reload and review the latest version." }, { status: 409 });
    }
    const roleRow = Array.isArray(auth.staffProfile.roles) ? auth.staffProfile.roles[0] : auth.staffProfile.roles;
    const role = getAdminRoleFromName(roleRow?.name);
    const { error: saveError } = await auth.serviceClient.rpc("save_corporate_booking_operations_atomic", {
      p_actor_auth_user_id: auth.user.id,
      p_actor_location_scope: auth.staffProfile.venue_scope ?? [],
      p_actor_name: auth.staffProfile.full_name ?? auth.user.email,
      p_actor_role: getActorRoleLabel(role),
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_booking_reference: context.snapshot.bookingReference,
      p_expected_revision: operations.revision,
      p_payload: operations,
      p_request_id: request.headers.get("x-vercel-id") ?? request.headers.get("x-request-id") ?? crypto.randomUUID(),
      p_user_agent: request.headers.get("user-agent"),
    });
    if (saveError) {
      if (saveError.message.includes("OPERATIONS_CHANGED")) {
        return Response.json({ code: "OPERATIONS_CHANGED", error: "These details changed after you opened them. Reload and review the latest version." }, { status: 409 });
      }
      throw saveError;
    }
    const updated = await loadCorporateOperationsContext(auth.serviceClient, context.snapshot.bookingReference);
    return Response.json({ operations: updated?.operations, snapshot: updated?.snapshot });
  } catch (error) {
    console.error("[Zingara API] Failed to save Corporate operations", error);
    return Response.json({ error: "Corporate function details could not be saved. No booking data was changed." }, { status: 500 });
  }
}
