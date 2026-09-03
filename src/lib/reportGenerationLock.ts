export const reportGenerationLockTimeoutSeconds = 300;

export type ReportGenerationLockState = {
  acquiredAt: string;
  expiresAt: string;
  isOwner?: boolean;
  ownerName: string | null;
  reportType: string;
};

export type ReportGenerationLockResult = ReportGenerationLockState & {
  acquired: boolean;
  staleRecovered: boolean;
  token?: string;
};

export function getReportGenerationLockMessage(
  lock: ReportGenerationLockState | null,
) {
  if (!lock) return "";

  const owner = lock.isOwner
    ? "You are currently generating a report."
    : lock.ownerName
      ? `${lock.ownerName} is currently generating a report.`
      : "Another staff member is currently generating a report.";

  return `${owner} Please try again when it has completed.`;
}
