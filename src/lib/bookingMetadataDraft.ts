export type BookingMetadataDraft = {
  operationalNotes: string;
};

export function createBookingMetadataDraft(
  operationalNotes: string | null | undefined,
): BookingMetadataDraft {
  return { operationalNotes: operationalNotes ?? "" };
}

export function isBookingMetadataDraftDirty(
  draft: BookingMetadataDraft,
  baseline: BookingMetadataDraft,
) {
  return draft.operationalNotes !== baseline.operationalNotes;
}

export function getDietaryRequirementsProjection(operationalNotes: string) {
  return operationalNotes.match(/^Dietary: (.+)$/m)?.[1] ?? null;
}
