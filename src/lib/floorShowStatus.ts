const operationalFloorShowStatuses = new Set(["active", "sold_out"]);

export function isOperationalFloorShowStatus(
  status: string | null | undefined,
) {
  return operationalFloorShowStatuses.has(status?.trim().toLowerCase() ?? "");
}
