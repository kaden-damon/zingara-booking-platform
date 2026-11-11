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
  getVenueZoneSeatCapacity,
  seatingZones,
} from "@/lib/zingaraDemo";
import { getAuthoritativePublicPricePerPerson } from "@/lib/authoritativePublicPrice";
import { bookingAddonCatalogue, getBookingAddonTotal } from "@/lib/bookingAddons";
import {
  serviceFeeGuestThreshold,
  serviceFeeRate,
} from "@/lib/bookingAddons";
import {
  calculateCurrencyPercentage,
  toCurrencyAmount,
} from "@/lib/currencyMath";

export { serviceFeeGuestThreshold, serviceFeeRate } from "@/lib/bookingAddons";

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
  includeGratuity?: boolean;
  includeBookingFee?: boolean;
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

export const bookingAddons: BookingAddon[] = bookingAddonCatalogue;

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
    return Math.max(0, calculateCurrencyPercentage(subtotal, value / 100));
  }

  return Math.max(0, Math.min(toCurrencyAmount(value), subtotal));
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

  const selectedAddons = input.addons ?? [];
  const addonsTotal = getBookingAddonTotal(selectedAddons);
  const configuredZonePrice = getConfiguredZonePrice(settings, zone);
  const pricePerPerson =
    input.authoritativePricePerPerson ??
    getAuthoritativePublicPricePerPerson({
      configuredPrice: configuredZonePrice,
      partySize: input.partySize,
      remainingSeats: input.remainingSeats,
    });
  const ticketAmount = toCurrencyAmount(pricePerPerson * input.partySize);
  const bookingFeeAmount = 0;
  const seatingSubtotal = ticketAmount;
  const subtotal = toCurrencyAmount(seatingSubtotal + addonsTotal);
  const discountAmount = toCurrencyAmount(
    Math.min(input.promo?.discountAmount ?? 0, subtotal),
  );
  const discountedSubtotal = toCurrencyAmount(
    Math.max(subtotal - discountAmount, 0),
  );
  const serviceFeeAmount =
    input.includeGratuity !== false && input.partySize >= serviceFeeGuestThreshold
      ? calculateCurrencyPercentage(discountedSubtotal, serviceFeeRate)
      : 0;
  const total = toCurrencyAmount(discountedSubtotal + serviceFeeAmount);
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
    bookingFeeAmount,
    depositAmount,
    depositPercentage,
    discountAmount,
    discountedSubtotal,
    pricePerPerson,
    serviceFeeAmount,
    subtotal,
    ticketAmount,
    total,
  };
}
