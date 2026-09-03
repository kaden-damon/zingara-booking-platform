type CorporateEnquiryLike = {
  addons: string[];
  alternativeDate: string;
  barTab: string;
  companyName: string;
  contactName: string;
  contactNumber: string;
  dietaryRequirements: string[];
  email: string;
  guestCount: number | null;
  id: string;
  locationAcknowledgement?: string;
  notes: string;
  occasion: string;
  preferredDate: string;
  requestType: "agent-contact" | "corporate-booking";
  seatingPreference: string;
};

type CorporateRecipientSettings = {
  operationalSettings: {
    corporateEnquiryRecipients: Record<
      "cape-town" | "johannesburg",
      string
    >;
  };
};

const authoritativeLocations = {
  "Cape Town": "cape-town",
  Johannesburg: "johannesburg",
} as const;

export function resolveCorporateEnquiryLocation(
  locationAcknowledgement: string | null | undefined,
) {
  const location = locationAcknowledgement?.trim();

  return location && location in authoritativeLocations
    ? authoritativeLocations[
        location as keyof typeof authoritativeLocations
      ]
    : null;
}

export function getCorporateEnquiryRecipient(
  request: CorporateEnquiryLike,
  settings: CorporateRecipientSettings,
) {
  const location = resolveCorporateEnquiryLocation(
    request.locationAcknowledgement,
  );

  return location
    ? settings.operationalSettings.corporateEnquiryRecipients[location]
    : null;
}

function display(value: string | number | null | undefined) {
  if (typeof value === "number") return String(value);
  return value?.trim() || "Not supplied";
}

export function createCorporateEnquiryNotificationMessage(
  request: CorporateEnquiryLike,
) {
  const requestedDates = [
    request.preferredDate
      ? `Preferred: ${request.preferredDate}`
      : "Preferred: Not supplied",
    request.alternativeDate
      ? `Alternative: ${request.alternativeDate}`
      : "Alternative: Not supplied",
  ].join("\n");

  return [
    `A new ${request.requestType === "agent-contact" ? "agent contact" : "Corporate booking"} enquiry has been submitted.`,
    "",
    `Enquiry reference: ${request.id}`,
    `Venue: ${display(request.locationAcknowledgement)}`,
    `Contact: ${display(request.contactName)}`,
    `Company: ${display(request.companyName)}`,
    `Email: ${display(request.email)}`,
    `Mobile: ${display(request.contactNumber)}`,
    `Requested date:\n${requestedDates}`,
    `Guests: ${display(request.guestCount)}`,
    `Seating preference: ${display(request.seatingPreference)}`,
    `Occasion: ${display(request.occasion)}`,
    `Dietary requirements: ${display(request.dietaryRequirements.join(", "))}`,
    `Bar tab: ${display(request.barTab)}`,
    `Add-ons: ${display(request.addons.join(", "))}`,
    `Notes: ${display(request.notes)}`,
  ].join("\n");
}
