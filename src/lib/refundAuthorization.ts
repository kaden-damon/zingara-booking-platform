export const refundAccessRestrictedMessage =
  "Refund access is restricted to authorised finance staff.";

export const approvedRefundStaffProfileIds = {
  kaden: "e8598359-54a0-4e1f-a635-1ec8ae02cb78",
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
