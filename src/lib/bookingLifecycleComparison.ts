import type { BookingLifecycleEvent } from "./zingaraDemo";

function eventTime(value: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return value;
  // Preserve PostgreSQL sub-millisecond precision while normalising timezone spelling.
  const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/i)?.[1] ?? "";
  return `${milliseconds}:${fraction.slice(3).padEnd(6, "0")}`;
}

export function lifecycleEventKey(event: BookingLifecycleEvent) {
  const { id: _id, createdAt, fromStatus, toStatus, note, ...other } = event;
  return JSON.stringify([
    eventTime(createdAt), fromStatus ?? null, toStatus, note ?? null,
    Object.entries(other).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

export function sameLifecycleHistory(left: unknown, right: unknown) {
  if (!Array.isArray(left) || !Array.isArray(right)) return JSON.stringify(left) === JSON.stringify(right);
  const valid = (value: unknown): value is BookingLifecycleEvent =>
    Boolean(value && typeof value === "object" &&
      typeof (value as BookingLifecycleEvent).createdAt === "string" &&
      typeof (value as BookingLifecycleEvent).toStatus === "string");
  if (!left.every(valid) || !right.every(valid)) return JSON.stringify(left) === JSON.stringify(right);
  const keys = (events: BookingLifecycleEvent[]) => [...new Set(events.map(lifecycleEventKey))].sort();
  return JSON.stringify(keys(left)) === JSON.stringify(keys(right));
}

export function reconcileLifecycleProjection(
  authoritative: BookingLifecycleEvent[],
  requested: BookingLifecycleEvent[],
) {
  const persisted = new Map(authoritative.map((event) => [lifecycleEventKey(event), event]));
  const seen = new Set<string>();
  return requested.flatMap((event) => {
    const key = lifecycleEventKey(event);
    if (seen.has(key)) return [];
    seen.add(key);
    return [structuredClone(persisted.get(key) ?? event)];
  });
}
