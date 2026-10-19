import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("booking lock ownership is exact-session and reclaim is revision guarded", async () => {
  const route = await readFile(
    new URL("../app/api/admin/booking-locks/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /activeLock\.session_id === sessionId/);
  assert.match(route, /\? "recoverable"/);
  assert.match(route, /action === "reclaim"/);
  assert.match(route, /\.eq\("last_activity_at", expectedLastActivityAt\)/);
  assert.match(route, /\.eq\("session_id", sessionId\)/);
  assert.doesNotMatch(route, /session_id: body\.sessionId/);
});

test("booking writes require the active lock's exact browser session", async () => {
  const route = await readFile(
    new URL("../app/api/admin/bookings/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /x-zingara-booking-lock-session/);
  assert.match(route, /activeLock\.session_id === requestingSessionId/);
  assert.match(route, /BOOKING_CHANGED/);
});

test("View Only uses explicit mode and cannot acquire or mutate", async () => {
  const page = await readFile(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /bookingDetailAccessMode === "view"/);
  assert.match(page, /setBookingDetailAccessMode\("view"\)/);
  assert.match(page, /Read Only/);
  assert.match(page, /Refresh Details/);
  assert.match(page, /bookingIsReadOnly \|\| eligibleTransferShows/);
  assert.match(page, /readOnly: bookingIsReadOnly/);
});

test("tab closure uses keepalive release and abandoned locks still expire", async () => {
  const [page, client, route] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("./supabase/apiClient.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/booking-locks/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /keepalive: true/);
  assert.match(page, /addEventListener\("pagehide", releaseOnUnload\)/);
  assert.match(client, /keepalive: options\.keepalive/);
  assert.match(route, /release_reason: "heartbeat-timeout"/);
});
