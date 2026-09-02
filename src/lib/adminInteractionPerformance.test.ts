import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("high-volume Admin searches keep keystrokes inside an isolated input", async () => {
  const [page, input] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/admin/AdminSearchInput.tsx"),
  ]);

  for (const search of [
    "bookingSearch",
    "corporateSearch",
    "customerSearch",
    "manifestSearch",
    "showSearch",
    "staffSearch",
    "waitlistSearch",
  ]) {
    assert.match(
      page,
      new RegExp(`<AdminSearchInput[\\s\\S]{0,180}value=\\{${search}\\}`),
    );
  }

  assert.match(input, /const \[draft, setDraft\] = useState\(value\)/);
  assert.match(input, /window\.setTimeout/);
  assert.doesNotMatch(input, /fetch\(|localStorage|sessionStorage|supabase/i);
});

test("System activity search is delayed before its server refresh dependency changes", async () => {
  const page = await source("../app/admin/page.tsx");

  assert.match(
    page,
    /<AdminSearchInput[\s\S]{0,180}value=\{platformOperationsBookingSearch\}[\s\S]{0,180}onSearchChange=\{setPlatformOperationsBookingSearch\}/,
  );
});

test("CRM profile aggregation is memoized away from unrelated input updates", async () => {
  const page = await source("../app/admin/page.tsx");

  const start = page.indexOf("const customerProfiles = useMemo");
  const end = page.indexOf(
    "[bookings, customerCrmRecords, liveCustomerRecords, waitlist]",
    start,
  );

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.match(page.slice(start, end), /bookings\.reduce/);
});

test("booking filtering is memoized across unrelated form draft updates", async () => {
  const page = await source("../app/admin/page.tsx");

  assert.match(page, /const filteredBookings = useMemo\(/);
  assert.match(page, /bookingSearch,[\s\S]{0,300}bookings,[\s\S]{0,180}shows,/);
});

test("Booking Details reconciliation drafts no longer update the Admin root per key", async () => {
  const [page, modal] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/admin/BookingReconciliationModal.tsx"),
  ]);

  assert.match(modal, /const \[draft, setDraft\] = useState/);
  assert.match(modal, /onClick=\{\(\) => props\.onSave\(draft\)\}/);
  assert.doesNotMatch(page, /onAmountPaidChange=/);
  assert.doesNotMatch(page, /onGuestCountChange=/);
});

test("Customer Details editing owns its draft below the Admin root", async () => {
  const [page, editor] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/admin/CustomerIdentityEditor.tsx"),
  ]);

  assert.match(page, /<CustomerIdentityEditor/);
  assert.match(editor, /const \[draft, setDraft\] = useState\(initialValue\)/);
  assert.match(editor, /onClick=\{\(\) => onSave\(draft\)\}/);
  assert.doesNotMatch(editor, /fetch\(|localStorage|sessionStorage|supabase/i);
});
