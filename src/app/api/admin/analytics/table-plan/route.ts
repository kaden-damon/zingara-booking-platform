import {
  buildTablePlanWorkbook,
  type TablePlanBooking,
  type TablePlanCustomer,
  type TablePlanPayment,
  type TablePlanShow,
  type TablePlanTable,
} from "@/lib/exports/tablePlan";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { normalizeShowLocation } from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ShowRow = TablePlanShow & {
  notes: string | null;
};

function getRole(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

function hasLocationAccess(venueScope: string[], location: "cape-town" | "johannesburg") {
  const normalizedScope = normalizeStaffVenueScope(venueScope);

  return normalizedScope.includes("all") || normalizedScope.includes(location);
}

function getFileLocation(location: "cape-town" | "johannesburg") {
  return location === "johannesburg" ? "JHB" : "CPT";
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!getRolePermissions(getRole(auth.staffProfile)).includes("analytics:read")) {
    return Response.json(
      { error: "You do not have permission to export table plans." },
      { status: 403 },
    );
  }

  const requestedShowId = new URL(request.url).searchParams.get("showId")?.trim();

  if (!requestedShowId) {
    return Response.json({ error: "A performance is required." }, { status: 400 });
  }

  try {
    const { data: show, error: showError } = await auth.serviceClient
      .from("shows")
      .select("id,name,date,time,venue,notes")
      .eq("id", requestedShowId)
      .maybeSingle();

    if (showError) {
      throw showError;
    }

    if (!show) {
      return Response.json({ error: "The selected performance was not found." }, { status: 404 });
    }

    const typedShow = show as ShowRow;
    const location = normalizeShowLocation(typedShow.venue);

    if (!location) {
      return Response.json(
        { error: "The selected performance has an unsupported location." },
        { status: 422 },
      );
    }

    if (!hasLocationAccess(auth.staffProfile.venue_scope, location)) {
      return Response.json(
        { error: "You do not have access to this performance location." },
        { status: 403 },
      );
    }

    const [{ data: tableRows, error: tableError }, { data: bookingRows, error: bookingError }] =
      await Promise.all([
        auth.serviceClient
          .from("show_tables")
          .select(
            "id,table_code,section,capacity,status,booking_id,is_override,availability_scope,merged_from,merged_parent_id,override_notes",
          )
          .eq("show_id", typedShow.id)
          .order("section", { ascending: true })
          .order("table_code", { ascending: true }),
        auth.serviceClient
          .from("bookings")
          .select(
            "id,customer_id,table_id,booking_reference,guest_count,booking_status,payment_status,section,total_amount,amount_paid,balance_outstanding,notes,dietary_requirements,archived_at",
          )
          .eq("show_id", typedShow.id)
          .not("table_id", "is", null),
      ]);

    if (tableError) {
      throw tableError;
    }

    if (bookingError) {
      throw bookingError;
    }

    const bookings = (bookingRows ?? []) as TablePlanBooking[];
    const customerIds = Array.from(
      new Set(bookings.map((booking) => booking.customer_id).filter(Boolean)),
    ) as string[];
    const bookingIds = bookings.map((booking) => booking.id);

    const customerRequest = customerIds.length
      ? auth.serviceClient
          .from("customers")
          .select(
            "id,first_name,surname,email,mobile,relationship_notes,dietary_requirements",
          )
          .in("id", customerIds)
      : Promise.resolve({ data: [], error: null });
    const paymentRequest = bookingIds.length
      ? auth.serviceClient
          .from("payments")
          .select("booking_id,payment_type,payment_status,amount,method,notes")
          .in("booking_id", bookingIds)
      : Promise.resolve({ data: [], error: null });
    const [customerResult, paymentResult] = await Promise.all([
      customerRequest,
      paymentRequest,
    ]);

    if (customerResult.error) {
      throw customerResult.error;
    }

    if (paymentResult.error) {
      throw paymentResult.error;
    }

    const workbook = await buildTablePlanWorkbook({
      bookings,
      customers: (customerResult.data ?? []) as TablePlanCustomer[],
      payments: (paymentResult.data ?? []) as TablePlanPayment[],
      show: typedShow,
      tables: (tableRows ?? []) as TablePlanTable[],
    });
    const filename = `Zingara_Table_Plan_${getFileLocation(location)}_${typedShow.date}.xlsx`;

    return new Response(new Uint8Array(workbook), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    console.error("[Zingara table plan export] Export failed", error);

    return Response.json(
      { error: "The table plan could not be generated." },
      { status: 500 },
    );
  }
}
