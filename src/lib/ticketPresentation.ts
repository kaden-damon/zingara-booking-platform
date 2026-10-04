import {
  defaultVenueSettings,
  getZoneSectionLookupTitles,
  normalizeVenueSettings,
  seatingZones,
  type DemoBooking,
  type DemoVenueSettings,
} from "./zingaraDemo";

export type TicketTableColour = {
  background: string;
  border: string;
  label: string;
};

export type TicketVenueSettingsRow = {
  name: string;
  settings: DemoVenueSettings | null;
  venue_key: string;
};

export function resolveTicketVenueSettings(
  row: TicketVenueSettingsRow | null | undefined,
) {
  const settings = normalizeVenueSettings(row?.settings);

  return {
    ...settings,
    venueId: row?.venue_key ?? settings.venueId ?? defaultVenueSettings.venueId,
    venueName: row?.name ?? settings.venueName ?? defaultVenueSettings.venueName,
  };
}

export function resolveTicketTableColour(
  booking: Pick<DemoBooking, "zoneId" | "zoneTitle">,
): TicketTableColour {
  const zone =
    seatingZones.find((item) => item.id === booking.zoneId) ??
    seatingZones.find((item) =>
      getZoneSectionLookupTitles(item.id, item.title)
        .map((title) => title.toLowerCase())
        .includes(booking.zoneTitle.trim().toLowerCase()),
    );
  const colours: Record<string, TicketTableColour> = {
    "elevated-stage": {
      background: "#4D4213",
      border: "#8D7A2F",
      label: "Elevated Stage Gold",
    },
    "golden-circle": {
      background: "#4A0D2B",
      border: "#8F4B68",
      label: "Golden Circle Plum",
    },
    "middle-ring": {
      background: "#0F5C4D",
      border: "#3A9D8B",
      label: "Middle Ring Emerald",
    },
    "royal-balcony": {
      background: "#3B1B52",
      border: "#8C62A8",
      label: "Royal Balcony Violet",
    },
    "royal-booths": {
      background: "#5B001B",
      border: "#A34063",
      label: "Private Booths Ruby",
    },
  };

  return (
    (zone ? colours[zone.id] : undefined) ?? {
      background: "#111111",
      border: "#D8C36A",
      label: zone?.title ?? "Zingara Gold",
    }
  );
}
