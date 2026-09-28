import { getActorRoleLabel } from "@/lib/auditTrail";
import {
  validateCompanyInput,
  type CompanyWriteInput,
} from "@/lib/companyMaster";
import {
  loadCompanies,
  toCompanyRpcPayload,
} from "@/lib/supabase/companyMasterServer";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

function actorRpcArgs(
  request: Request,
  auth: Awaited<ReturnType<typeof requireActiveStaff>>,
) {
  const role = Array.isArray(auth.staffProfile?.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile?.roles;

  return {
    p_actor_auth_user_id: auth.user?.id,
    p_actor_location_scope: auth.staffProfile?.venue_scope ?? [],
    p_actor_name: auth.staffProfile?.full_name ?? auth.user?.email ?? "Staff",
    p_actor_role: getActorRoleLabel(role?.name),
    p_actor_staff_profile_id: auth.staffProfile?.id,
    p_request_id:
      request.headers.get("x-vercel-id") ??
      request.headers.get("x-request-id") ??
      crypto.randomUUID(),
    p_user_agent: request.headers.get("user-agent"),
  };
}

function canManageCompanies(
  auth: Awaited<ReturnType<typeof requireActiveStaff>>,
) {
  const role = Array.isArray(auth.staffProfile?.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile?.roles;

  return getRolePermissions(role).includes("bookings:manage");
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient) return auth.error;

  try {
    const includeArchived =
      new URL(request.url).searchParams.get("includeArchived") === "true";
    const companies = await loadCompanies(auth.serviceClient, includeArchived);
    return Response.json({ companies });
  } catch (error) {
    console.error("[Zingara API] Failed to load Companies", error);
    return Response.json(
      { error: "Companies could not be loaded." },
      { status: 500 },
    );
  }
}

async function saveCompany(request: Request) {
  const auth = await requireActiveStaff(request);
  if (
    auth.error ||
    !auth.serviceClient ||
    !auth.staffProfile ||
    !auth.user
  ) {
    return auth.error;
  }
  if (!canManageCompanies(auth)) {
    return Response.json(
      { error: "Booking management access is required." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      companyId?: string;
      expectedRevision?: number;
      values?: CompanyWriteInput;
    };
    if (!body.values) {
      return Response.json({ error: "Company details are required." }, { status: 400 });
    }
    const validationError = validateCompanyInput(body.values);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }
    if (!body.companyId && body.values.primaryContactCustomerId) {
      return Response.json(
        { error: "Create the Company before choosing its Primary Contact." },
        { status: 409 },
      );
    }

    const { data, error } = await auth.serviceClient.rpc("save_company_atomic", {
      ...actorRpcArgs(request, auth),
      p_company_id: body.companyId ?? null,
      p_expected_revision: body.expectedRevision ?? 0,
      p_payload: toCompanyRpcPayload(body.values),
    });
    if (error) {
      const message = error.message ?? "";
      if (message.includes("COMPANY_ALREADY_EXISTS")) {
        return Response.json(
          { error: "A Company with this legal name already exists." },
          { status: 409 },
        );
      }
      if (message.includes("COMPANY_CHANGED")) {
        return Response.json(
          { error: "This Company changed. Refresh and try again." },
          { status: 409 },
        );
      }
      if (message.includes("PRIMARY_CONTACT_NOT_LINKED")) {
        return Response.json(
          { error: "The Primary Contact must first be linked to this Company." },
          { status: 409 },
        );
      }
      throw error;
    }

    const companyId = String((data as { id?: string } | null)?.id ?? body.companyId ?? "");
    const companies = await loadCompanies(auth.serviceClient, true);
    const company = companies.find((candidate) => candidate.id === companyId);
    if (!company) throw new Error("Saved Company could not be reloaded.");

    return Response.json({ company });
  } catch (error) {
    console.error("[Zingara API] Failed to save Company", error);
    return Response.json(
      { error: "Company details could not be saved." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return saveCompany(request);
}

export async function PATCH(request: Request) {
  return saveCompany(request);
}
