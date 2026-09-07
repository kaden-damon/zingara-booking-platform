import type { BookingAddon, EntryLocationKey } from "./zingaraDemo";

export const bookingAddonCatalogue: BookingAddon[] = [
  { id: "arrival-drinks", kind: "catalogue", name: "Arrival Drinks", price: 0, pricingType: "operational", quantity: 1, unitPrice: 0 },
  { id: "branded-menu-cards", kind: "catalogue", name: "Branded Menu Cards", price: 0, pricingType: "operational", quantity: 1, unitPrice: 0 },
  { id: "personalised-table-signage", kind: "catalogue", name: "Personalised Table Signage", price: 0, pricingType: "operational", quantity: 1, unitPrice: 0 },
  { id: "face-painting-eye", kind: "catalogue", name: "Face Painting · Eye", price: 100, pricingType: "priced", quantity: 1, unitPrice: 100 },
  { id: "face-painting-half-face", kind: "catalogue", name: "Face Painting · Half Face", price: 200, pricingType: "priced", quantity: 1, unitPrice: 200 },
  { id: "face-painting-mask", kind: "catalogue", name: "Face Painting · Mask", price: 200, pricingType: "priced", quantity: 1, unitPrice: 200 },
  { id: "tarot-reading", kind: "catalogue", name: "Tarot Reading", price: 450, pricingType: "priced", quantity: 1, unitPrice: 450 },
  { id: "vip-bar", kind: "catalogue", name: "VIP Bar", price: 0, pricingType: "operational", quantity: 1, unitPrice: 0 },
];

const johannesburgDietaryAddons: BookingAddon[] = [
  { id: "dietary-strictly-halaal", kind: "catalogue", name: "Strictly Halaal", price: 250, pricingType: "priced", quantity: 1, unitPrice: 250 },
  { id: "dietary-kosher", kind: "catalogue", name: "Kosher", price: 500, pricingType: "priced", quantity: 1, unitPrice: 500 },
];

const venueRestrictedAddonIds = new Set(
  johannesburgDietaryAddons.map((addon) => addon.id),
);

export function getBookingAddonCatalogue(
  location?: EntryLocationKey | null,
) {
  return location === "johannesburg"
    ? [...bookingAddonCatalogue, ...johannesburgDietaryAddons]
    : bookingAddonCatalogue;
}

export const serviceFeeGuestThreshold = 6;
export const serviceFeeRate = 0.125;

const maximumAddons = 40;
const maximumQuantity = 10_000;
const maximumUnitPrice = 10_000_000;

function currency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeQuantity(value: unknown) {
  const quantity = Number(value);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maximumQuantity) {
    throw new Error("Each add-on quantity must be a whole number between 1 and 10,000.");
  }

  return quantity;
}

function normalizeUnitPrice(value: unknown) {
  const unitPrice = Number(value);

  if (
    !Number.isFinite(unitPrice) ||
    unitPrice < 0 ||
    unitPrice > maximumUnitPrice ||
    Math.abs(unitPrice * 100 - Math.round(unitPrice * 100)) > 1e-8
  ) {
    throw new Error("Each add-on unit price must be a valid non-negative Rand amount with no more than two decimals.");
  }

  return currency(unitPrice);
}

export function getBookingAddonTotal(addons: BookingAddon[] | null | undefined) {
  return currency(
    (addons ?? []).reduce((total, addon) => total + Number(addon.price || 0), 0),
  );
}

