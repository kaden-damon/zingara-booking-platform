import type { BookingSource, CustomerInfo } from "@/lib/zingaraDemo";

export type BookingCreateField = "email" | "name" | "partySize" | "phone";

export type BookingCreateFieldErrors = Partial<
  Record<BookingCreateField, string>
>;

type BookingCreateValidationInput = {
  bookingSource?: BookingSource;
  customer: Partial<CustomerInfo> | null | undefined;
  isCreate: boolean;
  isTrustedStaff: boolean;
  partySize: number;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+()\s.-]+$/;

export function normalizeBookingCustomer(
  customer: Partial<CustomerInfo> | null | undefined,
): CustomerInfo {
  return {
    email: customer?.email?.trim().toLowerCase() ?? "",
    name: customer?.name?.trim() ?? "",
    phone: customer?.phone?.trim() ?? "",
  };
}

export function validateBookingCreate(
  input: BookingCreateValidationInput,
): BookingCreateFieldErrors {
  if (!input.isCreate && input.isTrustedStaff) {
    return {};
  }

  if (input.isTrustedStaff && input.bookingSource === "corporate-direct") {
    return {};
  }

  const customer = normalizeBookingCustomer(input.customer);
  const errors: BookingCreateFieldErrors = {};

  if (!customer.name) {
    errors.name = "Full name is required.";
  }

  if (!Number.isInteger(input.partySize) || input.partySize < 1) {
    errors.partySize = "Enter a valid number of guests.";
  }

  if (!input.isTrustedStaff) {
    if (!customer.email) {
      errors.email = "Email address is required.";
    } else if (!emailPattern.test(customer.email)) {
      errors.email = "Enter a valid email address.";
    }

    const phoneDigits = customer.phone.replace(/\D/g, "");

    if (!customer.phone) {
      errors.phone = "Mobile number is required.";
    } else if (
      !phonePattern.test(customer.phone) ||
      phoneDigits.length < 7 ||
      phoneDigits.length > 15
    ) {
      errors.phone = "Enter a valid mobile number.";
    }
  }

  return errors;
}

export function getFirstBookingCreateError(
  errors: BookingCreateFieldErrors,
) {
  return errors.name ?? errors.phone ?? errors.email ?? errors.partySize;
}

export function getPublicBookingGuidance(
  errors: BookingCreateFieldErrors,
) {
  const missingFields = [
    errors.name ? "full name" : "",
    errors.email ? "email address" : "",
    errors.phone ? "mobile number" : "",
  ].filter(Boolean);

  if (missingFields.length === 0) {
    return "";
  }

  if (missingFields.length === 1) {
    return `Please enter your ${missingFields[0]} to continue.`;
  }

  if (missingFields.length === 2) {
    return `Please enter your ${missingFields[0]} and ${missingFields[1]} to continue.`;
  }

  return "Please complete your full name, email address and mobile number to continue.";
}

export function mergeCustomerContactValues(
  existing: { email: string | null; mobile: string | null },
  proposed: { email: string | null; mobile: string | null },
) {
  return {
    email: proposed.email?.trim() || existing.email,
    mobile: proposed.mobile?.trim() || existing.mobile,
  };
}
