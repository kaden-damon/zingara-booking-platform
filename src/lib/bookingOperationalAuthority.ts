// Fatima/Kaden approval, 26 November 2026. Match verified identities, never names.
export const bookingOperationalStaffIds = [
  "3ac09b59-fc3f-4c6d-9bb3-8dd47a077188", // Fatima MB
  "fe8dff17-a040-4296-afa1-49c058d070f4", // Lisa Rodderick
  "d185b639-054d-4c4f-8f6b-3c1e6fc205af", // Michael Davis
  "1ede862e-6e46-48d5-a66f-03094bea28dd", // Vanessa Robinson
  "bb58fd74-5995-4544-803a-6baaf0ec129b", // Sharon Ricketts
  "92edf75d-06bf-4d40-a142-52b2862a3795", // Rasmus Bjerregaard
  "e2314f89-672a-47c9-bd84-ec8f21eb40f5", // Hannah
  "dfa04423-eaa2-4ff0-8e57-5d8631e276ae", // Nosi Vani
] as const;

export function hasBookingOperationalAuthority(staff: { id?: string | null; active?: boolean } | null | undefined) {
  return Boolean(staff?.active && staff.id && (bookingOperationalStaffIds as readonly string[]).includes(staff.id));
}

export const operationalFinancialFields = ["ticketAmount", "gratuityAmount", "barTabAmount", "otherAmount", "forfeitedAmount", "gratuityForfeitedAmount", "refundReviewAmount", "gratuityReviewAmount", "discountAmount"] as const;
export type OperationalFinancialComponents = Record<(typeof operationalFinancialFields)[number], number>;

export function validateOperationalFinancialComponents(value: unknown, total: number): value is OperationalFinancialComponents {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return operationalFinancialFields.every((key) => typeof record[key] === "number" && Number.isFinite(record[key]) &&
    Number(record[key]) >= 0 && Math.abs(Number(record[key]) * 100 - Math.round(Number(record[key]) * 100)) < 0.000001) &&
    Math.round(operationalFinancialFields.reduce((sum, key) => sum + Number(record[key]) * (key === "discountAmount" ? -1 : 1), 0) * 100) === Math.round(total * 100);
}
