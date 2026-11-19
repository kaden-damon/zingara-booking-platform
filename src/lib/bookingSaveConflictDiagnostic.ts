export type BookingSaveLockState = "unchecked" | "unavailable" | "absent" | "owned" | "missing-session" | "different-session" | "different-owner";
export type BookingSaveConflictStage = "missing-snapshot" | "snapshot-revision-mismatch" | "edit-lock" | "field-conflict" | "write-version-miss";

// Only known field names leave the handler; never log either booking snapshot.
const diagnosticFields = new Set([
  "addons", "addonsTotal", "amountPaid", "balanceDue", "communicationHistory",
  "customer", "customerId", "discountAmount", "guestAllocations", "guestTickets",
  "lifecycleHistory", "operationalNotes", "partySize", "paymentStatus", "serviceFeeAmount",
  "showId", "source", "status", "subtotalPrice", "tableId", "tableNumber", "totalPrice",
  "zoneEntitlements", "zoneId", "zoneTitle",
]);

export function bookingSaveConflictDiagnostic(input: {
  stage: BookingSaveConflictStage;
  lock: BookingSaveLockState;
  requestId?: string | null;
  expectedVersion?: string;
  currentVersion?: string;
  conflictingFields?: readonly string[];
}) {
  const fields = input.conflictingFields ?? [];
  const requestId = input.requestId ?? "";
  return {
    stage: input.stage,
    lock: input.lock,
    requestId: /^(?:[a-z0-9]+::){0,3}[a-z0-9]+-\d{13}-[a-f0-9]{8,32}$/i.test(requestId) && requestId.length <= 96 ? requestId : undefined,
    versionComparison: input.expectedVersion && input.currentVersion
      ? input.expectedVersion === input.currentVersion ? "equal" : "different"
      : "unknown",
    conflictingFields: [...new Set(fields.filter((field) => diagnosticFields.has(field)))].sort(),
    conflictCount: fields.length,
  };
}
