import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's built-in TypeScript test runner requires the extension.
import {
  countUniqueActiveStaff,
  platformPresenceActiveWindowMs,
  shouldSendPresenceHeartbeat,
} from "./platformPresence.ts";

test("presence remains active only while the visible tab has recent activity", () => {
  const now = 1_000_000;

  assert.equal(
    shouldSendPresenceHeartbeat({
      lastActivityAt: now - platformPresenceActiveWindowMs + 1,
      now,
      visible: true,
    }),
    true,
  );
  assert.equal(
    shouldSendPresenceHeartbeat({
      lastActivityAt: now - platformPresenceActiveWindowMs,
      now,
      visible: true,
    }),
    false,
  );
  assert.equal(
    shouldSendPresenceHeartbeat({
      lastActivityAt: now,
      now,
      visible: false,
    }),
    false,
  );
});

test("staff online counts unique authenticated staff profiles", () => {
  assert.equal(
    countUniqueActiveStaff([
      { session_type: "staff", staff_profile_id: "staff-1" },
      { session_type: "staff", staff_profile_id: "staff-1" },
      { session_type: "staff", staff_profile_id: "staff-2" },
      { session_type: "staff", staff_profile_id: null },
      { session_type: "public", staff_profile_id: null },
    ]),
    2,
  );
});
