import assert from "node:assert/strict";
import test from "node:test";

import {
  getLegacyImportCustomerIdentityCandidates,
  // @ts-expect-error Node's built-in TypeScript test runner requires the extension.
} from "./legacyImportIdentity.ts";

test("recovers Andrew Banks identity when the imported first name contains email", () => {
  const candidates = getLegacyImportCustomerIdentityCandidates({
    email: "andrew@loyaltypartners.co.za",
    firstName: "andrew@loyaltypartners.co.za",
    metadataName: "andrew@loyaltypartners.co.za Banks",
    surname: "Banks",
  });

  assert.ok(candidates.includes("andrew banks"));
  assert.ok(candidates.includes("andrew loyaltypartners co za banks"));
});

test("does not invent a surname or identity from an empty profile", () => {
  assert.deepEqual(getLegacyImportCustomerIdentityCandidates({}), []);
});

test("normal human-readable metadata remains a valid candidate", () => {
  assert.ok(
    getLegacyImportCustomerIdentityCandidates({
      metadataName: "Andrew Banks",
    }).includes("andrew banks"),
  );
});
