import type { AdminRole, Permission } from "@/lib/zingaraAccess";

export type QuickStartSectionId =
  | "analytics"
  | "bookings"
  | "communications"
  | "corporate"
  | "customers"
  | "floor"
  | "help"
  | "payment-controls"
  | "payments"
  | "refunds"
  | "table-plan"
  | "tickets"
  | "zone-full";

type QuickStartGuideAccess = {
  canProcessRefund: boolean;
  permissions: Permission[];
  role: AdminRole;
};

const rolePriority: Record<AdminRole, QuickStartSectionId[]> = {
  "box-office": [
    "bookings",
    "corporate",
    "tickets",
    "customers",
    "communications",
    "payments",
    "payment-controls",
    "floor",
    "zone-full",
    "refunds",
    "table-plan",
    "analytics",
    "help",
  ],
  "box-office-staff": [
    "bookings",
    "corporate",
    "tickets",
    "customers",
    "communications",
    "payments",
    "payment-controls",
    "floor",
    "zone-full",
    "refunds",
    "table-plan",
    "analytics",
    "help",
  ],
  "box-office-manager": [
    "bookings",
    "corporate",
    "payments",
    "payment-controls",
    "customers",
    "communications",
    "tickets",
    "floor",
    "zone-full",
    "refunds",
    "table-plan",
    "analytics",
    "help",
  ],
  concierge: ["tickets", "bookings", "help"],
  finance: [
    "payments",
    "refunds",
    "table-plan",
    "analytics",
    "bookings",
    "payment-controls",
    "corporate",
    "customers",
    "communications",
    "help",
  ],
  "floor-manager": [
    "floor",
    "zone-full",
    "tickets",
    "bookings",
    "help",
  ],
  marketing: ["customers", "communications", "analytics", "help"],
  "super-admin": [
    "analytics",
    "bookings",
    "corporate",
    "customers",
    "payments",
    "payment-controls",
    "refunds",
    "floor",
    "zone-full",
    "tickets",
    "communications",
    "table-plan",
    "help",
  ],
  "venue-manager": [
    "analytics",
    "bookings",
    "corporate",
    "customers",
    "floor",
    "zone-full",
    "tickets",
    "payments",
    "payment-controls",
    "refunds",
    "communications",
    "table-plan",
    "help",
  ],
};

export function getQuickStartSectionIds({
  canProcessRefund,
  permissions,
  role,
}: QuickStartGuideAccess) {
  const permissionSet = new Set(permissions);
  const visibleSections = new Set<QuickStartSectionId>(["help"]);
  const canManageBookings = permissionSet.has("bookings:manage");
  const canViewPayments =
    canManageBookings || permissionSet.has("analytics:read");

  if (canManageBookings) {
    visibleSections.add("bookings");
    visibleSections.add("corporate");
    visibleSections.add("payment-controls");
  }

  if (canViewPayments) {
    visibleSections.add("payments");
    visibleSections.add("refunds");
  }

  if (canProcessRefund) {
    visibleSections.add("refunds");
  }

  if (permissionSet.has("tables:manage")) {
    visibleSections.add("floor");
    visibleSections.add("zone-full");
  }

  if (permissionSet.has("tickets:validate")) {
    visibleSections.add("tickets");
  }

  if (permissionSet.has("crm:read")) {
    visibleSections.add("customers");
  }

  if (permissionSet.has("communications:manage")) {
    visibleSections.add("communications");
  }

  if (permissionSet.has("analytics:read")) {
    visibleSections.add("analytics");
    visibleSections.add("table-plan");
  }

  const priority = rolePriority[role];

  return [...visibleSections].sort((left, right) => {
    const leftIndex = priority.indexOf(left);
    const rightIndex = priority.indexOf(right);

    return (
      (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex) ||
      left.localeCompare(right)
    );
  });
}

export function getDefaultOpenQuickStartSections(
  sectionIds: QuickStartSectionId[],
) {
  return new Set(sectionIds.slice(0, Math.min(sectionIds.length, 3)));
}
