import assert from "node:assert/strict";
import test from "node:test";
import { currentLatestReplyName, displayReply } from "./replyAttribution.ts";

const sent_at = "2026-11-11T12:00:00+00:00";
const current = { sent_at, staff: { full_name: "Charlie" } };

test("a matching sent reply uses the current profile for its badge", () => {
  assert.equal(currentLatestReplyName("Charlotte King", sent_at, current), "Charlie");
  assert.equal(currentLatestReplyName("Different Staff", "unmatched", current), "Different Staff");
  assert.equal(currentLatestReplyName("Recorded Staff", sent_at, { ...current, staff: null }), "Recorded Staff");
  assert.equal(currentLatestReplyName("Recorded Staff", sent_at, { ...current, staff: { full_name: " " } }), "Recorded Staff");
  assert.equal(currentLatestReplyName(null, sent_at), null);
  assert.equal(currentLatestReplyName("Recorded Staff", sent_at, { ...current, staff: [current.staff] }), "Charlie");
  assert.equal(currentLatestReplyName("Recorded Staff", sent_at, { ...current, staff: [current.staff, { full_name: "Other" }] }), "Recorded Staff");
});

test("reply display changes only attribution and does not mutate historical evidence", () => {
  const original = { ...current, actor_name: "Charlotte King", message: "Original signed reply — Charlotte King", id: "reply" };
  assert.deepEqual(displayReply(original), {
    id: "reply", sent_at, actor_name: "Charlie", message: original.message,
  });
  assert.equal(original.actor_name, "Charlotte King");
  assert.equal(displayReply({ ...original, staff: null }).actor_name, "Charlotte King");
});
