export type CompactBookingSortDirection = "asc" | "desc";

export type CompactBookingSortKey =
  | "balance"
  | "name"
  | "pax"
  | "payment"
  | "section"
  | "source"
  | "table";

export type CompactBookingRow = {
  balanceDue: number;
  balanceLabel: string;
  customerName: string;
  pax: number;
  paymentLabel: string;
  paymentSortValue: string;
  promoCode?: string;
  reference: string;
  section: string;
  sourceLabel: string;
  statusLabel: string;
  statusTone: "amber" | "green" | "purple" | "red" | "sky" | "zinc";
  tableLabel: string;
};

function normalizeSortText(value: string) {
  return value.trim().toLocaleLowerCase("en-ZA");
}

export function sortCompactBookingRows(
  rows: CompactBookingRow[],
  key: CompactBookingSortKey,
  direction: CompactBookingSortDirection,
) {
  const multiplier = direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const leftValue =
      key === "balance"
        ? left.balanceDue
        : key === "pax"
          ? left.pax
          : key === "name"
            ? normalizeSortText(left.customerName)
            : key === "payment"
              ? normalizeSortText(left.paymentSortValue)
              : key === "section"
                ? normalizeSortText(left.section)
                : key === "source"
                  ? normalizeSortText(left.sourceLabel)
                  : normalizeSortText(left.tableLabel);
    const rightValue =
      key === "balance"
        ? right.balanceDue
        : key === "pax"
          ? right.pax
          : key === "name"
            ? normalizeSortText(right.customerName)
            : key === "payment"
              ? normalizeSortText(right.paymentSortValue)
              : key === "section"
                ? normalizeSortText(right.section)
                : key === "source"
                  ? normalizeSortText(right.sourceLabel)
                  : normalizeSortText(right.tableLabel);

    const comparison =
      typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), "en-ZA", {
            numeric: true,
            sensitivity: "base",
          });

    if (comparison !== 0) {
      return comparison * multiplier;
    }

    return left.reference.localeCompare(right.reference, "en-ZA") * multiplier;
  });
}
