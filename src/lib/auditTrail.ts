import type { AdminRole } from "@/lib/zingaraAccess";

export type AuditOutcome = "blocked" | "failed" | "success";

export type AuditEntityType =
  | "booking"
  | "booking-lock"
  | "customer"
  | "data-portability-import"
  | "data-portability-restore"
  | "data-portability-export"
  | "payment"
  | "promo-code"
  | "security"
  | "show"
  | "staff"
  | "staff-issue"
  | "ticket"
  | "workflow";

export type AuditJsonValue =
  | AuditJsonValue[]
  | boolean
  | null
  | number
  | string
  | { [key: string]: AuditJsonValue };

export type AuditEvent = {
  action: string;
  actorAuthUserId: string | null;
  actorLocationScope: string[];
  actorName: string | null;
  actorRole: string | null;
  actorStaffProfileId: string | null;
  afterValues: Record<string, AuditJsonValue>;
  beforeValues: Record<string, AuditJsonValue>;
  changedFields: string[];
  createdAt: string;
  entityId: string | null;
  entityLocation: string | null;
  entityReference: string;
  entityType: AuditEntityType;
  id: string;
  outcome: AuditOutcome;
  reason: string | null;
  requestId: string | null;
  sourceArea: string;
  userAgent: string | null;
};

export type AuditEventRow = {
  action: string;
  actor_auth_user_id: string | null;
  actor_location_scope: string[] | null;
  actor_name: string | null;
  actor_role: string | null;
  actor_staff_profile_id: string | null;
  after_values: Record<string, AuditJsonValue> | null;
  before_values: Record<string, AuditJsonValue> | null;
  changed_fields: string[] | null;
  created_at: string;
  entity_id: string | null;
  entity_location: string | null;
  entity_reference: string;
  entity_type: AuditEntityType;
  id: string;
  outcome: AuditOutcome;
  reason: string | null;
  request_id: string | null;
  source_area: string;
  user_agent: string | null;
};

export type AuditTrailFilters = {
  action?: string;
  actorStaffProfileId?: string;
  dateFrom?: string;
  dateTo?: string;
  entityReference?: string;
  entityType?: string;
  location?: string;
  outcome?: AuditOutcome | "all";
  page?: number;
  pageSize?: number;
  search?: string;
};

export function toAuditEvent(row: AuditEventRow): AuditEvent {
  return {
    action: row.action,
    actorAuthUserId: row.actor_auth_user_id,
    actorLocationScope: row.actor_location_scope ?? [],
    actorName: row.actor_name,
    actorRole: row.actor_role,
    actorStaffProfileId: row.actor_staff_profile_id,
    afterValues: row.after_values ?? {},
    beforeValues: row.before_values ?? {},
    changedFields: row.changed_fields ?? [],
    createdAt: row.created_at,
    entityId: row.entity_id,
    entityLocation: row.entity_location,
    entityReference: row.entity_reference,
    entityType: row.entity_type,
    id: row.id,
    outcome: row.outcome,
    reason: row.reason,
    requestId: row.request_id,
    sourceArea: row.source_area,
    userAgent: row.user_agent,
  };
}

export function getActorRoleLabel(role: AdminRole | string | null | undefined) {
  return String(role ?? "")
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
