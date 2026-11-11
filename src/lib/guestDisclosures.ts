type EntryLocationKey = "cape-town" | "johannesburg";

function resolveGuestVenueLocation(
  venue: EntryLocationKey | string | null | undefined,
): EntryLocationKey | null {
  const normalizedVenue = String(venue ?? "").trim().toLowerCase();

  if (normalizedVenue.includes("johannesburg") || normalizedVenue.includes("joburg")) {
    return "johannesburg";
  }
  if (normalizedVenue.includes("cape town") || normalizedVenue.includes("cape-town")) {
    return "cape-town";
  }
  return null;
}

export type GuestPaymentDisclosureInput = {
  balanceOutstanding?: number | null;
  gratuityPolicy?: "online-collected" | "pay-at-venue" | null;
  serviceFeeAmount?: number | null;
};

export function getGuestVenueInclusions(
  venue: EntryLocationKey | string | null | undefined,
) {
  const location = resolveGuestVenueLocation(venue);

  if (location === "cape-town") {
    return [
      "Welcome drinks and canapés on arrival.",
      "A decadent 3 course dinner.",
      "2½-hour performance experience.",
    ];
  }

  if (location === "johannesburg") {
    return [
      "Welcome drink on arrival.",
      "A decadent 4 course dinner.",
      "2½-hour performance experience.",
    ];
  }

  return [];
}

export function getSeatingPreviewTicketInclusion(
  venue: EntryLocationKey | string | null | undefined,
) {
  const location = resolveGuestVenueLocation(venue);

  if (location === "cape-town") {
    return "Your ticket includes a welcome drink and canapés on arrival, a decadent 3-course dinner and a 2½-hour performance experience.";
  }
  if (location === "johannesburg") {
    return "Your ticket includes a welcome drink on arrival, a decadent 4-course dinner and a 2½-hour performance experience.";
  }
  return "";
}

export function formatSeatingPreviewSeatAvailability(remainingSeats: number) {
  return `${remainingSeats} ${remainingSeats === 1 ? "Seat" : "Seats"} Available`;
}

export function formatSeatingPreviewRecommendation(
  showDateTime: string,
  zoneTitle: string,
) {
  return `You can also check ${showDateTime.trim()} for ${zoneTitle.trim()}.`;
}

export function getGuestPaymentDisclosures({
  balanceOutstanding = 0,
  gratuityPolicy,
  serviceFeeAmount = 0,
}: GuestPaymentDisclosureInput) {
  const notices: string[] = [];

  if (Number(balanceOutstanding) > 0) {
    notices.push(
      "Your outstanding ticket balance remains payable through your secure payment link or agreed payment arrangement.",
    );
  }

  if (Number(serviceFeeAmount) > 0) {
    notices.push(
      "A 12.5% gratuity for parties of six or more is included in the booking total and calculated on the discounted seating and add-on subtotal.",
    );
  }

  notices.push(
    gratuityPolicy === "pay-at-venue" || Number(serviceFeeAmount) === 0
      ? "Applicable gratuity and additional drinks are payable at the venue."
      : "Additional drinks and gratuity on drinks are payable on the night.",
  );

  return notices;
}
