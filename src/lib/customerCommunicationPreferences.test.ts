import assert from "node:assert/strict";
import test from "node:test";

import {
  canManageCustomerCommunicationState,
  canViewCustomerCommunicationState,
  getActiveOperationalSuppression,
  getOperationalPauseExpiry,
  getOperationalPauseReason,
  isOperationalSuppressionActive,
  normalizeMarketingConsentEvidence,
  resolveCustomerOperationalCommunication,
  shouldRespectCustomerOperationalPause,
  type CustomerCommunicationSuppression,
} from "./customerCommunicationPreferences.ts";

const now = new Date("2026-08-31T10:00:00.000Z");

function suppression(
  channel: "email" | "push",
  pausedUntil: string,
): CustomerCommunicationSuppression {
  return {
    channel,
    customerId: "customer-1",
    pausedAt: "2026-08-31T09:00:00.000Z",
    pausedByName: "Authorised Staff",
    pausedUntil,
    reason: "Updating booking details",
  };
}

test("pause durations produce deterministic short-lived expiries", () => {
  assert.equal(
    getOperationalPauseExpiry("1-hour", now),
    "2026-08-31T11:00:00.000Z",
  );
  assert.equal(
    getOperationalPauseExpiry("4-hours", now),
    "2026-08-31T14:00:00.000Z",
  );
  assert.equal(
    getOperationalPauseExpiry("24-hours", now),
    "2026-09-01T10:00:00.000Z",
  );
});

test("an active email pause does not block push", () => {
  const rows = [suppression("email", "2026-08-31T11:00:00.000Z")];

  assert.ok(getActiveOperationalSuppression(rows, "email", now));
  assert.equal(getActiveOperationalSuppression(rows, "push", now), null);
});

test("an active push pause does not block email", () => {
  const rows = [suppression("push", "2026-08-31T11:00:00.000Z")];

  assert.ok(getActiveOperationalSuppression(rows, "push", now));
  assert.equal(getActiveOperationalSuppression(rows, "email", now), null);
});

test("expired pauses resume eligibility without deleting subscriptions", () => {
  const row = suppression("push", "2026-08-31T09:59:59.000Z");

  assert.equal(isOperationalSuppressionActive(row, now), false);
  assert.equal(row.channel, "push");
});

test("Other requires its explicit note", () => {
  assert.equal(
    getOperationalPauseReason("Other", " Correcting guest identity "),
    "Correcting guest identity",
  );
  assert.equal(getOperationalPauseReason("Other", "  "), "");
});

test("marketing consent preserves unknown and never infers from contact data", () => {
  assert.equal(normalizeMarketingConsentEvidence(undefined), "unknown");
  assert.equal(normalizeMarketingConsentEvidence(""), "unknown");
  assert.equal(
    normalizeMarketingConsentEvidence("guest@example.com"),
    "unknown",
  );
  assert.equal(normalizeMarketingConsentEvidence("Subscribed"), "subscribed");
  assert.equal(
    normalizeMarketingConsentEvidence("Unsubscribed"),
    "not-subscribed",
  );
});

test("routine operational updates respect a pause", () => {
  assert.equal(shouldRespectCustomerOperationalPause("booking_update"), true);
  assert.equal(shouldRespectCustomerOperationalPause("custom_message"), true);
  assert.equal(shouldRespectCustomerOperationalPause("show_reminder"), true);
});

test("explicit or critical transactional sends use the documented bypass", () => {
  assert.equal(
    shouldRespectCustomerOperationalPause("payment_confirmation"),
    false,
  );
  assert.equal(shouldRespectCustomerOperationalPause("payment_link"), false);
  assert.equal(shouldRespectCustomerOperationalPause("ticket_resend"), false);
  assert.equal(
    shouldRespectCustomerOperationalPause("cancellation_notice"),
    false,
  );
});

test("CRM readers can view state but only communication managers can mutate", () => {
  assert.equal(canViewCustomerCommunicationState(["crm:read"]), true);
  assert.equal(canManageCustomerCommunicationState(["crm:read"]), false);
  assert.equal(
    canManageCustomerCommunicationState([
      "crm:read",
      "communications:manage",
    ]),
    true,
  );
  assert.equal(
    canManageCustomerCommunicationState(["communications:manage"]),
    false,
  );
});

test("the delivery policy blocks an active paused channel", () => {
  const result = resolveCustomerOperationalCommunication(
    [suppression("email", "2026-08-31T11:00:00.000Z")],
    { channel: "email", kind: "booking_update", now },
  );

  assert.equal(result.allowed, false);
  assert.equal(result.suppression?.pausedByName, "Authorised Staff");
});

test("critical sends bypass an otherwise active pause", () => {
  const result = resolveCustomerOperationalCommunication(
    [suppression("email", "2026-08-31T11:00:00.000Z")],
    { channel: "email", kind: "payment_confirmation", now },
  );

  assert.equal(result.allowed, true);
  assert.equal(result.suppression, null);
});
