import type { CorporateRequest } from "./zingaraDemo";

export type CorporateConversionGate =
  | { outcome: "create" }
  | { bookingReference: string; outcome: "idempotent" }
  | { outcome: "blocked"; reason: string };

export function getCorporateConversionGate(
  request: Pick<
    CorporateRequest,
    "archivedAt" | "guestCount" | "linkedBookingReference" | "status"
  >,
): CorporateConversionGate {
  if (request.linkedBookingReference) {
    return {
      bookingReference: request.linkedBookingReference,
      outcome: "idempotent",
    };
  }

  if (request.status !== "confirmed" || request.archivedAt) {
    return {
      outcome: "blocked",
      reason: "This Corporate enquiry is no longer eligible for conversion.",
    };
  }

  if (request.guestCount === null) {
    return {
      outcome: "blocked",
      reason: "An authoritative guest count is required before conversion.",
    };
  }

  return { outcome: "create" };
}
