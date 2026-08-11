import {
  defaultWorkflowConfigurations,
  isHttpsUrl,
  loadWorkflowConfigurations,
  saveWorkflowConfigurations,
  type AutomatedWorkflowConfiguration,
  type AutomatedWorkflowKey,
} from "@/lib/workflows/automatedWorkflows";
import {
  getAdminRoleFromName,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { recordAuditEvent } from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getStaffRole(
  staffProfile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  const role = Array.isArray(staffProfile.roles)
    ? staffProfile.roles[0]
    : staffProfile.roles;

  return getAdminRoleFromName(role?.name);
}

function isWorkflowKey(value: string): value is AutomatedWorkflowKey {
  return value === "pre_show_reminder" || value === "post_show_review";
}

function normaliseConfiguration(
  input: Partial<AutomatedWorkflowConfiguration>,
  existing: AutomatedWorkflowConfiguration,
  nowIso: string,
) {
  const workflowKey = input.workflowKey ?? existing.workflowKey;

  if (!isWorkflowKey(workflowKey)) {
    throw new Error("Unknown workflow key.");
  }

  const enabled = Boolean(input.enabled);
  const timingOffsetDays = Number(input.timingOffsetDays);
  const subject = String(input.subject ?? existing.subject).trim();
  const body = String(input.body ?? existing.body).trim();
  const capeTownReviewUrl = String(input.capeTownReviewUrl ?? "").trim();
  const johannesburgReviewUrl = String(
    input.johannesburgReviewUrl ?? "",
  ).trim();

  if (!subject || !body) {
    throw new Error("Workflow subject and body are required.");
  }

  if (!Number.isInteger(timingOffsetDays)) {
    throw new Error("Workflow timing must be a whole number of days.");
  }

  const minDays = 1;
  const maxDays = workflowKey === "post_show_review" ? 7 : 30;

  if (timingOffsetDays < minDays || timingOffsetDays > maxDays) {
    throw new Error(`Workflow timing must be between ${minDays} and ${maxDays} days.`);
  }

  if (!isHttpsUrl(capeTownReviewUrl) || !isHttpsUrl(johannesburgReviewUrl)) {
    throw new Error("Review URLs must be valid https URLs.");
  }

  if (
    workflowKey === "post_show_review" &&
    enabled &&
    (!capeTownReviewUrl || !johannesburgReviewUrl)
  ) {
    throw new Error(
      "Cape Town and Johannesburg review URLs are required before enabling reviews.",
    );
  }

  return {
    ...existing,
    activatedAt:
      !existing.enabled && enabled ? nowIso : enabled ? existing.activatedAt : null,
    body,
    capeTownReviewUrl,
    enabled,
    johannesburgReviewUrl,
    subject,
    timingOffsetDays,
    workflowKey,
  };
}

type WorkflowAuditShape = {
  activatedAt: string | null;
  capeTownReviewUrl: string;
  enabled: boolean;
  johannesburgReviewUrl: string;
  subject: string;
  timingOffsetDays: number;
  workflowKey: AutomatedWorkflowKey;
};

function auditShape(config: AutomatedWorkflowConfiguration): WorkflowAuditShape {
  return {
    activatedAt: config.activatedAt,
    capeTownReviewUrl: config.capeTownReviewUrl ? "configured" : "",
    enabled: config.enabled,
    johannesburgReviewUrl: config.johannesburgReviewUrl ? "configured" : "",
    subject: config.subject,
    timingOffsetDays: config.timingOffsetDays,
    workflowKey: config.workflowKey,
  };
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  const role = getStaffRole(auth.staffProfile);

  if (role !== "super-admin") {
    return Response.json(
      { error: "Automated workflow configuration is restricted to Super Admin." },
      { status: 403 },
    );
  }

  try {
    const workflows = await loadWorkflowConfigurations(auth.serviceClient);

    return Response.json({ workflows });
  } catch (error) {
    console.error("[Zingara Workflows] Failed to load workflow config", error);

    return Response.json(
      { error: "Workflow configuration could not be loaded." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  const role = getStaffRole(auth.staffProfile);

  if (role !== "super-admin") {
    return Response.json(
      { error: "Automated workflow configuration is restricted to Super Admin." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      workflows?: Partial<AutomatedWorkflowConfiguration>[];
    };
    const existing = await loadWorkflowConfigurations(auth.serviceClient);
    const existingByKey = new Map(
      existing.map((configuration) => [
        configuration.workflowKey,
        configuration,
      ]),
    );
    const nowIso = new Date().toISOString();
    const workflows = defaultWorkflowConfigurations.map((defaultConfig) => {
      const incoming = body.workflows?.find(
        (configuration) =>
          configuration.workflowKey === defaultConfig.workflowKey,
      );
      const current = existingByKey.get(defaultConfig.workflowKey) ?? defaultConfig;

      return normaliseConfiguration(incoming ?? current, current, nowIso);
    });
    const saved = await saveWorkflowConfigurations(
      auth.serviceClient,
      workflows,
      auth.user?.id ?? null,
    );

    await Promise.all(
      saved.map((workflow) => {
        const before = existingByKey.get(workflow.workflowKey);
        const beforeShape = before
          ? auditShape(before)
          : ({} as Partial<WorkflowAuditShape>);
        const afterShape = auditShape(workflow);
        const changedFields = (Object.keys(afterShape) as Array<
          keyof WorkflowAuditShape
        >).filter(
          (field) =>
            JSON.stringify(beforeShape[field]) !==
            JSON.stringify(afterShape[field]),
        );

        if (changedFields.length === 0) {
          return Promise.resolve();
        }

        return recordAuditEvent(
          auth.serviceClient!,
          auth.staffProfile,
          auth.user,
          {
            action: "workflow_configuration_updated",
            afterValues: afterShape,
            beforeValues: beforeShape,
            changedFields,
            entityReference: workflow.workflowKey,
            entityType: "workflow",
            outcome: "success",
            request,
            sourceArea: "Automated Workflows",
          },
        );
      }),
    );

    return Response.json({ workflows: saved });
  } catch (error) {
    console.error("[Zingara Workflows] Failed to save workflow config", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Workflow configuration could not be saved.",
      },
      { status: 400 },
    );
  }
}
