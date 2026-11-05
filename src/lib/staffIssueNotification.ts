import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminIssueTechnicalContext } from "@/lib/adminIssueCapture";
import { insertCommunicationPayload } from "@/lib/email/communicationIdempotency";
import { createBrandedCustomerEmail } from "@/lib/email/customerEmail";
import {
  getStaffIssueCategoryLabel,
  getStaffIssuePriorityLabel,
  type StaffIssueCategory,
  type StaffIssuePriority,
} from "@/lib/staffIssues";
import type { StaffIssueMediaType } from "@/lib/staffIssueMedia";
import { sendZingaraEmail } from "@/lib/email/smtp";
import {
  claimStaffEmailDelivery,
  completeStaffEmailDelivery,
} from "@/lib/email/staffEmailNotifications";
import { sendStaffIdentityPushNotification } from "@/lib/supabase/staffPush";
import { buildStaffIssueNotificationContent } from "@/lib/staffIssueNotificationContent";

const issueNotificationRecipient = "kaden@kaden.co.za";

export type StaffIssueNotificationDetails = {
  category: StaffIssueCategory;
  createdAt: string;
  description: string;
  id: string;
  location: string | null;
  moduleOrArea: string | null;
  priority: StaffIssuePriority;
  reporterEmail: string | null;
  reporterName: string | null;
  ticketReference: string;
  title: string;
  technicalContext?: AdminIssueTechnicalContext | null;
};

export type StaffIssueNotificationMedia = {
  content: Buffer;
  fileSize: number;
  mimeType: StaffIssueMediaType;
  originalFilename: string;
};

export async function notifyKadenOfStaffIssue(
  serviceClient: SupabaseClient,
  issue: StaffIssueNotificationDetails,
  media: StaffIssueNotificationMedia[] = [],
) {
  const { data: recipient, error } = await serviceClient
    .from("staff_profiles")
    .select("id,user_id")
    .eq("email", issueNotificationRecipient)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const notification = buildStaffIssueNotificationContent(
    {
      ...issue,
      categoryLabel: getStaffIssueCategoryLabel(issue.category),
      priorityLabel: getStaffIssuePriorityLabel(issue.priority),
    },
    media,
  );
  const deliveryId = await claimStaffEmailDelivery(serviceClient, {
    ccStaffProfileIds: [],
    eventKey: issue.id,
    notificationKey: "staff-issue-report",
    toStaffProfileIds: recipient?.id ? [recipient.id] : [],
  });

  if (!deliveryId) {
    return { deduplicated: true, delivered: true, error: null };
  }

  const subject = `[${issue.ticketReference}] ${issue.title}`;
  let communicationId: string | null = null;

  try {
    const communication = await insertCommunicationPayload(serviceClient, {
      booking_id: null,
      channel: "email",
      customer_id: null,
      message: notification.message,
      sent_at: null,
      show_id: null,
      status: "sending",
      subject,
      type: "custom_message",
    });
    communicationId = communication?.id ?? null;
  } catch (communicationError) {
    await completeStaffEmailDelivery(serviceClient, deliveryId, {
      error: "Communications evidence could not be prepared.",
      status: "failed",
    });
    throw communicationError;
  }

  let emailResult:
    | { error?: never; ok: true }
    | { error: string; ok: false };

  try {
    const branded = await createBrandedCustomerEmail({
      ctaLabel: "OPEN ISSUE",
      ctaUrl: notification.issueUrl,
      heading: `New Issue · ${issue.ticketReference}`,
      html: notification.html,
      includeAgePolicy: false,
      includeSecurityNotice: false,
      message: notification.message,
      preserveTableReferences: true,
      subject,
    });
    emailResult = await sendZingaraEmail({
      attachments: [...branded.attachments, ...notification.attachments],
      html: branded.html,
      message: branded.message,
      subject,
      to: issueNotificationRecipient,
    });
  } catch (deliveryError) {
    await Promise.all([
      completeStaffEmailDelivery(serviceClient, deliveryId, {
        error: "The email provider could not complete the notification.",
        status: "failed",
      }),
      communicationId
        ? serviceClient
            .from("communications")
            .update({ sent_at: new Date().toISOString(), status: "failed" })
            .eq("id", communicationId)
        : Promise.resolve(),
    ]);
    throw deliveryError;
  }

  const [, communicationUpdate] = await Promise.all([
    completeStaffEmailDelivery(serviceClient, deliveryId, {
      error: emailResult.ok ? undefined : emailResult.error,
      status: emailResult.ok ? "sent" : "failed",
    }),
    communicationId
      ? serviceClient
          .from("communications")
          .update({
            sent_at: new Date().toISOString(),
            status: emailResult.ok ? "sent" : "failed",
          })
          .eq("id", communicationId)
      : Promise.resolve(),
  ]);
  if (communicationUpdate && "error" in communicationUpdate && communicationUpdate.error) {
    console.error(
      "[Zingara Issues] Communication delivery status could not be updated",
      communicationUpdate.error,
    );
  }

  if (emailResult.ok && recipient?.id) {
    try {
      await sendStaffIdentityPushNotification({
        body: `${getStaffIssuePriorityLabel(issue.priority)} · ${issue.title}`,
        staffProfileId: recipient.id,
        title: `New issue · ${issue.ticketReference}`,
        url: `/admin?section=platform-operations&issue=${issue.id}`,
        userId: recipient.user_id,
      });
    } catch (pushError) {
      console.error("[Zingara Issues] Issue push notification failed", pushError);
    }
  } else if (!recipient?.id) {
    console.error("[Zingara Issues] Kaden push identity was not found.");
  }

  return {
    delivered: emailResult.ok,
    error: emailResult.ok ? null : emailResult.error,
  };
}
