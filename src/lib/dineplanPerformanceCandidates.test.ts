import assert from "node:assert/strict";
import test from "node:test";
import {
  isDineplanReconciliationPerformanceStatus,
  matchesDineplanPerformance,
} from "./dineplanPerformanceCandidates.ts";

const metadata = {
  performanceDate: "2026-09-25",
  performanceTime: "17:00",
  venue: "johannesburg",
};

function show(overrides: Partial<{ date: string; status: string; time: string; venue: string }> = {}) {
  return {
    date: "2026-09-25",
    status: "sold_out",
    time: "17:00:00",
    venue: "johannesburg",
    ...overrides,
  };
}

test("internal reconciliation includes legitimate performances regardless of public-sales state", () => {
  for (const status of ["active", "inactive", "sold_out", "special_event", "archived"]) {
    assert.equal(isDineplanReconciliationPerformanceStatus(status), true, status);
    assert.equal(matchesDineplanPerformance(metadata, show({ status })), true, status);
  }
});

test("blackouts, venue closures and unknown lifecycle states are not performance candidates", () => {
  for (const status of ["blackout", "venue_closure", "unknown"]) {
    assert.equal(isDineplanReconciliationPerformanceStatus(status), false, status);
    assert.equal(matchesDineplanPerformance(metadata, show({ status })), false, status);
  }
});

test("candidate matching is bounded by authoritative venue, date and normalized time", () => {
  assert.equal(matchesDineplanPerformance(metadata, show()), true);
  assert.equal(matchesDineplanPerformance(metadata, show({ venue: "cape-town" })), false);
  assert.equal(matchesDineplanPerformance(metadata, show({ date: "2026-09-24" })), false);
  assert.equal(matchesDineplanPerformance(metadata, show({ time: "18:00:00" })), false);
});

test("the real 24 and 25 September JHB metadata formats remain valid", () => {
  assert.equal(matchesDineplanPerformance(metadata, show()), true);
  assert.equal(matchesDineplanPerformance(
    { performanceDate: "2026-09-24", performanceTime: "17:00:00", venue: "jhb" },
    show({ date: "2026-09-24" }),
  ), true);
});
