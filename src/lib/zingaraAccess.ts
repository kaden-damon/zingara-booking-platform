export type AdminRole =
  | "super-admin"
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
  role: AdminRole;
  username: string;
  venueId: string;
};

export const adminRoleLabels: Record<AdminRole, string> = {
  "box-office-staff": "Box Office Staff",
  "floor-manager": "Floor Manager",
  "super-admin": "Super Admin",
  "venue-manager": "Venue Manager",
};

export const rolePermissions: Record<AdminRole, Permission[]> = {
  "box-office-staff": [
    "bookings:manage",
    "communications:manage",
    "tickets:validate",
    "waitlist:manage",
  ],
  "floor-manager": ["tables:manage", "tickets:validate"],
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
    ? (rolePermissions[session.role] ?? []).includes(permission)
    : false;
}
