export const adminIpUndertaking = {
  checkboxLabel:
    "I have read, understand and agree to the Platform Use & Access Terms.",
  title: "Platform Use & Access Terms",
  version: "ADMIN-IP-UNDERTAKING-V1",
} as const;

export const adminIpUndertakingRequiredEvent =
  "zingara-admin-ip-undertaking-required";

export type AdminIpUndertakingGateState =
  | "checking"
  | "required"
  | "accepted";

export function isCurrentAdminIpUndertakingCheck(input: {
  checkRequestId: number;
  currentCheckRequestId: number;
  currentStaffId: string | null | undefined;
  staffId: string;
}) {
  return (
    input.checkRequestId === input.currentCheckRequestId &&
    input.currentStaffId === input.staffId
  );
}

export type AdminIpUndertakingStatus = {
  accepted: boolean;
  acceptedAt: string | null;
  title: string;
  version: string;
};
