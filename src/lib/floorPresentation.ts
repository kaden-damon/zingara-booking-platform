export const floorCapacityLabels = {
  approvedRemaining: "Approved seats left",
  assignableSeats: "Available table seats",
  bookedGuests: "Guests booked",
  extraSeating: "Extra seating",
  floorQueue: "Needs a table",
  physicalSeats: "Table seats set up",
  publicCapacity: "Public seats",
  publicRemaining: "Public seats left",
  totalApproved: "Total approved seating",
} as const;

export const floorCapacityHelp = {
  extraSeating:
    "For staff-created bookings only. Does not increase website availability.",
  physicalSeats:
    "Physical table seats help seat booked guests. They do not create booking capacity.",
  publicCapacity: "Seats available for public booking.",
} as const;

export function getTableFitLabel(minimum: number, maximum: number) {
  return `Fits ${minimum}-${maximum} guests`;
}

export function formatFloorSeatCount(
  count: number,
  singularLabel: string,
  suffix = "",
) {
  return `${count} ${singularLabel}${count === 1 ? "" : "s"}${suffix ? ` ${suffix}` : ""}`;
}

export function getAssignmentSafetyCopy() {
  return {
    detail: "If one is no longer available, nothing changes.",
    title: "Tables are assigned together.",
  };
}
