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
  tables: Array<[string | number, number]>,
  minimumCapacity: number,
) {
  return tables.map(([code, maximumCapacity]) => ({
    code: String(code),
    defaultCapacity: maximumCapacity,
    maximumCapacity,
    minimumCapacity: Math.min(minimumCapacity, maximumCapacity),
    zoneId,
  } satisfies PhysicalTableDefinition));
}

export const physicalTableDefinitions: PhysicalTableDefinition[] = [
  ...createDefinitions(
    "royal-booths",
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]
      .map((code) => [code, 6] as [number, number]),
    4,
  ),
  ...createDefinitions(
    "middle-ring",
    [
      [200, 4], [201, 2], [202, 8], [203, 8], [204, 6], [205, 6],
      [206, 5], [207, 4], [208, 4], [209, 4], [210, 4], [211, 6],
      [300, 7], [301, 4], [302, 2], [303, 3], [304, 4], [305, 4],
      [306, 6], [307, 6], [308, 6], [309, 6], [310, 6], [400, 10],
    ],
    2,
  ),
  ...createDefinitions(
    "golden-circle",
    [
      [401, 6], [402, 6], [403, 4], [404, 8], [405, 8], [406, 10],
      [500, 10], [501, 6], [502, 8], [503, 6], [504, 6], [505, 8],
      [506, 10],
    ],
    2,
  ),
  ...createDefinitions(
    "golden-circle",
    [
      [600, 2], [601, 2], [602, 4], [603, 2], [604, 2], [605, 2],
      [606, 4], [607, 2], [608, 2], [609, 2],
    ],
    2,
  ),
  ...createDefinitions(
    "royal-balcony",
    [[800, 8], [801, 8], [900, 8], [901, 8]],
    2,
  ),
];

export function comparePhysicalTableCodes(left: string, right: string) {
  return left.trim().localeCompare(right.trim(), "en", {
    numeric: true,
    sensitivity: "base",
  });
}

const definitionsByKey = new Map(
  physicalTableDefinitions.map((definition) => [
    `${definition.zoneId}:${definition.code}`,
    definition,
  ]),
);

const sortOrderByKey = new Map(
  physicalTableDefinitions.map((definition, index) => [
    `${definition.zoneId}:${definition.code}`,
    index,
  ]),
);

export function getPhysicalTableDefinition(
  zoneId: SeatingZoneId,
  tableCode: string,
) {
  return definitionsByKey.get(`${zoneId}:${tableCode.trim()}`);
}

export function getPhysicalTableSortOrder(
  zoneId: SeatingZoneId,
  tableCode: string,
) {
  return sortOrderByKey.get(`${zoneId}:${tableCode.trim()}`);
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
