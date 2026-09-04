import type { DemoVenueSettings } from "./zingaraDemo";

export type ExperienceLocation = "cape-town" | "johannesburg";
export type CustomerExperienceTimes = {
  groundsOpen: string;
  guestSeating: string;
  showStarts: string;
};

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isValidExperienceTimes(times: CustomerExperienceTimes) {
  if (
    !timePattern.test(times.groundsOpen) ||
    !timePattern.test(times.guestSeating) ||
    !timePattern.test(times.showStarts)
  ) {
    return false;
  }

  return (
    times.groundsOpen < times.guestSeating &&
    times.guestSeating < times.showStarts
  );
}

export function getCustomerExperienceTimes(
  settings: DemoVenueSettings,
  location: ExperienceLocation | null | undefined,
) {
  if (!location) return null;

  const times = settings.operationalSettings.customerExperienceTimes[location];

  return times && isValidExperienceTimes(times) ? times : null;
}

export function getExperienceLocation(
  value: string | null | undefined,
): ExperienceLocation | null {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (normalized.includes("johannesburg") || normalized === "jhb") {
    return "johannesburg";
  }

  if (normalized.includes("cape town") || normalized === "cape-town" || normalized === "cpt") {
    return "cape-town";
  }

  return null;
}

export function formatCustomerExperienceSchedule(
  times: CustomerExperienceTimes,
) {
  return [
    "YOUR EVENING",
    `Grounds Open — ${times.groundsOpen}`,
    `Guest Seating — ${times.guestSeating}`,
    `Show Starts — ${times.showStarts}`,
    "Please arrive after grounds open and allow sufficient time to be seated before the show begins.",
  ].join("\n");
}
