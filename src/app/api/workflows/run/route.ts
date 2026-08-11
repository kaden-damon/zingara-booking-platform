import { getServiceClient } from "@/lib/supabase/serverAdmin";
import {
  runAutomatedWorkflows,
  type AutomatedWorkflowKey,
} from "@/lib/workflows/automatedWorkflows";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getBearerToken(request: Request) {
  return request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
}

function isAuthorisedCronRequest(request: Request) {
  const configuredSecret = (
    process.env.WORKFLOW_CRON_SECRET ??
    process.env.CRON_SECRET ??
    ""
  ).trim();

  if (!configuredSecret) {
    return false;
  }

  return getBearerToken(request) === configuredSecret;
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

    return Response.json({
      ...result,
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
