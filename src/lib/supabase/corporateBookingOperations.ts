import type {
  CorporateBookingOperations,
  CorporateOperationsBookingSnapshot,
  CorporateOperationsDocument,
} from "@/lib/corporateBookingOperations";
import { fetchSupabaseApi, fetchSupabaseBlob } from "./apiClient";

export type CorporateOperationsPayload = {
  operations: CorporateBookingOperations;
  snapshot: CorporateOperationsBookingSnapshot;
};

function path(reference: string, suffix = "") {
  return `/api/admin/corporate-booking-operations?reference=${encodeURIComponent(reference)}${suffix}`;
}

export function getCorporateBookingOperations(reference: string) {
  return fetchSupabaseApi<CorporateOperationsPayload>(path(reference), { cache: "no-store" });
}

export function saveCorporateBookingOperations(
  reference: string,
  operations: CorporateBookingOperations,
) {
  return fetchSupabaseApi<CorporateOperationsPayload>(path(reference), {
    body: { operations },
    method: "PUT",
  });
}

export function downloadCorporateOperationsDocument(
  reference: string,
  document: CorporateOperationsDocument,
) {
  return fetchSupabaseBlob(path(reference, `&document=${encodeURIComponent(document)}`));
}
