import type { BookingAddon } from "./zingaraDemo";
import { restrictedDietaryAddonIds } from "./bookingAddons";

export const dietaryAddonAdvanceHours = 72;
export const dietaryAddonCutoffErrorCode = "DIETARY_ADDON_CUTOFF";
export const dietaryAddonCutoffMessage =
  "Kosher and Strictly Halaal meals must be ordered at least 72 hours before the performance. Remove the unavailable meal add-on to continue with your booking.";

const restrictedIds = new Set<string>(restrictedDietaryAddonIds);

export function getPerformanceStartTimestamp(date: string, time: string) {
  const normalizedTime = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
  const timestamp = Date.parse(`${date}T${normalizedTime}+02:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getDietaryAddonOrderingState(input: {
  date: string;
  now?: Date;
  time: string;
}) {
  const performanceStart = getPerformanceStartTimestamp(input.date, input.time);
  if (performanceStart === null) {
    return { cutoffAt: null, isOrderable: false, performanceStart: null };
  }
  const cutoffAt = performanceStart - dietaryAddonAdvanceHours * 60 * 60 * 1000;
  return {
    cutoffAt,
    isOrderable: (input.now?.getTime() ?? Date.now()) <= cutoffAt,
    performanceStart,
  };
}

export function getRestrictedDietaryQuantities(
  addons: BookingAddon[] | null | undefined,
) {
  return Object.fromEntries(
    restrictedDietaryAddonIds.map((id) => [
      id,
      (addons ?? [])
        .filter((addon) => addon.id === id)
        .reduce((total, addon) => total + Math.max(Number(addon.quantity) || 0, 0), 0),
    ]),
  ) as Record<(typeof restrictedDietaryAddonIds)[number], number>;
}

export function hasRestrictedDietaryAddons(
  addons: BookingAddon[] | null | undefined,
) {
  return (addons ?? []).some(
    (addon) => restrictedIds.has(addon.id) && Number(addon.quantity) > 0,
  );
}

export function validateDietaryAddonChange(input: {
  date: string;
  existingAddons?: BookingAddon[];
  now?: Date;
  requestedAddons: BookingAddon[];
  time: string;
}) {
  const result = enforceDietaryAddonOrdering(input);
  if (result.restricted) {
    const error = new Error(dietaryAddonCutoffMessage);
    Object.assign(error, { code: dietaryAddonCutoffErrorCode });
    throw error;
  }
  return result.ordering;
}

export function enforceDietaryAddonOrdering(input: {
  date: string;
  existingAddons?: BookingAddon[];
  now?: Date;
  requestedAddons: BookingAddon[];
  time: string;
}) {
  const ordering = getDietaryAddonOrderingState(input);
  if (ordering.isOrderable) {
    return { addons: input.requestedAddons, ordering, restricted: false };
  }

  const existing = getRestrictedDietaryQuantities(input.existingAddons);
  const requested = getRestrictedDietaryQuantities(input.requestedAddons);
  const restricted = restrictedDietaryAddonIds.some(
    (id) => requested[id] > existing[id],
  );
  if (!restricted) {
    return { addons: input.requestedAddons, ordering, restricted: false };
  }

  const addons = input.requestedAddons.filter(
    (addon) =>
      !restrictedIds.has(addon.id) ||
      requested[addon.id as keyof typeof requested] <=
        existing[addon.id as keyof typeof existing],
  );
  for (const id of restrictedDietaryAddonIds) {
    if (requested[id] <= existing[id] || existing[id] === 0) continue;
    const existingAddon = input.existingAddons?.find((addon) => addon.id === id);
    if (existingAddon) addons.push(existingAddon);
  }

  return { addons, ordering, restricted: true };
}

export function isRestrictedDietaryAddonId(id: string) {
  return restrictedIds.has(id);
}
