import { createHash } from "node:crypto";

export type PayFastHistoryRow = {
  bookingReference: string;
  eventAt: string;
  eventType: "payment" | "reversal";
  fundingType: string;
  grossAmount: number;
  merchantNetAmount: number;
  providerPaymentId: string;
  providerProcessingFee: number;
  providerStatus: string;
};

function parseCsvRows(input: string) {
  const rows: string[][] = [];
  let field = "";
  let quoted = false;
  let row: string[] = [];

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function amount(value: string | undefined) {
  const parsed = Number.parseFloat(value ?? "");
  if (!Number.isFinite(parsed)) throw new Error("PayFast history contains an invalid amount.");
  return parsed;
}

export function parsePayFastHistoryCsv(input: string) {
  const rows = parseCsvRows(input.replace(/^\uFEFF/, ""));
  const headers = rows.shift() ?? [];
  const index = new Map(headers.map((header, position) => [header.trim(), position]));
  const required = ["Date", "Type", "Gross", "Fee", "Net", "M Payment ID", "PF Payment ID"];

  if (required.some((header) => !index.has(header))) {
    throw new Error("This isn't a supported PayFast transaction-history file.");
  }

  const transactions = rows.flatMap((values): PayFastHistoryRow[] => {
    const bookingReference = values[index.get("M Payment ID")!]?.trim().toUpperCase();
    const providerPaymentId = values[index.get("PF Payment ID")!]?.trim();
    const providerStatus = values[index.get("Type")!]?.trim();

    if (!/^ZNG-[A-Z0-9]+$/.test(bookingReference) || !providerPaymentId) return [];
    if (providerStatus !== "Funds Received" && providerStatus !== "Funds Received (Reversal)") return [];

    return [{
      bookingReference,
      eventAt: values[index.get("Date")!]?.trim().replace(" ", "T") + "+02:00",
      eventType: providerStatus === "Funds Received" ? "payment" : "reversal",
      fundingType: values[index.get("Funding Type")!]?.trim() ?? "",
      grossAmount: amount(values[index.get("Gross")!]),
      merchantNetAmount: amount(values[index.get("Net")!]),
      providerPaymentId,
      providerProcessingFee: amount(values[index.get("Fee")!]),
      providerStatus,
    }];
  });

  return {
    checksum: createHash("sha256").update(input).digest("hex"),
    transactions,
  };
}
