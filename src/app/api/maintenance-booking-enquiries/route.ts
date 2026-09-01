import {
  isPublicMaintenanceBlocking,
  loadPlatformMaintenance,
} from "@/lib/platformMaintenance";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  const client = getServiceClient();

  if (!client) {
    return Response.json(
      { error: "Booking enquiries are temporarily unavailable." },
      { status: 503 },
    );
  }

  try {
    const { config } = await loadPlatformMaintenance(client);

    if (
      !isPublicMaintenanceBlocking(config, "booking") ||
      !config.public.enquiryFormEnabled
    ) {
      return Response.json(
        { error: "The maintenance booking enquiry form is not active." },
        { status: 409 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const fullName = clean(body.fullName, 160);
    const mobile = clean(body.mobile, 40);
    const email = clean(body.email, 254).toLowerCase();
    const preferredCity = clean(body.preferredCity, 40);
    const pax = Number(body.pax);

    if (
      fullName.length < 2 ||
      mobile.length < 7 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !["Cape Town", "Johannesburg"].includes(preferredCity) ||
      !Number.isInteger(pax) ||
      pax < 1 ||
      pax > 500
    ) {
      return Response.json(
        { error: "Complete all required enquiry fields with valid details." },
        { status: 400 },
      );
    }

    const ipLimit = await checkRateLimit(
      request,
      { limit: 5, scope: "maintenance_enquiry_ip", windowSeconds: 900 },
      [],
      client,
    );

    if (!ipLimit.allowed) {
      return rateLimitResponse(ipLimit.retryAfterSeconds, {
        operation: "create_maintenance_booking_enquiry",
        route: "/api/maintenance-booking-enquiries",
        safeFingerprint: "maintenance_enquiry_rate_limited_ip",
      }, client);
    }

    const contactLimit = await checkRateLimit(
      request,
      { limit: 2, scope: "maintenance_enquiry_contact", windowSeconds: 1800 },
      [email, mobile],
      client,
    );

    if (!contactLimit.allowed) {
      return rateLimitResponse(contactLimit.retryAfterSeconds, {
        operation: "create_maintenance_booking_enquiry",
        route: "/api/maintenance-booking-enquiries",
        safeFingerprint: "maintenance_enquiry_rate_limited_contact",
      }, client);
    }

    const { data, error } = await client
      .from("maintenance_booking_enquiries")
      .insert({
        email,
        full_name: fullName,
        mobile,
        notes: clean(body.notes, 2000) || null,
        pax,
        preferred_city: preferredCity,
        preferred_show_date: clean(body.preferredShowDate, 240) || null,
        seating_preference: clean(body.seatingPreference, 160) || null,
      })
      .select("reference,submitted_at")
      .single();

    if (error) throw error;

    return Response.json(
      {
        enquiry: {
          reference: data.reference,
          submittedAt: data.submitted_at,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[Zingara Maintenance] Enquiry submission failed", error);
    return Response.json(
      { error: "Your enquiry could not be saved. Please try again shortly." },
      { status: 500 },
    );
  }
}
