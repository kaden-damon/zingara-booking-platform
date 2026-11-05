import {
  attendancePreviewToken,
  hashAttendanceToken,
} from "@/lib/attendance/attendanceTokens";
import { resolveAttendanceContext } from "@/lib/attendance/attendanceServer";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { sendStaffPushNotification } from "@/lib/supabase/staffPush";

export const dynamic = "force-dynamic";

function unavailable() {
  return Response.json({ error: "This attendance link is unavailable." }, { status: 404 });
}

const attendancePreview = {
  attendanceResponse: null,
  bookingReference: "TEST-PRE-SHOW-EMAIL",
  firstName: "Kaden",
  guestCount: 4,
  performanceDate: "2026-12-18",
  performanceName: "The Royal Countess",
  performanceTime: "19:30",
  venue: "cape-town",
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const client = getServiceClient();
  if (!client) return unavailable();
  const { token } = await params;

  if (token === attendancePreviewToken) {
    return Response.json({ attendance: attendancePreview });
  }

  try {
    const attendance = await resolveAttendanceContext(client, token);
    return attendance ? Response.json({ attendance }) : unavailable();
  } catch (error) {
    console.error("[Zingara Attendance] Context could not be loaded", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return unavailable();
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const client = getServiceClient();
  if (!client) return unavailable();
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return unavailable();

  let body: { response?: unknown };
  try {
    body = (await request.json()) as { response?: unknown };
  } catch {
    return Response.json({ error: "Choose an attendance response." }, { status: 400 });
  }
  if (body.response !== "confirmed" && body.response !== "declined") {
    return Response.json({ error: "Choose an attendance response." }, { status: 400 });
  }

  if (token === attendancePreviewToken) {
    return Response.json({
      changed: false,
      preview: true,
      response: body.response,
    });
  }

  const { data, error } = await client.rpc("record_booking_attendance_response", {
    p_response: body.response,
    p_token_hash: hashAttendanceToken(token),
  });
  const result = Array.isArray(data) ? data[0] : null;
  if (error || !result) {
    console.error("[Zingara Attendance] Response could not be recorded", {
      code: error?.code ?? null,
      message: error?.message ?? "No result",
    });
    return unavailable();
  }

  if (body.response === "declined") {
    try {
      await sendStaffPushNotification({
        body: `${result.booking_reference} can no longer attend. The booking remains active and requires Box Office review.`,
        bookingReference: result.booking_reference,
        notificationId: `attendance-declined-${result.booking_id}-${result.response_version}`,
        title: "Guest Cannot Attend",
        trigger: "attendance-declined",
      });
    } catch (notificationError) {
      console.error("[Zingara Attendance] Box Office notification failed", {
        bookingReference: result.booking_reference,
        message: notificationError instanceof Error ? notificationError.message : "Unknown error",
      });
    }
  }

  return Response.json({
    changed: Boolean(result.changed),
    response: body.response,
  });
}
