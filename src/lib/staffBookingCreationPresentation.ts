export const staffBookingJourneyLabels = {
  standard: ["Show", "Guests", "Seating", "Guest", "Review", "Created"],
  corporate: ["Show", "Guests", "Seating", "Company", "Review", "Created"],
} as const;

export function getStaffAvailabilityPresentation(input: {
  baseRemaining: number;
  isCorporate: boolean;
  operationalRemaining: number;
}) {
  const operationalRemaining = Math.max(Math.trunc(input.operationalRemaining), 0);
  const baseRemaining = Math.max(Math.trunc(input.baseRemaining), 0);
  const extraSeats = Math.max(operationalRemaining - baseRemaining, 0);

  return {
    extraSeats,
    extraSeatsLabel:
      extraSeats > 0 ? `Includes ${extraSeats} extra ${extraSeats === 1 ? "seat" : "seats"}` : "",
    label: input.isCorporate ? "Corporate staff availability" : "Staff availability",
    seatsLabel: `${operationalRemaining} ${operationalRemaining === 1 ? "seat" : "seats"} available`,
  };
}

export const staffBookingExtraSeatingHelp =
  "Extra seating is for staff-created bookings only and does not increase website availability.";
