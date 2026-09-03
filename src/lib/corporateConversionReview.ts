import type {
  CorporateRequest,
  PaymentStatus,
  SeatingZoneId,
} from "./zingaraDemo";

const conversionZoneIds = [
  "elevated-stage",
  "golden-circle",
  "middle-ring",
  "royal-booths",
  "royal-balcony",
] satisfies SeatingZoneId[];

function isConversionZoneId(value: string): value is SeatingZoneId {
  return conversionZoneIds.includes(value as SeatingZoneId);
}

export type CorporateConversionPaymentBasis =
  | "complimentary"
  | "deposit"
  | "fully-paid"
  | "unpaid";

export type CorporateConversionReview = {
  amountPaid: number;
  paymentBasis: CorporateConversionPaymentBasis;
  paymentStatus: PaymentStatus;
  pax: number;
  showId: string;
  ticketTotal: number;
  venue: "cape-town" | "johannesburg";
  zoneId: SeatingZoneId;
};

export type CorporateConversionReviewDraft = {
  amountPaid: string;
  paymentBasis: CorporateConversionPaymentBasis;
  pax: string;
  showId: string;
  ticketTotal: string;
  venue: "" | CorporateConversionReview["venue"];
  zoneId: string;
};

export function isCorporateRequestConversionEligible(
  request: Pick<
    CorporateRequest,
    "archivedAt" | "linkedBookingReference" | "status"
  >,
) {
  return (
    !request.archivedAt &&
    !request.linkedBookingReference &&
    (request.status === "quote-sent" || request.status === "confirmed")
  );
}

export function validateCorporateConversionReview(
  draft: CorporateConversionReviewDraft,
) {
  const errors: Partial<Record<keyof CorporateConversionReviewDraft, string>> = {};
  const pax = Number(draft.pax);
  const ticketTotal = Number(draft.ticketTotal);
  const amountPaid = Number(draft.amountPaid);

  if (!draft.venue) errors.venue = "Select the authoritative venue.";
  if (!draft.showId) errors.showId = "Select the authoritative performance.";
  if (!isConversionZoneId(draft.zoneId)) {
    errors.zoneId = "Select the agreed seating zone.";
  }
  if (!Number.isInteger(pax) || pax <= 0) {
    errors.pax = "Enter a valid guest count.";
  }
  if (
    draft.ticketTotal.trim() === "" ||
    !Number.isFinite(ticketTotal) ||
    ticketTotal < 0 ||
    (draft.paymentBasis !== "complimentary" && ticketTotal === 0)
  ) {
    errors.ticketTotal = "Enter the agreed ticket obligation.";
  }
  if (draft.amountPaid.trim() === "" || !Number.isFinite(amountPaid) || amountPaid < 0) {
    errors.amountPaid = "Enter the authoritative amount already paid, including R0.00.";
  }

  if (!errors.ticketTotal && !errors.amountPaid) {
    if (amountPaid > ticketTotal) {
      errors.amountPaid = "Amount paid cannot exceed the ticket obligation.";
    } else if (draft.paymentBasis === "unpaid" && amountPaid !== 0) {
      errors.amountPaid = "Unpaid bookings must have R0.00 already paid.";
    } else if (
      draft.paymentBasis === "deposit" &&
      !(amountPaid > 0 && amountPaid < ticketTotal)
    ) {
      errors.amountPaid = "A deposit must be greater than R0.00 and less than the ticket obligation.";
    } else if (
      draft.paymentBasis === "fully-paid" &&
      amountPaid !== ticketTotal
    ) {
      errors.amountPaid = "A fully paid booking must have the full ticket obligation paid.";
    } else if (
      draft.paymentBasis === "complimentary" &&
      (ticketTotal !== 0 || amountPaid !== 0)
    ) {
      errors.ticketTotal = "Complimentary bookings must have a R0.00 obligation and R0.00 paid.";
    }
  }

  return errors;
}

export function parseCorporateConversionReview(
  draft: CorporateConversionReviewDraft,
): CorporateConversionReview | null {
  if (Object.keys(validateCorporateConversionReview(draft)).length > 0 || !draft.venue) {
    return null;
  }

  const ticketTotal = Number(draft.ticketTotal);
  const amountPaid = Number(draft.amountPaid);
  const paymentStatus: PaymentStatus =
    draft.paymentBasis === "complimentary"
      ? "comp-vip"
      : draft.paymentBasis === "fully-paid"
        ? "fully-paid"
        : draft.paymentBasis === "deposit"
          ? "deposit-paid"
          : "pending-payment";

  return {
    amountPaid,
    paymentBasis: draft.paymentBasis,
    paymentStatus,
    pax: Number(draft.pax),
    showId: draft.showId,
    ticketTotal,
    venue: draft.venue,
    zoneId: draft.zoneId as SeatingZoneId,
  };
}
