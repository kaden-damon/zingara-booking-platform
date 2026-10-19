export const XERO_MAPPING_CATEGORIES = [
  "ticket_sales",
  "corporate",
  "buyouts",
  "booking_fee",
  "gratuity",
  "addons",
  "discounts",
  "deposits",
  "refunds",
  "payment_account",
] as const;

export type XeroMappingCategory = (typeof XERO_MAPPING_CATEGORIES)[number];

export const XERO_MAPPING_VENUES = ["all", "johannesburg", "cape-town"] as const;
export type XeroMappingVenue = (typeof XERO_MAPPING_VENUES)[number];

export const XERO_GLOBAL_MAPPING_CATEGORIES = ["payment_account"] as const satisfies readonly XeroMappingCategory[];
export const XERO_VENUE_MAPPING_CATEGORIES = XERO_MAPPING_CATEGORIES.filter((category) => category !== "payment_account");

export type ApprovedMappingIdentity = { category: string; venue: string };

export function xeroMappingKey(venue: XeroMappingVenue, category: XeroMappingCategory) {
  return `${venue}:${category}`;
}

export function xeroCategoriesForVenue(venue: XeroMappingVenue): readonly XeroMappingCategory[] {
  return venue === "all" ? XERO_GLOBAL_MAPPING_CATEGORIES : XERO_VENUE_MAPPING_CATEGORIES;
}

export function allRequiredXeroMappingsApproved(mappings: ApprovedMappingIdentity[]) {
  const approved = new Set(mappings.map((mapping) => `${mapping.venue}:${mapping.category}`));
  return XERO_MAPPING_VENUES.every((venue) => xeroCategoriesForVenue(venue).every((category) => approved.has(xeroMappingKey(venue, category))));
}
