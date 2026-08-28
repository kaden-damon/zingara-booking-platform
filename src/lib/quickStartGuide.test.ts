import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's built-in TypeScript test runner requires the extension.
import {
  getDefaultOpenQuickStartSections,
  getQuickStartSectionIds,
} from "./quickStartGuide.ts";

test("Super Admin receives broad guidance ordered for management", () => {
  const sections = getQuickStartSectionIds({
    canProcessRefund: true,
    permissions: [
      "analytics:read",
      "bookings:manage",
      "communications:manage",
      "crm:read",
      "settings:manage",
      "tables:manage",
      "tickets:validate",
      "waitlist:manage",
    ],
    role: "super-admin",
  });

  assert.deepEqual(sections.slice(0, 4), [
    "analytics",
    "bookings",
    "corporate",
    "customers",
  ]);
  assert.ok(sections.includes("refunds"));
  assert.ok(sections.includes("floor"));
});

test("Box Office guidance follows permissions and excludes System guidance", () => {
  const sections = getQuickStartSectionIds({
    canProcessRefund: false,
    permissions: [
      "bookings:manage",
      "communications:manage",
      "tickets:validate",
      "waitlist:manage",
    ],
    role: "box-office-staff",
  });

  assert.deepEqual(sections.slice(0, 3), [
    "bookings",
    "corporate",
    "tickets",
  ]);
  assert.ok(sections.includes("refunds"));
  assert.ok(!sections.includes("floor"));
  assert.ok(!sections.includes("analytics"));
});

test("Finance guidance prioritises payments and shows restricted refunds", () => {
  const sections = getQuickStartSectionIds({
    canProcessRefund: false,
    permissions: ["analytics:read"],
    role: "finance",
  });

  assert.deepEqual(sections.slice(0, 4), [
    "payments",
    "refunds",
    "table-plan",
    "analytics",
  ]);
  assert.ok(!sections.includes("payment-controls"));
});

test("Refund authority never grants unrelated guide access", () => {
  const sections = getQuickStartSectionIds({
    canProcessRefund: true,
    permissions: ["analytics:read"],
    role: "finance",
  });

  assert.ok(sections.includes("refunds"));
  assert.ok(!sections.includes("bookings"));
  assert.ok(!sections.includes("floor"));
});

test("Door staff receive a short ticket-first guide", () => {
  const sections = getQuickStartSectionIds({
    canProcessRefund: false,
    permissions: ["tickets:validate"],
    role: "concierge",
  });

  assert.deepEqual(sections, ["tickets", "help"]);
});

test("Floor guidance is permission-driven and does not imply cross-zone automation", () => {
  const sections = getQuickStartSectionIds({
    canProcessRefund: false,
    permissions: ["tables:manage", "tickets:validate"],
    role: "floor-manager",
  });

  assert.deepEqual(sections, ["floor", "zone-full", "tickets", "help"]);
});

test("Only the three highest-priority available cards open by default", () => {
  assert.deepEqual(
    [...getDefaultOpenQuickStartSections(["tickets", "bookings", "help"])],
    ["tickets", "bookings", "help"],
  );
});
