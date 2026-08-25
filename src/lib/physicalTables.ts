import type { SeatingZoneId } from "@/lib/zingaraDemo";

export type PhysicalTableDefinition = {
  code: string;
  defaultCapacity: number | null;
  maximumCapacity: number;
  minimumCapacity: number;
  zoneId: SeatingZoneId;
};

function createDefinitions(
  zoneId: SeatingZoneId,
  codes: Array<string | number>,
  minimumCapacity: number,
  maximumCapacity: number,
  defaultCapacity: number | null = null,
) {
  return codes.map((code) => ({
    code: String(code),
    defaultCapacity,
    maximumCapacity,
    minimumCapacity,
    zoneId,
  } satisfies PhysicalTableDefinition));
}

export const physicalTableDefinitions: PhysicalTableDefinition[] = [
  ...createDefinitions(
    "royal-booths",
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
    4,
    6,
    6,
  ),
  ...createDefinitions(
    "middle-ring",
    [200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213,
      300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313],
    2,
    8,
  ),
  ...createDefinitions(
    "golden-circle",
    [400, 401, 402, 403, 404, 405, 500, 501, 502, 503, 504, 505],
    8,
    12,
  ),
  ...createDefinitions(
    "golden-circle",
    [600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611],
    2,
    4,
  ),
  ...createDefinitions(
    "royal-balcony",
    [800, 801, 900, 901],
    10,
    10,
    10,
  ),
];

const definitionsByKey = new Map(
  physicalTableDefinitions.map((definition) => [
    `${definition.zoneId}:${definition.code}`,
    definition,
  ]),
);

export function getPhysicalTableDefinition(
  zoneId: SeatingZoneId,
  tableCode: string,
) {
  return definitionsByKey.get(`${zoneId}:${tableCode.trim()}`);
}

export function isLegacyPlaceholderTableCode(
  zoneId: SeatingZoneId,
  tableCode: string,
) {
  const code = tableCode.trim();

  if (zoneId === "golden-circle") {
    return /^GC\d+$/i.test(code);
  }

  if (zoneId === "middle-ring") {
    return /^MR\d+$/i.test(code);
  }

  if (zoneId === "royal-booths") {
    return /^B\d+$/i.test(code);
  }

  if (zoneId === "royal-balcony") {
    return /^RB\d+$/i.test(code);
  }

  return false;
}
