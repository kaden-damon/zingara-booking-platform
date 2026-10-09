import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  collectWorkflowRows,
  defaultWorkflowConfigurations,
  isReviewPerformanceAfterActivation,
  renderConfiguredWorkflowEmail,
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

test("review recipient evaluation suppresses historical, synthetic and already-reviewed bookings without requiring check-in", async () => {
  const source = await readFile(workflowPath, "utf8");
  assert.match(source, /\^\(qa\|test\|demo\)\[-_\]/i);
  assert.match(source, /reviewedBookingIds\.has\(booking\.id\)/);
  assert.match(source, /increment\(summary\.reasons, "already_reviewed"\)/);
  assert.match(source, /from\("guest_reviews"\)\.select\("booking_id"\)/);
  assert.match(source, /isReviewPerformanceAfterActivation\(showDateTime, activationDate\)/);
  assert.doesNotMatch(source, /new Date\(checkedInTicket\.updated_at\) < activationDate/);
  assert.doesNotMatch(source, /increment\(summary\.reasons, "not_checked_in"\)/);
  assert.doesNotMatch(source, /hasPersistedReviewAttendance/);
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

test("saved review workflow content renders identically for automated and manual recipients", async () => {
  const configuration = {
    ...defaultWorkflowConfigurations.find((item) => item.workflowKey === "post_show_review")!,
    body: "Dear {{customerName}},\n\nBooking {{bookingRef}} for {{showName}}.\n\n{{reviewUrl}}",
    subject: "Review {{showName}}",
  };
  const booking = {
    amount_paid: 3080,
    archived_at: null,
    balance_outstanding: 0,
    booking_reference: "ZNG-PARITY",
    booking_status: "confirmed",
    customer_id: "customer-1",
    guest_count: 2,
    id: "booking-1",
    payment_status: "fully_paid",
    section: "Private Booths",
    show_id: "show-1",
    table_id: null,
    total_amount: 3080,
  };
  const show = {
    date: "2026-10-03",
    id: "show-1",
    name: "The Royal Countess",
    status: "active",
    time: "17:00:00",
    venue: "johannesburg",
  };
  const automated = await renderConfiguredWorkflowEmail({
    booking,
    configuration,
    recipientName: "Booking Contact",
    reviewUrl: "https://book.zingara.co.za/review/automated-token",
    show,
  });
  const manual = await renderConfiguredWorkflowEmail({
    booking,
    configuration,
    recipientName: "Invited Attendee",
    reviewUrl: "https://book.zingara.co.za/review/manual-token",
    show,
  });

  assert.equal(automated.subject, manual.subject);
  assert.match(automated.message, /Dear Booking Contact/);
  assert.match(manual.message, /Dear Invited Attendee/);
  assert.match(automated.message, /automated-token/);
  assert.match(manual.message, /manual-token/);
  assert.doesNotMatch(automated.message, /\{\{\w+\}\}/);
  assert.doesNotMatch(manual.message, /\{\{\w+\}\}/);
  assert.match(automated.html, /data-zingara-customer-email="true"/);
  assert.match(manual.html, /data-zingara-customer-email="true"/);
  assert.deepEqual(automated.from, { address: "bookings@zingara.co.za", name: "Zingara" });
  assert.deepEqual(manual.from, automated.from);
});

test("workflow edits flow through the one shared review renderer", async () => {
  const configuration = defaultWorkflowConfigurations.find(
    (item) => item.workflowKey === "post_show_review",
  )!;
  const source = await readFile(workflowPath, "utf8");
  const route = await readFile(
    `${root}/src/app/api/admin/bookings/review-invitations/route.ts`,
    "utf8",
  );
  const previewRoute = await readFile(workflowRoutePath, "utf8");

  assert.ok(configuration.body.includes("{{reviewUrl}}"));
  assert.match(source, /renderConfiguredWorkflowEmail/);
  assert.match(route, /loadWorkflowConfigurations/);
  assert.match(route, /renderConfiguredWorkflowEmail/);
  assert.match(previewRoute, /renderConfiguredWorkflowEmail/);
  assert.doesNotMatch(route, /We'd love to hear about your Zingara experience/);
});
