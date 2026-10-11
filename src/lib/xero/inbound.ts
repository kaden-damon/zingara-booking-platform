import { reconcileAccounting, type ReconciliationState } from "./reconciliation.ts";

export type ProviderInvoice = {
  AmountDue?: number;
  AmountPaid?: number;
  InvoiceID?: string;
  Status?: string;
  Total?: number;
};

export type LocalInvoice = {
  id: string;
  total_cents: number;
  xero_document_id: string | null;
  xero_status: string | null;
};

export type ReconciliationDifference = {
  category: ReconciliationState;
  documentId: string | null;
  providerAmountCents: number | null;
  providerResourceId: string | null;
  providerStatus: string | null;
};

export function buildInvoiceReconciliation(localRows: LocalInvoice[], providerRows: ProviderInvoice[]) {
  const localByProviderId = new Map(localRows.filter((row) => row.xero_document_id).map((row) => [row.xero_document_id!, row]));
  const providerById = new Map(providerRows.filter((row) => row.InvoiceID).map((row) => [row.InvoiceID!, row]));
  const differences: ReconciliationDifference[] = [];
  for (const provider of providerRows) {
    if (!provider.InvoiceID) continue;
    const local = localByProviderId.get(provider.InvoiceID) ?? null;
    const category = reconcileAccounting(
      local ? { allocatedCents: 0, documentId: local.id, providerIds: [], status: local.xero_status ?? "", totalCents: local.total_cents } : null,
      { allocatedCents: Math.round(Number(provider.AmountPaid ?? 0) * 100), documentId: provider.InvoiceID, paymentIds: [], status: provider.Status ?? "", totalCents: Math.round(Number(provider.Total ?? 0) * 100) },
    );
    if (category !== "matched") differences.push({ category, documentId: local?.id ?? null, providerAmountCents: Math.round(Number(provider.Total ?? 0) * 100), providerResourceId: provider.InvoiceID, providerStatus: provider.Status ?? null });
  }
  for (const local of localRows) {
    if (!local.xero_document_id || providerById.has(local.xero_document_id)) continue;
    differences.push({ category: "missing_xero", documentId: local.id, providerAmountCents: null, providerResourceId: local.xero_document_id, providerStatus: null });
  }
  return differences;
}

export function shouldApplyWebhookEvent(currentSequence: number | null, incomingSequence: number | null) {
  return incomingSequence === null || currentSequence === null || incomingSequence > currentSequence;
}
