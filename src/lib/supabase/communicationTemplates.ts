import {
  type CommunicationChannel,
  type CommunicationTemplate,
  type CommunicationTrigger,
  defaultCommunicationTemplates,
  getStoredCommunicationTemplates,
  storeCommunicationTemplates,
} from "@/lib/zingaraDemo";
import { fetchSupabaseApi } from "./apiClient";

type SupabaseCommunicationType =
  | "booking_confirmation"
  | "complimentary_booking"
  | "corporate_tentative_booking"
  | "custom_message"
  | "operational_broadcast"
  | "payment_confirmation"
  | "post_show_review"
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

  if (trigger === "post-show-review") {
    return "post_show_review";
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

  if (type === "post_show_review") {
    return "post-show-review";
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

export async function getTemplates() {
  const fallbackTemplates = getStoredCommunicationTemplates();

  try {
    const payload = await fetchSupabaseApi<{
      templates: CommunicationTemplate[];
    }>("/api/admin/communication-templates");

    if (!payload.templates || payload.templates.length === 0) {
      return fallbackTemplates;
    }

    return payload.templates;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to load communication templates", error);
    return fallbackTemplates;
  }
}

async function persistTemplatesToSupabase(templates: CommunicationTemplate[]) {
  try {
    const payload = await fetchSupabaseApi<{
      templates: CommunicationTemplate[];
    }>("/api/admin/communication-templates", {
      body: { templates },
      method: "PUT",
    });

    return payload.templates ?? templates;
  } catch (error) {
    console.error(
      "[Zingara Supabase] Failed to load communication templates for persistence",
      error,
    );
    return templates;
  }
}

export async function saveTemplates(templates: CommunicationTemplate[]) {
  storeCommunicationTemplates(templates);

  return persistTemplatesToSupabase(templates);
}

export async function saveTemplate(template: CommunicationTemplate) {
  const templates = getStoredCommunicationTemplates();
  const nextTemplates = templates.some(
    (currentTemplate) => currentTemplate.id === template.id,
  )
    ? templates.map((currentTemplate) =>
        currentTemplate.id === template.id ? template : currentTemplate,
      )
    : [template, ...templates];

  return saveTemplates(nextTemplates);
}

export async function updateTemplate(
  templateId: string,
  updates: Partial<
    Pick<CommunicationTemplate, "body" | "channel" | "subject">
  >,
) {
  const templates = getStoredCommunicationTemplates();
  const nextTemplates = templates.map((template) =>
    template.id === templateId
      ? {
          ...template,
          ...updates,
          updatedAt: new Date().toISOString(),
        }
      : template,
  );

  return saveTemplates(nextTemplates);
}
