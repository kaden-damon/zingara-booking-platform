export const TWO_SEATER_BOOKING_LIMIT = 20;
export const TWO_SEATER_LIMIT_ERROR_CODE =
  "TWO_SEATER_BOOKING_LIMIT_REACHED";

export const twoSeaterOccupyingStatuses = [
  "new",
  "confirmed",
  "pending_payment",
  "checked_in",
] as const;

export type TwoSeaterAlternativeShow = {
  date: string;
  id: string;
  label: string;
  location: "cape-town" | "johannesburg";
  time: string;
};

export type TwoSeaterLimitErrorPayload = {
  alternatives?: TwoSeaterAlternativeShow[];
  code?: string;
  error?: string;
  limit?: number;
};

export function isTwoSeaterLimitError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message ?? "")
        : String(error ?? "");

  return message.includes(TWO_SEATER_LIMIT_ERROR_CODE);
}

export function isQualifyingTwoSeaterBooking(input: {
  archivedAt?: string | null;
  guestCount: number;
  status: string;
}) {
  return (
    !input.archivedAt &&
    input.guestCount === 2 &&
    twoSeaterOccupyingStatuses.includes(
      input.status as (typeof twoSeaterOccupyingStatuses)[number],
    )
  );
}
