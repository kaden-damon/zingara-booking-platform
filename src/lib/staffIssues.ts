import type { AdminRole } from "@/lib/zingaraAccess";

export const staffIssueCategories = [
  { label: "System / Technical", value: "system_technical" },
  { label: "Operations", value: "operations" },
  { label: "Booking", value: "booking" },
  { label: "Payments", value: "payments" },
  { label: "Customer / CRM", value: "customer_crm" },
  { label: "Floor / Seating", value: "floor_seating" },
  { label: "Tickets / QR", value: "tickets_qr" },
  { label: "UX / UI", value: "ux_ui" },
  { label: "Reporting / Analytics", value: "reporting_analytics" },
  { label: "Feature Request", value: "feature_request" },
  { label: "Other", value: "other" },
] as const;

export const staffIssuePriorities = [
  { label: "Low", value: "low" },
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
  { label: "Critical", value: "critical" },
] as const;

export const staffIssueStatuses = [
  { label: "Logged", value: "logged" },
  { label: "Scheduled", value: "scheduled" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed / Fixed", value: "completed" },
] as const;

export type StaffIssueCategory = (typeof staffIssueCategories)[number]["value"];
export type StaffIssuePriority = (typeof staffIssuePriorities)[number]["value"];
export type StaffIssueStatus = (typeof staffIssueStatuses)[number]["value"];

export type StaffIssueReport = {
  adminNotes: string | null;
  category: StaffIssueCategory;
  completedAt: string | null;
  createdAt: string;
  description: string;
  id: string;
  location: string | null;
  metadata: Record<string, unknown>;
  moduleOrArea: string | null;
  priority: StaffIssuePriority;
  reporterEmail: string | null;
  reporterName: string | null;
  reporterRole: AdminRole;
  reporterStaffId: string;
  resolutionNotes: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  status: StaffIssueStatus;
  ticketReference: string;
  title: string;
  updatedAt: string;
};

export function isStaffIssueCategory(
  value: unknown,
): value is StaffIssueCategory {
  return staffIssueCategories.some((category) => category.value === value);
}

export function isStaffIssuePriority(
  value: unknown,
): value is StaffIssuePriority {
  return staffIssuePriorities.some((priority) => priority.value === value);
}

export function isStaffIssueStatus(value: unknown): value is StaffIssueStatus {
  return staffIssueStatuses.some((status) => status.value === value);
}

export function getStaffIssueCategoryLabel(
  value: StaffIssueCategory | string | null | undefined,
) {
  return (
    staffIssueCategories.find((category) => category.value === value)?.label ??
    "Other"
  );
}

export function getStaffIssuePriorityLabel(
  value: StaffIssuePriority | string | null | undefined,
) {
  return (
    staffIssuePriorities.find((priority) => priority.value === value)?.label ??
    "Normal"
  );
}

export function getStaffIssueStatusLabel(
  value: StaffIssueStatus | string | null | undefined,
) {
  return (
    staffIssueStatuses.find((status) => status.value === value)?.label ??
    "Logged"
  );
}

export function canManageStaffIssues(role: AdminRole | string | null | undefined) {
  return role === "super-admin" || role === "venue-manager";
}
