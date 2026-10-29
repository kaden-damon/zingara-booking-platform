import type { DemoShow } from "./zingaraDemo";

export type InternalShowBookingDecision = {
  allowed: boolean;
  label: string;
  reason: string;
  requiresManagementApproval: boolean;
};

function normalizeStatus(status: string | null | undefined) {
  return (status ?? "active").trim().toLowerCase().replaceAll("-", "_");
}

export function getInternalShowBookingDecision(input: {
  hasActiveBuyout?: boolean;
  status?: DemoShow["operationalStatus"] | string | null;
}): InternalShowBookingDecision {
  const status = normalizeStatus(input.status);

  if (status === "archived") {
    return {
      allowed: false,
      label: "ARCHIVED — INTERNAL BOOKINGS BLOCKED",
      reason: "Archived performances cannot accept new bookings.",
      requiresManagementApproval: false,
    };
  }

  if (status === "blackout") {
    return {
      allowed: false,
      label: "BOOKING BLACKOUT — INTERNAL BOOKINGS BLOCKED",
      reason: "This performance has an active booking blackout.",
      requiresManagementApproval: false,
    };
  }

  if (status === "venue_closure") {
    return {
      allowed: false,
      label: "VENUE CLOSED — INTERNAL BOOKINGS BLOCKED",
      reason: "This performance is protected by a venue closure.",
      requiresManagementApproval: false,
    };
  }

  if (input.hasActiveBuyout) {
    return {
      allowed: true,
      label: "BUYOUT — APPROVAL REQUIRED",
      reason: "An active Full Show Buyout protects this performance.",
      requiresManagementApproval: true,
    };
  }

  if (status === "special_event") {
    return {
      allowed: true,
      label: "SPECIAL EVENT — APPROVAL REQUIRED",
      reason: "This Special Event requires management approval.",
      requiresManagementApproval: true,
    };
  }

  if (status === "sold_out") {
    return {
      allowed: true,
      label: "SOLD OUT — INTERNAL BOOKINGS ALLOWED",
      reason: "Public sales remain sold out. Internal capacity is checked separately.",
      requiresManagementApproval: false,
    };
  }

  if (status === "inactive") {
    return {
      allowed: true,
      label: "CLOSED — INTERNAL BOOKINGS ALLOWED",
      reason: "Public sales remain closed. Internal capacity is checked separately.",
      requiresManagementApproval: false,
    };
  }

  if (status === "active") {
    return {
      allowed: true,
      label: "OPEN",
      reason: "Public and internal booking rules apply.",
      requiresManagementApproval: false,
    };
  }

  return {
    allowed: false,
    label: "INTERNAL BOOKINGS BLOCKED",
    reason: "This performance status does not support internal bookings.",
    requiresManagementApproval: false,
  };
}

export function normalizeInternalShowApprovalReason(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

export function isInternalShowApprovalReasonValid(value: unknown) {
  return normalizeInternalShowApprovalReason(value).length >= 3;
}
