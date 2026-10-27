import { getAdminRoleFromName, type StaffProfileRow } from "@/lib/supabase/serverAdmin";

export const bookingActivityTimelineStaffIds = new Set([
  "e8598359-54a0-4e1f-a635-1ec8ae02cb78",
  "3ac09b59-fc3f-4c6d-9bb3-8dd47a077188",
]);

export type BookingActivityChange = {
  after: unknown;
  before: unknown;
  field: string;
};

export type BookingActivityEntry = {
  action: string;
  actor: string;
  changes: BookingActivityChange[];
  id: string;
  occurredAt: string;
  outcome: "blocked" | "failed" | "success";
  reason: string | null;
  source: string;
};

const sensitiveKeyPattern =
  /(authorization|cookie|password|secret|token|qr|provider_transaction|payment_identifier|access_key|refresh_key|email|phone|mobile)/i;

export function sanitizeTimelineText(value: string) {
  return value
    .replace(
      /(PayFast (?:transaction|payment received):\s*)[A-Z0-9-]+/gi,
      "$1[private reference]",
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[private contact]")
    .replace(/(?:\+27|0)\s?\d{2}(?:[\s()-]?\d){7}\b/g, "[private contact]")
    .replace(/\b\d{12,}\b/g, "[private reference]");
}

export function canAccessBookingActivityTimeline(
  staffProfile: Pick<StaffProfileRow, "active" | "id" | "roles">,
) {
  const role = Array.isArray(staffProfile.roles)
    ? staffProfile.roles[0]
    : staffProfile.roles;

  return (
    staffProfile.active &&
    bookingActivityTimelineStaffIds.has(staffProfile.id) &&
    getAdminRoleFromName(role?.name) === "super-admin"
  );
}

export function humanizeActivityLabel(value: string) {
  return value
    .replace(/^booking\./, "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function sanitizeTimelineValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeTimelineValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !sensitiveKeyPattern.test(key))
        .map(([key, nestedValue]) => [key, sanitizeTimelineValue(nestedValue)]),
    );
  }

  return typeof value === "string" ? sanitizeTimelineText(value) : value;
}

export function buildTimelineChanges(
  beforeValues: Record<string, unknown> | null | undefined,
  afterValues: Record<string, unknown> | null | undefined,
  changedFields: string[] = [],
) {
  const before = sanitizeTimelineValue(beforeValues ?? {}) as Record<
    string,
    unknown
  >;
  const after = sanitizeTimelineValue(afterValues ?? {}) as Record<
    string,
    unknown
  >;
  const fields = Array.from(
    new Set(
      (changedFields.length > 0
        ? changedFields
        : [...Object.keys(before), ...Object.keys(after)]
      ).filter((field) => !sensitiveKeyPattern.test(field)),
    ),
  );

  return fields.map((field) => ({
    after: after[field],
    before: before[field],
    field: humanizeActivityLabel(field),
  }));
}

export function sortBookingActivityEntries(entries: BookingActivityEntry[]) {
  return [...entries].sort((left, right) => {
    const timeDifference =
      new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
    return timeDifference || right.id.localeCompare(left.id);
  });
}
