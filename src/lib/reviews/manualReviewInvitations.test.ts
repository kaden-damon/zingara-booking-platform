import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getManualReviewEligibilityReason,
  manualReviewInvitationLimitPerHour,
  normalizeReviewRecipientEmail,
  validateManualReviewRecipient,
} from "./manualReviewInvitations.ts";

const root = process.cwd();

const completedBooking = {
  archivedAt: null,
  bookingReference: "ZNG-CORP40",
  bookingStatus: "confirmed",
  paymentStatus: "fully_paid",
  showDate: "2026-10-01",
  showTime: "17:00:00",
};

test("manual recipients require a safe name and email only for email sends", () => {
  assert.deepEqual(normalizeReviewRecipientEmail("  SARAH@EXAMPLE.COM "), "sarah@example.com");
  assert.equal("error" in validateManualReviewRecipient({ action: "send_email", name: "Sarah", email: "" }), true);
  assert.equal("error" in validateManualReviewRecipient({ action: "send_email", name: "S", email: "sarah@example.com" }), true);

  const email = validateManualReviewRecipient({
    action: "send_email",
    email: "  SARAH@EXAMPLE.COM ",
    name: " Sarah Marie Molefe ",
  });
  assert.deepEqual("value" in email ? email.value : null, {
    email: "sarah@example.com",
    name: "Sarah Marie Molefe",
    publicDisplayName: "Sarah M.",
  });

  const link = validateManualReviewRecipient({ action: "create_link", name: "John Peter" });
  assert.deepEqual("value" in link ? link.value : null, {
    email: null,
    name: "John Peter",
    publicDisplayName: "John P.",
  });
});

test("manual invitations require a legitimate completed booking without requiring attendee check-in", () => {
  const now = new Date("2026-10-04T12:00:00+02:00");
  assert.equal(getManualReviewEligibilityReason(completedBooking, now), null);
  assert.equal(
    getManualReviewEligibilityReason({ ...completedBooking, showDate: "2026-10-05" }, now),
    "show_not_completed",
  );
  assert.equal(
    getManualReviewEligibilityReason({ ...completedBooking, bookingStatus: "cancelled" }, now),
    "cancelled",
  );
  assert.equal(
    getManualReviewEligibilityReason({ ...completedBooking, paymentStatus: "refunded" }, now),
    "refunded",
  );
  assert.equal(
    getManualReviewEligibilityReason({ ...completedBooking, bookingReference: "TEST-40" }, now),
    "synthetic_booking",
  );
});

test("manual invitation limits remain bounded", () => {
  assert.equal(manualReviewInvitationLimitPerHour, 12);
});

test("manual invitation route reuses security, branded mail and communication evidence", async () => {
  const route = await readFile(`${root}/src/app/api/admin/bookings/review-invitations/route.ts`, "utf8");
  assert.match(route, /bookings:manage/);
  assert.match(route, /communications:manage/);
  assert.match(route, /hasVenueAccess/);
  assert.match(route, /checkRateLimit/);
  assert.match(route, /loadWorkflowConfigurations/);
  assert.match(route, /renderConfiguredWorkflowEmail/);
  assert.match(route, /workflowKey === "post_show_review"/);
  assert.match(route, /sender: "review"/);
  assert.match(route, /insertCommunicationPayload/);
  assert.match(route, /post_show_review_manual/);
  assert.match(route, /manual_email/);
  assert.match(route, /manual_link/);
  assert.match(route, /REVIEW_ALREADY_SENT/);
  assert.match(route, /REVIEW_ALREADY_SUBMITTED/);
  assert.match(route, /recordInvitationEvent/);
  assert.doesNotMatch(route, /metadata:\s*\{[^}]*token/i);
  assert.doesNotMatch(route, /createManualReviewEmailContent/);
});

