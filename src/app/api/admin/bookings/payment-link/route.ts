import { sendOperationalCustomerEmail } from "@/lib/email/smtp";
import {
  findDuplicateSentCommunication,
  insertCommunicationPayload,
} from "@/lib/email/communicationIdempotency";
import {
  createPaymentLinkToken,
  getCustomerName,
  getOutstandingAmount,
  getPaymentLinkUrl,
  hashPaymentLinkToken,
  isBookingPaymentLinkEligible,
  loadBookingForPaymentLink,
  loadCustomerForPaymentLink,
} from "@/lib/payment-links/customerPaymentLinks";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type PaymentLinkRequest = {
  bookingReference?: string;
};

function createPaymentLinkMessage(input: {
  amount: number;
  bookingReference: string;
  customerName: string;
  paymentUrl: string;
}) {
  return [
    `Dear ${input.customerName || "guest"},`,
    "",
    `Your secure Zingara payment link for booking ${input.bookingReference} is ready:`,
    input.paymentUrl,
    "",
    `Outstanding balance: R${input.amount.toFixed(2)}.`,
    "",
    "Payment is processed through the secure PayFast checkout.",
  ].join("\n");
}

function isMissingPaymentLinkTable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: string }).code === "42P01" ||
      (error as { code?: string }).code === "PGRST205")
  );
}

export async function POST(request: Request) {
  const { error, serviceClient, staffProfile, user } =
    await requireActiveStaff(request);

  if (error || !serviceClient || !staffProfile) {
    return error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const role = Array.isArray(staffProfile.roles)
    ? staffProfile.roles[0]
    : staffProfile.roles;
  const permissions = getRolePermissions(role);

  if (
    !permissions.includes("bookings:manage") ||
    !permissions.includes("communications:manage")
  ) {
    return Response.json(
      { error: "Booking and communication management access is required." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as PaymentLinkRequest;
    const bookingReference = body.bookingReference?.trim().toUpperCase();

    if (!bookingReference) {
      return Response.json(
        { error: "Booking reference is required." },
        { status: 400 },
      );
    }

    const booking = await loadBookingForPaymentLink(
      serviceClient,
      bookingReference,
    );

    if (!booking) {
      return Response.json(
        { error: "Booking could not be found." },
        { status: 404 },
      );
    }

    if (!isBookingPaymentLinkEligible(booking)) {
      return Response.json(
        { error: "This booking is not awaiting customer payment." },
        { status: 409 },
      );
    }

    const customer = await loadCustomerForPaymentLink(
      serviceClient,
      booking.customer_id,
    );
    const recipient = customer?.email?.trim().toLowerCase();

    if (!recipient) {
      return Response.json(
        { error: "This booking does not have a customer email address." },
        { status: 409 },
      );
    }

    const now = new Date();
    const { data: recentActiveLink, error: recentActiveLinkError } =
      await serviceClient
        .from("booking_payment_links")
        .select("id,sent_at,created_at")
        .eq("booking_id", booking.id)
        .eq("status", "active")
        .gt("expires_at", now.toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (recentActiveLinkError) {
      throw recentActiveLinkError;
    }

    const recentSentAt = new Date(
      (recentActiveLink as { created_at?: string; sent_at?: string } | null)
        ?.sent_at ??
        (recentActiveLink as { created_at?: string; sent_at?: string } | null)
          ?.created_at ??
        0,
    ).getTime();

    if (
      recentActiveLink &&
      Number.isFinite(recentSentAt) &&
      now.getTime() - recentSentAt < 60_000
    ) {
      return Response.json(
        {
          error:
            "A payment link was already sent for this booking. Please wait before sending another.",
        },
        { status: 409 },
      );
    }

    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7);
    const token = createPaymentLinkToken();
    const paymentUrl = getPaymentLinkUrl(request, token);
    const amount = getOutstandingAmount(booking);
    const customerName = getCustomerName(customer);
    const subject = `Secure payment link for ${bookingReference}`;
    const message = createPaymentLinkMessage({
      amount,
      bookingReference,
      customerName,
      paymentUrl,
    });

    await serviceClient
      .from("booking_payment_links")
      .update({
        revoked_at: now.toISOString(),
        status: "revoked",
        updated_at: now.toISOString(),
      })
      .eq("booking_id", booking.id)
      .eq("status", "active");

    const { data: linkRow, error: linkError } = await serviceClient
      .from("booking_payment_links")
      .insert({
        booking_id: booking.id,
        booking_reference: bookingReference,
        created_by: user?.id ?? null,
        expires_at: expiresAt.toISOString(),
        metadata: {
          createdByStaffName: staffProfile?.full_name ?? null,
          recipient,
        },
        token_hash: hashPaymentLinkToken(token),
      })
      .select("id")
      .maybeSingle();

    if (linkError) {
      throw linkError;
    }

    const duplicate = await findDuplicateSentCommunication(serviceClient, {
      booking_id: booking.id,
      channel: "email",
      customer_id: booking.customer_id,
      message,
      sent_at: now.toISOString(),
      show_id: booking.show_id,
      status: "sent",
      subject,
      type: "custom_message",
    });

    if (duplicate) {
      return Response.json({
        deduped: true,
        linkId: linkRow?.id ?? null,
        paymentUrl,
        row: duplicate,
      });
    }

    const sendResult = await sendOperationalCustomerEmail({
      customerId: booking.customer_id,
      kind: "payment_link",
      message,
      subject,
      to: recipient,
    });

    if (sendResult.ok && linkRow?.id) {
      await serviceClient
        .from("booking_payment_links")
        .update({
          sent_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", linkRow.id);
    }

    const communication = await insertCommunicationPayload(serviceClient, {
      booking_id: booking.id,
      channel: "email",
      customer_id: booking.customer_id,
      message,
      sent_at: sendResult.ok ? now.toISOString() : null,
      show_id: booking.show_id,
      status: sendResult.ok
        ? "sent"
        : sendResult.suppressed
          ? "suppressed"
          : "failed",
      subject,
      type: "custom_message",
    });

    if (!sendResult.ok) {
      if (linkRow?.id) {
        await serviceClient
          .from("booking_payment_links")
          .update({
            revoked_at: new Date().toISOString(),
            status: "revoked",
            updated_at: new Date().toISOString(),
          })
          .eq("id", linkRow.id)
          .eq("status", "active");
      }

      return Response.json(
        {
          error: "Payment link email could not be sent.",
          linkId: linkRow?.id ?? null,
          row: communication,
        },
        { status: 502 },
      );
    }

    return Response.json({
      linkId: linkRow?.id ?? null,
      paymentUrl,
      row: communication,
    });
  } catch (sendError) {
    console.error("[Zingara Payment Link] Failed to send link", sendError);

    if (isMissingPaymentLinkTable(sendError)) {
      return Response.json(
        { error: "Payment links are not configured yet." },
        { status: 503 },
      );
    }

    return Response.json(
      { error: "Payment link could not be sent." },
      { status: 500 },
    );
  }
}
