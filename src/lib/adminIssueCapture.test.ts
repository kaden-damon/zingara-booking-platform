import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildQuickIssueDescription,
  createAdminOperationErrorContext,
  sanitizeAdminIssueTechnicalContext,
} from "./adminIssueCapture.ts";
import { buildStaffIssueNotificationContent } from "./staffIssueNotificationContent.ts";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("Admin failures retain useful booking context without retaining sensitive fields", () => {
  const context = createAdminOperationErrorContext({
    body: {
      bookingReference: "ZNG-ABC123",
      currentGuestCount: 4,
      customer: { email: "guest@example.com", name: "Private Guest" },
      newGuestCount: 6,
      paymentToken: "must-not-appear",
      venue: "Cape Town",
    },
    code: "TABLE_CAPACITY",
    message: "The selected table cannot accommodate this booking.",
    path: "/api/admin/bookings/guest-count",
    requestId: "req-safe-123",
    status: 409,
  });

  assert.equal(context.bookingReference, "ZNG-ABC123");
  assert.equal(context.guestCountBefore, 4);
  assert.equal(context.guestCountAfter, 6);
  assert.equal(context.venue, "Cape Town");
  assert.doesNotMatch(JSON.stringify(context), /guest@example|Private Guest|must-not/);
  assert.match(buildQuickIssueDescription(context), /from 4 to 6 guests/);
});

test("server sanitisation rejects arbitrary and malformed context", () => {
  const context = sanitizeAdminIssueTechnicalContext({
    bookingReference: "not-a-booking",
    browser: "Example Browser",
    errorMessage: "Save failed",
    password: "never retained",
    status: 500,
  });

  assert.deepEqual(context, {
    browser: "Example Browser",
    errorMessage: "Save failed",
    status: 500,
  });
});

test("issue email is concise and preserves available context in a copy-ready report", () => {
  const notification = buildStaffIssueNotificationContent({
    categoryLabel: "System / Technical",
    createdAt: "2026-11-05T10:00:00.000Z",
    description: "I tried to update a booking and the save failed.",
    id: "issue-id",
    location: "Johannesburg",
    moduleOrArea: "Bookings",
    priorityLabel: "High",
    reporterEmail: "staff@example.com",
    reporterName: "Staff Member",
    technicalContext: {
      applicationVersion: "commit-123",
      bookingReference: "ZNG-ABC123",
      errorCode: "SAVE_FAILED",
      errorMessage: "Table 313 could not be saved.",
      requestId: "req-123",
      status: 500,
    },
    ticketReference: "BUG-000123",
    title: "Admin save error",
  });

  assert.match(notification.message, /\nREPORT\n/);
  assert.doesNotMatch(notification.message, /CODEX-READY|Not captured/);
  assert.match(notification.message, /ZNG-ABC123/);
  assert.match(notification.message, /Table 313 could not be saved/);
  assert.match(notification.message, /commit-123/);
  assert.match(notification.message, /Nov 2026, 12:00 SAST/);
  assert.match(notification.html, /data-zingara-issue-report="true"/);
  assert.match(notification.html, /border-radius:14px/);
  assert.doesNotMatch(notification.html, /Not captured/);
  assert.match(notification.issueUrl, /issue=issue-id/);
});

test("quick reporter is lazy, event-driven, and reuses authenticated issue media", async () => {
  const [shell, panel, client, route, notification, emailTemplate] =
    await Promise.all([
      source("../app/admin/QuickIssueReporter.tsx"),
      source("../app/admin/QuickIssueReporterPanel.tsx"),
      source("./supabase/apiClient.ts"),
      source("../app/api/admin/issues/route.ts"),
      source("./staffIssueNotification.ts"),
      source("./email/customerEmail.ts"),
    ]);

  assert.match(shell, /dynamic\(\s*\(\) => import\("\.\/QuickIssueReporterPanel"\)/);
  assert.doesNotMatch(shell, /setInterval|MutationObserver|PerformanceObserver/);
  assert.match(client, /dispatchAdminOperationError/);
  assert.match(client, /!path\.startsWith\("\/api\/admin\/issues"\)/);
  assert.match(panel, /getDisplayMedia/);
  assert.match(panel, /uploadAndFinalizeStaffIssueMedia/);
  assert.match(route, /after\(async \(\) =>/);
  assert.match(route, /sanitizeAdminIssueTechnicalContext/);
  assert.match(notification, /claimStaffEmailDelivery/);
  assert.match(notification, /insertCommunicationPayload/);
  assert.match(notification, /createBrandedCustomerEmail/);
  assert.match(notification, /html: notification\.html/);
  assert.match(notification, /preserveTableReferences: true/);
  assert.match(emailTemplate, /preserveTableReferences\?: boolean/);
  assert.match(emailTemplate, /max-width:620px/);
  assert.match(emailTemplate, /Privacy Policy/);
});
