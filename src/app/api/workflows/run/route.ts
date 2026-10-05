import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { cleanupPlatformTelemetry } from "@/lib/platformTelemetry";
import {
  runAutomatedWorkflows,
  type AutomatedWorkflowKey,
} from "@/lib/workflows/automatedWorkflows";
import { runCorporatePaymentHolds } from "@/lib/workflows/corporatePaymentHolds";
import { runDailyBookingReview } from "@/lib/workflows/dailyBookingReview";
import { runDineplanScheduledEmails } from "@/lib/workflows/dineplanScheduledEmails";
import { runPublicPaymentHoldCleanup } from "@/lib/workflows/publicPaymentHolds";
import { runReviewManagementWorkflows } from "@/lib/workflows/reviewManagement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getBearerToken(request: Request) {
  return request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
}

function isAuthorisedCronRequest(request: Request) {
  const configuredSecrets = [
    process.env.CRON_SECRET,
    process.env.WORKFLOW_CRON_SECRET,
  ].flatMap((value) => value?.trim() ? [value.trim()] : []);

  if (!configuredSecrets.length) {
    return false;
  }

  const bearerToken = getBearerToken(request);
  return Boolean(bearerToken && configuredSecrets.includes(bearerToken));
}

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
  if (!isAuthorisedCronRequest(request)) {
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
      corporatePaymentHolds,
      dailyBookingReview,
      dineplanScheduledEmails,
      publicPaymentHolds,
      reviewManagement,
      telemetryCleanup,
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
