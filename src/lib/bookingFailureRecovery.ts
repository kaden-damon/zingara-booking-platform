export type BookingFailureOutcome = "abandoned" | "recovered" | "unresolved";

export type BookingFailureTimelineEntry = {
  at: string;
  bookingReference: string | null;
  failureReason: string;
  performanceDate: string | null;
  performanceId: string | null;
  quotedValue: number;
  requestedGuests: number;
  seatingZone: string | null;
  statusCode: number;
  venue: string | null;
};

export type BookingFailureJourney = {
  amountPaid: number;
  bookingStatus: string | null;
  failedAttempts: number;
  firstFailedAt: string;
  journeyId: string;
  lastFailedAt: string;
  latestFailureReason: string;
  outcome: BookingFailureOutcome;
  paymentStatus: string | null;
  performanceDate: string | null;
  performanceId: string | null;
  potentialValue: number;
  requestedGuests: number;
  seatingZone: string | null;
  successfulBookingReference: string | null;
  timeline: BookingFailureTimelineEntry[];
  totalAmount: number;
  venue: string | null;
};

export type BookingFailureRecoveryReport = {
  asOf: string;
  from: string;
  page: number;
  pageSize: number;
  rows: BookingFailureJourney[];
  summary: {
    abandoned_journeys: number;
    failed_journeys: number;
    potential_value: number;
    recovered_journeys: number;
    requested_guests: number;
    total_attempts: number;
    unresolved_journeys: number;
  };
  to: string;
};

export const bookingFailureReasonLabels: Record<string, string> = {
  "application-error": "Application error",
  "booking-cutoff": "Booking cutoff",
  "booking-validation": "Booking validation",
  "concurrency-conflict": "Concurrent booking conflict",
  "payment-initiation-failed": "Payment could not start",
  "show-closed": "Show closed",
  "show-sold-out": "Show sold out",
  "two-seater-limit": "Two-seater limit",
  "zone-capacity-exhausted": "Zone capacity exhausted",
  "zone-unavailable": "Zone unavailable",
};
