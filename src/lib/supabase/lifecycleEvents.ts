import {
  type BookingLifecycleEvent,
  type BookingStatus,
  type DemoBooking,
  getStoredDemoBookings,
} from "@/lib/zingaraDemo";
import { getSupabaseClient } from "./client";
import { fetchSupabaseApi } from "./apiClient";

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

type SupabaseLifecycleEventRow = {
  booking_id: string;
  changed_by: string | null;
  created_at: string;
  from_status: SupabaseBookingStatus | null;
  id: string;
  note: string | null;
  reason: string | null;
  to_status: SupabaseBookingStatus;
};

type SupabaseBookingRelationRow = {
  id: string;
};

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

function toDemoBookingStatus(status: SupabaseBookingStatus): BookingStatus {
  if (status === "pending_payment") {
    return "pending-payment";
  }

  if (status === "checked_in") {
    return "checked-in";
  }

  if (status === "no_show") {
    return "no-show";
  }

  return status;
}

function getFallbackLifecycleEvents(): BookingLifecycleEvent[] {
  return getStoredDemoBookings().flatMap(
    (booking) => (booking.lifecycleHistory ?? []) as BookingLifecycleEvent[],
  );
}

function toLifecycleEvent(row: SupabaseLifecycleEventRow): BookingLifecycleEvent {
  return {
    createdAt: row.created_at,
    fromStatus: row.from_status
      ? toDemoBookingStatus(row.from_status)
      : undefined,
    id: row.id,
    note: row.note ?? row.reason ?? undefined,
    toStatus: toDemoBookingStatus(row.to_status),
  };
}

function toLifecyclePayload(
  event: BookingLifecycleEvent,
  bookingId: string,
) {
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

function isSameLifecycleEvent(
  row: SupabaseLifecycleEventRow,
  payload: ReturnType<typeof toLifecyclePayload>,
) {
  return (
    row.booking_id === payload.booking_id &&
    row.created_at === payload.created_at &&
    row.from_status === payload.from_status &&
    row.note === payload.note &&
    row.to_status === payload.to_status
  );
}

async function getBookingRelation(reference: string) {
  try {
    const payload = await fetchSupabaseApi<{
      rows: SupabaseBookingRelationRow[];
    }>(`/api/admin/bookings?reference=${encodeURIComponent(reference)}`);

    return payload.rows[0] ?? null;
  } catch (error) {
    console.error(
      "[Zingara Supabase] Failed to resolve lifecycle booking",
      error,
    );
    return undefined;
  }
}

async function getLifecycleEventRows() {
  try {
    const payload = await fetchSupabaseApi<{
      rows: SupabaseLifecycleEventRow[];
    }>("/api/admin/booking-lifecycle-events");

    return payload.rows ?? [];
  } catch (error) {
    console.error("[Zingara Supabase] Failed to load lifecycle events", error);
    return null;
  }
}

export async function getLifecycleEvents() {
  const rows = await getLifecycleEventRows();

  if (!rows) {
    return getFallbackLifecycleEvents();
  }

  if (rows.length === 0) {
    return getFallbackLifecycleEvents();
  }

  return rows.map(toLifecycleEvent);
}

export async function getLifecycleEventsForBooking(booking: DemoBooking) {
  const bookingRelation = await getBookingRelation(booking.reference);

  if (!bookingRelation) {
    return booking.lifecycleHistory ?? [];
  }

  const rows = await getLifecycleEventRows();

  if (!rows) {
    return booking.lifecycleHistory ?? [];
  }

  const supabaseRows = rows.filter((row) => row.booking_id === bookingRelation.id);
  const supabaseEvents = supabaseRows.map(toLifecycleEvent);

  return [
    ...supabaseEvents,
    ...(booking.lifecycleHistory ?? []).filter((event) => {
      const bookingId = bookingRelation.id;
      const payload = toLifecyclePayload(event, bookingId);

      return !supabaseRows.some((row) => isSameLifecycleEvent(row, payload));
    }),
  ].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() -
      new Date(left.createdAt).getTime(),
  );
}

export async function createLifecycleEvent(
  booking: DemoBooking,
  event: BookingLifecycleEvent,
) {
  try {
    const payload = await fetchSupabaseApi<{
      row: SupabaseLifecycleEventRow | null;
    }>("/api/admin/booking-lifecycle-events", {
      body: {
        booking,
        event,
      },
      method: "POST",
    });

    return payload.row
      ? toLifecycleEvent(payload.row as SupabaseLifecycleEventRow)
      : event;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to create lifecycle event", error);
    return event;
  }
}

export async function syncBookingLifecycleEvents(booking: DemoBooking) {
  const supabase = getSupabaseClient();
  const bookingRelation = await getBookingRelation(booking.reference);

  if (!supabase || !bookingRelation || (booking.lifecycleHistory ?? []).length === 0) {
    return booking.lifecycleHistory ?? [];
  }

  const rows = (await getLifecycleEventRows()) ?? [];

  await Promise.all(
    (booking.lifecycleHistory ?? []).map(async (event) => {
      const payload = toLifecyclePayload(event, bookingRelation.id);
      const existingRow = rows.find((row) =>
        isSameLifecycleEvent(row, payload),
      );

      if (existingRow) {
        return;
      }

      await createLifecycleEvent(booking, event);
    }),
  );

  return booking.lifecycleHistory ?? [];
}
