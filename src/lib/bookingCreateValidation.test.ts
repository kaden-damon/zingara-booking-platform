import assert from "node:assert/strict";
import test from "node:test";

import {
  getPublicBookingGuidance,
  mergeCustomerContactValues,
  normalizeBookingCustomer,
  validateBookingCreate,
  // @ts-expect-error Node's built-in TypeScript test runner requires the extension.
} from "./bookingCreateValidation.ts";

const completeCustomer = {
  email: "guest@example.com",
  name: "Guest Example",
  phone: "+27 82 123 4567",
};

test("requires public name, email, mobile, and pax", () => {
  assert.deepEqual(
    validateBookingCreate({
      customer: { email: "", name: "   ", phone: "" },
      isCreate: true,
      isTrustedStaff: false,
      partySize: 0,
    }),
    {
      email: "Email address is required.",
      name: "Full name is required.",
      partySize: "Enter a valid number of guests.",
      phone: "Mobile number is required.",
    },
  );
});

test("accepts practical international public contact details", () => {
  assert.deepEqual(
    validateBookingCreate({
      customer: completeCustomer,
      isCreate: true,
      isTrustedStaff: false,
      partySize: 2,
    }),
    {},
  );
});

test("rejects malformed public email and mobile values", () => {
  assert.deepEqual(
    validateBookingCreate({
      customer: { email: "not-an-email", name: "SingleName", phone: "12-3" },
      isCreate: true,
      isTrustedStaff: false,
      partySize: 1,
    }),
    {
      email: "Enter a valid email address.",
      phone: "Enter a valid mobile number.",
    },
  );
});

test("requires only name and pax for a trusted staff Standard create", () => {
  assert.deepEqual(
    validateBookingCreate({
      bookingSource: "admin",
      customer: { email: "", name: "Staff Guest", phone: "" },
      isCreate: true,
      isTrustedStaff: true,
      partySize: 4,
    }),
    {},
  );
  assert.deepEqual(
    validateBookingCreate({
      bookingSource: "admin",
      customer: { email: "", name: "", phone: "" },
      isCreate: true,
      isTrustedStaff: true,
      partySize: 0,
    }),
    {
      name: "Full name is required.",
      partySize: "Enter a valid number of guests.",
    },
  );
});

test("does not trust a public source label to bypass contact requirements", () => {
  assert.deepEqual(
    validateBookingCreate({
      bookingSource: "admin",
      customer: { email: "", name: "Public Guest", phone: "" },
      isCreate: true,
      isTrustedStaff: false,
      partySize: 2,
    }),
    {
      email: "Email address is required.",
      phone: "Mobile number is required.",
    },
  );
});

test("keeps trusted historical edits compatible", () => {
  assert.deepEqual(
    validateBookingCreate({
      bookingSource: "admin",
      customer: { email: "", name: "", phone: "" },
      isCreate: false,
      isTrustedStaff: true,
      partySize: 0,
    }),
    {},
  );
});

test("keeps Corporate creation on its existing validation path", () => {
  assert.deepEqual(
    validateBookingCreate({
      bookingSource: "corporate-direct",
      customer: { email: "", name: "", phone: "" },
      isCreate: true,
      isTrustedStaff: true,
      partySize: 0,
    }),
    {},
  );
});

test("normalizes public customer values without restrictive name rules", () => {
  assert.deepEqual(
    normalizeBookingCustomer({
      email: "  Guest+QA@Example.COM ",
      name: "  Cher  ",
      phone: "  +44 20 7946 0958  ",
    }),
    {
      email: "guest+qa@example.com",
      name: "Cher",
      phone: "+44 20 7946 0958",
    },
  );
});

test("does not overwrite populated customer contacts with blanks", () => {
  assert.deepEqual(
    mergeCustomerContactValues(
      { email: "saved@example.com", mobile: "+27821234567" },
      { email: null, mobile: "" },
    ),
    { email: "saved@example.com", mobile: "+27821234567" },
  );
});

test("builds concise context-aware public form guidance", () => {
  assert.equal(
    getPublicBookingGuidance({
      email: "Email address is required.",
      name: "Full name is required.",
      phone: "Mobile number is required.",
    }),
    "Please complete your full name, email address and mobile number to continue.",
  );
  assert.equal(
    getPublicBookingGuidance({ phone: "Mobile number is required." }),
    "Please enter your mobile number to continue.",
  );
  assert.equal(
    getPublicBookingGuidance({
      email: "Email address is required.",
      phone: "Mobile number is required.",
    }),
    "Please enter your email address and mobile number to continue.",
  );
});
