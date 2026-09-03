import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createCorporateEnquiryNotificationMessage,
  getCorporateEnquiryRecipient,
  resolveCorporateEnquiryLocation,
} from "../corporateEnquiryRouting.ts";

const settings = {
  operationalSettings: {
    corporateEnquiryRecipients: {
      "cape-town": "corporatebookingcpt@zingara.co.za",
      johannesburg: "corporatebookings@zingara.co.za",
    },
  },
};

function request(
  locationAcknowledgement: string,
) {
  return {
    addons: ["Arrival Drinks"],
    alternativeDate: "2026-11-14",
    barTab: "R500 pp",
    communicationHistory: [],
    companyName: "Example Company",
    contactName: "Alex Example",
    contactNumber: "+27 82 000 0000",
    createdAt: "2026-09-03T08:00:00.000Z",
    dietaryRequirements: ["Vegetarian"],
    email: "alex@example.com",
    guestCount: 24,
    id: "CORP-TEST-001",
    locationAcknowledgement,
    notes: "Please call after 14:00.",
    occasion: "Year-End Function",
    otherDietaryRequirement: "",
    otherOccasion: "",
    preferredDate: "2026-11-07",
    requestType: "corporate-booking" as const,
    seatingPreference: "Middle Ring",
    source: "Corporate Direct",
    status: "corporate-tentative",
    updatedAt: "2026-09-03T08:00:00.000Z",
  };
}

test("Johannesburg enquiry routes only to the Johannesburg inbox", () => {
  assert.equal(
    getCorporateEnquiryRecipient(request("Johannesburg"), settings),
    "corporatebookings@zingara.co.za",
  );
});

test("Cape Town enquiry routes only to the Cape Town inbox", () => {
  assert.equal(
    getCorporateEnquiryRecipient(request("Cape Town"), settings),
    "corporatebookingcpt@zingara.co.za",
  );
});

test("routing rejects free-text location inference", () => {
  assert.equal(resolveCorporateEnquiryLocation("JHB event please"), null);
  assert.equal(resolveCorporateEnquiryLocation("Cape Town notes"), null);
});

test("internal notification contains the submitted operational details", () => {
  const message = createCorporateEnquiryNotificationMessage(
    request("Johannesburg"),
  );

  for (const expected of [
    "CORP-TEST-001",
    "Johannesburg",
    "Alex Example",
    "Example Company",
    "alex@example.com",
    "+27 82 000 0000",
    "2026-11-07",
    "2026-11-14",
    "Guests: 24",
    "Middle Ring",
    "Please call after 14:00.",
  ]) {
    assert.match(
      message,
      new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
});

test("public submission delivers server-side through the shared branded shell", async () => {
  const [route, email, page] = await Promise.all([
    readFile(
      new URL("../../app/api/corporate-requests/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("./corporateEnquiryEmail.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/corporate/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /sendCorporateEnquiryEmails/);
  assert.match(route, /loadCorporateRequestRecord/);
  assert.match(email, /createBrandedCustomerEmail/);
  assert.match(email, /insertCommunicationPayload/);
  assert.match(email, /hasMatchingCommunication/);
  assert.doesNotMatch(page, /syncCorporateRequestCommunications/);
});

test("enquiry persistence remains authoritative when notification delivery fails", async () => {
  const route = await readFile(
    new URL("../../app/api/corporate-requests/route.ts", import.meta.url),
    "utf8",
  );
  const persistenceIndex = route.indexOf("persistCorporateRequests(");
  const notificationIndex = route.indexOf("sendCorporateEnquiryEmails(");

  assert.ok(persistenceIndex >= 0);
  assert.ok(notificationIndex > persistenceIndex);
  assert.match(route, /Corporate enquiry notifications could not start/);
  assert.match(route, /return Response\.json\(\{ requests: persistedRequests \}\)/);
});

test("existing request IDs do not trigger duplicate notifications", async () => {
  const route = await readFile(
    new URL("../../app/api/corporate-requests/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /loadCorporateRequestRecord/);
  assert.match(route, /const createdRequests = requests\.filter/);
  assert.match(route, /!existingRequests\[index\]/);
});

test("public venue settings do not expose internal Corporate inboxes", async () => {
  const route = await readFile(
    new URL("../../app/api/venue-settings/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /corporateEnquiryRecipients: _corporateRecipients/);
});
