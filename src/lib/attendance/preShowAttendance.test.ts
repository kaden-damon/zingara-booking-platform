import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildAttendanceUrl,
  createAttendanceToken,
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

test("pre-show email adds secure yes and no actions without changing the reminder schedule", async () => {
  const workflow = await readFile(`${root}/src/lib/workflows/automatedWorkflows.ts`, "utf8");
  const email = await readFile(`${root}/src/lib/email/customerEmail.ts`, "utf8");
  assert.match(workflow, /YES — I'LL BE THERE/);
  assert.match(workflow, /NO — I CAN'T MAKE IT/);
  assert.match(workflow, /getOrCreateAttendanceLinks/);
  assert.match(email, /input\.actions/);
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

test("decline notifications use the atomic response version for idempotency", async () => {
  const route = await readFile(`${root}/src/app/api/attendance/[token]/route.ts`, "utf8");
  assert.match(route, /body\.response === "declined"/);
  assert.match(route, /attendance-declined-\$\{result\.booking_id\}-\$\{result\.response_version\}/);
  assert.doesNotMatch(route, /after\(async/);
});
