import { cookies } from "next/headers";

import {
  guidedTrainingModules,
  isGuidedTrainingModuleId,
} from "@/lib/guidedTraining";
import {
  guidedTrainingPreviewCookie,
  verifyGuidedTrainingPreviewSession,
} from "@/lib/guidedTrainingPreviewSession";
import {
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

function previewAllowed() {
  return process.env.NODE_ENV !== "production";
}

function releaseEnabled() {
  return process.env.ACADEMY_GUIDED_TRAINING_ENABLED === "true";
}

function hasLocalPreviewAccess(request: Request) {
  const configuredKey = process.env.ACADEMY_GUIDED_TRAINING_PREVIEW_KEY;
  const suppliedKey = new URL(request.url).searchParams.get("previewKey");
  return Boolean(
    previewAllowed() &&
      configuredKey &&
      suppliedKey &&
      suppliedKey.length === configuredKey.length &&
      suppliedKey === configuredKey,
  );
}

async function hasLocalPreviewSession(request: Request) {
  if (!previewAllowed()) return false;
  const moduleId = new URL(request.url).searchParams.get("module");
  if (!isGuidedTrainingModuleId(moduleId)) return false;
  const token = (await cookies()).get(guidedTrainingPreviewCookie)?.value;
  return Boolean(verifyGuidedTrainingPreviewSession(token, moduleId));
}

async function authenticate(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.staffProfile || !auth.serviceClient) return { auth, error: auth.error };
  if (!previewAllowed() && !releaseEnabled()) {
    return {
      auth,
      error: Response.json({ error: "Guided Training is awaiting approval." }, { status: 404 }),
    };
  }
  return { auth, error: null };
}

export async function GET(request: Request) {
  if (hasLocalPreviewAccess(request) || await hasLocalPreviewSession(request)) {
    return Response.json({
      modules: guidedTrainingModules,
      persistence: "preview-session",
      progress: [],
      staffId: "local-management-preview",
    });
  }
  const { auth, error } = await authenticate(request);
  if (error) return error;
  if (!auth.staffProfile || !auth.serviceClient) {
    return Response.json({ error: "Guided Training authentication failed." }, { status: 401 });
  }

  if (previewAllowed() && !releaseEnabled()) {
    return Response.json({
      modules: guidedTrainingModules,
      persistence: "preview-session",
      progress: [],
      staffId: auth.staffProfile.id,
    });
  }

  const { data, error: loadError } = await auth.serviceClient
    .from("academy_guided_training_progress")
    .select("module_id,module_version,status,current_step,started_at,completed_at,updated_at")
    .eq("staff_profile_id", auth.staffProfile.id);
  if (loadError) {
    console.error("[Guided Training] Progress load failed", loadError.code);
    return Response.json({ error: "Training progress could not be loaded." }, { status: 500 });
  }
  return Response.json({
    modules: guidedTrainingModules,
    persistence: "academy",
    progress: data ?? [],
    staffId: auth.staffProfile.id,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const previewToken = previewAllowed()
    ? (await cookies()).get(guidedTrainingPreviewCookie)?.value
    : undefined;
  const localPreview =
    hasLocalPreviewAccess(request) ||
    (isGuidedTrainingModuleId(body.moduleId) &&
      verifyGuidedTrainingPreviewSession(previewToken, body.moduleId));
  if (localPreview) {
    if (!isGuidedTrainingModuleId(body.moduleId)) {
      return Response.json({ error: "Select a valid Guided Training module." }, { status: 400 });
    }
    const trainingModule = guidedTrainingModules.find((candidate) => candidate.id === body.moduleId)!;
    const currentStep = Number(body.currentStep);
    if (
      body.moduleVersion !== trainingModule.version ||
      !Number.isInteger(currentStep) ||
      currentStep < 0 ||
      currentStep > trainingModule.steps.length
    ) {
      return Response.json({ error: "Training progress is not valid for this module version." }, { status: 400 });
    }
    return Response.json({ accepted: true, persistence: "preview-session" });
  }
  const { auth, error } = await authenticate(request);
  if (error) return error;
  if (!auth.staffProfile || !auth.serviceClient) {
    return Response.json({ error: "Guided Training authentication failed." }, { status: 401 });
  }

  if (!isGuidedTrainingModuleId(body.moduleId)) {
    return Response.json({ error: "Select a valid Guided Training module." }, { status: 400 });
  }
  const trainingModule = guidedTrainingModules.find((candidate) => candidate.id === body.moduleId)!;
  const currentStep = Number(body.currentStep);
  const status = body.status;
  if (
    body.moduleVersion !== trainingModule.version ||
    !Number.isInteger(currentStep) ||
    currentStep < 0 ||
    currentStep > trainingModule.steps.length ||
    !["in-progress", "completed"].includes(String(status)) ||
    (status === "completed" && currentStep !== trainingModule.steps.length)
  ) {
    return Response.json({ error: "Training progress is not valid for this module version." }, { status: 400 });
  }

  if (previewAllowed() && !releaseEnabled()) {
    return Response.json({ accepted: true, persistence: "preview-session" });
  }

  const now = new Date().toISOString();
  const { error: saveError } = await auth.serviceClient
    .from("academy_guided_training_progress")
    .upsert({
      completed_at: status === "completed" ? now : null,
      current_step: currentStep,
      module_id: trainingModule.id,
      module_version: trainingModule.version,
      staff_profile_id: auth.staffProfile.id,
      status,
      updated_at: now,
    }, { onConflict: "staff_profile_id,module_id,module_version" });
  if (saveError) {
    console.error("[Guided Training] Progress save failed", saveError.code);
    return Response.json({ error: "Training progress could not be saved." }, { status: 500 });
  }
  return Response.json({ accepted: true, persistence: "academy" });
}
