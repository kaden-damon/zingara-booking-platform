import type { SupabaseClient } from "@supabase/supabase-js";

export const staffEmailNotificationRegistry = [
  {
    description: "Your daily summary of bookings you originally created.",
    key: "daily-booking-review",
    label: "Daily Booking Review",
    mode: "personal",
  },
  {
    description: "A concise alert whenever a new Corporate enquiry is received.",
    key: "corporate-enquiry",
    label: "New Corporate Enquiries",
    mode: "management",
  },
  {
    description: "An immediate alert whenever a guest submits a review.",
    key: "new-review-alert",
    label: "New Review Alerts",
    mode: "management",
  },
] as const;

export type StaffEmailNotificationKey =
  (typeof staffEmailNotificationRegistry)[number]["key"];
export type PersonalEmailNotificationKey = Extract<
  (typeof staffEmailNotificationRegistry)[number],
  { mode: "personal" }
>["key"];
export type ManagementEmailNotificationKey = Extract<
  (typeof staffEmailNotificationRegistry)[number],
  { mode: "management" }
>["key"];

type StaffRecipient = {
  email: string;
  id: string;
  name: string;
};

export type ManagementEmailRoute = {
  cc: StaffRecipient[];
  enabled: boolean;
  key: ManagementEmailNotificationKey;
  to: StaffRecipient[];
};

function uniqueIds(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export async function isPersonalEmailSubscriptionEnabled(
  client: SupabaseClient,
  staffProfileId: string,
  notificationKey: PersonalEmailNotificationKey,
) {
  const { data, error } = await client
    .from("staff_email_subscriptions")
    .select("enabled")
    .eq("staff_profile_id", staffProfileId)
    .eq("notification_key", notificationKey)
    .maybeSingle();
  if (error) throw error;
  return data?.enabled !== false;
}

export async function loadPersonalEmailSubscriptions(
  client: SupabaseClient,
  staffProfileId: string,
) {
  const { data, error } = await client
    .from("staff_email_subscriptions")
    .select("notification_key,enabled")
    .eq("staff_profile_id", staffProfileId);
  if (error) throw error;
  const configured = new Map(
    (data ?? []).map((row) => [row.notification_key, row.enabled]),
  );
  return staffEmailNotificationRegistry
    .filter((item) => item.mode === "personal")
    .map((item) => ({ ...item, enabled: configured.get(item.key) !== false }));
}

export async function loadManagementEmailRoute(
  client: SupabaseClient,
  notificationKey: ManagementEmailNotificationKey,
): Promise<ManagementEmailRoute> {
  const { data: route, error } = await client
    .from("management_email_notification_routes")
    .select("notification_key,enabled,to_staff_profile_ids,cc_staff_profile_ids")
    .eq("notification_key", notificationKey)
    .maybeSingle();
  if (error) throw error;
  if (!route) {
    throw new Error(`Management email route ${notificationKey} is not configured.`);
  }

  const toIds = uniqueIds(route.to_staff_profile_ids ?? []);
  const ccIds = uniqueIds(route.cc_staff_profile_ids ?? []).filter(
    (id) => !toIds.includes(id),
  );
  const staffIds = [...toIds, ...ccIds];
  const { data: staff, error: staffError } = staffIds.length
    ? await client
        .from("staff_profiles")
        .select("id,full_name,email")
        .in("id", staffIds)
        .eq("active", true)
        .not("email", "is", null)
    : { data: [], error: null };
  if (staffError) throw staffError;

  const byId = new Map(
    (staff ?? []).map((member) => [
      member.id,
      { email: member.email.trim(), id: member.id, name: member.full_name },
    ]),
  );
  const resolve = (ids: string[]) =>
    ids.flatMap((id) => {
      const member = byId.get(id);
      return member ? [member] : [];
    });

  return {
    cc: resolve(ccIds),
    enabled: route.enabled,
    key: notificationKey,
    to: resolve(toIds),
  };
}

export async function claimStaffEmailDelivery(
  client: SupabaseClient,
  input: {
    ccStaffProfileIds: string[];
    eventKey: string;
    notificationKey: ManagementEmailNotificationKey;
    toStaffProfileIds: string[];
  },
) {
  const { data, error } = await client
    .rpc("claim_staff_email_notification_delivery", {
      p_cc_staff_profile_ids: uniqueIds(input.ccStaffProfileIds),
      p_event_key: input.eventKey,
      p_notification_key: input.notificationKey,
      p_to_staff_profile_ids: uniqueIds(input.toStaffProfileIds),
    });
  if (error) throw error;
  return typeof data === "string" ? data : null;
}

export async function completeStaffEmailDelivery(
  client: SupabaseClient,
  deliveryId: string,
  result: { error?: string; status: "failed" | "sent" | "suppressed" },
) {
  const { error } = await client
    .from("staff_email_notification_deliveries")
    .update({
      last_error: result.error?.slice(0, 1000) ?? null,
      sent_at: result.status === "sent" ? new Date().toISOString() : null,
      status: result.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", deliveryId);
  if (error) throw error;
}
