import { getPayFastConfig } from "@/lib/payfast/config";
import {
  createPayFastPaymentData,
  getPayFastPaymentFormAction,
} from "@/lib/payfast/payment";

export const dynamic = "force-dynamic";

type PayFastCheckoutRequest = {
  amount?: number;
  bookingReference?: string;
  customer?: {
    email?: string;
    name?: string;
    phone?: string;
  };
  itemDescription?: string;
  itemName?: string;
  section?: string;
};

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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PayFastCheckoutRequest;

    if (!body.bookingReference || !body.amount || body.amount <= 0) {
      return Response.json(
        { error: "A booking reference and positive amount are required." },
        { status: 400 },
      );
    }

    const baseUrl = getBaseUrl(request);
    const config = getPayFastConfig();
    const payFastConfig = {
      ...config,
      cancelUrl:
        config.cancelUrl ||
        `${baseUrl}/book?payment=cancelled&booking=${encodeURIComponent(
          body.bookingReference,
        )}`,
      merchantId: config.merchantId || "10000100",
      merchantKey: config.merchantKey || "46f0cd694581a",
      notifyUrl:
        config.notifyUrl ||
        `${baseUrl}/api/payfast/itn`,
      returnUrl:
        config.returnUrl ||
        `${baseUrl}/book?payment=return&booking=${encodeURIComponent(
          body.bookingReference,
        )}`,
    };
    const { firstName, lastName } = splitName(body.customer?.name);
    const paymentData = createPayFastPaymentData(
      {
        amount: body.amount,
        cellNumber: normalizePhone(body.customer?.phone),
        customString1: body.bookingReference,
        customString2: body.section,
        emailAddress: body.customer?.email,
        itemDescription:
          body.itemDescription ??
          `Zingara booking ${body.bookingReference}`,
        itemName: body.itemName ?? "The Royal Countess Zingara Booking",
        merchantPaymentId: body.bookingReference,
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
    console.error("[Zingara PayFast] Checkout payload failed", error);

    return Response.json(
      { error: "PayFast checkout could not be prepared." },
      { status: 500 },
    );
  }
}
