import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getStaffIssueCategoryLabel,
  getStaffIssuePriorityLabel,
  type StaffIssueCategory,
  type StaffIssuePriority,
} from "@/lib/staffIssues";
import type { StaffIssueMediaType } from "@/lib/staffIssueMedia";
import { sendZingaraEmail } from "@/lib/email/smtp";
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
  const emailResult = await sendZingaraEmail({
    attachments: notification.attachments,
    message: notification.message,
    subject: `[${issue.ticketReference}] ${issue.title}`,
    to: issueNotificationRecipient,
  });

  if (recipient?.id) {
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
  } else {
    console.error("[Zingara Issues] Kaden push identity was not found.");
  }

  return {
    delivered: emailResult.ok,
    error: emailResult.ok ? null : emailResult.error,
  };
}
