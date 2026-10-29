export type BookingAmendmentErrorResponse = {
  code: string;
  message: string;
  status: number;
};

const ERROR_RESPONSES: Array<{
  code: string;
  message: string;
  status: number;
}> = [
  { code: "BOOKING_REVISION_CHANGED", message: "This booking was changed by another staff member. Reload and review the latest values.", status: 409 },
  { code: "BOOKING_NOT_FOUND", message: "The booking could not be found.", status: 404 },
  { code: "GUEST_COUNT_UNCHANGED", message: "Enter a different guest count before confirming.", status: 400 },
  { code: "GUEST_COUNT_INVALID", message: "Enter a valid whole-number guest count.", status: 400 },
  { code: "RECONCILIATION_REASON_REQUIRED", message: "Enter a reason for this change.", status: 400 },
  { code: "ZONE_CAPACITY_EXCEEDED", message: "This seating section does not have enough approved space for the added guests.", status: 409 },
  { code: "CORPORATE_ZONE_ENTITLEMENTS_INVALID", message: "The Corporate seating allocation does not match the guest count. Review the seating sections and try again.", status: 409 },
  { code: "CORPORATE_ZONE_ALLOCATION_REQUIRED", message: "This booking uses more than one seating section. Update its Corporate seating allocation before changing the guest count.", status: 409 },
  { code: "BOOKING_TABLE_STATE_INVALID", message: "Check this booking's table before changing the guest count.", status: 409 },
  { code: "SHOW_NOT_FOUND", message: "The booking's performance could not be found.", status: 409 },
  { code: "SHOW_NOT_ACTIVE", message: "Guests cannot be added because this performance is not currently active.", status: 409 },
  { code: "TWO_SEATER_BOOKING_LIMIT_REACHED", message: "This performance has reached its limit for two-guest table requests. Keep the current guest count or choose another available performance.", status: 409 },
  { code: "FULL_PAYMENT_POLICY_AMENDMENT_REQUIRED", message: "This performance requires full payment. The existing payment agreement cannot be used to add guests; review the booking with Accounts before continuing.", status: 409 },
  { code: "FULL_PAYMENT_ONLY", message: "This performance requires full payment. Deposit or partial-payment terms are not available.", status: 409 },
  { code: "FULL_PAYMENT_VERIFICATION_REQUIRED", message: "Full payment must be verified before this booking can be treated as settled.", status: 409 },
  { code: "ADDED_GUEST_FINANCIAL_BASIS_REQUIRED", message: "The additional amount could not be calculated. Check the booking's payment details before adding guests.", status: 409 },
  { code: "COMP_CATEGORY_FINANCIAL_BASIS_REQUIRED", message: "The Media or Tradex rate could not be verified. Review the booking's payment details before changing guests.", status: 409 },
  { code: "COMP_CATEGORY_REDUCTION_FINANCIAL_REVIEW_REQUIRED", message: "This reduction would leave more paid than the revised booking total. Review the payment before reducing guests.", status: 409 },
  { code: "LEGACY_MANUAL_BASIS_NOT_ALLOWED", message: "This booking already has confirmed pricing. Use its saved payment details.", status: 409 },
  { code: "LEGACY_INCREASE_REQUIRED", message: "Manual legacy pricing can only be used when adding guests.", status: 400 },
  { code: "GUEST_COUNT_REDUCTION_REQUIRED", message: "Enter a lower guest count for this retained-value workflow.", status: 400 },
  { code: "RETAINED_VALUE_ALLOCATION_REQUIRED", message: "Confirm the retained value transfer to Bar Tab.", status: 400 },
  { code: "LEGACY_FINANCIAL_EVIDENCE_REQUIRED", message: "Add the original invoice details before reducing this paid booking.", status: 409 },
  { code: "LEGACY_TICKET_RATE_INVALID", message: "The imported ticket, gratuity and Bar Tab values do not reconcile exactly. Review the evidence before continuing.", status: 409 },
  { code: "RETAINED_VALUE_ALLOCATION_MISMATCH", message: "The imported ticket, gratuity and Bar Tab values do not reconcile exactly. Review the evidence before continuing.", status: 409 },
  { code: "BOOKING_RECONCILIATION_NOT_ALLOWED", message: "This booking cannot be amended in its current status.", status: 409 },
  { code: "AMOUNT_PAID_BELOW_IMMUTABLE_EVIDENCE", message: "The paid amount cannot be reduced below verified provider or legacy payment evidence.", status: 409 },
  { code: "FINANCIAL_RECONCILIATION_UNCHANGED", message: "Enter a financial change before confirming.", status: 400 },
  { code: "RECONCILIATION_PERMISSION_REQUIRED", message: "Your account does not have permission to amend this booking.", status: 403 },
  { code: "TICKET_POPULATION_TERMINAL_IDENTITY_REVIEW_REQUIRED", message: "This booking has a cancelled or replaced ticket that needs review before guests can be added.", status: 409 },
  { code: "TICKET_POPULATION_FAMILY_AMBIGUOUS", message: "This booking's ticket identities need review before guests can be added.", status: 409 },
  { code: "TICKET_POPULATION_METADATA_INVALID", message: "This booking's ticket information needs review before guests can be added.", status: 409 },
];

export function mapBookingAmendmentError(error: unknown): BookingAmendmentErrorResponse | null {
  const message = error && typeof error === "object" && "message" in error
    ? String(error.message ?? "")
    : "";
  const match = ERROR_RESPONSES.find((candidate) => message.includes(candidate.code));
  return match ? { ...match } : null;
}
