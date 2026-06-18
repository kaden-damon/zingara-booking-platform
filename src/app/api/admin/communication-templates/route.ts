import {
  type CommunicationChannel,
  type CommunicationTemplate,
  type CommunicationTrigger,
  defaultCommunicationTemplates,
} from "@/lib/zingaraDemo";
import {
  getServiceClient,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

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

type SupabaseCommunicationChannel =
  | "email"
  | "internal_note"
  | "push"
  | "sms"
  | "whatsapp";

type SupabaseCommunicationTemplateRow = {
  active: boolean;
  body: string;
  channel: SupabaseCommunicationChannel;
  id: string;
  name: string;
  subject: string;
  type: SupabaseCommunicationType;
  updated_at?: string;
};

function toSupabaseType(
  trigger: CommunicationTrigger,
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

function toCommunicationTrigger(
  type: SupabaseCommunicationType,
): CommunicationTrigger {
  if (type === "booking_confirmation") {
    return "booking-confirmation";
  }

  if (type === "payment_confirmation") {
    return "payment-confirmation";
  }

  if (type === "reservation_confirmed") {
    return "reservation-confirmed";
  }

  if (type === "reservation_pending") {
    return "reservation-pending";
  }

  if (type === "complimentary_booking") {
    return "complimentary-booking";
  }

  if (type === "corporate_tentative_booking") {
    return "corporate-tentative-booking";
  }

  if (type === "show_reminder") {
    return "show-reminder";
  }

  if (type === "refund_notice") {
    return "cancellation-refund";
  }

  if (type === "operational_broadcast") {
    return "operational-broadcast";
  }

  return "custom-message";
}

function toSupabaseChannel(
  channel: CommunicationChannel,
): SupabaseCommunicationChannel {
  return channel;
}

function toCommunicationChannel(
  channel: SupabaseCommunicationChannel,
): CommunicationChannel {
  if (channel === "whatsapp" || channel === "internal_note") {
    return "email";
  }

  return channel;
}

function findDefaultTemplate(row: SupabaseCommunicationTemplateRow) {
  return defaultCommunicationTemplates.find(
    (template) =>
      template.channel === toCommunicationChannel(row.channel) &&
      template.name === row.name,
  );
}

function toCommunicationTemplate(
  row: SupabaseCommunicationTemplateRow,
): CommunicationTemplate {
  const defaultTemplate = findDefaultTemplate(row);

  return {
    body: row.body,
    channel: toCommunicationChannel(row.channel),
    id:
      defaultTemplate?.id ??
      `${toCommunicationChannel(row.channel)}-${row.type}-${row.id}`,
    name: row.name,
    subject: row.subject,
    trigger: defaultTemplate?.trigger ?? toCommunicationTrigger(row.type),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

function mergeMissingDefaultTemplates(templates: CommunicationTemplate[]) {
  const templateIds = new Set(templates.map((template) => template.id));

  return [
    ...templates,
    ...defaultCommunicationTemplates.filter(
      (template) => !templateIds.has(template.id),
    ),
  ];
}

function toSupabaseTemplate(template: CommunicationTemplate) {
  return {
    active: true,
    body: template.body,
    channel: toSupabaseChannel(template.channel),
    name: template.name,
    subject: template.subject,
    type: toSupabaseType(template.trigger),
  };
}

async function loadTemplates(includeInactive = false) {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    throw new Error("Supabase service role is not configured.");
  }

  let query = serviceClient
    .from("communication_templates")
    .select("id,type,channel,name,subject,body,active,updated_at")
    .order("name", { ascending: true });

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as SupabaseCommunicationTemplateRow[];
}

async function persistTemplates(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
  templates: CommunicationTemplate[],
) {
  const existingRows = await loadTemplates(true);

  await Promise.all(
    templates.map((template) => {
      const templatePayload = toSupabaseTemplate(template);
      const existingRow = existingRows.find(
        (row) =>
          row.name === template.name &&
          row.channel === templatePayload.channel,
      );

      if (existingRow) {
        return serviceClient
          .from("communication_templates")
          .update(templatePayload)
          .eq("id", existingRow.id);
      }

      return serviceClient.from("communication_templates").insert(templatePayload);
    }),
  );
}

export async function GET() {
  try {
    const serviceClient = getServiceClient();
    let rows = await loadTemplates();

    if (rows.length === 0 && serviceClient) {
      await persistTemplates(serviceClient, defaultCommunicationTemplates);
      rows = await loadTemplates();
    }

    const templates = mergeMissingDefaultTemplates(rows.map(toCommunicationTemplate));

    return Response.json({ templates });
  } catch (error) {
    console.error("[Zingara API] Failed to load communication templates", error);

    return Response.json(
      { error: "Communication templates could not be loaded." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as {
      templates?: CommunicationTemplate[];
    };
    const templates = body.templates ?? [];

    await persistTemplates(auth.serviceClient, templates);

    const rows = await loadTemplates();

    return Response.json({
      templates: mergeMissingDefaultTemplates(rows.map(toCommunicationTemplate)),
    });
  } catch (error) {
    console.error("[Zingara API] Failed to save communication templates", error);

    return Response.json(
      { error: "Communication templates could not be saved." },
      { status: 500 },
    );
  }
}
