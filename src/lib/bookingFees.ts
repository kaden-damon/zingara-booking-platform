export const includedBookingFeeAmount = 10;

export function getPersistedBookingFeeAmount(
  notes: unknown,
  ticketGrossAmount: number,
) {
  if (typeof notes === "string" && notes.startsWith("__zingara_booking_meta__:")) {
    try {
      const metadata = JSON.parse(notes.slice("__zingara_booking_meta__:".length)) as {
        pricingProvenance?: { bookingFeeAmount?: unknown };
      };
      const recorded = Number(metadata.pricingProvenance?.bookingFeeAmount);
      if (Number.isFinite(recorded) && recorded >= 0) return recorded;
    } catch {
      // Historical free-text notes retain the established fee interpretation.
    }
  }
  return ticketGrossAmount > 0 ? includedBookingFeeAmount : 0;
}
