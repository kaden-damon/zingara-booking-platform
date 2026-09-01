import {
  type BookingAddon,
  type DemoBooking,
  type DemoVenueSettings,
  type PromoDiscountType,
  type SeatingZone,
  defaultVenueSettings,
  calculateConfiguredDeposit,
  getConfiguredZonePrice,
  getConfiguredZoneMaxSeats,
  getIncludedBookingFeeBreakdown,
  getVenueZoneSeatCapacity,
  seatingZones,
} from "@/lib/zingaraDemo";
import { getAuthoritativePublicPricePerPerson } from "@/lib/authoritativePublicPrice";

export type PromoCodeSummary = {
  code: string;
  description: string;
  discountType: PromoDiscountType;
  value: number;
};

export type PromoValidationStatus =
  | "expired"
  | "invalid"
  | "not_applicable"
  | "scheduled"
  | "usage_exhausted"
  | "valid";

export type PromoValidationResult = {
  code?: string;
  description?: string;
  discountAmount: number;
  discountType?: PromoDiscountType;
  discountValue?: number;
  promoCodeId?: string;
  status: PromoValidationStatus;
};

export type PublicPricingInput = {
  addons?: BookingAddon[];
  authoritativePricePerPerson?: number;
  partySize: number;
  paymentOption?: DemoBooking["paymentOption"];
  promo?: PromoValidationResult | null;
  remainingSeats?: number;
  settings?: DemoVenueSettings | null;
  zoneId: SeatingZone["id"];
};

export type PublicPricingResult = {
  addons: BookingAddon[];
  addonsTotal: number;
  amountDueNow: number;
  bookingFeeAmount: number;
  depositAmount: number;
  depositPercentage: number;
  discountAmount: number;
  discountedSubtotal: number;
  pricePerPerson: number;
  serviceFeeAmount: number;
  subtotal: number;
  ticketAmount: number;
  total: number;
};

export const bookingAddons: BookingAddon[] = [
  {
    id: "vip-champagne",
    name: "VIP Champagne Package",
    price: 1250,
  },
  {
    id: "premium-wine",
    name: "Premium Wine Pairing",
    price: 890,
  },
  {
    id: "birthday-celebration",
    name: "Birthday Celebration Package",
    price: 750,
  },
  {
    id: "backstage-experience",
    name: "Backstage Experience",
    price: 1500,
  },
];

export const legacyPromoCodes: PromoCodeSummary[] = [
  {
    code: "COUNTESS10",
    description: "10% Royal Countess guest saving",
    discountType: "percentage",
    value: 10,
  },
  {
    code: "ROYAL500",
    description: "R500 private table credit",
    discountType: "fixed",
    value: 500,
  },
  {
    code: "STAGE15",
    description: "15% elevated stage celebration rate",
    discountType: "percentage",
    value: 15,
  },
];

export const serviceFeeGuestThreshold = 6;
export const serviceFeeRate = 0.125;

export function normalizePromoCode(code: string | null | undefined) {
  return (code ?? "").trim().toUpperCase();
}

export function getDiscountAmount(
  promoCode:
    | Pick<PromoCodeSummary, "discountType" | "value">
    | {
        discountType: PromoDiscountType;
        discountValue: number;
      }
    | null
    | undefined,
  subtotal: number,
) {
  if (!promoCode || subtotal <= 0) {
    return 0;
  }

  const discountType = promoCode.discountType;
  const value =
    "discountValue" in promoCode ? promoCode.discountValue : promoCode.value;

  if (discountType === "percentage") {
    return Math.max(0, Math.round(subtotal * (value / 100)));
  }

  return Math.max(0, Math.min(Math.round(value), subtotal));
}

export function getRemainingVenueSeatsForZone(
  option: Pick<SeatingZone, "id">,
  occupiedSeats: number,
  settings: DemoVenueSettings = defaultVenueSettings,
) {
  return Math.max(
    getConfiguredZoneMaxSeats(settings, option) - Math.max(occupiedSeats, 0),
    0,
  );
}

export function calculatePublicBookingPricing(
  input: PublicPricingInput,
): PublicPricingResult {
  const settings = input.settings ?? defaultVenueSettings;
  const zone = seatingZones.find((candidate) => candidate.id === input.zoneId);

  if (!zone) {
    throw new Error("Unknown seating zone.");
  }

  const selectedAddonIds = new Set((input.addons ?? []).map((addon) => addon.id));
  const selectedAddons = bookingAddons.filter((addon) =>
    selectedAddonIds.has(addon.id),
  );
  const addonsTotal = selectedAddons.reduce(
    (total, addon) => total + addon.price,
    0,
  );
  const configuredZonePrice = getConfiguredZonePrice(settings, zone);
  const pricePerPerson =
    input.authoritativePricePerPerson ??
    getAuthoritativePublicPricePerPerson({
      configuredPrice: configuredZonePrice,
      partySize: input.partySize,
      remainingSeats: input.remainingSeats,
    });
  const seatingSubtotal = pricePerPerson * input.partySize;
  const includedBookingFeeBreakdown =
    getIncludedBookingFeeBreakdown(seatingSubtotal);
  const subtotal = seatingSubtotal + addonsTotal;
  const discountAmount = Math.min(input.promo?.discountAmount ?? 0, subtotal);
  const discountedSubtotal = Math.max(subtotal - discountAmount, 0);
  const serviceFeeAmount =
    input.partySize >= serviceFeeGuestThreshold
      ? Math.round(discountedSubtotal * serviceFeeRate)
      : 0;
  const total = discountedSubtotal + serviceFeeAmount;
  const depositAmount = calculateConfiguredDeposit(
    settings,
    zone,
    total,
    input.partySize,
  );
  const depositPercentage = total > 0 ? (depositAmount / total) * 100 : 100;
  const amountDueNow =
    input.paymentOption === "deposit" ? depositAmount : total;

  return {
    addons: selectedAddons,
    addonsTotal,
    amountDueNow,
    bookingFeeAmount: includedBookingFeeBreakdown.bookingFee,
    depositAmount,
    depositPercentage,
    discountAmount,
    discountedSubtotal,
    pricePerPerson,
    serviceFeeAmount,
    subtotal,
    ticketAmount: includedBookingFeeBreakdown.ticketAmount,
    total,
  };
}
