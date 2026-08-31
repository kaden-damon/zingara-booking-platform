import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  type BookingLifecycleEvent,
  type BookingStatus,
  type DemoBooking,
} from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient) {
    return auth.error;
  }

  const { data, error } = await auth.serviceClient
    .from("booking_lifecycle_events")
    .select("id,booking_id,from_status,to_status,note,reason,changed_by,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Zingara API] Failed to load lifecycle events", error);

    return Response.json(
      { error: "Lifecycle events could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({ rows: data ?? [] });
}

type SupabaseBookingStatus =
  | "cancelled"
  | "checked_in"
  | "completed"
  | "confirmed"
  | "new"
  | "no_show"
  | "pending_payment"
  | "refunded"
  | "waitlisted";

function toSupabaseBookingStatus(status: BookingStatus): SupabaseBookingStatus {
  if (status === "pending-payment" || status === "pending") {
    return "pending_payment";
  }

  if (status === "checked-in") {
    return "checked_in";
  }

  if (status === "no-show") {
    return "no_show";
  }

  return status;
}

function toLifecyclePayload(event: BookingLifecycleEvent, bookingId: string) {
  return {
    booking_id: bookingId,
    created_at: event.createdAt,
    from_status: event.fromStatus
      ? toSupabaseBookingStatus(event.fromStatus)
      : null,
    note: event.note ?? null,
    reason: null,
    to_status: toSupabaseBookingStatus(event.toStatus),
  };
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  const role = Array.isArray(auth.staffProfile.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile.roles;

  if (!getRolePermissions(role).includes("bookings:manage")) {
    return Response.json(
      { error: "Booking management access is required." },
      { status: 403 },
    );
  }

  const supabase = auth.serviceClient;

  try {
    const body = (await request.json()) as {
      booking?: DemoBooking;
      event?: BookingLifecycleEvent;
    };

    if (!body.booking || !body.event) {
      return Response.json(
        { error: "Booking and lifecycle event are required." },
        { status: 400 },
      );
    }

    const { data: bookingRows, error: bookingError } = await supabase
      .from("bookings")
      .select("id")
      .eq("booking_reference", body.booking.reference)
      .limit(1);

    if (bookingError) {
      throw bookingError;
    }

    const bookingId = (bookingRows?.[0] as { id?: string } | undefined)?.id;

    if (!bookingId) {
      return Response.json(
        { error: "Booking could not be resolved for lifecycle event." },
        { status: 404 },
      );
    }

    const { data, error } = await supabase
      .from("booking_lifecycle_events")
      .insert(toLifecyclePayload(body.event, bookingId))
      .select(
        "id,booking_id,from_status,to_status,note,reason,changed_by,created_at",
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    return Response.json({ row: data });
  } catch (error) {
    console.error("[Zingara API] Failed to create lifecycle event", error);

    return Response.json(
      { error: "Lifecycle event could not be created." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  return POST(request);
}
