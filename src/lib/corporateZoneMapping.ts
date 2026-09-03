import type { SeatingZoneId } from "./zingaraDemo";

const corporateZoneAliases: Record<string, SeatingZoneId> = {
  "elevated stage": "elevated-stage",
  es: "elevated-stage",
  "gc golden circle": "golden-circle",
  gc: "golden-circle",
  "golden circle": "golden-circle",
  "golden-circle": "golden-circle",
  "middle ring": "middle-ring",
  "middle-ring": "middle-ring",
  "mr middle ring": "middle-ring",
  mr: "middle-ring",
  "pb private booth": "royal-booths",
  "pb private booths": "royal-booths",
  pb: "royal-booths",
  "private booth": "royal-booths",
  "private booths": "royal-booths",
  "royal booth": "royal-booths",
  "royal booths": "royal-booths",
  "royal-booths": "royal-booths",
  "rb royal balcony": "royal-balcony",
  rb: "royal-balcony",
  "royal balcony": "royal-balcony",
  "royal-balcony": "royal-balcony",
};

function normalizeCorporateZoneValue(value: string) {
  const trimmed = value.trim().toLowerCase();

  if (trimmed.includes("-")) {
    return trimmed;
  }

  return trimmed
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getCorporateSeatingZoneId(
  value: string | null | undefined,
): SeatingZoneId | null {
  if (!value?.trim()) return null;

  return corporateZoneAliases[normalizeCorporateZoneValue(value)] ?? null;
}
