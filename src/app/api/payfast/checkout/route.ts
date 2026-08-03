import { getPayFastConfig } from "@/lib/payfast/config";
import {
  createPayFastPaymentData,
  createPayFastResultUrl,
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

    const config = getPayFastConfig();
    if (!config.configured) {
      return Response.json(
        { error: "PayFast checkout is not configured." },
        { status: 503 },
      );
    }

    const payFastConfig = {
      ...config,
      cancelUrl: createPayFastResultUrl(
        config.cancelUrl,
        "cancelled",
        body.bookingReference,
      ),
      notifyUrl: config.notifyUrl,
      returnUrl: createPayFastResultUrl(
        config.returnUrl,
        "return",
        body.bookingReference,
      ),
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
