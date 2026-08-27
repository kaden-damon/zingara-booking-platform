import {
  expirePaymentLink,
  getCustomerName,
  getOutstandingAmount,
  isBookingPaymentLinkEligible,
  loadActivePaymentLink,
  loadBookingForPaymentLink,
  loadCustomerForPaymentLink,
  loadShowForPaymentLink,
  parseBookingMetadata,
} from "@/lib/payment-links/customerPaymentLinks";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { calculatePayFastTransactionAmounts } from "@/lib/payfast/transactionFee";
import {
  getShowLocationOption,
  normalizeShowLocation,
} from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

type PaymentLinkContext = {
  params: Promise<{
    token: string;
  }>;
};

function isMissingPaymentLinkTable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: string }).code === "42P01" ||
      (error as { code?: string }).code === "PGRST205")
  );
}

function getShowTimeLabel(time: string | null | undefined) {
  return time?.slice(0, 5) ?? "";
}

function getShowLocationLabels(venue: string | null | undefined) {
  const location = normalizeShowLocation(venue ?? "");

  if (!location) {
    return {
      code: "LOC",
      label: "Location not recorded",
    };
  }

  const option = getShowLocationOption(location);

  return {
    code: location === "johannesburg" ? "JHB" : "CPT",
    label: option.city,
  };
}

export async function GET(_request: Request, context: PaymentLinkContext) {
  const { token } = await context.params;
  const supabase = getServiceClient();

  if (!supabase) {
    return Response.json(
      { error: "Payment links are temporarily unavailable." },
      { status: 503 },
    );
  }

  try {
    const link = await loadActivePaymentLink(
      supabase,
      decodeURIComponent(token),
    );

    if (!link || link.status !== "active") {
      return Response.json(
        { error: "This payment link is invalid or has expired." },
        { status: 404 },
      );
    }

    if (new Date(link.expires_at).getTime() <= Date.now()) {
      await expirePaymentLink(supabase, link.id);

      return Response.json(
        { error: "This payment link has expired." },
        { status: 410 },
      );
    }

    const booking = await loadBookingForPaymentLink(
      supabase,
      link.booking_reference,
    );

    if (!booking || booking.id !== link.booking_id) {
      return Response.json(
        { error: "This payment link is no longer valid." },
        { status: 404 },
      );
    }

    const customer = await loadCustomerForPaymentLink(
      supabase,
      booking.customer_id,
    );
    const show = await loadShowForPaymentLink(supabase, booking.show_id);
    const metadata = parseBookingMetadata(booking.notes);
    const outstandingAmount = getOutstandingAmount(booking);
    const transaction = calculatePayFastTransactionAmounts(outstandingAmount);
    const location = getShowLocationLabels(show?.venue);
    const showTime = getShowTimeLabel(show?.time);
    const showLabel =
      show?.date && showTime
        ? `${location.code} · ${show.date} · ${showTime}`
        : metadata?.bookingDate ?? "Show not recorded";

    return Response.json({
      booking: {
        amountPaid: Math.max(Number(booking.amount_paid) || 0, 0),
        bookingReference: booking.booking_reference,
        customerName: getCustomerName(customer) || metadata?.customer.name || "Guest",
        expiresAt: link.expires_at,
        isPayable: isBookingPaymentLinkEligible(booking),
        locationCode: location.code,
        locationLabel: location.label,
        outstandingAmount,
        providerGrossAmount: transaction.providerGrossAmount,
        partySize: metadata?.partySize ?? null,
        paymentStatus: booking.payment_status,
        section: booking.section ?? metadata?.zoneTitle ?? "Not recorded",
        showDate: show?.date ?? null,
        showLabel,
        showTime: showTime || null,
        status: booking.booking_status,
        tableNumber: metadata?.tableNumber ?? "Not recorded",
        totalAmount: Math.max(Number(booking.total_amount) || 0, 0),
        transactionFeeAmount: transaction.transactionFeeAmount,
      },
    });
  } catch (error) {
    console.error("[Zingara Payment Link] Lookup failed", error);

    if (isMissingPaymentLinkTable(error)) {
      return Response.json(
        { error: "Payment links are not configured yet." },
        { status: 503 },
      );
    }

    return Response.json(
      { error: "Payment link could not be loaded." },
      { status: 500 },
    );
  }
}
