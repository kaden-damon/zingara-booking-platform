import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  collectWorkflowRows,
  isReviewPerformanceAfterActivation,
} from "./automatedWorkflows.ts";

const root = process.cwd();
const workflowPath = `${root}/src/lib/workflows/automatedWorkflows.ts`;
const adminPath = `${root}/src/app/admin/page.tsx`;
const workflowRoutePath = `${root}/src/app/api/admin/workflows/route.ts`;

test("review activation boundary is based on performance time, not a later ticket update", () => {
  const activatedAt = new Date("2026-10-01T12:00:00+02:00");
  assert.equal(
    isReviewPerformanceAfterActivation(
      new Date("2026-09-30T17:00:00+02:00"),
      activatedAt,
    ),
    false,
  );
  assert.equal(
    isReviewPerformanceAfterActivation(
      new Date("2026-10-02T17:00:00+02:00"),
      activatedAt,
    ),
    true,
  );
});

test("workflow datasets page beyond the Supabase 1,000-row response limit", async () => {
  const source = Array.from({ length: 2_105 }, (_, index) => index + 1);
  const requests: Array<[number, number]> = [];
  const rows = await collectWorkflowRows(async (from, to) => {
    requests.push([from, to]);
    return {
      data: source.slice(from, to + 1),
      error: null,
    };
  });

  assert.deepEqual(requests, [
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
  assert.deepEqual(rows, source);
});

test("workflow dataset pagination fails closed when any page fails", async () => {
  await assert.rejects(
    collectWorkflowRows(async (from) => ({
      data: from === 0 ? Array.from({ length: 1000 }, () => "row") : null,
      error: from === 0 ? null : { message: "page failed" },
    })),
    /page failed/,
  );
});

test("review recipient evaluation suppresses historical, synthetic and already-reviewed bookings", async () => {
  const source = await readFile(workflowPath, "utf8");
  assert.match(source, /\^\(qa\|test\|demo\)\[-_\]/i);
  assert.match(source, /reviewedBookingIds\.has\(booking\.id\)/);
  assert.match(source, /increment\(summary\.reasons, "already_reviewed"\)/);
  assert.match(source, /from\("guest_reviews"\)\.select\("booking_id"\)/);
  assert.match(source, /isReviewPerformanceAfterActivation\(showDateTime, activationDate\)/);
  assert.doesNotMatch(source, /new Date\(checkedInTicket\.updated_at\) < activationDate/);
});

test("review workflow remains disabled by default and uses one-day timing", async () => {
  const source = await readFile(workflowPath, "utf8");
  const reviewStart = source.indexOf("Thank you for joining us for {{showName}}.");
  const reviewDefault = source.slice(reviewStart, reviewStart + 1800);
  assert.match(reviewDefault, /enabled: false/);
  assert.match(reviewDefault, /timingOffsetDays: 1/);
  assert.match(source, /findDuplicateSentCommunication/);
  assert.match(source, /getOrCreateVerifiedReviewLink/);
  assert.match(source, /ctaLabel:[\s\S]*"RATE YOUR EXPERIENCE"/);
  assert.match(source, /hidePrimaryUrlInHtml: deliveryItem\.workflowKey === "post_show_review"/);
});

test("legacy venue URLs are preserved in configuration but removed from normal review UI", async () => {
  const [admin, route] = await Promise.all([
    readFile(adminPath, "utf8"),
    readFile(workflowRoutePath, "utf8"),
  ]);
  assert.doesNotMatch(admin, /Cape Town legacy URL|Johannesburg legacy URL/);
  assert.match(admin, /No venue review URL needs to be maintained/);
  assert.match(route, /capeTownReviewUrl/);
  assert.match(route, /johannesburgReviewUrl/);
});
