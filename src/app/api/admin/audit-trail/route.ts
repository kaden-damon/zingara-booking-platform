import {
  getAdminRoleFromName,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { toAuditEvent, type AuditEventRow } from "@/lib/auditTrail";

export const dynamic = "force-dynamic";

const auditSelect =
  "id,created_at,actor_staff_profile_id,actor_auth_user_id,actor_name,actor_role,actor_location_scope,action,entity_type,entity_reference,entity_id,entity_location,outcome,source_area,reason,before_values,after_values,changed_fields,request_id,user_agent";

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

function getStaffScope(
  staffProfile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  return staffProfile.venue_scope ?? [];
}

export async function GET(request: Request) {
  const { error, serviceClient, staffProfile } = await requireActiveStaff(request);

  if (error || !serviceClient || !staffProfile) {
    return error;
  }

  const role = getStaffRole(staffProfile);
  const scope = getStaffScope(staffProfile);

  if (!["super-admin", "venue-manager"].includes(role)) {
    return Response.json(
      { error: "Audit Trail access is restricted." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const page = Math.max(Number(url.searchParams.get("page") ?? "1"), 1);
  const pageSize = Math.min(
    Math.max(Number(url.searchParams.get("pageSize") ?? "25"), 10),
    100,
  );
  const offset = (page - 1) * pageSize;
  const requestedLocation = url.searchParams.get("location")?.trim();
  const permittedLocations = scope.includes("all") ? [] : scope;

  let query = serviceClient
    .from("audit_events")
    .select(auditSelect, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (role === "venue-manager" && permittedLocations.length > 0) {
    query = query.in("entity_location", permittedLocations);
  }

  if (
    requestedLocation &&
    requestedLocation !== "all" &&
    (scope.includes("all") || scope.includes(requestedLocation))
  ) {
    query = query.eq("entity_location", requestedLocation);
  }

  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const actorStaffProfileId = url.searchParams.get("actorStaffProfileId");
  const action = url.searchParams.get("action");
  const entityType = url.searchParams.get("entityType");
  const entityReference = url.searchParams.get("entityReference");
  const outcome = url.searchParams.get("outcome");
  const search = url.searchParams.get("search")?.trim();

  if (dateFrom) {
    query = query.gte("created_at", dateFrom);
  }

  if (dateTo) {
    query = query.lte("created_at", dateTo);
  }

  if (actorStaffProfileId) {
    query = query.eq("actor_staff_profile_id", actorStaffProfileId);
  }

  if (action) {
    query = query.eq("action", action);
  }

  if (entityType) {
    query = query.eq("entity_type", entityType);
  }

  if (entityReference) {
    query = query.eq("entity_reference", entityReference);
  }

  if (outcome && outcome !== "all") {
    query = query.eq("outcome", outcome);
  }

  if (search) {
    const value = search.replace(/[(),]/g, " ");

    query = query.or(
      [
        `action.ilike.*${value}*`,
        `actor_name.ilike.*${value}*`,
        `entity_reference.ilike.*${value}*`,
        `reason.ilike.*${value}*`,
        `source_area.ilike.*${value}*`,
      ].join(","),
    );
  }

  const { count, data, error: loadError } = await query;

  if (loadError) {
    console.error("[Zingara Audit] Failed to load audit events", loadError);

    return Response.json(
      { error: "Audit events could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({
    events: ((data ?? []) as AuditEventRow[]).map(toAuditEvent),
    page,
    pageSize,
    total: count ?? 0,
  });
}
