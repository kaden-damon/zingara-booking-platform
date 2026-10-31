import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const admin = readFileSync(
  new URL("../app/admin/page.tsx", import.meta.url),
  "utf8",
);
const navigation = readFileSync(
  new URL("./adminNavigation.ts", import.meta.url),
  "utf8",
);
const historyRoute = readFileSync(
  new URL("../app/api/admin/communications/route.ts", import.meta.url),
  "utf8",
);
const historyPanel = readFileSync(
  new URL("../app/admin/CommunicationHistoryPanel.tsx", import.meta.url),
  "utf8",
);

test("Communications is a dedicated five-tab workspace", () => {
  assert.match(navigation, /id: "communications", label: "Communications"/);
  for (const label of [
    "Overview",
    "Guest Emails",
    "Staff Emails",
    "Broadcasts",
    "History",
  ]) {
    assert.match(admin, new RegExp(`label: "${label}"`));
  }
  assert.match(admin, /activeAdminTab === "communications"/);
});

test("Communications no longer requires complete booking or history hydration", () => {
  const populationGate = admin.slice(
    admin.indexOf("const requiresCompleteBookingPopulation"),
    admin.indexOf("useEffect(() => {", admin.indexOf("const requiresCompleteBookingPopulation") + 50),
  );
  assert.doesNotMatch(populationGate, /communications|workflows/);
  assert.match(admin, /showId: authoritativeWorkflowShowId/);
  assert.match(admin, /activeCommunicationsTab === "guest-emails"/);
});

test("Communication history uses bounded authoritative server pages", () => {
  assert.match(historyRoute, /pageSize.*"10"/s);
  assert.match(historyRoute, /\.range\(from, from \+ pageSize - 1\)/);
  assert.match(historyRoute, /communications:manage/);
  assert.match(historyRoute, /outside your venue access/);
  assert.match(historyPanel, /pageSize: "10"/);
  assert.match(historyPanel, /Page \{page\} of \{totalPages\}/);
});

test("Staff and guest settings mount only in their selected tabs", () => {
  assert.match(admin, /activeCommunicationsTab === "staff-emails"/);
  assert.match(admin, /<EmailNotificationsSettings \/>/);
  assert.match(admin, /activeCommunicationsTab === "guest-emails"/);
  assert.match(admin, /activeCommunicationsTab === "broadcasts"/);
});
