import assert from "node:assert/strict";
import test from "node:test";

import { resolveBookingCompanyName } from "./bookingCompanyIdentity.ts";

test("linked company is authoritative over the booking snapshot", () => {
  assert.equal(
    resolveBookingCompanyName({
      linkedCompany: {
        legal_name: "Authoritative Company (Pty) Ltd",
        trading_name: "Authoritative Company",
      },
      storedCompanyName: "Older Snapshot",
    }),
    "Authoritative Company",
  );
});

test("booking snapshot supports authoritative historical imports without a link", () => {
  assert.equal(
    resolveBookingCompanyName({
      storedCompanyName: "Historical Company",
    }),
    "Historical Company",
  );
});

test("missing company evidence stays blank", () => {
  assert.equal(resolveBookingCompanyName({}), "");
});
