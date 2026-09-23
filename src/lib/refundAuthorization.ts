export const refundAccessRestrictedMessage =
  "Refund access is restricted to authorised finance staff.";

export const approvedRefundStaffProfileIds = {
  jacquesScholtz: "0116d6e4-d52a-42cd-9f90-5d2db97e59a6",
  kaden: "e8598359-54a0-4e1f-a635-1ec8ae02cb78",
  rachelleSmuts: "3ea8ff16-d914-477b-95fc-23380e71019a",
  tristanChetty: "1c9779e7-0e7e-4c58-9fa8-a58c9b16ea0d",
  wagheedaAbrahams: "6ae026bc-8815-4fea-b56c-b2103eb0c093",
} as const;

const approvedRefundStaffProfileIdSet = new Set<string>(
  Object.values(approvedRefundStaffProfileIds),
);

export function canProcessRefund(
  staffProfile: { active?: boolean; id?: string | null } | null | undefined,
  hasExistingRefundAuthority: boolean,
) {
  return Boolean(
    staffProfile?.active &&
      hasExistingRefundAuthority &&
      staffProfile.id &&
      approvedRefundStaffProfileIdSet.has(staffProfile.id),
  );
}
