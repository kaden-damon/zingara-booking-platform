import type { BookingAddon } from "./zingaraDemo";

export type BookingMetadataDraft = {
  addons: BookingAddon[];
  operationalNotes: string;
};

export function createBookingMetadataDraft(
  operationalNotes: string | null | undefined,
  addons: BookingAddon[] = [],
): BookingMetadataDraft {
  return {
    addons: addons.map((addon) => {
      const quantity = addon.quantity ?? 1;
      return {
        ...addon,
        quantity,
        unitPrice: addon.unitPrice ?? addon.price / quantity,
      };
    }),
    operationalNotes: operationalNotes ?? "",
  };
}

export function isBookingMetadataDraftDirty(
  draft: BookingMetadataDraft,
  baseline: BookingMetadataDraft,
) {
  return (
    draft.operationalNotes !== baseline.operationalNotes ||
    JSON.stringify(draft.addons) !== JSON.stringify(baseline.addons)
  );
}

export function getDietaryRequirementsProjection(operationalNotes: string) {
  return operationalNotes.match(/^Dietary: (.+)$/m)?.[1] ?? null;
}
