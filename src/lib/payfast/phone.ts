export type PayFastCellNumberResult =
  | { cellNumber: string | undefined; valid: true }
  | { error: string; valid: false };

const invalidCellNumberError =
  "The customer phone number cannot be used for PayFast checkout. Enter a valid 10-digit South African number and try again.";

export function normalizePayFastCellNumber(
  phone: string | null | undefined,
): PayFastCellNumberResult {
  const trimmed = phone?.trim() ?? "";

  if (!trimmed) {
    return { cellNumber: undefined, valid: true };
  }

  if (!/^[+\d\s().-]+$/.test(trimmed)) {
    return { error: invalidCellNumberError, valid: false };
  }

  const digits = trimmed.replace(/\D/g, "");
  const nationalNumber = digits.startsWith("27")
    ? `0${digits.slice(2)}`
    : digits.length === 9
      ? `0${digits}`
      : digits;

  if (!/^0\d{9}$/.test(nationalNumber)) {
    return { error: invalidCellNumberError, valid: false };
  }

  return { cellNumber: nationalNumber, valid: true };
}
