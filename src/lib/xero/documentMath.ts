export type XeroLineAmountType = "exclusive" | "inclusive" | "no-tax";

export type XeroDocumentLineInput = {
  description: string;
  mappingCategory?: string | null;
  quantity: string;
  unitPrice: string;
  taxRatePercent: string | null;
  taxCode: string | null;
};

export type XeroCalculatedLine = XeroDocumentLineInput & {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

const SCALE = 10_000;

function parseScaled(value: string, scale = 4, allowNegative = false) {
  const normalized = value.trim();
  const pattern = allowNegative ? /^-?\d+(?:\.\d+)?$/ : /^\d+(?:\.\d+)?$/;
  if (!pattern.test(normalized)) {
    throw new Error(allowNegative ? "Enter a valid amount." : "Enter a valid positive number.");
  }
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  if (fraction.length > scale) {
    throw new Error(`Use no more than ${scale} decimal places.`);
  }
  const magnitude = Number(whole) * 10 ** scale + Number(fraction.padEnd(scale, "0"));
  const scaled = negative ? -magnitude : magnitude;
  if (!Number.isSafeInteger(scaled)) throw new Error("This amount is too large.");
  return scaled;
}

function roundFraction(numerator: number, denominator: number) {
  if (!Number.isSafeInteger(numerator)) throw new Error("This calculation is too large.");
  const result = numerator / denominator;
  return result < 0 ? Math.ceil(result - 0.5) : Math.floor(result + 0.5);
}

export function calculateXeroDocumentLine(
  input: XeroDocumentLineInput,
  amountType: XeroLineAmountType,
): XeroCalculatedLine {
  if (!input.description.trim()) throw new Error("Add a line description.");
  const quantity = parseScaled(input.quantity);
  if (quantity <= 0) throw new Error("Quantity must be greater than zero.");
  const unitPrice = parseScaled(input.unitPrice, 4, true);
  const lineGrossScaled = roundFraction(quantity * unitPrice, SCALE);
  const grossCents = roundFraction(lineGrossScaled, 100);
  const taxBasisPoints = input.taxRatePercent
    ? Number(parseScaled(input.taxRatePercent, 2))
    : 0;
  if (taxBasisPoints < 0 || taxBasisPoints > 10_000) {
    throw new Error("Choose a valid tax rate.");
  }

  if (amountType === "no-tax" || taxBasisPoints === 0) {
    return { ...input, subtotalCents: grossCents, taxCents: 0, totalCents: grossCents };
  }

  if (amountType === "inclusive") {
    const subtotalCents = roundFraction(
      grossCents * 10_000,
      10_000 + taxBasisPoints,
    );
    return {
      ...input,
      subtotalCents,
      taxCents: grossCents - subtotalCents,
      totalCents: grossCents,
    };
  }

  // Xero-style exclusive totals round the extended amount including tax once.
  // Rounding the subtotal and tax independently introduces a one-cent drift for
  // four-decimal unit prices such as the approved INV-1237 fixture.
  const totalCents = roundFraction(
    lineGrossScaled * (10_000 + taxBasisPoints),
    100 * 10_000,
  );
  return {
    ...input,
    subtotalCents: grossCents,
    taxCents: totalCents - grossCents,
    totalCents,
  };
}

export function calculateXeroDocumentTotals(
  lines: XeroDocumentLineInput[],
  amountType: XeroLineAmountType,
) {
  const calculatedLines = lines.map((line) =>
    calculateXeroDocumentLine(line, amountType),
  );
  const totals = calculatedLines.reduce(
    (totals, line) => ({
      lines: calculatedLines,
      subtotalCents: totals.subtotalCents + line.subtotalCents,
      taxCents: totals.taxCents + line.taxCents,
      totalCents: totals.totalCents + line.totalCents,
    }),
    { lines: calculatedLines, subtotalCents: 0, taxCents: 0, totalCents: 0 },
  );
  if (totals.subtotalCents < 0 || totals.totalCents < 0) {
    throw new Error("Discounts cannot make the document total negative.");
  }
  return totals;
}

export function isAccountingMappingApproved(input: {
  accountCode: string | null;
  approvedAt: string | null;
  taxCode: string | null;
}) {
  return Boolean(input.accountCode && input.taxCode && input.approvedAt);
}
