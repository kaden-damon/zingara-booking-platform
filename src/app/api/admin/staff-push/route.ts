import {
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  sendStaffPushNotification,
  type StaffPushTrigger,
} from "@/lib/supabase/staffPush";

export const dynamic = "force-dynamic";

const staffPushTriggers = new Set<StaffPushTrigger>([
  "booking-cancelled",
  "guest-checked-in",
  "new-booking",
  "new-corporate-request",
  "operational-broadcast-sent",
  "payment-received",
  "waitlist-promotion",
]);

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as {
      bookingReference?: string;
      body?: string;
      corporateRequestId?: string;
      trigger?: StaffPushTrigger;
      waitlistId?: string;
    };

    if (!body.trigger || !staffPushTriggers.has(body.trigger)) {
      return Response.json(
        { error: "A valid staff push trigger is required." },
        { status: 400 },
      );
    }

    const result = await sendStaffPushNotification({
      bookingReference: body.bookingReference,
      body: body.body,
      corporateRequestId: body.corporateRequestId,
      trigger: body.trigger,
      waitlistId: body.waitlistId,
    });

    return Response.json(result);
  } catch (error) {
    console.error("[Zingara API] Failed to send staff push", error);

    return Response.json(
      { error: "Staff push notification could not be sent." },
      { status: 500 },
    );
  }
}
