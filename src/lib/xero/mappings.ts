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
  "payfast_clearing_account",
  "eft_payment_account",
] as const;

export type XeroMappingCategory = (typeof XERO_MAPPING_CATEGORIES)[number];

export const XERO_MAPPING_VENUES = ["all", "johannesburg", "cape-town"] as const;
export type XeroMappingVenue = (typeof XERO_MAPPING_VENUES)[number];

export const XERO_GLOBAL_MAPPING_CATEGORIES = ["payfast_clearing_account", "eft_payment_account"] as const satisfies readonly XeroMappingCategory[];
export const XERO_VENUE_MAPPING_CATEGORIES = XERO_MAPPING_CATEGORIES.filter((category) => !XERO_GLOBAL_MAPPING_CATEGORIES.includes(category as (typeof XERO_GLOBAL_MAPPING_CATEGORIES)[number]));

export const XERO_REQUIRED_GLOBAL_MAPPING_CATEGORIES = XERO_GLOBAL_MAPPING_CATEGORIES;
export const XERO_REQUIRED_VENUE_MAPPING_CATEGORIES = [
  "ticket_sales",
  "corporate",
  "buyouts",
  "booking_fee",
  "gratuity",
  "addons",
  "discounts",
] as const satisfies readonly XeroMappingCategory[];

const APPROVED_REVENUE_ACCOUNT_CODES: Record<Exclude<XeroMappingVenue, "all">, Partial<Record<XeroMappingCategory, string>>> = {
  "cape-town": {
    addons: "205-01",
    booking_fee: "206-02",
    buyouts: "205-01",
    corporate: "205-01",
    discounts: "205-01",
    gratuity: "823-02",
    ticket_sales: "205-01",
  },
  johannesburg: {
    addons: "205",
    booking_fee: "206-01",
    buyouts: "205",
    corporate: "205",
    discounts: "205",
    gratuity: "823-01",
    ticket_sales: "205",
  },
};

export type ApprovedMappingIdentity = { category: string; venue: string };

export function xeroMappingKey(venue: XeroMappingVenue, category: XeroMappingCategory) {
  return `${venue}:${category}`;
}

export function xeroCategoriesForVenue(venue: XeroMappingVenue): readonly XeroMappingCategory[] {
  return venue === "all" ? XERO_GLOBAL_MAPPING_CATEGORIES : XERO_VENUE_MAPPING_CATEGORIES;
}

export function isXeroPaymentMappingCategory(category: XeroMappingCategory) {
  return XERO_GLOBAL_MAPPING_CATEGORIES.includes(category as (typeof XERO_GLOBAL_MAPPING_CATEGORIES)[number]);
}

export function expectedXeroAccountCode(venue: XeroMappingVenue, category: XeroMappingCategory) {
  return venue === "all" ? null : APPROVED_REVENUE_ACCOUNT_CODES[venue][category] ?? null;
}

export function isXeroMappingApprovalSupported(venue: XeroMappingVenue, category: XeroMappingCategory) {
  if (venue === "all") return isXeroPaymentMappingCategory(category);
  return Boolean(expectedXeroAccountCode(venue, category));
}

export function allRequiredXeroMappingsApproved(mappings: ApprovedMappingIdentity[]) {
  const approved = new Set(mappings.map((mapping) => `${mapping.venue}:${mapping.category}`));
  return XERO_REQUIRED_GLOBAL_MAPPING_CATEGORIES.every((category) => approved.has(xeroMappingKey("all", category)))
    && (["johannesburg", "cape-town"] as const).every((venue) => XERO_REQUIRED_VENUE_MAPPING_CATEGORIES.every((category) => approved.has(xeroMappingKey(venue, category))));
}

export function resolveXeroPaymentAccount(evidenceType: unknown, mappings: Array<{ account_id: string | null; account_type: string | null; approved_at: string | null; category: string }>) {
  const category = evidenceType === "successful_payfast" ? "payfast_clearing_account" : evidenceType === "structured_manual" ? "eft_payment_account" : null;
  if (!category) throw new Error("The payment source needs manual reconciliation before Xero allocation.");
  const candidates = mappings.filter((mapping) => mapping.category === category && mapping.approved_at && mapping.account_type === "BANK" && mapping.account_id);
  if (candidates.length !== 1) throw new Error("Approve the verified bank account for this payment source before allocation.");
  return candidates[0].account_id!;
}
