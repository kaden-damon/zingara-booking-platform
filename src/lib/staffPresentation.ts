export const staffBookingStatusLabels = {
  cancelled: "Cancelled",
  completed: "Completed",
  confirmed: "Confirmed",
  new: "New",
  "no-show": "No-show",
  pending: "Awaiting payment",
  "pending-payment": "Awaiting payment",
  refunded: "Refunded",
  waitlisted: "Waitlisted",
  "checked-in": "Checked in",
} as const;

export const staffPaymentStatusLabels = {
  "comp-vip": "Complimentary",
  "deposit-paid": "Deposit paid",
  "fully-paid": "Paid",
  "pending-payment": "Unpaid",
  refunded: "Refunded",
} as const;

export const staffShowStatusLabels = {
  active: "Open",
  blackout: "Booking blackout",
  inactive: "Closed",
  "sold-out": "Sold out",
  "special-event": "Special event",
  "venue-closure": "Venue closed",
} as const;

export const staffCapacityTerms = {
  activeEntitlement: "Guests booked",
  assignableSeats: "Available table seats",
  baseCapacity: "Public seats",
  effectiveCapacity: "Total approved seating",
  floorQueue: "Needs a table",
  operationalRemaining: "Approved seats left",
  physicalRepresentation: "Table seats set up",
  publicRemaining: "Public seats left",
  temporaryCapacity: "Extra seating",
} as const;

export const staffCapacityHelp = {
  activeEntitlement: "Includes confirmed guests who still need a table.",
  baseCapacity: "Seats available for public booking.",
  effectiveCapacity: "Public seats plus approved extra seating for this show.",
  operationalRemaining: "Seats remaining against total approved seating.",
  physicalRepresentation:
    "Physical table seats help seat booked guests. They do not create booking capacity.",
  temporaryCapacity:
    "For staff-created bookings only. Does not increase website availability.",
} as const;
