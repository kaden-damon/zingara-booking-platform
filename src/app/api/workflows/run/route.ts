import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { cleanupPlatformTelemetry } from "@/lib/platformTelemetry";
import {
  runAutomatedWorkflows,
  type AutomatedWorkflowKey,
} from "@/lib/workflows/automatedWorkflows";
import { runCorporatePaymentHolds } from "@/lib/workflows/corporatePaymentHolds";
import { runDailyBookingReview } from "@/lib/workflows/dailyBookingReview";
import { runDailyWaitlistReminder } from "@/lib/workflows/dailyWaitlistReminder";
import { runDineplanScheduledEmails } from "@/lib/workflows/dineplanScheduledEmails";
import { runPublicPaymentHoldCleanup } from "@/lib/workflows/publicPaymentHolds";
import { runReviewManagementWorkflows } from "@/lib/workflows/reviewManagement";
import { isAuthorisedWorkflowCronRequest } from "@/lib/workflows/cronAuthorization";
import { runApprovedPlatformFeedbackCampaign } from "@/lib/platformFeedbackCampaign";
import { runInvoiceRequestReminder } from "@/lib/workflows/invoiceRequestReminders";
import { runAutomaticTableAssignmentNotifications } from "@/lib/workflows/automaticTableAssignmentNotifications";
import { runLiveXeroSyncWorker } from "@/lib/xero/liveSync";
import { runLiveXeroReconciliation } from "@/lib/xero/liveReconciliation";
import { runAdvertisingConversionWorker } from "@/lib/advertisingConversionOutbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function shouldRunDailyTelemetryCleanup() {
  const johannesburgHour = Number(
    new Intl.DateTimeFormat("en-ZA", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Africa/Johannesburg",
    }).format(new Date()),
  );

  return johannesburgHour === 3;
}

