import {
  calculateXeroDocumentTotals,
  type XeroDocumentLineInput,
  type XeroLineAmountType,
} from "./documentMath.ts";

export type XeroDraftField =
  | "billingAddress"
  | "customerEmail"
  | "customerName"
  | "documentDate"
  | "guestCount"
  | "lineItems";

export type XeroDraftFieldErrors = Partial<Record<XeroDraftField, string>>;

export function validateXeroDraftFields(input: {
  amountType: XeroLineAmountType;
  billingAddress: string;
  customerEmail: string;
  customerName: string;
  documentDate: string;
  guestCount: string;
  lines: XeroDocumentLineInput[];
}) {
  const errors: XeroDraftFieldErrors = {};
  if (!input.customerName.trim()) {
    errors.customerName = "Add a customer or Company name.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail.trim())) {
    errors.customerEmail = "Add a valid billing email.";
  }
  if (!input.billingAddress.trim()) {
    errors.billingAddress = "Add a billing address.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.documentDate)) {
    errors.documentDate = "Choose a document date.";
  }
  if (input.guestCount.trim()) {
    const guestCount = Number(input.guestCount);
    if (!Number.isInteger(guestCount) || guestCount < 0) {
      errors.guestCount = "Enter a valid guest count.";
    }
  }
  if (input.lines.length === 0) {
    errors.lineItems = "Add at least one line.";
  } else if (input.lines.length > 100) {
    errors.lineItems = "Use no more than 100 lines.";
  } else {
    try {
      calculateXeroDocumentTotals(input.lines, input.amountType);
    } catch (error) {
      errors.lineItems =
        error instanceof Error ? error.message : "Check the invoice lines.";
    }
  }
  return errors;
}

export function xeroDraftFieldForMessage(
  message: string,
): XeroDraftField | null {
  if (message === "Add a customer or Company name.") return "customerName";
  if (message === "Add a valid billing email.") return "customerEmail";
  if (message === "Add a billing address.") return "billingAddress";
  if (message === "Choose a document date.") return "documentDate";
  if (message === "Enter a valid guest count.") return "guestCount";
  if (
    message.includes("line") ||
    message.includes("Quantity") ||
    message.includes("amount") ||
    message.includes("tax rate") ||
    message.includes("decimal places")
  ) {
    return "lineItems";
  }
  return null;
}
