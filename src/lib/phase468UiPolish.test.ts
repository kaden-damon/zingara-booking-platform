import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isShowPubliclyBookable,
  isShowPubliclyVisible,
  isShowStaffBookable,
} from "./publicShowSales.ts";

const adminPageUrl = new URL("../app/admin/page.tsx", import.meta.url);
const bookingPageUrl = new URL("../app/book/page.tsx", import.meta.url);

test("Home Widget Canvas uses the shared disclosure without persisting disclosure state", async () => {
  const adminPage = await readFile(adminPageUrl, "utf8");

  assert.match(
    adminPage,
    /<AdminCollapsibleSection[\s\S]*summary="Customise your Home dashboard widgets\."[\s\S]*title="Widget Canvas"/,
  );
  assert.doesNotMatch(
    adminPage,
    /title="Widget Canvas"[\s\S]{0,300}defaultOpen/,
  );
  assert.match(adminPage, /persistDashboardLayout\(\{ order: nextOrder \}\)/);
  assert.match(adminPage, /persistDashboardLayout\(\{ hidden: nextHidden \}\)/);
  assert.match(adminPage, /persistDashboardLayout\(\{ minimized: nextMinimized \}\)/);
  assert.match(adminPage, /Reset Dashboard Layout/);
});

test("staff account popover is viewport-safe on mobile and right-aligned from tablet", async () => {
  const adminPage = await readFile(adminPageUrl, "utf8");

  assert.match(
    adminPage,
    /absolute left-0 top-\[calc\(100%\+0\.5rem\)\][\s\S]*w-\[min\(18rem,calc\(100vw-2rem\)\)\][\s\S]*sm:left-auto sm:right-0/,
  );
  assert.match(adminPage, /staffAccountMenuRef\.current\.open = false/);
  assert.match(adminPage, /Location: \{getStaffVenueScopeLabel/);
  assert.match(adminPage, />\s*Sign Out\s*</);
});

test("Special Event is visible in purple but remains unavailable to public booking", async () => {
  const bookingPage = await readFile(bookingPageUrl, "utf8");

  assert.equal(isShowPubliclyVisible("special_event"), true);
  assert.equal(isShowPubliclyBookable("special_event"), false);
  assert.equal(isShowStaffBookable("special_event"), true);
  assert.match(
    bookingPage,
    /"special-event":\s*\n\s*"border-purple-300\/45 bg-purple-950\/30 text-purple-100/,
  );
  assert.match(
    bookingPage,
    /status === "special-event"[\s\S]*\? "bg-purple-300"/,
  );
  assert.match(bookingPage, /disabled=\{!isAvailableDate\}/);
  assert.match(bookingPage, /isShowPubliclyBookable\(status\)/);
});
