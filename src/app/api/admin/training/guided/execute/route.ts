import { cookies } from "next/headers";

import {
  guidedTrainingModules,
  isGuidedTrainingModuleId,
} from "@/lib/guidedTraining";
import {
  guidedTrainingPreviewCookie,
  verifyGuidedTrainingPreviewSession,
} from "@/lib/guidedTrainingPreviewSession";
import { requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    moduleId?: unknown;
  } | null;
  if (!body || !isGuidedTrainingModuleId(body.moduleId)) {
    return Response.json({ error: "Invalid training module." }, { status: 400 });
  }
  const token = (await cookies()).get(guidedTrainingPreviewCookie)?.value;
  if (!verifyGuidedTrainingPreviewSession(token, body.moduleId)) {
    const auth = await requireActiveStaff(request);
    if (auth.error || !auth.staffProfile) {
      return Response.json(
        { error: "Training preview session expired." },
        { status: 403 },
      );
    }
  }
  const allowedAction = body.moduleId === "buyout" ? "create-buyout" : "create-booking";
  if (body.action !== allowedAction) {
    return Response.json({ error: "Invalid training action." }, { status: 400 });
  }
  const trainingModule = guidedTrainingModules.find((item) => item.id === body.moduleId)!;
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return Response.json({
    bookingReference: `ZNG-${suffix}`,
    moduleId: trainingModule.id,
    moduleVersion: trainingModule.version,
    persisted: false,
    synthetic: true,
  });
}
