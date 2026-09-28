export type CompanyAddress = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  country: string;
  postalCode: string;
  province: string;
  suburb: string;
};

export type CompanyContact = {
  crmRevision: number;
  email: string | null;
  firstName: string;
  id: string;
  jobTitle: string | null;
  mobile: string | null;
  surname: string | null;
  updatedAt: string;
};

export type CompanyRecord = {
  archivedAt: string | null;
  billingAddress: CompanyAddress;
  billingEmail: string | null;
  bookingCount: number;
  bookingHistory: Array<{
    bookingReference: string;
    createdAt: string;
    guestCount: number;
    status: string;
  }>;
  contacts: CompanyContact[];
  corporateRequestCount: number;
  corporateHistory: Array<{
    contactName: string;
    createdAt: string;
    id: string;
    status: string;
  }>;
  createdAt: string;
  id: string;
  legalName: string;
  mergedIntoCompanyId: string | null;
  phone: string | null;
  physicalAddress: CompanyAddress | null;
  primaryContactCustomerId: string | null;
  registrationNumber: string | null;
  revision: number;
  tradingName: string | null;
  updatedAt: string;
  vatNumber: string | null;
};

export type CompanyWriteInput = {
  archived?: boolean;
  archiveReason?: string;
  billingAddressLine1?: string;
  billingAddressLine2?: string;
  billingCity?: string;
  billingCountry?: string;
  billingEmail?: string;
  billingPostalCode?: string;
  billingProvince?: string;
  billingSuburb?: string;
  legalName: string;
  phone?: string;
  physicalAddressDifferent?: boolean;
  physicalAddressLine1?: string;
  physicalAddressLine2?: string;
  physicalCity?: string;
  physicalCountry?: string;
  physicalPostalCode?: string;
  physicalProvince?: string;
  physicalSuburb?: string;
  primaryContactCustomerId?: string | null;
  registrationNumber?: string;
  tradingName?: string;
  vatNumber?: string;
};

export type CrmReviewCandidate = {
  candidateType: "company-as-person" | "company-variant" | "customer-duplicate";
  createdAt: string;
  displayNames: string[];
  evidence: Record<string, unknown>;
  id: string;
  reason: string;
  status: "dismissed" | "keep-separate" | "linked" | "merged" | "not-a-duplicate" | "pending";
  subjectIds: string[];
};

export function normalizeCompanyMatchKey(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompanyReviewKey(value: string | null | undefined) {
  return normalizeCompanyMatchKey(value)
    .replace(
      /\s+(proprietary limited|pty ltd|limited|ltd|incorporated|inc|close corporation|cc)$/,
      "",
    )
    .trim();
}

export function validateSouthAfricanVatNumber(value: string | null | undefined) {
  const normalized = (value ?? "").replace(/\s+/g, "").toUpperCase();

  if (!normalized) return { normalized: "", valid: true };

  return {
    normalized,
    valid: /^4\d{9}$/.test(normalized),
  };
}

export function validateCompanyInput(input: CompanyWriteInput) {
  const legalName = input.legalName.trim();
  const billingEmail = input.billingEmail?.trim().toLowerCase() ?? "";
  const vat = validateSouthAfricanVatNumber(input.vatNumber);

  if (legalName.length < 2) return "Legal Company Name is required.";
  if (!normalizeCompanyMatchKey(legalName)) {
    return "Legal Company Name must include letters or numbers.";
  }
  if (billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) {
    return "Enter a valid Billing Email.";
  }
  if (!vat.valid) return "Enter a valid 10-digit South African VAT Number.";

  return null;
}

export function emptyCompanyInput(): CompanyWriteInput {
  return {
    billingCountry: "South Africa",
    legalName: "",
    physicalAddressDifferent: false,
  };
}
