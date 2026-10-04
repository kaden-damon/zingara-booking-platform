import assert from "node:assert/strict";
import test from "node:test";

import { getAdminHomeCopy, getAdminNavigation } from "./adminNavigation.ts";

const noAccess = {
  canManageCommunications: false,
  canManageSettings: false,
  canManageWaitlist: false,
  canViewAnalytics: false,
  canViewBookingManagement: false,
  canViewCrm: false,
  canViewOperationsWorkspace: false,
};

test("daily navigation is derived from existing access without granting capabilities", () => {
  const navigation = getAdminNavigation({
    ...noAccess,
    canManageCommunications: true,
    canManageWaitlist: true,
    canViewBookingManagement: true,
    canViewCrm: true,
  });

  assert.deepEqual(
    navigation.primary.map((item) => item.label),
    ["Home", "Bookings", "Floor & Arrivals", "Customers"],
  );
  assert.deepEqual(
    navigation.more.map((item) => item.label),
    ["Reviews", "System", "Academy"],
  );
});

test("Finance sees reports without irrelevant booking or Floor destinations", () => {
  const navigation = getAdminNavigation({ ...noAccess, canViewAnalytics: true });

  assert.deepEqual(
    navigation.primary.map((item) => item.label),
    ["Home", "Reports"],
  );
  assert.deepEqual(
    navigation.more.map((item) => item.label),
    ["System", "Academy"],
  );
});

test("Floor staff retain booking lookup and Floor while CRM and reports stay hidden", () => {
  const navigation = getAdminNavigation({
    ...noAccess,
    canViewBookingManagement: true,
    canViewOperationsWorkspace: true,
  });

  assert.deepEqual(
    navigation.primary.map((item) => item.label),
    ["Home", "Bookings", "Floor & Arrivals"],
  );
});

test("Management retains daily work, CRM, reports and relevant More destinations", () => {
  const navigation = getAdminNavigation({
    ...noAccess,
    canManageCommunications: true,
    canManageWaitlist: true,
    canViewAnalytics: true,
    canViewBookingManagement: true,
    canViewCrm: true,
    canViewOperationsWorkspace: true,
  });

  assert.deepEqual(
    navigation.primary.map((item) => item.label),
    ["Home", "Bookings", "Floor & Arrivals", "Customers", "Reports"],
  );
  assert.equal(navigation.more.some((item) => item.label === "Reviews"), true);
  assert.equal(navigation.more.some((item) => item.label === "Settings"), false);
});

test("Super Admin retains every shell destination", () => {
  const navigation = getAdminNavigation({
    canManageCommunications: true,
    canManageSettings: true,
    canManageWaitlist: true,
    canViewAnalytics: true,
    canViewBookingManagement: true,
    canViewCrm: true,
    canViewOperationsWorkspace: true,
  });

  assert.deepEqual(
    [...navigation.primary, ...navigation.more].map((item) => item.id),
    [
      "overview",
      "bookings",
      "operations",
      "customers",
      "analytics",
      "reviews",
      "settings",
      "platform-operations",
      "academy",
    ],
  );
});

test("Home guidance follows existing role responsibilities", () => {
  assert.match(getAdminHomeCopy("box-office"), /Bookings, payments/);
  assert.match(getAdminHomeCopy("floor-manager"), /Arrivals, check-in/);
  assert.match(getAdminHomeCopy("finance"), /Payments, outstanding/);
});
