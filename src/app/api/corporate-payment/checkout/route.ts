import { getPayFastConfig } from "@/lib/payfast/config";
import {
  createPayFastPaymentData,
  getPayFastPaymentFormAction,
} from "@/lib/payfast/payment";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { type DemoBooking } from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

type CorporatePaymentCheckoutRequest = {
  bookingReference?: string;
  token?: string;
};

type BookingRow = {
  amount_paid: number;
  balance_outstanding: number;
  booking_reference: string;
  notes: string | null;
  payment_status: string;
  total_amount: number;
};

const bookingMetadataPrefix = "__zingara_booking_meta__:";

function getBaseUrl(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = forwardedHost ?? request.headers.get("host");

  return host ? `${forwardedProto}://${host}` : new URL(request.url).origin;
}

function splitName(name: string | undefined) {
  const trimmedName = name?.trim() ?? "";
  const [firstName = "", ...surnameParts] = trimmedName.split(/\s+/);

  return {
    firstName,
    lastName: surnameParts.join(" "),
  };
}

function normalizePhone(phone: string | undefined) {
  return phone?.replace(/[^\d+]/g, "") || undefined;
}

function parseBookingNotes(notes: string | null) {
  if (!notes?.startsWith(bookingMetadataPrefix)) {
    return undefined;
  }

  try {
    return JSON.parse(notes.slice(bookingMetadataPrefix.length)) as DemoBooking;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CorporatePaymentCheckoutRequest;
    const bookingReference = body.bookingReference?.trim();
    const token = body.token?.trim();

    if (!bookingReference || !token) {
      return Response.json(
        { error: "A booking reference and payment token are required." },
        { status: 400 },
      );
    }

    const serviceClient = getServiceClient();

    if (!serviceClient) {
      return Response.json(
        { error: "Payment checkout is not configured." },
        { status: 500 },
      );
    }

    const { data, error } = await serviceClient
      .from("bookings")
      .select("booking_reference,total_amount,amount_paid,balance_outstanding,payment_status,notes")
      .eq("booking_reference", bookingReference)
      .maybeSingle();

    if (error) {
      console.error("[Zingara Corporate Payment] Booking lookup failed", error);

      return Response.json(
        { error: "Payment checkout could not be prepared." },
        { status: 500 },
      );
    }

    const row = data as BookingRow | null;
    const booking = parseBookingNotes(row?.notes ?? null);

    if (!row || !booking || booking.corporatePaymentToken !== token) {
      return Response.json(
        { error: "This payment link is invalid or has expired." },
        { status: 403 },
      );
    }

    const balanceDue = Math.max(row.balance_outstanding ?? 0, 0);

    if (balanceDue <= 0 || row.payment_status === "fully_paid") {
      return Response.json(
        { error: "This corporate booking has already been paid." },
        { status: 409 },
      );
    }

    const baseUrl = getBaseUrl(request);
    const config = getPayFastConfig();
    const payFastConfig = {
      ...config,
      cancelUrl:
        config.cancelUrl ||
        `${baseUrl}/book?payment=cancelled&booking=${encodeURIComponent(
          bookingReference,
        )}`,
      merchantId: config.merchantId || "10000100",
      merchantKey: config.merchantKey || "46f0cd694581a",
      notifyUrl: config.notifyUrl || `${baseUrl}/api/payfast/itn`,
      returnUrl:
        config.returnUrl ||
        `${baseUrl}/book?payment=return&booking=${encodeURIComponent(
          bookingReference,
        )}`,
    };
    const { firstName, lastName } = splitName(booking.customer.name);
    const paymentData = createPayFastPaymentData(
      {
        amount: balanceDue,
        cellNumber: normalizePhone(booking.customer.phone),
        customString1: bookingReference,
        customString2: booking.zoneTitle,
        emailAddress: booking.customer.email,
        itemDescription: `Corporate booking payment ${bookingReference}`,
        itemName: "The Royal Countess Zingara Corporate Booking",
        merchantPaymentId: bookingReference,
        nameFirst: firstName,
        nameLast: lastName,
      },
      payFastConfig,
    );

    return Response.json({
      actionUrl: getPayFastPaymentFormAction(payFastConfig),
      fields: paymentData,
      mode: payFastConfig.mode,
    });
  } catch (error) {
    console.error("[Zingara Corporate Payment] Checkout failed", error);

    return Response.json(
      { error: "Payment checkout could not be prepared." },
      { status: 500 },
    );
  }
}
