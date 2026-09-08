import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

export const defaultPhoneCountry: CountryCode = "ZA";

export type PhoneNumberResult =
  | {
      country: CountryCode;
      e164: string;
      nationalDisplay: string;
      nationalNumber: string;
      valid: true;
    }
  | { error: string; valid: false };

const invalidPhoneError = "Enter a valid mobile number.";

export function parseInternationalPhone(
  value: string | null | undefined,
  defaultCountry: CountryCode = defaultPhoneCountry,
): PhoneNumberResult {
  const input = value?.trim() ?? "";

  if (!input || !/^[+\d\s().-]+$/.test(input)) {
    return { error: invalidPhoneError, valid: false };
  }

  const phone = parsePhoneNumberFromString(input, defaultCountry);

  if (!phone?.isValid()) {
    return { error: invalidPhoneError, valid: false };
  }

  return {
    country: phone.country ?? defaultCountry,
    e164: phone.number,
    nationalDisplay: phone.formatNational(),
    nationalNumber: phone.nationalNumber,
    valid: true,
  };
}

export function normalizePhoneForStorage(
  value: string | null | undefined,
  defaultCountry: CountryCode = defaultPhoneCountry,
) {
  const input = value?.trim() ?? "";

  if (!input) return "";

  const parsed = parseInternationalPhone(input, defaultCountry);
  return parsed.valid ? parsed.e164 : input;
}

export function normalizePhoneForComparison(
  value: string | null | undefined,
  defaultCountry: CountryCode = defaultPhoneCountry,
) {
  const parsed = parseInternationalPhone(value, defaultCountry);
  return parsed.valid ? parsed.e164 : "";
}

export function composeInternationalPhoneInput(
  country: CountryCode,
  nationalInput: string,
) {
  const trimmed = nationalInput.trim();

  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed;

  const parsedNational = parsePhoneNumberFromString(trimmed, country);

  if (parsedNational?.isValid()) {
    return parsedNational.number;
  }

  const digits = trimmed.replace(/\D/g, "").replace(/^0/, "");
  return digits ? `+${getCountryCallingCode(country)}${digits}` : "";
}

export function getPhoneLookupVariants(
  value: string | null | undefined,
  defaultCountry: CountryCode = defaultPhoneCountry,
) {
  const parsed = parseInternationalPhone(value, defaultCountry);

  if (!parsed.valid) return [];

  const variants = [parsed.e164, parsed.e164.slice(1)];

  if (parsed.country === "ZA") {
    variants.push(`0${parsed.nationalNumber}`);
  }

  return Array.from(new Set(variants));
}

export function getSupportedPhoneCountries() {
  return getCountries();
}

export function getCallingCode(country: CountryCode) {
  return getCountryCallingCode(country);
}