export async function GET(request: Request) {
  if (!isAuthorisedWorkflowCronRequest(request)) {
    return Response.json({ error: "Unauthorised workflow runner." }, { status: 401 });
  }

  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") === "send" ? "send" : "dry-run";
    const workflow = url.searchParams.get("workflow");
    const workflowKey =
      workflow === "pre_show_reminder" || workflow === "post_show_review"
        ? (workflow as AutomatedWorkflowKey)
        : undefined;
    const result = await runAutomatedWorkflows(serviceClient, {
      allowedRecipient: process.env.WORKFLOW_ALLOWED_RECIPIENT,
      mode,
      workflowKey,
    });
    const corporatePaymentHolds = await runCorporatePaymentHolds(serviceClient);
    let dailyBookingReview: Awaited<ReturnType<typeof runDailyBookingReview>> | { reason: "failed"; sent: 0; skipped: 0 };
    try {
      dailyBookingReview = await runDailyBookingReview(serviceClient);
    } catch (dailyReviewError) {
      console.error("[Zingara Workflows] Daily Booking Review failed", dailyReviewError);
      dailyBookingReview = { reason: "failed", sent: 0, skipped: 0 };
    }
    let dailyWaitlistReminder: Awaited<ReturnType<typeof runDailyWaitlistReminder>> | { reason: "failed"; sent: false };
    try {
      dailyWaitlistReminder = await runDailyWaitlistReminder(serviceClient);
    } catch (waitlistReminderError) {
      console.error("[Zingara Workflows] Daily Waitlist Reminder failed", waitlistReminderError);
      dailyWaitlistReminder = { reason: "failed", sent: false };
    }
    const publicPaymentHolds = await runPublicPaymentHoldCleanup(serviceClient);
    let reviewManagement: Awaited<ReturnType<typeof runReviewManagementWorkflows>> | { reason: "failed" };
    try {
      reviewManagement = await runReviewManagementWorkflows(serviceClient);
    } catch (reviewError) {
      console.error("[Zingara Workflows] Review management notifications failed", reviewError);
      reviewManagement = { reason: "failed" };
    }
    let dineplanScheduledEmails: Awaited<ReturnType<typeof runDineplanScheduledEmails>> | { delivered: 0; reason: "failed" };
    try {
      dineplanScheduledEmails = await runDineplanScheduledEmails(serviceClient);
    } catch (digestError) {
      console.error("[Zingara Workflows] Dineplan scheduled emails failed", digestError);
      dineplanScheduledEmails = { delivered: 0, reason: "failed" };
    }
    let platformFeedback: Awaited<ReturnType<typeof runApprovedPlatformFeedbackCampaign>> | { reason: "failed" };
    try {
      platformFeedback = await runApprovedPlatformFeedbackCampaign(
        serviceClient,
        process.env.NEXT_PUBLIC_APP_URL || "https://book.zingara.co.za",
      );
    } catch (feedbackError) {
      console.error("[Zingara Workflows] Booking Experience Feedback failed", feedbackError);
      platformFeedback = { reason: "failed" };
    }
    let invoiceRequestReminder: Awaited<ReturnType<typeof runInvoiceRequestReminder>> | { reason: "failed" };
    try {
      invoiceRequestReminder = await runInvoiceRequestReminder(serviceClient);
    } catch (reminderError) {
      console.error("[Zingara Workflows] Invoice request reminder failed", reminderError);
      invoiceRequestReminder = { reason: "failed" };
    }
    let automaticTableAssignmentNotifications: Awaited<ReturnType<typeof runAutomaticTableAssignmentNotifications>> | { reason: "failed" };
    try {
      automaticTableAssignmentNotifications = await runAutomaticTableAssignmentNotifications(serviceClient);
    } catch (notificationError) {
      console.error("[Zingara Workflows] Automatic table assignment notifications failed", notificationError);
      automaticTableAssignmentNotifications = { reason: "failed" };
    }
    let xeroSync: Awaited<ReturnType<typeof runLiveXeroSyncWorker>> | { reason: "failed" };
    try {
      xeroSync = await runLiveXeroSyncWorker(serviceClient);
    } catch (xeroError) {
      console.error("[Zingara Workflows] Xero invoice sync failed", xeroError);
      xeroSync = { reason: "failed" };
    }
    let xeroReconciliation: Awaited<ReturnType<typeof runLiveXeroReconciliation>> | { reason: "failed" };
    try {
      xeroReconciliation = await runLiveXeroReconciliation(serviceClient);
    } catch (xeroError) {
      console.error("[Zingara Workflows] Xero reconciliation failed", xeroError);
      xeroReconciliation = { reason: "failed" };
    }
    let advertisingConversions: Awaited<ReturnType<typeof runAdvertisingConversionWorker>> | { reason: "failed" };
    try {
      advertisingConversions = await runAdvertisingConversionWorker(serviceClient);
    } catch (conversionError) {
      console.error("[Zingara Workflows] Advertising conversion delivery failed", conversionError);
      advertisingConversions = { reason: "failed" };
    }
    let telemetryCleanup: Awaited<ReturnType<typeof cleanupPlatformTelemetry>> =
      null;

    if (!workflowKey && shouldRunDailyTelemetryCleanup()) {
      try {
        telemetryCleanup = await cleanupPlatformTelemetry(serviceClient);
      } catch (cleanupError) {
        console.error("[Zingara Workflows] Telemetry cleanup failed", {
          message:
            cleanupError instanceof Error
              ? cleanupError.message
              : "Unknown error",
        });
      }
    }

    return Response.json({
      ...result,
      advertisingConversions,
      automaticTableAssignmentNotifications,
      corporatePaymentHolds,
      dailyBookingReview,
      dailyWaitlistReminder,
      dineplanScheduledEmails,
      invoiceRequestReminder,
      platformFeedback,
      publicPaymentHolds,
      reviewManagement,
      telemetryCleanup,
      xeroSync,
      xeroReconciliation,
    });
  } catch (error) {
    console.error("[Zingara Workflows] Workflow dry-run failed", error);

    return Response.json(
      { error: "Workflow runner could not complete." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
