import { getServiceClient } from "@/lib/supabase/serverAdmin";
import {
  type CommunicationChannel,
  type CommunicationRecord,
  type CommunicationTrigger,
  type CorporateRequest,
  type DemoBooking,
} from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

export async function GET() {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  const { data, error } = await serviceClient
    .from("communications")
    .select(
      "id,customer_id,booking_id,show_id,batch_id,type,channel,subject,message,status,sent_at,created_at",
    )
    .order("sent_at", { ascending: false });

  if (error) {
    console.error("[Zingara API] Failed to load communications", error);

    return Response.json(
      { error: "Communications could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({ rows: data ?? [] });
}

type SupabaseCommunicationChannel =
  | "email"
  | "internal_note"
  | "push"
  | "sms"
  | "whatsapp";

type SupabaseCommunicationType =
  | "booking_confirmation"
  | "complimentary_booking"
  | "corporate_tentative_booking"
  | "custom_message"
  | "operational_broadcast"
  | "payment_confirmation"
  | "refund_notice"
  | "reservation_confirmed"
  | "reservation_pending"
  | "show_reminder";

function getRouteClient() {
  return getServiceClient();
}

function toSupabaseType(
  trigger?: CommunicationTrigger,
): SupabaseCommunicationType {
  if (trigger === "booking-confirmation") {
    return "booking_confirmation";
  }

  if (trigger === "payment-confirmation") {
    return "payment_confirmation";
  }

  if (trigger === "reservation-confirmed") {
    return "reservation_confirmed";
  }

  if (trigger === "reservation-pending") {
    return "reservation_pending";
  }

  if (trigger === "complimentary-booking") {
    return "complimentary_booking";
  }

  if (trigger === "corporate-tentative-booking") {
    return "corporate_tentative_booking";
  }

  if (trigger === "show-reminder") {
    return "show_reminder";
  }

  if (trigger === "cancellation-refund") {
    return "refund_notice";
  }

  if (trigger === "operational-broadcast") {
    return "operational_broadcast";
  }

  return "custom_message";
}

function toSupabaseChannel(
  channel: CommunicationChannel,
): SupabaseCommunicationChannel {
  return channel;
}

async function getCommunicationPayload(
  record: CommunicationRecord,
  context: {
    booking?: DemoBooking;
    corporateRequest?: CorporateRequest;
  },
) {
  const supabase = getRouteClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured.");
  }

  if (context.booking) {
    const { data: bookingRows, error } = await supabase
      .from("bookings")
      .select("id,customer_id,show_id")
      .eq("booking_reference", context.booking.reference)
      .limit(1);

    if (error) {
      throw error;
    }

    const bookingRelation = bookingRows?.[0] as
      | { customer_id: string; id: string; show_id: string }
      | undefined;

    return {
      booking_id: bookingRelation?.id ?? null,
      channel: toSupabaseChannel(record.channel),
      customer_id: bookingRelation?.customer_id ?? null,
      message: record.message,
      sent_at: record.sentAt,
      show_id: bookingRelation?.show_id ?? null,
      status: "sent",
      subject: record.subject ?? null,
      type: toSupabaseType(record.trigger),
    };
  }

  let customerId: string | null = null;

  if (context.corporateRequest) {
    const email = context.corporateRequest.email?.trim().toLowerCase();
    const mobile = context.corporateRequest.contactNumber?.trim();
    const customerName = context.corporateRequest.contactName?.trim();
    const [firstName = customerName || email || "Corporate", ...surnameParts] =
      (customerName || email || "Corporate").split(/\s+/);
    const { data: existingRows, error: loadError } = await supabase
      .from("customers")
      .select("id,email,mobile")
      .or(
        [
          email ? `email.eq.${email}` : "",
          mobile ? `mobile.eq.${mobile}` : "",
        ]
          .filter(Boolean)
          .join(","),
      )
      .limit(1);

    if (loadError) {
      throw loadError;
    }

    customerId = (existingRows?.[0] as { id?: string } | undefined)?.id ?? null;

    if (!customerId) {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          dietary_requirements:
            context.corporateRequest.dietaryRequirements.join(", ") || null,
          email: email || null,
          first_name: firstName,
          mobile: mobile || null,
          preferences: {
            customerKey: email || mobile || customerName?.toLowerCase(),
            vipTags: [],
          },
          relationship_notes: "",
          surname: surnameParts.join(" ") || null,
          vip_status: null,
        })
        .select("id")
        .maybeSingle();

      if (error) {
        throw error;
      }

      customerId = (data as { id?: string } | null)?.id ?? null;
    }
  }

  return {
    booking_id: null,
    channel: toSupabaseChannel(record.channel),
    customer_id: customerId,
    message: record.message,
    sent_at: record.sentAt,
    show_id: null,
    status: "sent",
    subject: record.subject ?? null,
    type: toSupabaseType(record.trigger),
  };
}

export async function POST(request: Request) {
  const supabase = getRouteClient();

  if (!supabase) {
    return Response.json(
      { error: "Supabase client is not configured." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as {
      booking?: DemoBooking;
      corporateRequest?: CorporateRequest;
      record?: CommunicationRecord;
    };

    if (!body.record) {
      return Response.json(
        { error: "Communication record is required." },
        { status: 400 },
      );
    }

    const payload = await getCommunicationPayload(body.record, {
      booking: body.booking,
      corporateRequest: body.corporateRequest,
    });
    const { data, error } = await supabase
      .from("communications")
      .insert(payload)
      .select(
        "id,customer_id,booking_id,show_id,batch_id,type,channel,subject,message,status,sent_at,created_at",
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    return Response.json({ row: data });
  } catch (error) {
    console.error("[Zingara API] Failed to save communication", error);

    return Response.json(
      { error: "Communication could not be saved." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const supabase = getRouteClient();

  if (!supabase) {
    return Response.json(
      { error: "Supabase client is not configured." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as {
      booking?: DemoBooking;
      corporateRequest?: CorporateRequest;
      record?: CommunicationRecord;
    };

    if (!body.record) {
      return Response.json(
        { error: "Communication record is required." },
        { status: 400 },
      );
    }

    const payload = await getCommunicationPayload(body.record, {
      booking: body.booking,
      corporateRequest: body.corporateRequest,
    });
    const { data, error } = await supabase
      .from("communications")
      .update(payload)
      .eq("id", body.record.id)
      .select(
        "id,customer_id,booking_id,show_id,batch_id,type,channel,subject,message,status,sent_at,created_at",
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    return Response.json({ row: data });
  } catch (error) {
    console.error("[Zingara API] Failed to update communication", error);

    return Response.json(
      { error: "Communication could not be updated." },
      { status: 500 },
    );
  }
}
