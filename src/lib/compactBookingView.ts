export type CompactBookingSortDirection = "asc" | "desc";

export type CompactBookingSortKey =
  | "amountPaid"
  | "balance"
  | "createdAt"
  | "name"
  | "pax"
  | "payment"
  | "section"
  | "showDate"
  | "source"
  | "table";

export type CompactBookingRow = {
  amountPaid: number;
  amountPaidLabel: string;
  balanceDue: number;
  balanceLabel: string;
  bookingNotes?: string;
  createdAt: string;
  customerName: string;
  pax: number;
  paymentLabel: string;
  paymentSortValue: string;
  promoCode?: string;
  reference: string;
  section: string;
  showDate: string;
  sourceLabel: string;
  statusLabel: string;
  statusTone: "amber" | "green" | "purple" | "red" | "sky" | "zinc";
  tableLabel: string;
};

function normalizeSortText(value: string) {
  return value.trim().toLocaleLowerCase("en-ZA");
}

function getSortTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortCompactBookingRows(
  rows: CompactBookingRow[],
  key: CompactBookingSortKey,
  direction: CompactBookingSortDirection,
) {
  const multiplier = direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const leftValue =
      key === "amountPaid"
        ? left.amountPaid
        : key === "balance"
          ? left.balanceDue
          : key === "createdAt"
            ? getSortTimestamp(left.createdAt)
            : key === "pax"
              ? left.pax
              : key === "showDate"
                ? getSortTimestamp(left.showDate)
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
      key === "amountPaid"
        ? right.amountPaid
        : key === "balance"
          ? right.balanceDue
          : key === "createdAt"
            ? getSortTimestamp(right.createdAt)
            : key === "pax"
              ? right.pax
              : key === "showDate"
                ? getSortTimestamp(right.showDate)
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

    const createdAtComparison =
      getSortTimestamp(right.createdAt) - getSortTimestamp(left.createdAt);

    if (key !== "createdAt" && createdAtComparison !== 0) {
      return createdAtComparison;
    }

    return left.reference.localeCompare(right.reference, "en-ZA");
  });
}
