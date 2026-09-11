export type SecretPasswordScope = "show" | "date" | "range";

export type SecretPasswordSchedule = {
  createdAt?: string;
  enabled: boolean;
  endDate: string;
  endTime?: string | null;
  id: string;
  phrase: string;
  scopeType: SecretPasswordScope;
  showId?: string | null;
  startDate: string;
  startTime?: string | null;
  updatedAt?: string;
  venueLocation: "cape-town" | "johannesburg";
};

export type ResolvedSecretPassword = {
  heading: string;
  instruction: string;
  phrase: string;
  scheduleId: string;
};

export function resolveScheduledSecretPassword(input: {
  configuration: { enabled: boolean; heading: string; instruction: string };
  show: { date: string; id: string; time: string };
  schedules: SecretPasswordSchedule[];
  venueLocation: "cape-town" | "johannesburg";
}): ResolvedSecretPassword | null {
  if (!input.configuration.enabled) return null;
  const showTime = input.show.time.slice(0, 5);
  const matches = input.schedules
    .filter((schedule) => {
      if (!schedule.enabled || schedule.venueLocation !== input.venueLocation) return false;
      if (schedule.scopeType === "show") return schedule.showId === input.show.id;
      if (input.show.date < schedule.startDate || input.show.date > schedule.endDate) return false;
      if (schedule.startTime && showTime < schedule.startTime) return false;
      if (schedule.endTime && showTime > schedule.endTime) return false;
      return true;
    })
    .sort(
      (left, right) =>
        Number(right.scopeType === "show") - Number(left.scopeType === "show") ||
        (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
    );
  const schedule = matches[0];
  return schedule
    ? {
        heading: input.configuration.heading,
        instruction: input.configuration.instruction,
        phrase: schedule.phrase,
        scheduleId: schedule.id,
      }
    : null;
}
