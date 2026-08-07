export type StaffLocationValue = "all" | "cape-town" | "johannesburg";

export const staffLocationOptions = [
  {
    label: "All Locations",
    value: "all",
  },
  {
    label: "Cape Town — The Night Court",
    value: "cape-town",
  },
  {
    label: "Johannesburg — The Spring Court",
    value: "johannesburg",
  },
] as const satisfies Array<{
  label: string;
  value: StaffLocationValue;
}>;

const legacyLocationAliases: Record<string, StaffLocationValue> = {
  "all locations": "all",
  "cape town": "cape-town",
  capetown: "cape-town",
  "zingara-cape-town": "cape-town",
  zingara: "cape-town",
  jhb: "johannesburg",
  joburg: "johannesburg",
  johannesburg: "johannesburg",
};

export function normalizeStaffLocation(
  value: string | null | undefined,
): StaffLocationValue | null {
  const normalizedValue = value?.trim().toLowerCase();

  if (!normalizedValue) {
    return null;
  }

  if (
    normalizedValue === "all" ||
    normalizedValue === "cape-town" ||
    normalizedValue === "johannesburg"
  ) {
    return normalizedValue;
  }

  return legacyLocationAliases[normalizedValue] ?? null;
}

export function normalizeStaffVenueScope(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeStaffLocation(value))
        .filter((value): value is StaffLocationValue => Boolean(value)),
    ),
  );
}

export function getStaffLocationLabel(value: string) {
  const normalizedValue = normalizeStaffLocation(value);

  return (
    staffLocationOptions.find((option) => option.value === normalizedValue)
      ?.label ?? value
  );
}

export function getStaffVenueScopeLabel(venueScope: string[]) {
  const normalizedScope = normalizeStaffVenueScope(venueScope);

  if (normalizedScope.includes("all")) {
    return "All Locations";
  }

  const locationScope = normalizedScope.filter((scope) => scope !== "all");

  if (locationScope.length === staffLocationOptions.length - 1) {
    return "All Locations";
  }

  if (locationScope.length === 0) {
    return "No location assigned";
  }

  return locationScope.map(getStaffLocationLabel).join(", ");
}
