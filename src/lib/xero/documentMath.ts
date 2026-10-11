export type XeroLineAmountType = "exclusive" | "inclusive" | "no-tax";

export type XeroDocumentLineInput = {
  description: string;
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

function parseScaled(value: string, scale = 4) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error("Enter a valid positive number.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > scale) {
    throw new Error(`Use no more than ${scale} decimal places.`);
  }
  const scaled = Number(whole) * 10 ** scale + Number(fraction.padEnd(scale, "0"));
  if (!Number.isSafeInteger(scaled)) throw new Error("This amount is too large.");
  return scaled;
}

function roundFraction(numerator: number, denominator: number) {
  if (!Number.isSafeInteger(numerator)) throw new Error("This calculation is too large.");
  return Math.floor(numerator / denominator + 0.5);
}

export function calculateXeroDocumentLine(
  input: XeroDocumentLineInput,
  amountType: XeroLineAmountType,
): XeroCalculatedLine {
  if (!input.description.trim()) throw new Error("Add a line description.");
  const quantity = parseScaled(input.quantity);
  const unitPrice = parseScaled(input.unitPrice);
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

  const taxCents = roundFraction(grossCents * taxBasisPoints, 10_000);
  return {
    ...input,
    subtotalCents: grossCents,
    taxCents,
    totalCents: grossCents + taxCents,
  };
}

export function calculateXeroDocumentTotals(
  lines: XeroDocumentLineInput[],
  amountType: XeroLineAmountType,
) {
  const calculatedLines = lines.map((line) =>
    calculateXeroDocumentLine(line, amountType),
  );
  return calculatedLines.reduce(
    (totals, line) => ({
      lines: calculatedLines,
      subtotalCents: totals.subtotalCents + line.subtotalCents,
      taxCents: totals.taxCents + line.taxCents,
      totalCents: totals.totalCents + line.totalCents,
    }),
    { lines: calculatedLines, subtotalCents: 0, taxCents: 0, totalCents: 0 },
  );
}

export function isAccountingMappingApproved(input: {
  accountCode: string | null;
  approvedAt: string | null;
  taxCode: string | null;
}) {
  return Boolean(input.accountCode && input.taxCode && input.approvedAt);
}
