import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyHistoricalBookingProvenance,
  hasImmutableProvenanceChanged,
  resolveBookingCreationProvenance,
  resolveTrustedBookingSource,
  signInternalBookingHandoff,
  verifyInternalBookingHandoff,
  // @ts-expect-error Node's built-in TypeScript test runner requires the extension.
} from "./bookingProvenance.ts";

test("assigns creation provenance from trusted server context", () => {
  assert.deepEqual(resolveBookingCreationProvenance({}), {
    bookingOrigin: "customer_public",
  });
  assert.deepEqual(
    resolveBookingCreationProvenance({
      bookingSource: "admin",
      staffProfileId: "staff-1",
    }),
    { bookingOrigin: "admin_staff", createdByStaffId: "staff-1" },
  );
  assert.deepEqual(
    resolveBookingCreationProvenance({
      bookingSource: "corporate-direct",
      staffProfileId: "staff-1",
    }),
    { bookingOrigin: "corporate", createdByStaffId: "staff-1" },
  );
});

test("does not trust client source labels without authenticated staff", () => {
  assert.equal(
    resolveTrustedBookingSource({ requestedSource: "admin" }),
    "online",
  );
  assert.equal(
    resolveTrustedBookingSource({
      requestedSource: "corporate-direct",
      staffProfileId: "staff-1",
    }),
    "corporate-direct",
  );
  assert.deepEqual(
    resolveBookingCreationProvenance({ bookingSource: "admin" }),
    { bookingOrigin: "customer_public" },
  );
  assert.deepEqual(
    resolveBookingCreationProvenance({ bookingSource: "corporate-direct" }),
    { bookingOrigin: "customer_public" },
  );
});

test("accepts only a fresh server-signed Admin handoff", () => {
  const input = {
    body: JSON.stringify({ booking: { reference: "ZNG-TEST" } }),
    secret: "test-only-secret",
    staffProfileId: "staff-1",
    timestamp: "100000",
  };
  const signature = signInternalBookingHandoff(input);

  assert.equal(
    verifyInternalBookingHandoff({ ...input, now: 100500, signature }),
    true,
  );
  assert.equal(
    verifyInternalBookingHandoff({
      ...input,
      body: `${input.body} `,
      now: 100500,
      signature,
    }),
    false,
  );
  assert.equal(
    verifyInternalBookingHandoff({ ...input, now: 200000, signature }),
    false,
  );
});

test("preserves immutable original creator semantics", () => {
  assert.equal(
    hasImmutableProvenanceChanged(
      { bookingOrigin: "admin_staff", createdByStaffId: "staff-1" },
      { bookingOrigin: "admin_staff", createdByStaffId: "staff-1" },
    ),
    false,
  );
  assert.equal(
    hasImmutableProvenanceChanged(
      { bookingOrigin: "admin_staff", createdByStaffId: "staff-1" },
      { bookingOrigin: "admin_staff", createdByStaffId: "staff-2" },
    ),
    true,
  );
});

test("classifies historical rows only from authoritative evidence", () => {
  assert.deepEqual(
    classifyHistoricalBookingProvenance({
      dataImportCreatorId: "importer-1",
      hasCustomerPublicLifecycleEvent: true,
    }),
    { bookingOrigin: "data_import", createdByStaffId: "importer-1" },
  );
  assert.deepEqual(
    classifyHistoricalBookingProvenance({
      hasCustomerPublicLifecycleEvent: true,
    }),
    { bookingOrigin: "customer_public" },
  );
  assert.deepEqual(classifyHistoricalBookingProvenance({}), {
    bookingOrigin: "legacy_unknown",
  });
});
