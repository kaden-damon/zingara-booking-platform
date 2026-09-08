import { requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { tryRecordAuditEvent } from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";

async function denyAdminDataPortability(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
    action: "data-portability.access",
    entityReference: "imports",
    entityType: "data-portability-import",
    outcome: "blocked",
    reason: "Admin Data Portability access is disabled.",
    request,
    sourceArea: "Data Portability",
  });

  return Response.json(
    { error: "Admin Data Portability access is disabled." },
    { status: 403 },
  );
}

export async function GET(request: Request) {
  return denyAdminDataPortability(request);
}

export async function POST(request: Request) {
  return denyAdminDataPortability(request);
}
