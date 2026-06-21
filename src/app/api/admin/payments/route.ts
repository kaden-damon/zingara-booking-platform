import { getServiceClient } from "@/lib/supabase/serverAdmin";
import {
  type DemoBooking,
  type PaymentStatus,
} from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

export async function GET() {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  const { data, error } = await serviceClient
    .from("payments")
    .select("id,booking_id,payment_type,payment_status,amount,method,reference,notes,processed_at,created_at")
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

function getRouteClient() {
  return getServiceClient();
}

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

function getPaymentAmount(booking: DemoBooking) {
  if (
    booking.paymentStatus === "refunded" ||
    booking.status === "refunded" ||
    booking.paymentStatus === "comp-vip"
  ) {
    return 0;
  }

  return booking.amountPaid ?? 0;
}

function getPaymentPayload(booking: DemoBooking, bookingId: string) {
  return {
    amount: getPaymentAmount(booking),
    booking_id: bookingId,
    method: "platform",
    notes: booking.refundNotes || booking.paymentOption || null,
    payment_status: toSupabasePaymentStatus(booking.paymentStatus),
    payment_type: getPaymentType(booking),
    processed_at: new Date().toISOString(),
    reference: booking.reference,
  };
}

async function upsertPayment(booking: DemoBooking) {
  const supabase = getRouteClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured.");
  }

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

  const payload = getPaymentPayload(booking, bookingId);
  const { data: existingRows, error: loadError } = await supabase
    .from("payments")
    .select("id")
    .eq("reference", booking.reference)
    .limit(1);

  if (loadError) {
    throw loadError;
  }

  const existingId = (existingRows?.[0] as { id?: string } | undefined)?.id;
  const query = existingId
    ? supabase.from("payments").update(payload).eq("id", existingId)
    : supabase.from("payments").insert(payload);
  const { data, error } = await query
    .select("id,booking_id,payment_type,payment_status,amount,method,reference,notes,processed_at,created_at")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { booking?: DemoBooking };

    if (!body.booking) {
      return Response.json(
        { error: "Booking payload is required." },
        { status: 400 },
      );
    }

    const row = await upsertPayment(body.booking);

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
