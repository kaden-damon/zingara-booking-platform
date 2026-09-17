export type SeatingZoneLifecycleSettings = {
  zonePricing: Record<string, { enabled?: boolean }>;
};

export function isConfiguredSeatingZoneEnabled(
  settings: SeatingZoneLifecycleSettings,
  zoneId: string,
) {
  return settings.zonePricing[zoneId]?.enabled !== false;
}

export function filterEnabledSeatingZones<
  const T extends readonly { id: string }[],
>(
  settings: SeatingZoneLifecycleSettings,
  zones: T,
) {
  return zones.filter(
    (zone) => isConfiguredSeatingZoneEnabled(settings, zone.id),
  ) as Array<T[number]>;
}
