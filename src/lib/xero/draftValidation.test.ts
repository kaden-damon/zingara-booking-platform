import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateXeroDraftFields,
  xeroDraftFieldForMessage,
} from "./draftValidation.ts";

const validInput = {
  amountType: "inclusive" as const,
  billingAddress: "1 Example Street, Johannesburg",
  customerEmail: "accounts@example.com",
  customerName: "Example Customer",
  documentDate: "2026-10-29",
  guestCount: "14",
  lines: [
    {
      description: "Booking ZNG-4UGGV9 - show gratuity",
      mappingCategory: "gratuity",
      quantity: "1",
      taxCode: null,
      taxRatePercent: null,
      unitPrice: "2188.00",
    },
  ],
};

test("accepts a blank gratuity VAT rate", () => {
  assert.deepEqual(validateXeroDraftFields(validInput), {});
});

test("places missing billing details beside their fields", () => {
  assert.deepEqual(
    validateXeroDraftFields({
      ...validInput,
      billingAddress: "",
      customerEmail: "",
    }),
    {
      billingAddress: "Add a billing address.",
      customerEmail: "Add a valid billing email.",
    },
  );
});

test("maps authoritative server validation to the matching field", () => {
  assert.equal(
    xeroDraftFieldForMessage("Add a billing address."),
    "billingAddress",
  );
  assert.equal(
    xeroDraftFieldForMessage("Quantity must be greater than zero."),
    "lineItems",
  );
  assert.equal(xeroDraftFieldForMessage("Unexpected database failure"), null);
});

test("keeps save failures inside the editor and opens a persisted draft", async () => {
  const workspace = await readFile(
    new URL("../../app/admin/XeroWorkspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workspace, /props\.fieldErrors\.billingAddress/);
  assert.match(workspace, /props\.error && <p role="alert"/);
  assert.match(workspace, /result\.document\?\.id/);
  assert.match(workspace, /await openDocument\(result\.document\.id\)/);
});