test("manual review sends have an authoritative communication type", async () => {
  const sql = await readFile(
    `${root}/supabase/migrations/20261004225000_phase_43_5a_manual_review_communication_type.sql`,
    "utf8",
  );
  assert.match(sql, /alter type public\.communication_type/);
  assert.match(sql, /add value if not exists 'post_show_review_manual'/);
});

test("manual invitation migration changes review grain without weakening verified attendance", async () => {
  const sql = await readFile(`${root}/supabase/migrations/20261004210000_phase_43_5_manual_review_invitations.sql`, "utf8");
  assert.match(sql, /drop constraint if exists review_invitations_booking_id_key/);
  assert.match(sql, /drop constraint if exists guest_reviews_booking_id_key/);
  assert.match(sql, /where invitation_type = 'automated_verified'/);
  assert.match(sql, /booking_id, normalized_email/);
  assert.match(sql, /review_invitation_events/);
  assert.match(sql, /v_verified := v_invitation\.invitation_type = 'automated_verified'/);
  assert.match(sql, /v_verified and not exists[\s\S]*ticket_status::text = 'checked_in'/);
  assert.match(sql, /v_review\.verified_guest/);
  assert.doesNotMatch(sql, /delete from public\.(review_invitations|guest_reviews)/i);
});

test("manual invitation revocation is atomic, idempotent and preserves history", async () => {
  const sql = await readFile(
    `${root}/supabase/migrations/20261004223000_phase_43_5a_review_invitation_revocation.sql`,
    "utf8",
  );
  assert.match(sql, /revoke_manual_review_invitation_atomic/);
  assert.match(sql, /for update/);
  assert.match(sql, /REVIEW_INVITATION_STALE_REVISION/);
  assert.match(sql, /REVIEW_INVITATION_ALREADY_SUBMITTED/);
  assert.match(sql, /if v_invitation\.status = 'revoked'[\s\S]*'idempotent', true/);
  assert.match(sql, /status = 'revoked'/);
  assert.match(sql, /revoked_at = v_now/);
  assert.match(sql, /revision = revision \+ 1/);
  assert.match(sql, /manual_review_invitation_revoked/);
  assert.match(sql, /status in \('active', 'submitted'\)/);
  assert.doesNotMatch(sql, /delete from public\.review_invitations/i);
  assert.doesNotMatch(sql, /token_hash.*metadata|token_envelope.*metadata/i);
});

test("revocation API remains booking, permission and venue scoped", async () => {
  const route = await readFile(
    `${root}/src/app/api/admin/bookings/review-invitations/route.ts`,
    "utf8",
  );
  assert.match(route, /action\?: "copy_existing" \| "create_link" \| "revoke" \| "send_email"/);
  assert.match(route, /revoke_manual_review_invitation_atomic/);
  assert.match(route, /p_booking_id: context\.booking\.id/);
  assert.match(route, /p_expected_revision: body\.revision/);
  assert.match(route, /REVIEW_INVITATION_ALREADY_SUBMITTED/);
  assert.match(route, /REVIEW_INVITATION_STALE_REVISION/);
  assert.match(route, /manual_review_invitation_revoked/);
  assert.match(route, /permissions\.includes\("bookings:manage"\)/);
  assert.match(route, /permissions\.includes\("communications:manage"\)/);
  assert.match(route, /hasVenueAccess/);
  assert.match(route, /\.in\("status", \["active", "submitted"\]\)/);
  assert.doesNotMatch(route, /delete\(\).*review_invitations|from\("review_invitations"\)\.delete/s);
});

test("Booking Details exposes compact revoke controls without review deletion", async () => {
  const panel = await readFile(`${root}/src/app/admin/BookingReviewInvitations.tsx`, "utf8");
  assert.match(panel, />\s*Revoke\s*</);
  assert.match(panel, /action: "revoke"/);
  assert.match(panel, /revision: invitation\.revision/);
  assert.match(panel, /Review invitation revoked/);
  assert.doesNotMatch(panel, /delete review|remove review/i);
});
