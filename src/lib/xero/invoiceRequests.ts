export const approvedInvoiceConversionStaffProfileIds = {
  kadenPlatformOwner: "e8598359-54a0-4e1f-a635-1ec8ae02cb78",
  rachelleSmuts: "3ea8ff16-d914-477b-95fc-23380e71019a",
  tristanChetty: "1c9779e7-0e7e-4c58-9fa8-a58c9b16ea0d",
} as const;

const approvedInvoiceConversionStaffProfileIdSet = new Set<string>(
  Object.values(approvedInvoiceConversionStaffProfileIds),
);

export function canConvertRequestedQuote(
  staffProfile: { active?: boolean; id?: string | null } | null | undefined,
  hasExistingInvoiceAuthority: boolean,
) {
  return Boolean(
    staffProfile?.active &&
      hasExistingInvoiceAuthority &&
      staffProfile.id &&
      approvedInvoiceConversionStaffProfileIdSet.has(staffProfile.id),
  );
}
