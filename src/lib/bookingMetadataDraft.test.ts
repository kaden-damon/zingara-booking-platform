import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createBookingMetadataDraft,
  getDietaryRequirementsProjection,
  isBookingMetadataDraftDirty,
} from "./bookingMetadataDraft.ts";

const pagePath = new URL("../app/admin/page.tsx", import.meta.url);
const editorPath = new URL(
  "../app/admin/BookingMetadataDraftEditor.tsx",
  import.meta.url,
);
const routePath = new URL(
  "../app/api/admin/bookings/route.ts",
  import.meta.url,
);

test("booking notes initialise as an unchanged local draft", () => {
  const baseline = createBookingMetadataDraft("Dietary: Vegetarian\nBirthday");
  const draft = createBookingMetadataDraft("Dietary: Vegetarian\nBirthday");

  assert.equal(isBookingMetadataDraftDirty(draft, baseline), false);
});

test("multiline local edits become dirty without normalisation", () => {
  const baseline = createBookingMetadataDraft("First line");
  const draft = createBookingMetadataDraft("First line\nSecond line\n");

  assert.equal(isBookingMetadataDraftDirty(draft, baseline), true);
  assert.equal(draft.operationalNotes, "First line\nSecond line\n");
});

test("dietary projection remains compatible with persisted booking metadata", () => {
  assert.equal(
    getDietaryRequirementsProjection("Internal note\nDietary: Strict Halaal"),
    "Strict Halaal",
  );
  assert.equal(getDietaryRequirementsProjection("Internal note"), null);
});

test("typing is isolated inside the editor and does not invoke persistence", async () => {
  const editor = await readFile(editorPath, "utf8");
  const changeHandler = editor.match(
    /onChange=\{\(event\) => \{([\s\S]*?)\n\s*\}\}/,
  )?.[1];

  assert.match(changeHandler ?? "", /setDraft/);
  assert.doesNotMatch(changeHandler ?? "", /saveBookingMetadata|fetch|saveBookings/);
});

test("Save Changes performs one narrow metadata request and guards duplicate clicks", async () => {
  const editor = await readFile(editorPath, "utf8");

  assert.equal(editor.match(/await saveBookingMetadata\(/g)?.length, 1);
  assert.match(editor, /inFlightRef\.current/);
  assert.match(editor, /Save Changes/);
  assert.match(editor, /Saving\.\.\./);
  assert.match(editor, /Saved ✓/);
});

test("failed saves preserve the draft and surface the server error", async () => {
  const editor = await readFile(editorPath, "utf8");
  const catchBlock = editor.match(/catch \(saveError\) \{([\s\S]*?)\n\s*\} finally/)?.[1];

  assert.match(catchBlock ?? "", /setError/);
  assert.doesNotMatch(catchBlock ?? "", /setDraft|setBaseline/);
});

test("page no longer routes booking notes keystrokes through root saveBookings", async () => {
  const page = await readFile(pagePath, "utf8");

  assert.doesNotMatch(page, /function updateBookingOperationalField/);
  assert.match(page, /<BookingMetadataDraftEditor/);
});

test("cancellation and refund evidence remain outside generic metadata editing", async () => {
  const page = await readFile(pagePath, "utf8");

  assert.match(page, /booking\.cancellationReason \|\| "Not recorded"/);
  assert.match(page, /booking\.refundNotes \|\| "Not recorded"/);
  assert.doesNotMatch(
    page,
    /value=\{booking\.(?:cancellationReason|refundNotes)/,
  );
});

test("dirty close and booking navigation require an explicit discard decision", async () => {
  const page = await readFile(pagePath, "utf8");

  assert.match(page, /dirtyBookingMetadataReference === expandedBookingReference/);
  assert.match(page, /Unsaved Changes/);
  assert.match(page, /Discard Changes/);
  assert.match(page, /Keep Editing/);
  assert.match(page, /pendingBookingDetailsReference/);
});

test("metadata route enforces auth, permission, venue scope, lock and stale revision", async () => {
  const route = await readFile(routePath, "utf8");

  assert.match(route, /async function persistBookingMetadataUpdate/);
  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /includes\("bookings:manage"\)/);
  assert.match(route, /outside your assigned location/);
  assert.match(route, /ensureNoConflictingBookingLock/);
  assert.match(route, /\.eq\("updated_at", previousUpdatedAt\)/);
  assert.match(route, /Your draft is preserved/);
});

test("metadata save writes only notes projections and one immutable audit event", async () => {
  const route = await readFile(routePath, "utf8");
  const handler = route.match(
    /async function persistBookingMetadataUpdate([\s\S]*?)\nasync function setBookingArchiveState/,
  )?.[1] ?? "";
  const updatePayload = handler.match(/\.update\(\{([\s\S]*?)\n\s*\}\)/)?.[1] ?? "";

  assert.match(updatePayload, /dietary_requirements/);
  assert.match(updatePayload, /notes: nextNotes/);
  assert.match(updatePayload, /updated_at: nextUpdatedAt/);
  assert.doesNotMatch(updatePayload, /amount_paid|booking_status|customer_id|guest_count|payment_status|table_id|total_amount/);
  assert.equal(handler.match(/action: "booking\.metadata-edit"/g)?.length, 1);
  assert.doesNotMatch(handler, /communication|notifyAppleWallet|payment/);
});
