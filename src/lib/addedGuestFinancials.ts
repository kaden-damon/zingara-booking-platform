import type { BookingOrigin, DemoBooking, PaymentOption } from "./zingaraDemo";

export type AddedGuestPricingBasis =
  | {
      paymentBasis: PaymentOption;
      source: NonNullable<DemoBooking["agreedPriceSource"]>;
      unitAmount: number;
    }
  | {
      paymentBasis: "unknown";
      source: "unknown";
      unitAmount: null;
    };

function positiveMoney(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100) / 100
    : null;
}

export function resolveAddedGuestPricingBasis(input: {
  bookingOrigin?: BookingOrigin | null;
  metadata: Partial<DemoBooking> | null;
}) : AddedGuestPricingBasis {
  const provenance = input.metadata?.pricingProvenance;
  const provenanceRate = positiveMoney(provenance?.agreedPricePerPerson);
  const provenanceDeposit = positiveMoney(provenance?.depositPerPerson);

  if (provenance?.source === "complimentary") {
    return {
      paymentBasis: "full",
      source: "complimentary",
      unitAmount: 0,
    };
  }

  if (
    provenance &&
    (provenance.paymentModel === "deposit" || provenance.paymentModel === "full") &&
    provenanceRate &&
    (provenance.paymentModel === "full" || provenanceDeposit)
  ) {
    return {
      paymentBasis: provenance.paymentModel,
      source: provenance.source,
      unitAmount:
        provenance.paymentModel === "deposit"
          ? (provenanceDeposit as number)
          : provenanceRate,
    };
  }

  if (
    input.bookingOrigin === "data_import" ||
    input.bookingOrigin === "legacy_unknown" ||
    !input.metadata
  ) {
    return { paymentBasis: "unknown", source: "unknown", unitAmount: null };
  }

  const paymentBasis = input.metadata.paymentOption;
  const agreedRate = positiveMoney(input.metadata.pricePerPerson);

  if ((paymentBasis !== "deposit" && paymentBasis !== "full") || !agreedRate) {
    return { paymentBasis: "unknown", source: "unknown", unitAmount: null };
  }

  if (paymentBasis === "full") {
    return {
      paymentBasis,
      source: input.metadata.agreedPriceSource ?? "standard-zone",
      unitAmount: agreedRate,
    };
  }

  const originalGuests = Number(input.metadata.partySize);
  const originalTotal = positiveMoney(input.metadata.totalPrice);
  const depositPercentage = Number(input.metadata.depositPercentage);
  const derivedDeposit =
    Number.isInteger(originalGuests) &&
    originalGuests > 0 &&
    originalTotal &&
    Number.isFinite(depositPercentage) &&
    depositPercentage > 0
      ? positiveMoney((originalTotal * depositPercentage) / 100 / originalGuests)
      : null;

  return derivedDeposit
    ? {
        paymentBasis,
        source: input.metadata.agreedPriceSource ?? "standard-zone",
        unitAmount: derivedDeposit,
      }
    : { paymentBasis: "unknown", source: "unknown", unitAmount: null };
}

export function calculateAddedGuestFinancials(input: {
  basis: AddedGuestPricingBasis;
  currentGuestCount: number;
  currentOutstanding: number;
  newGuestCount: number;
}) {
  const addedGuests = Math.max(input.newGuestCount - input.currentGuestCount, 0);
  const additionalAmount =
    input.basis.unitAmount === null
      ? null
      : Math.round(addedGuests * input.basis.unitAmount * 100) / 100;

  return {
    addedGuests,
    additionalAmount,
    newOutstanding:
      additionalAmount === null
        ? null
        : Math.round((input.currentOutstanding + additionalAmount) * 100) / 100,
  };
}
