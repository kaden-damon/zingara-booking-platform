export type AdminActionState =
  | "idle"
  | "pending"
  | "success"
  | "error"
  | "uncertain";

export function canStartAdminAction(state: AdminActionState) {
  return state !== "pending";
}

export function replaceAffectedRecord<T extends { id: string }>(
  records: T[],
  affectedRecord: T,
) {
  return records.map((record) =>
    record.id === affectedRecord.id ? affectedRecord : record,
  );
}
