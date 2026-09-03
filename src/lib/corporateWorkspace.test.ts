import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { CorporateRequest } from "./zingaraDemo.ts";
import {
  filterCorporateEnquiries,
  getCorporateEnquiryLifecycle,
  getCorporateEnquiryLifecycleCounts,
  getCorporateFilterOptions,
} from "./corporateWorkspace.ts";

const request = (
  overrides: Partial<CorporateRequest> = {},
): CorporateRequest => ({
  addons: [],
  alternativeDate: "",
  barTab: "No Bar Tab",
  companyName: "Example Company",
  contactName: "Example Contact",
  contactNumber: "0820000000",
  createdAt: "2026-09-03T10:00:00Z",
  dietaryRequirements: [],
  email: "contact@example.com",
  guestCount: 10,
  id: "request-1",
  notes: "",
  occasion: "",
  otherDietaryRequirement: "",
  otherOccasion: "",
  preferredDate: "2026-11-27",
  requestType: "corporate-booking",
  seatingPreference: "MR",
  source: "Corporate Direct",
  status: "quote-sent",
  updatedAt: "2026-09-03T10:00:00Z",
  ...overrides,
});

test("Corporate lifecycle keeps converted and archived enquiries out of Active", () => {
  assert.equal(getCorporateEnquiryLifecycle(request()), "active");
  assert.equal(
    getCorporateEnquiryLifecycle(request({ status: "converted" })),
    "converted",
  );
  assert.equal(
    getCorporateEnquiryLifecycle(
      request({ archivedAt: "2026-09-03T11:00:00Z", status: "cancelled" }),
    ),
    "archived",
  );
});

test("Corporate lifecycle counts are authoritative and mutually exclusive", () => {
  assert.deepEqual(
    getCorporateEnquiryLifecycleCounts([
      request(),
      request({ id: "request-2", status: "converted" }),
      request({ archivedAt: "2026-09-03T11:00:00Z", id: "request-3" }),
    ]),
    { active: 1, all: 3, archived: 1, converted: 1 },
  );
});

test("Corporate enquiry filters combine location, status, date, consultant, and search", () => {
  const matching = request({
    assignedConsultant: "Ash",
    linkedBookingReference: "ZNG-ABC123",
    locationAcknowledgement: "Cape Town",
  });
  const other = request({
    assignedConsultant: "Kaden",
    companyName: "Other Company",
    id: "request-2",
    locationAcknowledgement: "Johannesburg",
    preferredDate: "2026-12-01",
    status: "awaiting-payment",
  });

  assert.deepEqual(
    filterCorporateEnquiries([matching, other], {
      consultant: "Ash",
      date: "2026-11-27",
      lifecycle: "active",
      location: "Cape Town",
      search: "zng-abc123",
      status: "quote-sent",
    }).map((item) => item.id),
    ["request-1"],
  );
});

test("Corporate filter options use only authoritative populated request values", () => {
  assert.deepEqual(
    getCorporateFilterOptions([
      request({ assignedConsultant: "Ash", locationAcknowledgement: "Cape Town" }),
      request({
        assignedConsultant: "Ash",
        id: "request-2",
        locationAcknowledgement: "Cape Town",
      }),
      request({
        assignedConsultant: "Kaden",
        id: "request-3",
        locationAcknowledgement: "Johannesburg",
        preferredDate: "2026-12-01",
      }),
    ]),
    {
      consultants: ["Ash", "Kaden"],
      dates: ["2026-11-27", "2026-12-01"],
      locations: ["Cape Town", "Johannesburg"],
    },
  );
});

test("Admin renders mutually exclusive Corporate workspaces with streamlined labels", async () => {
  const page = await readFile(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /\["bookings", "Standard"\]/);
  assert.match(page, /aria-label="Corporate workspaces"/);
  assert.match(
    page,
    /\["enquiries", "Enquiries", corporateRequests\.length\]/,
  );
  assert.match(
    page,
    /\["bookings", "Bookings", corporateBookingCount\]/,
  );
  assert.match(page, /corporateWorkspace === "enquiries"/);
  assert.match(page, /corporateWorkspace === "bookings"/);
});

test("Admin exposes one lifecycle cohort and authoritative cross-navigation", async () => {
  const page = await readFile(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /aria-label="Corporate enquiry lifecycle"/);
  assert.match(page, /View Booking/);
  assert.match(page, /View Enquiry/);
  assert.doesNotMatch(page, />Active Enquiries<\/h3>/);
  assert.doesNotMatch(page, />Converted Enquiries<\/h3>/);
  assert.doesNotMatch(page, />Archived Enquiries<\/h3>/);
});
