import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildAttendanceUrl,
  createAttendanceToken,
  getAttendancePreviewLinks,
  hashAttendanceToken,
  openAttendanceToken,
  sealAttendanceToken,
} from "./attendanceTokens.ts";

const root = process.cwd();

test("attendance tokens are opaque, encrypted and booking-link safe", () => {
  const token = createAttendanceToken();
  const envelope = sealAttendanceToken(token, "test-secret");
  assert.match(token, /^[A-Za-z0-9_-]{40,100}$/);
  assert.equal(openAttendanceToken(envelope, "test-secret"), token);
  assert.notEqual(openAttendanceToken(envelope, "wrong-secret"), token);
  assert.equal(hashAttendanceToken(token).length, 64);
  assert.equal(
    buildAttendanceUrl("https://book.zingara.co.za/", token, "declined"),
    `https://book.zingara.co.za/attendance/${token}?response=declined`,
  );
});

test("preview attendance links are isolated from booking-specific tokens", () => {
  const links = getAttendancePreviewLinks("https://book.zingara.co.za/");
  assert.match(links.confirmedUrl, /attendance\/zingara-pre-show-attendance-template-preview-2026\?response=confirmed$/);
  assert.match(links.declinedUrl, /attendance\/zingara-pre-show-attendance-template-preview-2026\?response=declined$/);
});

test("pre-show email adds secure yes and no actions without changing the reminder schedule", async () => {
  const workflow = await readFile(`${root}/src/lib/workflows/automatedWorkflows.ts`, "utf8");
  const email = await readFile(`${root}/src/lib/email/customerEmail.ts`, "utf8");
  assert.match(workflow, /YES - ATTENDING/);
  assert.match(workflow, /NO - NOT ATTENDING/);
  assert.doesNotMatch(workflow, /YES — I'LL BE THERE|NO — I CAN'T MAKE IT/);
  assert.match(workflow, /getOrCreateAttendanceLinks/);
  assert.match(email, /input\.actions/);
  assert.match(email, /actionsAfterIntro/);
  assert.match(email, /stackActions/);
  assert.match(workflow, /preShowReminderLeadMs = 24 \* 60 \* 60 \* 1000/);
});

test("response persistence is isolated from booking, seating, payment and ticket state", async () => {
  const migration = await readFile(`${root}/supabase/migrations/20261105193000_pre_show_attendance_confirmations.sql`, "utf8");
  assert.match(migration, /for update/);
  assert.match(migration, /attendance_response_version = attendance_response_version \+ 1/);
  assert.match(migration, /booking_attendance_response_recorded/);
  assert.doesNotMatch(migration, /update public\.(payments|tickets|show_tables|shows)/);
  assert.doesNotMatch(migration, /booking_status\s*=/);
});

test("decline notifications are asynchronous, routed and idempotent", async () => {
  const [route, notification, migration] = await Promise.all([
    readFile(`${root}/src/app/api/attendance/[token]/route.ts`, "utf8"),
    readFile(`${root}/src/lib/email/attendanceDeclineNotification.ts`, "utf8"),
    readFile(`${root}/supabase/migrations/20261106001500_attendance_management_integration.sql`, "utf8"),
  ]);
  assert.match(route, /body\.response === "declined"/);
  assert.match(route, /after\(async/);
  assert.match(notification, /loadManagementEmailRoute[\s\S]*"attendance-confirmations"/);
  assert.match(notification, /eventKey: `\$\{input\.bookingId\}:\$\{input\.responseVersion\}`/);
  assert.match(notification, /recipientStaffProfileIds: recipientIds/);
  assert.match(notification, /attendance-declined-\$\{input\.bookingId\}-\$\{input\.responseVersion\}/);
  assert.match(migration, /attendance-confirmations/);
  assert.match(migration, /bookings_attendance_response_idx/);
  assert.doesNotMatch(migration, /kaden@|fatima@|venue-manager|super-admin/i);
});

test("attendance management is presentation-only and keeps arrival separate", async () => {
  const page = await readFile(`${root}/src/app/admin/page.tsx`, "utf8");
  const migration = await readFile(`${root}/supabase/migrations/20261106001500_attendance_management_integration.sql`, "utf8");
  assert.match(page, /Attendance · Awaiting Response/);
  assert.match(page, /Attendance: \{getAttendanceResponseLabel\(booking\)\}/);
  assert.match(page, /setConciergeAttendanceFilter/);
  assert.match(migration, /i\.attendance = 'awaiting' and b\.attendance_response is null/);
  assert.doesNotMatch(migration, /arrival_time\s*=|update public\.bookings\s+set/);
});

test("preview responses never call the attendance RPC or staff notifications", async () => {
  const route = await readFile(`${root}/src/app/api/attendance/[token]/route.ts`, "utf8");
  const previewGuard = route.indexOf("token === attendancePreviewToken");
  const attendanceRpc = route.indexOf("record_booking_attendance_response");
  assert.ok(previewGuard > 0 && attendanceRpc > previewGuard);
  assert.match(route, /preview: true/);
});
