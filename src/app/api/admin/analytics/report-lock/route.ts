import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import {
  acquireReportGenerationLock,
  getReportGenerationLock,
  releaseReportGenerationLock,
} from "@/lib/supabase/reportGenerationLockServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

async function authorize(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return { auth, error: auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  if (!getRolePermissions(roleOf(auth.staffProfile)).includes("analytics:read")) {
    return { auth, error: Response.json({ error: "Analytics access is required." }, { status: 403 }) };
  }
  return { auth, error: null };
}

export async function GET(request: Request) {
  const { auth, error } = await authorize(request);
  if (error || !auth.serviceClient || !auth.staffProfile) {
    return error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const lock = await getReportGenerationLock(auth.serviceClient, auth.staffProfile.id);
    return Response.json({ lock }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (loadError) {
    console.error("[Zingara Analytics] Report lock status failed", loadError);
    return Response.json({ error: "Report generation status could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { auth, error } = await authorize(request);
  if (error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    action?: "acquire" | "release";
    lockToken?: string;
    outcome?: "failed" | "success";
    reportScope?: Record<string, unknown>;
    reportType?: string;
  } | null;

  if (!body?.action || !body.reportType?.trim()) {
    return Response.json({ error: "A report action and type are required." }, { status: 400 });
  }

  const reportScope = body.reportScope && typeof body.reportScope === "object" ? body.reportScope : {};

  try {
    if (body.action === "acquire") {
      const result = await acquireReportGenerationLock({
        reportScope,
        reportType: body.reportType,
        request,
        serviceClient: auth.serviceClient,
        staffProfile: auth.staffProfile,
        user: auth.user,
      });

      if (!result.acquired) {
        return Response.json(
          { error: result.ownerName ? `${result.ownerName} is currently generating a report.` : "A report is currently being generated.", lock: result },
          { status: 423 },
        );
      }

      return Response.json({ lock: result });
    }

    if (body.action !== "release" || !body.lockToken || !body.outcome) {
      return Response.json({ error: "A lock token and completion outcome are required." }, { status: 400 });
    }

    await releaseReportGenerationLock({
      lockToken: body.lockToken,
      outcome: body.outcome,
      reportScope,
      reportType: body.reportType,
      request,
      serviceClient: auth.serviceClient,
      staffProfile: auth.staffProfile,
      user: auth.user,
    });
    return Response.json({ released: true });
  } catch (lockError) {
    console.error("[Zingara Analytics] Report lock action failed", lockError);
    return Response.json({ error: "Report generation lock could not be updated." }, { status: 500 });
  }
}
