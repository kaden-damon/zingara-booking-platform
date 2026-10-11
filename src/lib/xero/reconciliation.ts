export type ReconciliationState = "matched" | "missing_local" | "missing_xero" | "amount_mismatch" | "status_mismatch" | "unallocated";
export type LocalAccountingEvidence = { allocatedCents: number; documentId: string; providerIds: string[]; status: string; totalCents: number };
export type XeroAccountingEvidence = { allocatedCents: number; documentId: string; paymentIds: string[]; status: string; totalCents: number };

export function reconcileAccounting(local: LocalAccountingEvidence | null, xero: XeroAccountingEvidence | null): ReconciliationState {
  if (!local && xero) return "missing_local";
  if (local && !xero) return "missing_xero";
  if (!local || !xero) return "unallocated";
  if (local.totalCents !== xero.totalCents || local.allocatedCents !== xero.allocatedCents) return "amount_mismatch";
  if (local.status.toLowerCase() !== xero.status.toLowerCase()) return "status_mismatch";
  return "matched";
}
