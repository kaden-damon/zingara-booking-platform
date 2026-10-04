import type { AdminRole } from "@/lib/zingaraAccess";

export type AdminNavigationSection =
  | "overview"
  | "bookings"
  | "operations"
  | "customers"
  | "reviews"
  | "analytics"
  | "platform-operations"
  | "settings"
  | "academy";

export type AdminNavigationItem = {
  id: AdminNavigationSection;
  label: string;
};

type AdminNavigationAccess = {
  canManageCommunications: boolean;
  canManageSettings: boolean;
  canManageWaitlist: boolean;
  canViewAnalytics: boolean;
  canViewBookingManagement: boolean;
  canViewCrm: boolean;
  canViewOperationsWorkspace: boolean;
};

export function getAdminNavigation(access: AdminNavigationAccess) {
  const primary: AdminNavigationItem[] = [{ id: "overview", label: "Home" }];

  if (access.canViewBookingManagement) {
    primary.push({ id: "bookings", label: "Bookings" });
  }
  if (access.canViewOperationsWorkspace || access.canManageWaitlist) {
    primary.push({ id: "operations", label: "Floor & Arrivals" });
  }
  if (access.canViewCrm) {
    primary.push({ id: "customers", label: "Customers" });
  }
  if (access.canViewAnalytics) {
    primary.push({ id: "analytics", label: "Reports" });
  }

  const more: AdminNavigationItem[] = [];
  if (access.canManageCommunications) {
    more.push({ id: "reviews", label: "Reviews" });
  }
  if (access.canManageSettings) {
    more.push({ id: "settings", label: "Settings" });
  }

  // System Preferences remains staff-accessible. Protected management panels
  // continue to enforce their existing server permissions.
  more.push(
    { id: "platform-operations", label: "System" },
    { id: "academy", label: "Academy" },
  );

  return { more, primary };
}

export function getAdminHomeCopy(role: AdminRole) {
  if (role === "finance") {
    return "Payments, outstanding balances and reports for the work that needs attention.";
  }
  if (role === "floor-manager" || role === "concierge") {
    return "Arrivals, check-in, Floor and guests who need attention today.";
  }
  if (
    role === "box-office" ||
    role === "box-office-manager" ||
    role === "box-office-staff"
  ) {
    return "Bookings, payments, customers and the handover to Floor.";
  }
  if (role === "marketing") {
    return "Customers, reviews and communications that need attention.";
  }
  return "Shows, bookings, Floor alerts and management tasks in one place.";
}
