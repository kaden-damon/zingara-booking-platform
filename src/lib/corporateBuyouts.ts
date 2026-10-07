export const corporateBuyoutActiveStates = [
  "provisional",
  "awaiting_payment",
  "fully_paid",
  "confirmed",
] as const;

export type CorporateBuyoutState =
  | (typeof corporateBuyoutActiveStates)[number]
  | "cancelled"
  | "released";

export type CorporateBuyoutPackage = {
  active: boolean;
  additionalGuestRate: number | null;
  baseAmount: number;
  code: string;
  currency: "ZAR";
  dateHoldHours: number | null;
  displayName: string;
  exclusions: string[];
  gratuityAmount: number;
  id: string;
  includedGuestCount: number;
  inclusions: string[];
  maximumGuestCount: number | null;
  paymentDueHours: number | null;
  quoteValidityHours: number | null;
  totalAmount: number;
  vatAmount: number;
  version: number;
};

export type CorporateBuyoutSummary = {
  bookingReference: string;
  companyName: string;
  currentGuestCount: number;
  id: string;
  packageName: string;
  revision: number;
  reviewBookingCount: number;
  reviewGuestCount: number;
  state: CorporateBuyoutState;
  unallocatedGuestCount: number;
};

export const corporateBuyoutStateLabels: Record<CorporateBuyoutState, string> = {
  awaiting_payment: "Awaiting Payment",
  cancelled: "Cancelled",
  confirmed: "Confirmed",
  fully_paid: "Fully Paid",
  provisional: "Provisional",
  released: "Released",
};

export function isActiveCorporateBuyoutState(
  state: string | null | undefined,
) {
  return corporateBuyoutActiveStates.includes(
    state as (typeof corporateBuyoutActiveStates)[number],
  );
}

export function calculateCorporateBuyoutCommercials(input: {
  additionalGuestRate?: number | null;
  guestCount: number;
  package: Pick<
    CorporateBuyoutPackage,
    | "baseAmount"
    | "gratuityAmount"
    | "includedGuestCount"
    | "maximumGuestCount"
    | "totalAmount"
    | "vatAmount"
  >;
}) {
  const guestCount = Math.trunc(input.guestCount);
  const additionalGuests = Math.max(
    guestCount - input.package.includedGuestCount,
    0,
  );
  const additionalGuestRate = Number(input.additionalGuestRate ?? 0);
  const additionalGuestAmount =
    Math.round(additionalGuests * additionalGuestRate * 100) / 100;

  return {
    additionalGuestAmount,
    additionalGuests,
    baseAmount: input.package.baseAmount,
    gratuityAmount: input.package.gratuityAmount,
    totalAmount:
      Math.round((input.package.totalAmount + additionalGuestAmount) * 100) /
      100,
    vatAmount: input.package.vatAmount,
  };
}

export function validateCorporateBuyoutGuestTerms(input: {
  additionalGuestRate?: number | null;
  guestCount: number;
  includedGuestCount: number;
  maximumGuestCount?: number | null;
}) {
  if (!Number.isInteger(input.guestCount) || input.guestCount < 1) {
    return "Enter a valid guest count.";
  }

  if (input.guestCount <= input.includedGuestCount) return null;

  if (
    !Number.isFinite(input.additionalGuestRate) ||
    Number(input.additionalGuestRate) <= 0 ||
    !Number.isInteger(input.maximumGuestCount) ||
    Number(input.maximumGuestCount) < input.includedGuestCount
  ) {
    return "Add the approved extra-guest rate and maximum to the quote before continuing.";
  }

  if (input.guestCount > Number(input.maximumGuestCount)) {
    return `This quote allows up to ${input.maximumGuestCount} guests.`;
  }

  return null;
}
