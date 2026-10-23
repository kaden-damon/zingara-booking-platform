import { validateBookingCreate } from "./bookingCreateValidation";
import {
  parseCorporateConversionReview,
  type CorporateConversionReviewDraft,
} from "./corporateConversionReview";
import {
  calculateCorporateBuyoutCommercials,
  type CorporateBuyoutPackage,
  validateCorporateBuyoutGuestTerms,
} from "./corporateBuyouts";
import type { CompanyRecord } from "./companyMaster";
import {
  defaultVenueSettings,
  type DemoShow,
  type DemoVenueSettings,
} from "./zingaraDemo";

export const guidedTrainingModuleIds = [
  "standard-booking",
  "corporate-booking",
  "buyout",
] as const;

export type GuidedTrainingModuleId = (typeof guidedTrainingModuleIds)[number];
export type GuidedTrainingStatus = "not-started" | "in-progress" | "completed";

export type GuidedTrainingStep = {
  controlId: string;
  event?: "change" | "click" | "input" | "submit";
  instruction: string;
  key: string;
  prepare?: {
    controlId: string;
    event: "change" | "click" | "input";
    instruction: string;
    validValues?: string[];
  };
  validValues?: string[];
};

export type GuidedTrainingModule = {
  estimatedMinutes: number;
  id: GuidedTrainingModuleId;
  number: string;
  steps: GuidedTrainingStep[];
  title: string;
  version: number;
};

export const guidedTrainingModules: GuidedTrainingModule[] = [
  {
    estimatedMinutes: 8,
    id: "standard-booking",
    number: "01",
    title: "Create Standard Booking",
    version: 4,
    steps: [
      { key: "create", controlId: "training-calendar-create", instruction: "Click + on the highlighted performance." },
      { key: "type", controlId: "training-booking-standard", instruction: "Choose Standard Booking." },
      { key: "guests", controlId: "training-booking-guests", instruction: "Set 4 guests, then continue.", validValues: ["4"] },
      { key: "zone", controlId: "training-booking-zone-golden-circle", instruction: "Choose Golden Circle." },
      { key: "zone-confirm", controlId: "training-booking-zone-confirm", instruction: "Confirm the seating section." },
      { key: "details-open", controlId: "training-booking-details-open", instruction: "Continue to Guest Details." },
      { key: "details", controlId: "training-booking-details", instruction: "Enter Avery Daniels, avery.daniels@example.com and +27 82 000 0000, then continue.", validValues: ["valid"] },
      {
        key: "payment",
        controlId: "training-booking-review",
        instruction: "Review the booking.",
        prepare: {
          controlId: "training-booking-payment-option",
          event: "change",
          instruction: "Choose a payment option.",
          validValues: ["full", "deposit"],
        },
      },
      { key: "terms", controlId: "training-booking-terms", instruction: "Accept the booking terms.", validValues: ["checked"] },
      { key: "confirm", controlId: "training-booking-confirm", instruction: "Create the booking." },
    ],
  },
  {
    estimatedMinutes: 10,
    id: "corporate-booking",
    number: "02",
    title: "Create Corporate Booking",
    version: 5,
    steps: [
      { key: "create", controlId: "training-calendar-create", instruction: "Click + on the highlighted performance." },
      { key: "type", controlId: "training-booking-corporate", instruction: "Choose Corporate Booking." },
      { key: "guests", controlId: "training-booking-guests", instruction: "Enter 20 guests, then continue.", validValues: ["20"] },
      { key: "zone", controlId: "training-booking-zone-royal-booths", instruction: "Choose Private Booths." },
      { key: "zone-confirm", controlId: "training-booking-zone-confirm", instruction: "Confirm the seating section." },
      { key: "details-open", controlId: "training-booking-details-open", instruction: "Continue to Company Details." },
      { key: "details", controlId: "training-booking-details", instruction: "Enter the company and contact details, then continue.", validValues: ["valid"] },
      {
        key: "rate",
        controlId: "training-booking-rate",
        instruction: "Choose Standard Rate or Complimentary.",
        validValues: ["standard", "complimentary"],
      },
      {
        key: "payment",
        controlId: "training-booking-review",
        instruction: "Review the booking.",
        prepare: {
          controlId: "training-booking-payment-option",
          event: "change",
          instruction: "Choose a payment option.",
          validValues: ["full", "deposit", "invoice-outstanding", "invoice-paid"],
        },
      },
      { key: "terms", controlId: "training-booking-terms", instruction: "Accept the booking terms.", validValues: ["checked"] },
      { key: "confirm", controlId: "training-booking-confirm", instruction: "Create the Corporate booking." },
    ],
  },
  {
    estimatedMinutes: 8,
    id: "buyout",
    number: "03",
    title: "Create Buyout",
    version: 2,
    steps: [
      { key: "create", controlId: "training-calendar-create", instruction: "Click + on the highlighted performance." },
      { key: "type", controlId: "training-booking-buyout", instruction: "Choose Buyout." },
      { key: "company", controlId: "training-buyout-company", event: "change", instruction: "Choose the company.", validValues: ["academy-guided-training-company"] },
      { key: "contact", controlId: "training-buyout-contact", event: "change", instruction: "Choose the company contact.", validValues: ["academy-guided-training-contact"] },
      { key: "package", controlId: "training-buyout-package", instruction: "Choose Full Venue Buyout." },
      { key: "guests", controlId: "training-buyout-guests", instruction: "Confirm 400 expected guests.", validValues: ["400"] },
      { key: "review", controlId: "training-buyout-review", instruction: "Review the Buyout." },
      { key: "confirm", controlId: "training-buyout-confirm", instruction: "Create the Buyout." },
    ],
  },
];

