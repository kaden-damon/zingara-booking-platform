export function normalizeAttendingGuestName(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.trim().length > 120 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("Enter an attending guest name of no more than 120 characters.");
  }
  return value.trim() || undefined;
}

export function getBookingGuestName(booking: { attendingGuestName?: string; customer: { name: string } }) {
  return booking.attendingGuestName?.trim() || booking.customer.name;
}

export function getBookingGuestLabel(booking: { attendingGuestName?: string; customer: { name: string } }) {
  return booking.attendingGuestName?.trim()
    ? `${booking.attendingGuestName.trim()} (Booked by ${booking.customer.name})`
    : booking.customer.name;
}

export function getAttendingGuestNameFromNotes(notes: string | null | undefined) {
  const prefix = "__zingara_booking_meta__:";
  if (!notes?.startsWith(prefix)) return undefined;
  try {
    return normalizeAttendingGuestName(JSON.parse(notes.slice(prefix.length)).attendingGuestName);
  } catch { return undefined; }
}
