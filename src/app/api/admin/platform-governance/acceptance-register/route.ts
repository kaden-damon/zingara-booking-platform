import { adminIpUndertaking } from "@/lib/adminIpUndertaking";
import { getPolicyDisplayVersion } from "@/lib/platformOwner";
import {
  isKnownAdminRoleName,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { isPlatformOwnerIdentity } from "@/lib/supabase/platformOwner";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

type StaffRow = {
  active: boolean;
  email: string;
  full_name: string;
  id: string;
  roles?: { name?: string | null } | Array<{ name?: string | null }> | null;
  user_id: string;
};

type AcceptanceRow = {
  accepted_at: string;
  actor_auth_user_id: string;
  actor_email: string;
  actor_name: string;
  id: string;
  policy_title: string;
  policy_version: string;
  staff_profile_id: string | null;
};

type AuditRow = {
  actor_role: string | null;
  entity_id: string | null;
  id: string;
};

function roleName(row: StaffRow) {
  const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
  return role?.name ?? null;
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return auth.error;
  }

  try {
    if (!(await isPlatformOwnerIdentity(auth.serviceClient, auth.staffProfile, auth.user))) {
      return Response.json(
        { error: "Platform Owner access is required." },
        { headers: responseHeaders, status: 403 },
      );
    }

    const [staffResult, acceptanceResult, auditResult] = await Promise.all([
      auth.serviceClient
        .from("staff_profiles")
        .select("id,user_id,full_name,email,active,roles(name)")
        .order("full_name", { ascending: true }),
      auth.serviceClient
        .from("admin_policy_acceptances")
        .select(
          "id,staff_profile_id,actor_auth_user_id,actor_name,actor_email,policy_title,policy_version,accepted_at",
        )
        .eq("policy_key", "admin-ip-undertaking")
        .order("accepted_at", { ascending: false }),
      auth.serviceClient
        .from("audit_events")
        .select("id,entity_id,actor_role")
        .eq("action", "admin.ip-undertaking.accepted"),
    ]);

    const loadError = staffResult.error ?? acceptanceResult.error ?? auditResult.error;
    if (loadError) throw loadError;

    const staffRows = (staffResult.data ?? []) as unknown as StaffRow[];
    const activeStaff = staffRows.filter(
      (row) => row.active && isKnownAdminRoleName(roleName(row)),
    );
    const acceptances = (acceptanceResult.data ?? []) as AcceptanceRow[];
    const audits = (auditResult.data ?? []) as AuditRow[];
    const auditByAcceptanceId = new Map(
      audits
        .filter((audit) => audit.entity_id)
        .map((audit) => [audit.entity_id as string, audit]),
    );
    const currentAcceptanceIdentities = new Set(
      acceptances
        .filter((acceptance) => acceptance.policy_version === adminIpUndertaking.version)
        .flatMap((acceptance) => [
          acceptance.staff_profile_id ? `staff:${acceptance.staff_profile_id}` : "",
          `auth:${acceptance.actor_auth_user_id}`,
        ])
        .filter(Boolean),
    );
    const acceptedRows = acceptances.map((acceptance) => {
      const audit = auditByAcceptanceId.get(acceptance.id);

      return {
        acceptanceId: acceptance.id,
        acceptedAt: acceptance.accepted_at,
        auditEventId: audit?.id ?? null,
        email: acceptance.actor_email,
        policyTitle: acceptance.policy_title,
        policyVersion: acceptance.policy_version,
        roleAtAcceptance: audit?.actor_role ?? "Not recorded",
        staffId: acceptance.staff_profile_id,
        staffMember: acceptance.actor_name,
        status:
          acceptance.policy_version === adminIpUndertaking.version
            ? "current"
            : "superseded",
      } as const;
    });
    const pendingRows = activeStaff
      .filter(
        (staff) =>
          !currentAcceptanceIdentities.has(`staff:${staff.id}`) &&
          !currentAcceptanceIdentities.has(`auth:${staff.user_id}`),
      )
      .map((staff) => ({
        acceptanceId: null,
        acceptedAt: null,
        auditEventId: null,
        email: staff.email,
        policyTitle: adminIpUndertaking.title,
        policyVersion: adminIpUndertaking.version,
        roleAtAcceptance: null,
        staffId: staff.id,
        staffMember: staff.full_name,
        status: "pending" as const,
      }));
    const currentAccepted = activeStaff.filter(
      (staff) =>
        currentAcceptanceIdentities.has(`staff:${staff.id}`) ||
        currentAcceptanceIdentities.has(`auth:${staff.user_id}`),
    ).length;

    return Response.json(
      {
        currentPolicy: {
          displayVersion: getPolicyDisplayVersion(adminIpUndertaking.version),
          status: "current",
          title: adminIpUndertaking.title,
          version: adminIpUndertaking.version,
        },
        rows: [...acceptedRows, ...pendingRows],
        summary: {
          accepted: currentAccepted,
          activeAdminUsers: activeStaff.length,
          pending: activeStaff.length - currentAccepted,
        },
      },
      { headers: responseHeaders },
    );
  } catch (error) {
    console.error("[Zingara Platform Owner] Acceptance Register failed", error);
    return Response.json(
      { error: "The Acceptance Register could not be loaded." },
      { headers: responseHeaders, status: 503 },
    );
  }
}
