import { sendOperationalCustomerEmail } from "@/lib/email/smtp";
import {
  findDuplicateSentCommunication,
  insertCommunicationPayload,
} from "@/lib/email/communicationIdempotency";
import {
  createPaymentLinkToken,
  getCustomerName,
  getOutstandingAmount,
  getPaymentLinkCheckoutAmount,
  getPaymentLinkUrl,
  getSelectedBookingPaymentAmount,
  hashPaymentLinkToken,
  isBookingPaymentLinkEligible,
  loadActivePaymentLink,
  loadBookingForPaymentLink,
  loadCustomerForPaymentLink,
} from "@/lib/payment-links/customerPaymentLinks";
import {
  getRolePermissions,
  isSuperAdminProfile,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type PaymentLinkRequest = {
  action?: "create" | "send-existing";
  bookingReference?: string;
  token?: string;
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
    `Amount due: R${input.amount.toFixed(2)}.`,
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
  const supabase = serviceClient;

  try {
    const body = (await request.json()) as PaymentLinkRequest;
    const action = body.action ?? "create-and-send";
    const isManualCheckoutAction =
      action === "create" || action === "send-existing";
    const role = Array.isArray(staffProfile.roles)
      ? staffProfile.roles[0]
      : staffProfile.roles;
    const permissions = getRolePermissions(role);

    if (isManualCheckoutAction && !isSuperAdminProfile(staffProfile)) {
      return Response.json(
        { error: "Super Admin access is required to create a manual payment link." },
        { status: 403 },
      );
    }

    if (
      !permissions.includes("bookings:manage") ||
      (action !== "create" && !permissions.includes("communications:manage"))
    ) {
      return Response.json(
        { error: "Booking and communication management access is required." },
        { status: 403 },
      );
    }

    const bookingReference = body.bookingReference?.trim().toUpperCase();

    if (!bookingReference) {
      return Response.json(
        { error: "Booking reference is required." },
        { status: 400 },
      );
    }
    const authoritativeBookingReference = bookingReference;

    const booking = await loadBookingForPaymentLink(
      supabase,
      bookingReference,
    );

    if (!booking) {
      return Response.json(
        { error: "Booking could not be found." },
        { status: 404 },
      );
    }
    const authoritativeBooking = booking;

    if (!isBookingPaymentLinkEligible(authoritativeBooking)) {
      return Response.json(
        { error: "This booking is not awaiting customer payment." },
        { status: 409 },
      );
    }

    const customer = await loadCustomerForPaymentLink(
      supabase,
      authoritativeBooking.customer_id,
    );
    const recipient = customer?.email?.trim().toLowerCase();
    const customerName = getCustomerName(customer);
    const now = new Date();

    async function sendLink(input: {
      amount: number;
      linkId: string | null;
      paymentUrl: string;
      revokeOnFailure: boolean;
    }) {
      if (!recipient) {
        return Response.json(
          { error: "This booking does not have a customer email address." },
          { status: 409 },
        );
      }

      const subject = `Secure payment link for ${authoritativeBookingReference}`;
      const message = createPaymentLinkMessage({
        amount: input.amount,
        bookingReference: authoritativeBookingReference,
        customerName,
        paymentUrl: input.paymentUrl,
      });
      const duplicate = await findDuplicateSentCommunication(supabase, {
        booking_id: authoritativeBooking.id,
        channel: "email",
        customer_id: authoritativeBooking.customer_id,
        message,
        sent_at: now.toISOString(),
        show_id: authoritativeBooking.show_id,
        status: "sent",
        subject,
        type: "custom_message",
      });

      if (duplicate) {
        return Response.json({
          deduped: true,
          linkId: input.linkId,
          paymentUrl: input.paymentUrl,
          row: duplicate,
        });
      }

      const sendResult = await sendOperationalCustomerEmail({
        customerId: authoritativeBooking.customer_id,
        kind: "payment_link",
        message,
        subject,
        to: recipient,
      });

      if (sendResult.ok && input.linkId) {
        await supabase
          .from("booking_payment_links")
          .update({
            sent_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", input.linkId);
      }

      const communication = await insertCommunicationPayload(supabase, {
        booking_id: authoritativeBooking.id,
        channel: "email",
        customer_id: authoritativeBooking.customer_id,
        message,
        sent_at: sendResult.ok ? now.toISOString() : null,
        show_id: authoritativeBooking.show_id,
        status: sendResult.ok
          ? "sent"
          : sendResult.suppressed
            ? "suppressed"
            : "failed",
        subject,
        type: "custom_message",
      });

      if (!sendResult.ok) {
        if (input.revokeOnFailure && input.linkId) {
          await supabase
            .from("booking_payment_links")
            .update({
              revoked_at: new Date().toISOString(),
              status: "revoked",
              updated_at: new Date().toISOString(),
            })
            .eq("id", input.linkId)
            .eq("status", "active");
        }

        return Response.json(
          {
            error: "Payment link email could not be sent.",
            linkId: input.linkId,
            row: communication,
          },
          { status: 502 },
        );
      }

      return Response.json({
        linkId: input.linkId,
        paymentUrl: input.paymentUrl,
        row: communication,
      });
    }

    if (action === "send-existing") {
      const token = body.token?.trim();

      if (!token) {
        return Response.json(
          { error: "Payment link token is required." },
          { status: 400 },
        );
      }

      const link = await loadActivePaymentLink(supabase, token);

      if (
        !link ||
        link.status !== "active" ||
        link.booking_id !== authoritativeBooking.id ||
        link.booking_reference !== bookingReference ||
        new Date(link.expires_at).getTime() <= now.getTime()
      ) {
        return Response.json(
          { error: "This payment link is no longer active." },
          { status: 409 },
        );
      }

      return sendLink({
        amount: getPaymentLinkCheckoutAmount(link, authoritativeBooking),
        linkId: link.id,
        paymentUrl: getPaymentLinkUrl(request, token),
        revokeOnFailure: false,
      });
    }

    if (action !== "create" && !recipient) {
      return Response.json(
        { error: "This booking does not have a customer email address." },
        { status: 409 },
      );
    }

    if (action !== "create") {
      const { data: recentActiveLink, error: recentActiveLinkError } =
        await supabase
          .from("booking_payment_links")
          .select("id,sent_at,created_at")
          .eq("booking_id", authoritativeBooking.id)
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
    }

    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7);
    const token = createPaymentLinkToken();
    const paymentUrl = getPaymentLinkUrl(request, token);
    const amount =
      action === "create"
        ? getSelectedBookingPaymentAmount(authoritativeBooking)
        : getOutstandingAmount(authoritativeBooking);

    await supabase
      .from("booking_payment_links")
      .update({
        revoked_at: now.toISOString(),
        status: "revoked",
        updated_at: now.toISOString(),
      })
      .eq("booking_id", authoritativeBooking.id)
      .eq("status", "active");

    const { data: linkRow, error: linkError } = await supabase
      .from("booking_payment_links")
      .insert({
        booking_id: authoritativeBooking.id,
        booking_reference: bookingReference,
        created_by: user?.id ?? null,
        expires_at: expiresAt.toISOString(),
        metadata: {
          checkoutAmount: amount,
          createdByStaffName: staffProfile?.full_name ?? null,
          manualCheckout: action === "create",
          recipient,
        },
        token_hash: hashPaymentLinkToken(token),
      })
      .select("id")
      .maybeSingle();

    if (linkError) {
      throw linkError;
    }

    if (action === "create") {
      return Response.json({
        canSend: Boolean(recipient),
        linkId: linkRow?.id ?? null,
        paymentUrl,
        token,
      });
    }

    return sendLink({
      amount,
      linkId: linkRow?.id ?? null,
      paymentUrl,
      revokeOnFailure: true,
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
