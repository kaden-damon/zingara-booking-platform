import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  AuditEntityType,
  AuditJsonValue,
  AuditOutcome,
} from "@/lib/auditTrail";
import { getActorRoleLabel } from "@/lib/auditTrail";
import {
  getAdminRoleFromName,
  type StaffProfileRow,
} from "@/lib/supabase/serverAdmin";

type AuditRecordInput = {
  action: string;
  afterValues?: Record<string, AuditJsonValue>;
  beforeValues?: Record<string, AuditJsonValue>;
  changedFields?: string[];
  entityId?: string | null;
  entityLocation?: string | null;
  entityReference: string;
  entityType: AuditEntityType;
  outcome: AuditOutcome;
  reason?: string | null;
  request?: Request;
  requestId?: string | null;
  sourceArea: string;
};

type AuditDiff = {
  afterValues: Record<string, AuditJsonValue>;
  beforeValues: Record<string, AuditJsonValue>;
  changedFields: string[];
};

const sensitiveKeyPattern =
  /password|token|secret|passphrase|service[_-]?role|authorization|credential|card/i;

function isAuditJsonValue(value: unknown): value is AuditJsonValue {
  if (
    value === null ||
    ["boolean", "number", "string"].includes(typeof value)
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isAuditJsonValue);
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(isAuditJsonValue);
  }

  return false;
}

export function toAuditJsonValue(value: unknown): AuditJsonValue {
  if (isAuditJsonValue(value)) {
    return value;
  }

  if (value === undefined) {
    return null;
  }

  return String(value);
}

export function pickAuditFields(
  source: Record<string, unknown> | null | undefined,
  fields: string[],
) {
  const picked: Record<string, AuditJsonValue> = {};

  for (const field of fields) {
    if (sensitiveKeyPattern.test(field)) {
      continue;
    }

    picked[field] = toAuditJsonValue(source?.[field] ?? null);
  }

  return picked;
}

export function diffAuditFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields: string[],
): AuditDiff {
  const beforeValues: Record<string, AuditJsonValue> = {};
  const afterValues: Record<string, AuditJsonValue> = {};
  const changedFields: string[] = [];

  for (const field of fields) {
    if (sensitiveKeyPattern.test(field)) {
      continue;
    }

    const beforeValue = toAuditJsonValue(before?.[field] ?? null);
    const afterValue = toAuditJsonValue(after?.[field] ?? null);

    if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) {
      continue;
    }

    beforeValues[field] = beforeValue;
    afterValues[field] = afterValue;
    changedFields.push(field);
  }

  return { afterValues, beforeValues, changedFields };
}

function getStaffRole(staffProfile: StaffProfileRow | null | undefined) {
  const role = Array.isArray(staffProfile?.roles)
    ? staffProfile?.roles[0]
    : staffProfile?.roles;

  return getAdminRoleFromName(role?.name);
}

function getRequestMetadata(request: Request | undefined) {
  if (!request) {
    return {
      ipAddress: null,
      requestId: null,
      userAgent: null,
    };
  }

  return {
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null,
    requestId:
      request.headers.get("x-vercel-id") ??
      request.headers.get("x-request-id") ??
      crypto.randomUUID(),
    userAgent: request.headers.get("user-agent"),
  };
}

export async function recordAuditEvent(
  serviceClient: SupabaseClient,
  staffProfile: StaffProfileRow | null | undefined,
  user: User | null | undefined,
  input: AuditRecordInput,
) {
  const role = getStaffRole(staffProfile);
  const requestMetadata = getRequestMetadata(input.request);
  const changedFields = input.changedFields ?? [
    ...new Set([
      ...Object.keys(input.beforeValues ?? {}),
      ...Object.keys(input.afterValues ?? {}),
    ]),
  ];

  const { error } = await serviceClient.from("audit_events").insert({
    action: input.action,
    actor_auth_user_id: user?.id ?? null,
    actor_location_scope: staffProfile?.venue_scope ?? [],
    actor_name: staffProfile?.full_name ?? user?.email ?? null,
    actor_role: getActorRoleLabel(role),
    actor_staff_profile_id: staffProfile?.id ?? null,
    after_values: input.afterValues ?? {},
    before_values: input.beforeValues ?? {},
    changed_fields: changedFields,
    entity_id: input.entityId ?? null,
    entity_location: input.entityLocation ?? null,
    entity_reference: input.entityReference,
    entity_type: input.entityType,
    ip_address: requestMetadata.ipAddress,
    outcome: input.outcome,
    reason: input.reason ?? null,
    request_id: input.requestId ?? requestMetadata.requestId,
    source_area: input.sourceArea,
    user_agent: requestMetadata.userAgent,
  });

  if (error) {
    console.error("[Zingara Audit] Failed to record audit event", {
      action: input.action,
      entityReference: input.entityReference,
      entityType: input.entityType,
      message: error.message,
      outcome: input.outcome,
    });
    throw error;
  }
}

export async function tryRecordAuditEvent(
  serviceClient: SupabaseClient,
  staffProfile: StaffProfileRow | null | undefined,
  user: User | null | undefined,
  input: AuditRecordInput,
) {
  try {
    await recordAuditEvent(serviceClient, staffProfile, user, input);
  } catch {
    return false;
  }

  return true;
}
