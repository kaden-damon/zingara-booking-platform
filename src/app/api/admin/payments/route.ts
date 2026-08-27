import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  type DemoBooking,
  type PaymentStatus,
} from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  const role = Array.isArray(auth.staffProfile.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile.roles;
  const permissions = getRolePermissions(role);

  if (
    !permissions.includes("bookings:manage") &&
    !permissions.includes("analytics:read")
  ) {
    return Response.json(
      { error: "Payment access is required." },
      { status: 403 },
    );
  }

  const { data, error } = await auth.serviceClient
    .from("payments")
    .select("id,booking_id,payment_type,payment_status,amount,method,reference,notes,processed_at,created_at,provider_transaction_id")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Zingara API] Failed to load payments", error);

    return Response.json(
      { error: "Payments could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({ rows: data ?? [] });
}

type SupabasePaymentStatus =
  | "cancelled"
  | "comp_vip"
  | "deposit_paid"
  | "fully_paid"
  | "pending_payment"
  | "refunded";

type SupabasePaymentType =
  | "adjustment"
  | "balance"
  | "comp"
  | "deposit"
  | "full_payment"
  | "refund";

type ExistingPayment = {
  amount: number | null;
  id: string;
  method: string | null;
  notes: string | null;
  processed_at: string | null;
  provider_transaction_id?: string | null;
};

function toSupabasePaymentStatus(status?: PaymentStatus): SupabasePaymentStatus {
  if (status === "deposit-paid") {
    return "deposit_paid";
  }

  if (status === "fully-paid") {
    return "fully_paid";
  }

  if (status === "comp-vip") {
    return "comp_vip";
  }

  if (status === "refunded") {
    return "refunded";
  }

  return "pending_payment";
}

function getPaymentType(booking: DemoBooking): SupabasePaymentType {
  if (booking.paymentStatus === "refunded" || booking.status === "refunded") {
    return "refund";
  }

  if (booking.paymentStatus === "comp-vip") {
    return "comp";
  }

  if (booking.paymentStatus === "deposit-paid") {
    return "deposit";
  }

  if (booking.paymentStatus === "fully-paid") {
    return "full_payment";
  }

  return booking.paymentOption === "deposit" ? "deposit" : "full_payment";
}

function getPaymentAmount(
  booking: DemoBooking,
  existingPayment?: ExistingPayment | null,
) {
  if (booking.paymentStatus === "refunded" || booking.status === "refunded") {
    return existingPayment?.amount ?? booking.amountPaid ?? 0;
  }

  if (booking.paymentStatus === "comp-vip") {
    return 0;
  }

  return booking.amountPaid ?? 0;
}

function getPaymentPayload(
  booking: DemoBooking,
  bookingId: string,
  existingPayment?: ExistingPayment | null,
) {
  const isRefunded =
    booking.paymentStatus === "refunded" || booking.status === "refunded";
  const refundNotes = [
    existingPayment?.notes ?? "",
    booking.refundNotes
      ? `Internal refund recorded: ${booking.refundNotes}`
      : "Internal refund recorded.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    amount: getPaymentAmount(booking, existingPayment),
    booking_id: bookingId,
    method:
      existingPayment?.method ??
      (existingPayment?.provider_transaction_id ? "payfast" : "platform"),
    notes: existingPayment?.provider_transaction_id
      ? existingPayment.notes
      : isRefunded
        ? refundNotes
        : booking.refundNotes || booking.paymentOption || null,
    payment_status: toSupabasePaymentStatus(booking.paymentStatus),
    payment_type: getPaymentType(booking),
    processed_at:
      existingPayment?.provider_transaction_id || isRefunded
        ? existingPayment?.processed_at ?? new Date().toISOString()
        : new Date().toISOString(),
    provider_transaction_id: existingPayment?.provider_transaction_id ?? null,
    reference: booking.reference,
  };
}

async function upsertPayment(
  supabase: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
  booking: DemoBooking,
) {
  const { data: bookingRows, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("booking_reference", booking.reference)
    .limit(1);

  if (bookingError) {
    throw bookingError;
  }

  const bookingId = (bookingRows?.[0] as { id?: string } | undefined)?.id;

  if (!bookingId) {
    throw new Error("Booking could not be resolved for payment.");
  }

  const { data: existingRows, error: loadError } = await supabase
    .from("payments")
    .select("id,amount,method,notes,processed_at,provider_transaction_id")
    .eq("reference", booking.reference)
    .limit(1);

  if (loadError) {
    throw loadError;
  }

  const existingPayment = existingRows?.[0] as ExistingPayment | undefined;
  const existingId = existingPayment?.id;
  const payload = getPaymentPayload(booking, bookingId, existingPayment);
  const query = existingId
    ? supabase.from("payments").update(payload).eq("id", existingId)
    : supabase.from("payments").insert(payload);
  const { data, error } = await query
    .select("id,booking_id,payment_type,payment_status,amount,method,reference,notes,processed_at,created_at,provider_transaction_id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
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

  try {
    const body = (await request.json()) as { booking?: DemoBooking };

    if (!body.booking) {
      return Response.json(
        { error: "Booking payload is required." },
        { status: 400 },
      );
    }

    const row = await upsertPayment(auth.serviceClient, body.booking);

    return Response.json({ row });
  } catch (error) {
    console.error("[Zingara API] Failed to save payment", error);

    return Response.json(
      { error: "Payment could not be saved." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  return POST(request);
}
