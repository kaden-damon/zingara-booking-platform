import {
  sendGuestPushNotification,
  type GuestPushTrigger,
} from "@/lib/supabase/staffPush";

export const dynamic = "force-dynamic";

const guestPushTriggers = new Set<GuestPushTrigger>([
  "payment-received",
  "reservation-cancelled",
  "reservation-confirmed",
  "reservation-pending-payment",
  "waitlist-promoted",
]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      bookingReference?: string;
      trigger?: GuestPushTrigger;
    };

    if (!body.trigger || !guestPushTriggers.has(body.trigger)) {
      return Response.json(
        { error: "A valid guest push trigger is required." },
        { status: 400 },
      );
    }

    if (!body.bookingReference) {
      return Response.json(
        { error: "A booking reference is required." },
        { status: 400 },
      );
    }

    const result = await sendGuestPushNotification({
      bookingReference: body.bookingReference,
      trigger: body.trigger,
    });

    return Response.json(result);
  } catch (error) {
    console.error("[Zingara API] Failed to send guest push", error);

    return Response.json(
      { error: "Guest push notification could not be sent." },
      { status: 500 },
    );
  }
}
