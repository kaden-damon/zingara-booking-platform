import type { DemoShow, SeatingZoneId } from "@/lib/zingaraDemo";

export type ShowCustomPricing = {
  enabled: boolean;
  updatedAt?: string;
  zonePrices: Partial<Record<SeatingZoneId, number>>;
};

const supportedZoneIds: SeatingZoneId[] = [
  "golden-circle",
  "middle-ring",
  "royal-balcony",
  "royal-booths",
];

export function isSupportedCustomPricingZone(
  value: string,
): value is SeatingZoneId {
  return supportedZoneIds.includes(value as SeatingZoneId);
}

export function normalizeShowCustomPricing(
  value: ShowCustomPricing | null | undefined,
): ShowCustomPricing {
  const zonePrices = Object.fromEntries(
    Object.entries(value?.zonePrices ?? {}).flatMap(([zoneId, price]) =>
      isSupportedCustomPricingZone(zoneId) &&
      Number.isFinite(Number(price)) &&
      Number(price) > 0
        ? [[zoneId, Math.round(Number(price) * 100) / 100]]
        : [],
    ),
  ) as Partial<Record<SeatingZoneId, number>>;

  return {
    enabled: value?.enabled === true,
    updatedAt: value?.updatedAt,
    zonePrices,
  };
}

export function getShowSpecificZonePrice(
  show: Pick<DemoShow, "customPricing"> | null | undefined,
  zoneId: SeatingZoneId,
) {
  const customPricing = normalizeShowCustomPricing(show?.customPricing);
  const price = customPricing.zonePrices[zoneId];

  return customPricing.enabled && Number(price) > 0 ? Number(price) : null;
}

export function resolveShowZonePrice(input: {
  defaultPrice: number;
  show: Pick<DemoShow, "customPricing"> | null | undefined;
  zoneId: SeatingZoneId;
}) {
  return (
    getShowSpecificZonePrice(input.show, input.zoneId) ?? input.defaultPrice
  );
}