export const guidedTrainingSyntheticShow: DemoShow = {
  address: "Private Academy Fixture",
  date: "2026-12-10",
  description: "Guided Training performance",
  id: "academy-guided-training-show",
  internalNotes: "",
  label: "Zingara Guided Training",
  location: "johannesburg",
  operationalStatus: "active",
  time: "18:00",
  venueName: "johannesburg",
};

export const guidedTrainingVenueSettings: DemoVenueSettings = {
  ...defaultVenueSettings,
  venueId: "academy-guided-training",
  venueName: "Zingara Johannesburg",
};

export const guidedTrainingCompany: CompanyRecord = {
  archivedAt: null,
  billingAddress: {
    addressLine1: "1 Academy Lane",
    addressLine2: "",
    city: "Johannesburg",
    country: "South Africa",
    postalCode: "2000",
    province: "Gauteng",
    suburb: "Sandton",
  },
  billingEmail: "accounts@goldencircleevents.co.za",
  bookingCount: 0,
  bookingHistory: [],
  contacts: [{
    crmRevision: 1,
    email: "avery.daniels@goldencircleevents.co.za",
    firstName: "Avery",
    id: "academy-guided-training-contact",
    jobTitle: "Events Manager",
    mobile: "+27820000000",
    surname: "Daniels",
    updatedAt: "2026-10-22T00:00:00.000Z",
  }],
  corporateRequestCount: 0,
  corporateHistory: [],
  createdAt: "2026-10-22T00:00:00.000Z",
  id: "academy-guided-training-company",
  legalName: "Golden Circle Events (Pty) Ltd",
  mergedIntoCompanyId: null,
  phone: "+27110000000",
  physicalAddress: null,
  primaryContactCustomerId: "academy-guided-training-contact",
  registrationNumber: null,
  revision: 1,
  tradingName: "Golden Circle Events",
  updatedAt: "2026-10-22T00:00:00.000Z",
  vatNumber: null,
};

export const syntheticBuyoutPackage: CorporateBuyoutPackage = {
  active: true,
  additionalGuestRate: 950,
  baseAmount: 360000,
  code: "ACADEMY-FULL-VENUE",
  currency: "ZAR",
  dateHoldHours: 48,
  displayName: "Full Venue Buyout",
  exclusions: [],
  gratuityAmount: 45000,
  id: "academy-buyout-package",
  includedGuestCount: 400,
  inclusions: ["Exclusive venue", "Dinner show", "Dedicated event team"],
  maximumGuestCount: 450,
  paymentDueHours: 72,
  quoteValidityHours: 48,
  totalAmount: 405000,
  vatAmount: 52826.09,
  version: 1,
};

export function validateStandardTrainingBooking(input: {
  email: string;
  guests: number;
  name: string;
  phone: string;
}) {
  return validateBookingCreate({
    bookingSource: "box-office",
    customer: { email: input.email, name: input.name, phone: input.phone },
    isCreate: true,
    isTrustedStaff: false,
    partySize: input.guests,
  });
}

export function validateCorporateTrainingBooking(input: {
  guests: number;
  paymentBasis: CorporateConversionReviewDraft["paymentBasis"];
  showId: string;
  total: number;
  venue: "cape-town" | "johannesburg";
  zoneId: string;
}) {
  return parseCorporateConversionReview({
    amountPaid: "0",
    outstandingAmount: String(input.total),
    paymentBasis: input.paymentBasis,
    pax: String(input.guests),
    showId: input.showId,
    ticketTotal: String(input.total),
    venue: input.venue,
    zoneId: input.zoneId,
    zoneEntitlements: [{ pax: String(input.guests), zoneId: input.zoneId }],
  });
}

export function validateBuyoutTrainingBooking(guestCount: number) {
  const error = validateCorporateBuyoutGuestTerms({
    additionalGuestRate: syntheticBuyoutPackage.additionalGuestRate,
    guestCount,
    includedGuestCount: syntheticBuyoutPackage.includedGuestCount,
    maximumGuestCount: syntheticBuyoutPackage.maximumGuestCount,
  });
  return {
    commercials: calculateCorporateBuyoutCommercials({
      additionalGuestRate: syntheticBuyoutPackage.additionalGuestRate,
      guestCount,
      package: syntheticBuyoutPackage,
    }),
    error,
  };
}

export function isGuidedTrainingModuleId(value: unknown): value is GuidedTrainingModuleId {
  return guidedTrainingModuleIds.includes(value as GuidedTrainingModuleId);
}

export function createGuidedTrainingReference() {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replaceAll("-", "").slice(0, 6)
      : Math.random().toString(36).slice(2, 8);
  return `ZNG-${suffix.toUpperCase()}`;
}
