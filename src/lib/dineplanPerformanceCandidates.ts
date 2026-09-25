import { normalizeShowLocation } from "./zingaraDemo.ts";

export type DineplanPerformanceMetadata = {
  performanceDate: string | null;
  performanceTime: string | null;
  venue: string | null;
};

export type DineplanCandidateShow = {
  date: string;
  status: string;
  time: string;
  venue: string;
};

const showStatuses = new Set([
  "active",
  "archived",
  "inactive",
  "sold_out",
  "special_event",
]);

export function isDineplanReconciliationPerformanceStatus(status: string) {
  return showStatuses.has(status.trim().toLowerCase());
}

function normalizedTime(value: string | null | undefined) {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

export function matchesDineplanPerformance(
  metadata: DineplanPerformanceMetadata,
  show: DineplanCandidateShow,
) {
  if (!isDineplanReconciliationPerformanceStatus(show.status)) return false;
  if (!metadata.performanceDate || show.date !== metadata.performanceDate) return false;

  const sourceVenue = normalizeShowLocation(metadata.venue);
  const showVenue = normalizeShowLocation(show.venue);
  if (sourceVenue && sourceVenue !== showVenue) return false;

  const sourceTime = normalizedTime(metadata.performanceTime);
  const showTime = normalizedTime(show.time);
  if (sourceTime && sourceTime !== showTime) return false;

  return true;
}
