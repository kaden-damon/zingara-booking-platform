import type { DemoBooking } from "./zingaraDemo";
import { reconcileLifecycleProjection, sameLifecycleHistory } from "./bookingLifecycleComparison.ts";

const paymentOwnedFields = new Set([
  "amountPaid",
  "balanceDue",
  "lastBookingAppliedAmount",
  "lastProviderGrossAmount",
  "lastTransactionFeeAmount",
  "paymentDate",
  "paymentStatus",
  "transactionReference",
]);

const immutableFields = new Set([
  "createdAt",
  "reference",
  "supabaseBookingId",
  "updatedAt",
]);

function sameValue(left: unknown, right: unknown, field: string) {
  if (field === "lifecycleHistory") return sameLifecycleHistory(left, right);
  return JSON.stringify(left) === JSON.stringify(right);
}

export type AdminBookingStateMergeResult = {
  changedFields: string[];
  conflictingFields: string[];
  financialFields: string[];
  mergedBooking: DemoBooking;
};

export function mergeAdminBookingState(input: {
  authoritative: DemoBooking;
  previous: DemoBooking;
  requested: DemoBooking;
}): AdminBookingStateMergeResult {
  const mergedBooking = structuredClone(input.authoritative);
  const changedFields: string[] = [];
  const conflictingFields: string[] = [];
  const financialFields: string[] = [];
  const authoritative = input.authoritative as DemoBooking & Record<string, unknown>;
  const previous = input.previous as DemoBooking & Record<string, unknown>;
  const requested = input.requested as DemoBooking & Record<string, unknown>;

  for (const key of Object.keys(requested)) {
    if (immutableFields.has(key) || sameValue(previous[key], requested[key], key)) {
      continue;
    }

    changedFields.push(key);

    if (paymentOwnedFields.has(key)) {
      financialFields.push(key);
    }

    if (!sameValue(authoritative[key], previous[key], key)) {
      conflictingFields.push(key);
      continue;
    }

    Object.assign(mergedBooking, {
      [key]: key === "lifecycleHistory" && Array.isArray(authoritative.lifecycleHistory) && Array.isArray(requested.lifecycleHistory)
        ? reconcileLifecycleProjection(authoritative.lifecycleHistory, requested.lifecycleHistory)
        : structuredClone(requested[key]),
    });
  }

  return {
    changedFields,
    conflictingFields,
    financialFields,
    mergedBooking,
  };
}

export function isPaymentOwnedBookingField(field: string) {
  return paymentOwnedFields.has(field);
}
