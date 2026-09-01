import {
  createExistingBookingPayFastCheckout,
  preparePayFastCheckoutAttempt,
} from "@/lib/payfast/checkout";
import { calculatePayFastTransactionAmounts } from "@/lib/payfast/transactionFee";
import { calculateOutstandingAmount } from "@/lib/paymentControls";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { type DemoBooking } from "@/lib/zingaraDemo";
import { requirePublicMaintenanceAvailable } from "@/lib/platformMaintenance";

export const dynamic = "force-dynamic";

type CorporatePaymentCheckoutRequest = {
  action?: "checkout" | "preview";
  bookingReference?: string;
  token?: string;
};

type BookingRow = {
  amount_paid: number;
  booking_reference: string;
  notes: string | null;
  payment_status: string;
  total_amount: number;
};

const bookingMetadataPrefix = "__zingara_booking_meta__:";

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

    if (body.action !== "preview") {
      const maintenanceResponse = await requirePublicMaintenanceAvailable(
        serviceClient,
        "payment",
      );

      if (maintenanceResponse) return maintenanceResponse;
    }

    const { data, error } = await serviceClient
      .from("bookings")
      .select("booking_reference,total_amount,amount_paid,payment_status,notes")
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

    const balanceDue = calculateOutstandingAmount(
      row.total_amount,
      row.amount_paid,
    );

    if (balanceDue <= 0 || row.payment_status === "fully_paid") {
      return Response.json(
        { error: "This corporate booking has already been paid." },
        { status: 409 },
      );
    }

    const transaction = calculatePayFastTransactionAmounts(balanceDue);

    if (body.action === "preview") {
      return Response.json({
        bookingAppliedAmount: transaction.bookingAppliedAmount,
        bookingReference,
        providerGrossAmount: transaction.providerGrossAmount,
        status: "preview",
        transactionFeeAmount: transaction.transactionFeeAmount,
      });
    }

    const attempt = await preparePayFastCheckoutAttempt(serviceClient, {
      amount: balanceDue,
      bookingReference,
    });

    if ("error" in attempt) {
      return Response.json({ error: attempt.error }, { status: attempt.status });
    }

    const checkout = await createExistingBookingPayFastCheckout(serviceClient, {
      amount: balanceDue,
      bookingReference,
      customer: booking.customer,
      itemDescription: `Corporate booking payment ${bookingReference}`,
      itemName: "The Royal Countess Zingara Corporate Booking",
      preparedAmount: attempt.attempt.amount_due ?? balanceDue,
      section: booking.zoneTitle,
    });

    if ("error" in checkout) {
      return Response.json({ error: checkout.error }, { status: checkout.status });
    }

    return Response.json({
      actionUrl: checkout.actionUrl,
      bookingAppliedAmount: checkout.bookingAppliedAmount,
      fields: checkout.fields,
      mode: checkout.mode,
      providerGrossAmount: checkout.providerGrossAmount,
      status: "payfast",
      transactionFeeAmount: checkout.transactionFeeAmount,
    });
  } catch (error) {
    console.error("[Zingara Corporate Payment] Checkout failed", error);

    return Response.json(
      { error: "Payment checkout could not be prepared." },
      { status: 500 },
    );
  }
}