export function normalizeInternalBookingAddons(
  value: unknown,
  options: {
    allowCustomPricing: boolean;
    existingAddons?: BookingAddon[];
    location?: EntryLocationKey | null;
  },
): BookingAddon[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("Booking add-ons must be supplied as a list.");
  if (value.length > maximumAddons) throw new Error("A booking may contain at most 40 add-on items.");

  const seenIds = new Set<string>();

  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error("An add-on item is invalid.");
    const item = raw as Record<string, unknown>;
    const requestedId = String(item.id ?? "").trim();
    const catalogueItem = getBookingAddonCatalogue(options.location).find(
      (candidate) => candidate.id === requestedId,
    );
    const quantity = normalizeQuantity(item.quantity ?? 1);

    if (catalogueItem) {
      if (seenIds.has(catalogueItem.id)) throw new Error("The same catalogue add-on cannot be selected twice.");
      seenIds.add(catalogueItem.id);
      const catalogueUnitPrice = catalogueItem.unitPrice ?? catalogueItem.price;
      const requestedUnitPrice = normalizeUnitPrice(
        item.unitPrice ?? catalogueUnitPrice,
      );
      const existingItem = options.existingAddons?.find(
        (candidate) => candidate.id === catalogueItem.id,
      );
      const existingUnitPrice = existingItem
        ? normalizeUnitPrice(
            existingItem.unitPrice ??
              Number(existingItem.price || 0) /
                (existingItem.quantity ?? 1),
          )
        : null;
      const preservesExistingOverride =
        existingUnitPrice !== null && requestedUnitPrice === existingUnitPrice;

      if (
        requestedUnitPrice !== catalogueUnitPrice &&
        !options.allowCustomPricing &&
        !preservesExistingOverride
      ) {
        throw new Error(
          "Booking-specific catalogue price changes require booking financial reconciliation access.",
        );
      }

      return {
        ...catalogueItem,
        catalogueUnitPrice,
        price: currency(requestedUnitPrice * quantity),
        quantity,
        unitPrice: requestedUnitPrice,
      };
    }

    if (venueRestrictedAddonIds.has(requestedId)) {
      throw new Error(
        "This priced dietary add-on is not configured for the booking venue.",
      );
    }

    const existingItem = options.existingAddons?.find(
      (candidate) => candidate.id === requestedId,
    );
    if (
      existingItem &&
      String(item.name ?? "") === existingItem.name &&
      String(item.description ?? "") === (existingItem.description ?? "") &&
      Number(item.price) === Number(existingItem.price) &&
      quantity === (existingItem.quantity ?? 1)
    ) {
      const existingUnitPrice =
        existingItem.unitPrice ?? Number(existingItem.price || 0) / quantity;
      return {
        ...existingItem,
        price: currency(existingUnitPrice * quantity),
        quantity,
        unitPrice: currency(existingUnitPrice),
      };
    }

    if (!options.allowCustomPricing) {
      throw new Error("Custom-priced add-ons require booking financial reconciliation access.");
    }

    const name = String(item.name ?? "").trim();
    const description = String(item.description ?? "").trim();
    if (!name) throw new Error("Custom add-on item name is required.");
    if (name.length > 120) throw new Error("Custom add-on item name may not exceed 120 characters.");
    if (description.length > 500) throw new Error("Custom add-on notes may not exceed 500 characters.");
    const unitPrice = normalizeUnitPrice(item.unitPrice);
    const id = requestedId.startsWith("custom-")
      ? requestedId.slice(0, 100)
      : `custom-${index + 1}`;
    if (seenIds.has(id)) throw new Error("Each custom add-on must have a unique identifier.");
    seenIds.add(id);

    return {
      description: description || undefined,
      id,
      kind: "custom",
      name,
      price: currency(unitPrice * quantity),
      pricingType: unitPrice > 0 ? "priced" : "operational",
      quantity,
      unitPrice,
    };
  });
}

export function hasPricedBookingAddons(addons: BookingAddon[]) {
  return addons.some((addon) => Number(addon.price) > 0);
}

export function calculateBookingAddonFinancialUpdate(input: {
  amountPaid: number;
  currentServiceFee: number;
  currentTotalAmount: number;
  newAddonsTotal: number;
  oldAddonsTotal: number;
  partySize: number;
  subtotalAmount: number;
}) {
  const subtotalAmount = Math.max(Number(input.subtotalAmount) || 0, 0);
  const addonDelta = currency(
    Math.max(input.newAddonsTotal, 0) - Math.max(input.oldAddonsTotal, 0),
  );
  const nextSubtotal = currency(
    Math.max(subtotalAmount + addonDelta, 0),
  );
  const serviceFeeDelta =
    input.partySize >= serviceFeeGuestThreshold
      ? currency(addonDelta * serviceFeeRate)
      : 0;
  const serviceFee = currency(
    Math.max(Number(input.currentServiceFee) || 0, 0) + serviceFeeDelta,
  );
  const totalAmount = currency(
    Math.max(Number(input.currentTotalAmount) || 0, 0) +
      addonDelta +
      serviceFeeDelta,
  );
  const amountPaid = Math.max(Number(input.amountPaid) || 0, 0);

  return {
    amountPaid,
    balanceOutstanding: currency(Math.max(totalAmount - amountPaid, 0)),
    createsCredit: amountPaid > totalAmount,
    serviceFee,
    subtotalAmount: nextSubtotal,
    totalAmount,
  };
}
