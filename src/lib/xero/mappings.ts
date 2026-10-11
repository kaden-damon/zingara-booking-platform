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

export function allRequiredXeroMappingsApproved(categories: string[]) {
  const approved = new Set(categories);
  return XERO_MAPPING_CATEGORIES.every((category) => approved.has(category));
}
