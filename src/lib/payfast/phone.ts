export type PayFastCellNumberResult =
  | { cellNumber: string | undefined; valid: true }
  | { error: string; valid: false };

const invalidCellNumberError =
  "The customer phone number is invalid. Check the country calling code and mobile number.";

export function normalizePayFastCellNumber(
  phone: string | null | undefined,
): PayFastCellNumberResult {
  const trimmed = phone?.trim() ?? "";

  if (!trimmed) {
    return { cellNumber: undefined, valid: true };
  }

  const parsed = parseInternationalPhone(trimmed);

  if (!parsed.valid) {
    return { error: invalidCellNumberError, valid: false };
  }

  // PayFast's cell_number is optional and its existing integration expects a
  // South African national number. International customers must not be blocked
  // by an optional provider field or be assigned a fabricated local number.
  return {
    cellNumber:
      parsed.country === "ZA" ? `0${parsed.nationalNumber}` : undefined,
    valid: true,
  };
}
import { parseInternationalPhone } from "@/lib/phone";
