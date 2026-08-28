type StaffDisplayIdentity = {
  active?: boolean | null;
  email?: string | null;
  full_name?: string | null;
};

function isHumanReadableStaffName(value: string) {
  return value.length > 0 && !value.includes("@");
}

export function resolveStaffDisplayName(
  staff: StaffDisplayIdentity | null | undefined,
) {
  if (!staff) {
    return undefined;
  }

  const fullName = staff.full_name?.trim() ?? "";

  if (isHumanReadableStaffName(fullName)) {
    return fullName;
  }

  const email = staff.email?.trim() ?? "";

  return email || "Unknown Staff";
}
