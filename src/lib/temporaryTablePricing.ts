export function normalizeTemporaryTableCustomPrice(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Custom price per person must be a positive Rand amount.");
  }

  return Math.round(amount * 100) / 100;
}

export function getTemporaryTablePricePerPerson(input: {
  configuredZonePrice: number;
  customPricePerPerson?: number | null;
}) {
  return input.customPricePerPerson ?? input.configuredZonePrice;
}
