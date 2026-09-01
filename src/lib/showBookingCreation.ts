export type ShowLockPurpose = "booking-creation" | "show-edit";

export type CalendarBookingLockContext = {
  expectedDate: string;
  expectedLocation: string;
  expectedTime: string;
  lockId: string;
  sessionId: string;
  showReference: string;
};

export function canReuseShowLock(input: {
  existingPurpose: ShowLockPurpose;
  existingSessionId: string;
  requestedPurpose: ShowLockPurpose;
  requestedSessionId: string;
}) {
  return (
    input.existingPurpose === input.requestedPurpose &&
    input.existingSessionId === input.requestedSessionId
  );
}

export function buildCalendarBookingHref(input: {
  bookingType: "corporate" | "standard";
  context: CalendarBookingLockContext;
}) {
  const params = new URLSearchParams({
    bookingType: input.bookingType,
    expectedDate: input.context.expectedDate,
    expectedLocation: input.context.expectedLocation,
    expectedTime: input.context.expectedTime,
    showId: input.context.showReference,
    showLockId: input.context.lockId,
    showLockSession: input.context.sessionId,
    staffCheckout: "1",
  });

  return `/book?${params.toString()}`;
}

export function hasValidCalendarBookingContext(
  context: Partial<CalendarBookingLockContext> | null | undefined,
): context is CalendarBookingLockContext {
  return Boolean(
    context?.expectedDate?.trim() &&
      context.expectedLocation?.trim() &&
      context.expectedTime?.trim() &&
      context.lockId?.trim() &&
      context.sessionId?.trim() &&
      context.showReference?.trim(),
  );
}
