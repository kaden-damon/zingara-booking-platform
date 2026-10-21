import { xeroRetryDelay } from "./transport.ts";

export type XeroOutboxItem = { attemptCount: number; documentId: string | null; id: string; idempotencyKey: string; operation: string; payload: Record<string, unknown>; tenantId: string };
export type XeroWorkerStore = {
  claim(limit: number, workerId: string): Promise<XeroOutboxItem[]>;
  complete(item: XeroOutboxItem, result: { providerContactId?: string; providerId?: string; providerNumber?: string; providerStatus?: string }): Promise<void>;
  connection(tenantId: string): Promise<{ configured: boolean; connected: boolean; mappingsApproved: boolean; syncPaused: boolean }>;
  fail(item: XeroOutboxItem, input: { delayMs: number | null; message: string; terminal: boolean }): Promise<void>;
};
export type XeroOperationExecutor = (item: XeroOutboxItem) => Promise<{ providerContactId?: string; providerId?: string; providerNumber?: string; providerStatus?: string }>;

export function updatesXeroDocumentIdentity(operation: string) {
  return ["document.sync", "quote.create", "quote.update", "invoice.create"].includes(operation);
}

export async function runXeroOutboxWorker(input: { execute: XeroOperationExecutor; limit?: number; store: XeroWorkerStore; workerId: string }) {
  const items = await input.store.claim(Math.min(25, Math.max(1, input.limit ?? 10)), input.workerId);
  const result = { blocked: 0, failed: 0, processed: 0, succeeded: 0 };
  for (const item of items) {
    const connection = await input.store.connection(item.tenantId);
    if (!connection.configured || !connection.connected || connection.syncPaused || !connection.mappingsApproved) {
      await input.store.fail(item, { delayMs: null, message: !connection.configured ? "Xero is not configured." : connection.syncPaused ? "Xero sync is paused." : !connection.mappingsApproved ? "Accounts mappings need approval." : "Reconnect Xero.", terminal: true });
      result.blocked += 1; continue;
    }
    try { const providerResult = await input.execute(item); await input.store.complete(item, providerResult); result.succeeded += 1; }
    catch (error) {
      const delayMs = xeroRetryDelay(error, item.attemptCount + 1);
      const terminal = delayMs === null || item.attemptCount + 1 >= 8;
      await input.store.fail(item, { delayMs, message: error instanceof Error ? error.message.slice(0, 500) : "Xero sync failed.", terminal });
      result.failed += 1;
    }
    result.processed += 1;
  }
  return result;
}

export function assertVerifiedPaymentEvidence(payload: Record<string, unknown>) {
  if (payload.evidenceType !== "successful_payfast" && payload.evidenceType !== "structured_manual" && payload.evidenceType !== "reconciled_import") throw new Error("Verified payment evidence is required before accounting allocation.");
  if (!payload.providerPaymentId || !(Number(payload.amountCents) > 0)) throw new Error("Payment identity and amount are required.");
}

export function assertVerifiedRefundEvidence(payload: Record<string, unknown>) {
  if (!payload.refundId || !payload.originalInvoiceId || !(Number(payload.amountCents) > 0)) {
    throw new Error("Verified refund evidence and the original Xero invoice are required before a credit note can be prepared.");
  }
}
