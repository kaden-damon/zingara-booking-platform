export type AdminRole =
  | "box-office"
  | "super-admin"
  | "concierge"
  | "finance"
  | "marketing"
  | "venue-manager"
  | "box-office-staff"
  | "floor-manager";

export type Permission =
  | "analytics:read"
  | "bookings:manage"
  | "communications:manage"
  | "crm:read"
  | "settings:manage"
  | "tickets:validate"
  | "tables:manage"
  | "waitlist:manage";

export type StaffSession = {
  email?: string;
  id: string;
  name: string;
  permissions?: Permission[];
  role: AdminRole;
  username: string;
  venueId: string;
};

export const adminRoleLabels: Record<AdminRole, string> = {
  "box-office": "Box Office",
  "box-office-staff": "Box Office Staff",
  concierge: "Concierge",
  finance: "Finance",
  "floor-manager": "Floor Manager",
  marketing: "Marketing",
  "super-admin": "Super Admin",
  "venue-manager": "Venue Manager",
};

export const rolePermissions: Record<AdminRole, Permission[]> = {
  "box-office": [
    "bookings:manage",
    "communications:manage",
    "tickets:validate",
    "waitlist:manage",
  ],
  "box-office-staff": [
    "bookings:manage",
    "communications:manage",
    "tickets:validate",
    "waitlist:manage",
  ],
  concierge: ["tickets:validate"],
  finance: ["analytics:read"],
  "floor-manager": ["tables:manage", "tickets:validate"],
  marketing: ["communications:manage", "crm:read"],
  "super-admin": [
    "analytics:read",
    "bookings:manage",
    "communications:manage",
    "crm:read",
    "settings:manage",
    "tables:manage",
    "tickets:validate",
    "waitlist:manage",
  ],
  "venue-manager": [
    "analytics:read",
    "bookings:manage",
    "communications:manage",
    "crm:read",
    "tables:manage",
    "tickets:validate",
    "waitlist:manage",
  ],
};

export function hasPermission(
  session: Pick<StaffSession, "role"> | null,
  permission: Permission,
) {
  return session
    ? ((session as StaffSession).permissions ??
        rolePermissions[session.role] ??
        []
      ).includes(permission)
    : false;
}
