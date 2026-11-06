import type { BookingAddon } from "./zingaraDemo";

export const corporateDietaryOptions = [
  { label: "Vegetarian", value: "Vegetarian" },
  { label: "Vegan", value: "Vegan" },
  { label: "Halaal Friendly", value: "Halaal Friendly" },
  { label: "Strictly Halaal · R250 each", value: "Strict Halaal" },
  { label: "Kosher · R500 each", value: "Kosher" },
  { label: "Gluten Free", value: "Gluten Free" },
  { label: "Nut Allergy", value: "Nut Allergy" },
  { label: "Dairy Free", value: "Dairy Free" },
  { label: "Other", value: "Other" },
] as const;

export type CorporateDietaryQuantities = Record<string, number>;

const supportedCorporateDietaryRequirements = new Set(
  corporateDietaryOptions.map((option) => option.value),
);

function normalizedRequirement(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function formatCorporateDietaryRequirement(requirement: string) {
  const normalized = normalizedRequirement(requirement);
  return normalized === "Strict Halaal" || normalized === "Strictly Halaal"
    ? "Strictly Halaal"
    : normalized;
}

export function validateCorporateDietaryRequirements(requirements: unknown) {
  if (!Array.isArray(requirements)) {
    throw new Error("Corporate dietary requirements must be supplied as a list.");
  }
  const normalized = requirements.map(normalizedRequirement);
  if (
    normalized.some(
      (requirement) =>
        !supportedCorporateDietaryRequirements.has(
          requirement as (typeof corporateDietaryOptions)[number]["value"],
        ),
    )
  ) {
    throw new Error("One or more Corporate dietary requirements are invalid.");
  }
  return normalized;
}

export function normalizeCorporateDietaryQuantities(input: {
  dietaryRequirements: string[];
  guestCount: number | null;
  quantities: unknown;
  requireSelectedQuantities?: boolean;
}) {
  const selected = Array.from(
    new Set(input.dietaryRequirements.map(normalizedRequirement).filter(Boolean)),
  );
  const maximum = Number.isInteger(input.guestCount) && Number(input.guestCount) > 0
    ? Number(input.guestCount)
    : 10_000;
  const raw =
    input.quantities && typeof input.quantities === "object" && !Array.isArray(input.quantities)
      ? (input.quantities as Record<string, unknown>)
      : {};

  return Object.fromEntries(
    selected.flatMap((requirement) => {
      const quantity = Number(raw[requirement]);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > maximum) {
        if (input.requireSelectedQuantities) {
          throw new Error(
            `Enter a whole-number quantity for ${formatCorporateDietaryRequirement(requirement)} from 1 to ${maximum}.`,
          );
        }
        return [];
      }
      return [[requirement, quantity]];
    }),
  ) as CorporateDietaryQuantities;
}

export function getCorporateDietaryQuantity(
  quantities: CorporateDietaryQuantities | undefined,
  requirement: string,
) {
  const aliases =
    formatCorporateDietaryRequirement(requirement) === "Strictly Halaal"
      ? ["Strict Halaal", "Strictly Halaal"]
      : [requirement];
  return aliases.reduce(
    (total, alias) => Math.max(total, Number(quantities?.[alias]) || 0),
    0,
  );
}

export function getCorporateDietarySummary(input: {
  dietaryRequirements: string[];
  dietaryQuantities?: CorporateDietaryQuantities;
}) {
  return input.dietaryRequirements
    .map((requirement) => {
      const quantity = getCorporateDietaryQuantity(
        input.dietaryQuantities,
        requirement,
      );
      const label = formatCorporateDietaryRequirement(requirement);
      return quantity > 0 ? `${label}: ${quantity}` : `${label}: quantity not recorded`;
    })
    .join(", ");
}

export function getCorporateDietaryAddons(input: {
  dietaryRequirements: string[];
  dietaryQuantities?: CorporateDietaryQuantities;
  otherDietaryRequirement?: string;
}): BookingAddon[] {
  const catalogueByRequirement: Record<
    string,
    { id: string; name: string; unitPrice: number }
  > = {
    "Dairy Free": { id: "dietary-dairy-free", name: "Dairy Free", unitPrice: 0 },
    "Gluten Free": { id: "dietary-gluten-free", name: "Gluten Free", unitPrice: 0 },
    "Halaal Friendly": { id: "dietary-halaal-friendly", name: "Halaal Friendly", unitPrice: 0 },
    Kosher: { id: "dietary-kosher", name: "Kosher", unitPrice: 500 },
    "Nut Allergy": { id: "dietary-nut-allergy", name: "Nut Allergy", unitPrice: 0 },
    Other: { id: "dietary-other", name: "Other Dietary Meal", unitPrice: 0 },
    "Strictly Halaal": { id: "dietary-strictly-halaal", name: "Strictly Halaal", unitPrice: 250 },
    Vegan: { id: "dietary-vegan", name: "Vegan", unitPrice: 0 },
    Vegetarian: { id: "dietary-vegetarian", name: "Vegetarian", unitPrice: 0 },
  };
  const addons: BookingAddon[] = [];
  for (const requirement of input.dietaryRequirements) {
    const label = formatCorporateDietaryRequirement(requirement);
    const catalogue = catalogueByRequirement[label];
    const quantity = getCorporateDietaryQuantity(
      input.dietaryQuantities,
      requirement,
    );
    if (!catalogue || quantity < 1) continue;
    addons.push({
      description:
        label === "Other" ? input.otherDietaryRequirement?.trim() || undefined : undefined,
      id: catalogue.id,
      kind: "catalogue",
      name: catalogue.name,
      price: quantity * catalogue.unitPrice,
      pricingType: catalogue.unitPrice > 0 ? "priced" : "operational",
      quantity,
      unitPrice: catalogue.unitPrice,
    });
  }
  return addons;
}
