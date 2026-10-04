import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createBrandedCustomerEmail,
  createZingaraEmailCta,
} from "@/lib/email/customerEmail";
import { resolveInternalOperationalRecipients } from "@/lib/email/internalOperationalRecipients";
import { sendZingaraEmail } from "@/lib/email/smtp";

type ReminderRow = {
  booking_id: string;
  booking_reference: string;
  corporate_payment_deadline: string;
  created_by_staff_id: string;
  balance_outstanding: number;
  company_name: string | null;
  guest_count: number;
  guest_name: string;
  show_date: string;
  show_time: string;
  show_venue: string;
  seating_zone: string;
  staff_email: string;
  staff_name: string;
};

const productionAdminOrigin = "https://book.zingara.co.za";

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDeadline(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    currency: "ZAR",
    style: "currency",
  }).format(value);
}

function formatShow(row: ReminderRow) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(`${row.show_date}T${row.show_time}+02:00`));
}

function bookingUrl(reference: string) {
  return `${productionAdminOrigin}/admin?section=bookings&booking=${encodeURIComponent(reference)}`;
}

function buildReminderContent(staffName: string, rows: ReminderRow[]) {
  const items = rows.map((row) => {
    const guest = row.company_name?.trim() || row.guest_name || "Corporate guest";
    return [
      `${row.booking_reference} · ${guest}`,
      `${row.guest_count} guests · ${row.seating_zone} · ${row.show_venue} · ${formatShow(row)}`,
      `Outstanding: ${formatCurrency(Number(row.balance_outstanding ?? 0))}`,
      `Payment follow-up: ${formatDeadline(row.corporate_payment_deadline)}`,
      "Action: Follow up on payment. If EFT/POP has been received, record it in Zingara.",
      `Open booking: ${bookingUrl(row.booking_reference)}`,
    ].join("\n");
  });
  const message = [
    `Hello ${staffName || "Team"},`,
    "",
    `${rows.length} Corporate booking${rows.length === 1 ? " requires" : "s require"} payment follow-up.`,
    "",
    ...items.flatMap((item) => [item, ""]),
  ].join("\n").trim();
  const htmlItems = rows.map((row) => {
    const guest = row.company_name?.trim() || row.guest_name || "Corporate guest";
    return `<li style="margin:0 0 22px"><strong>${escapeHtml(row.booking_reference)} · ${escapeHtml(guest)}</strong><br>${escapeHtml(row.guest_count)} guests · ${escapeHtml(row.seating_zone)} · ${escapeHtml(row.show_venue)} · ${escapeHtml(formatShow(row))}<br>Outstanding: <strong>${escapeHtml(formatCurrency(Number(row.balance_outstanding ?? 0)))}</strong><br>Payment follow-up: <strong>${escapeHtml(formatDeadline(row.corporate_payment_deadline))}</strong><br><br>Follow up on payment or record payment in Zingara.<div style="margin-top:12px">${createZingaraEmailCta("OPEN BOOKING", bookingUrl(row.booking_reference))}</div></li>`;
  }).join("");

  return {
    html: `<p>${rows.length} Corporate booking${rows.length === 1 ? " requires" : "s require"} payment follow-up.</p><ol>${htmlItems}</ol>`,
    message,
  };
}

async function releaseReminderClaims(client: SupabaseClient, bookingIds: string[]) {
  if (!bookingIds.length) return;
  const { error } = await client
    .from("bookings")
    .update({ corporate_payment_reminder_claimed_at: null })
    .in("id", bookingIds)
    .is("corporate_payment_reminder_sent_at", null);
  if (error) throw error;
}

export async function runCorporatePaymentHolds(client: SupabaseClient) {
  const { data: claimedData, error: claimError } = await client.rpc(
    "claim_due_corporate_payment_reminders",
  );
  if (claimError) throw claimError;

  const claimed = (claimedData ?? []) as ReminderRow[];
  const claimedIds = claimed.map((row) => row.booking_id);
  let eligibleIds = new Set<string>();
  if (claimedIds.length) {
    const now = new Date().toISOString();
    const { data: eligibleRows, error: eligibilityError } = await client
      .from("bookings")
      .select("id")
      .in("id", claimedIds)
      .eq("booking_source", "corporate-direct")
      .eq("booking_origin", "corporate")
      .in("booking_status", ["new", "pending_payment"])
      .eq("payment_status", "pending_payment")
      .lte("amount_paid", 0)
      .gt("corporate_payment_deadline", now)
      .is("corporate_payment_expired_at", null)
      .is("corporate_payment_protected_at", null)
      .is("corporate_payment_reminder_sent_at", null);
    if (eligibilityError) throw eligibilityError;
    eligibleIds = new Set((eligibleRows ?? []).map((row) => row.id));
  }
  const eligible = claimed.filter((row) => eligibleIds.has(row.booking_id));
  await releaseReminderClaims(
    client,
    claimedIds.filter((id) => !eligibleIds.has(id)),
  );
  const groups = new Map<string, ReminderRow[]>();
  for (const row of eligible) {
    const key = `${row.created_by_staff_id}:${row.staff_email.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  let remindersSent = 0;
  for (const rows of groups.values()) {
    const staff = rows[0];
    const content = buildReminderContent(staff.staff_name, rows);
    const recipients = await resolveInternalOperationalRecipients(client, {
      to: staff.staff_email,
    });
    const branded = await createBrandedCustomerEmail({
      heading: "Corporate Payment Follow-up",
      html: content.html,
      includeAgePolicy: false,
      message: content.message,
      subject: `Zingara Corporate payment follow-up (${rows.length})`,
    });
    const result = await sendZingaraEmail({
      attachments: branded.attachments,
      cc: recipients.cc,
      html: branded.html,
      message: branded.message,
      subject: `Zingara Corporate payment follow-up (${rows.length})`,
      to: recipients.to,
    });
    const bookingIds = rows.map((row) => row.booking_id);

    if (!result.ok) {
      await releaseReminderClaims(client, bookingIds);
      continue;
    }

    const sentAt = new Date().toISOString();
    const { error: updateError } = await client
      .from("bookings")
      .update({ corporate_payment_reminder_sent_at: sentAt })
      .in("id", bookingIds)
      .is("corporate_payment_reminder_sent_at", null);
    if (updateError) throw updateError;

    const { error: auditError } = await client.from("audit_events").insert(
      rows.map((row) => ({
        action: "corporate.payment_deadline.reminder-sent",
        actor_location_scope: [],
        actor_name: "SYSTEM",
        after_values: { reminder_sent_at: sentAt },
        before_values: { reminder_sent_at: null },
        changed_fields: ["corporate_payment_reminder_sent_at"],
        entity_id: row.booking_id,
        entity_reference: row.booking_reference,
        entity_type: "booking",
        outcome: "success",
        reason: "Consolidated payment follow-up sent to the booking creator and configured management recipient.",
        source_area: "Corporate Bookings",
      })),
    );
    if (auditError) throw auditError;
    remindersSent += 1;
  }

  return {
    claimedReminders: eligible.length,
    corporateAutoExpiryEnabled: false,
    expired: 0,
    reminderEmailsSent: remindersSent,
  };
}
