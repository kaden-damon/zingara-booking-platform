import type { SeatingZoneId } from "./zingaraDemo";

const corporateZoneTitles: Partial<Record<SeatingZoneId, string>> = {
  "golden-circle": "Golden Circle",
  "middle-ring": "Middle Ring",
  "royal-balcony": "Royal Balcony",
  "royal-booths": "Private Booths",
};

export type CorporateZoneEntitlement = {
  pax: number;
  zoneId: SeatingZoneId;
};

export type CorporateZoneEntitlementDraft = {
  pax: string;
  zoneId: string;
};

export function validateCorporateZoneEntitlements(
  entitlements: CorporateZoneEntitlementDraft[],
  totalPax: number,
) {
  if (entitlements.length === 0) {
    return "Add at least one seating zone.";
  }

  const seen = new Set<string>();
  let allocated = 0;

  for (const entitlement of entitlements) {
    if (
      !corporateZoneTitles[entitlement.zoneId as SeatingZoneId]
    ) {
      return "Select a valid seating zone for every allocation.";
    }
    if (seen.has(entitlement.zoneId)) {
      return "Each seating zone may appear only once.";
    }
    seen.add(entitlement.zoneId);

    const pax = Number(entitlement.pax);
    if (!Number.isInteger(pax) || pax <= 0) {
      return "Enter a positive whole guest count for every seating zone.";
    }
    allocated += pax;
  }

  if (!Number.isInteger(totalPax) || totalPax <= 0 || allocated !== totalPax) {
    return `Seating allocation must equal ${Math.max(totalPax, 0)} guests.`;
  }

  return null;
}

export function parseCorporateZoneEntitlements(
  entitlements: CorporateZoneEntitlementDraft[],
  totalPax: number,
): CorporateZoneEntitlement[] | null {
  if (validateCorporateZoneEntitlements(entitlements, totalPax)) return null;

  return entitlements.map((entitlement) => ({
    pax: Number(entitlement.pax),
    zoneId: entitlement.zoneId as SeatingZoneId,
  }));
}

export function normalizeCorporateZoneEntitlementEditDraft(
  entitlements: CorporateZoneEntitlementDraft[],
) {
  return entitlements.filter((entitlement) => Number(entitlement.pax) !== 0);
}

export function parseCorporateZoneEntitlementEdit(
  entitlements: CorporateZoneEntitlementDraft[],
  totalPax: number,
) {
  return parseCorporateZoneEntitlements(
    normalizeCorporateZoneEntitlementEditDraft(entitlements),
    totalPax,
  );
}

export function getBookingZoneEntitlements(booking: {
  partySize: number;
  zoneEntitlements?: CorporateZoneEntitlement[];
  zoneId: SeatingZoneId;
}) {
  return booking.zoneEntitlements?.length
    ? booking.zoneEntitlements
    : [{ pax: booking.partySize, zoneId: booking.zoneId }];
}

export function getZoneEntitlementLabel(entitlement: CorporateZoneEntitlement) {
  return `${corporateZoneTitles[entitlement.zoneId] ?? entitlement.zoneId} · ${entitlement.pax} guests`;
}
