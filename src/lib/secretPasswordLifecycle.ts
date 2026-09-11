import type { SecretPasswordSchedule } from "./secretPasswordResolution";

export type SecretPasswordLifecycleStatus =
  | "active"
  | "disabled"
  | "expired"
  | "scheduled";

function johannesburgNow(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Johannesburg",
    year: "numeric",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

export function getSecretPasswordLifecycleStatus(
  schedule: Pick<
    SecretPasswordSchedule,
    "enabled" | "endDate" | "endTime" | "startDate" | "startTime"
  >,
  now = new Date(),
): SecretPasswordLifecycleStatus {
  const current = johannesburgNow(now);
  const hasExpired =
    schedule.endDate < current.date ||
    (schedule.endDate === current.date &&
      Boolean(schedule.endTime) &&
      schedule.endTime! <= current.time);
  if (hasExpired) return "expired";
  if (!schedule.enabled) return "disabled";

  const hasStarted =
    schedule.startDate < current.date ||
    (schedule.startDate === current.date &&
      (!schedule.startTime || schedule.startTime <= current.time));
  return hasStarted ? "active" : "scheduled";
}
