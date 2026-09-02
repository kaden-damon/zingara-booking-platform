import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyAppleWalletBooking } from "@/lib/appleWalletSync";
import { sendZingaraEmail } from "@/lib/email/smtp";

type ReminderRow = {
  booking_id: string;
  booking_reference: string;
  corporate_payment_deadline: string;
  created_by_staff_id: string;
  guest_name: string;
  show_date: string;
  staff_email: string;
  staff_name: string;
};

function formatDeadline(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

export async function runCorporatePaymentHolds(client: SupabaseClient) {
  const { data: expiredRows, error: expiredQueryError } = await client
    .from("bookings")
    .select("id,booking_reference")
    .not("corporate_payment_deadline", "is", null)
    .lte("corporate_payment_deadline", new Date().toISOString())
    .is("corporate_payment_expired_at", null)
    .lte("amount_paid", 0)
    .in("booking_status", ["new", "pending_payment"])
    .limit(500);

  if (expiredQueryError) throw expiredQueryError;

  let expired = 0;
  for (const booking of expiredRows ?? []) {
    const { data, error } = await client.rpc("expire_unpaid_corporate_booking", {
      p_booking_id: booking.id,
    });
    if (error) throw error;
    if ((data as { expired?: boolean } | null)?.expired) {
      expired += 1;
      await notifyAppleWalletBooking(client, booking.id);
    }
  }

  const { data: claimedData, error: claimError } = await client.rpc(
    "claim_due_corporate_payment_reminders",
  );
  if (claimError) throw claimError;

  const claimed = (claimedData ?? []) as ReminderRow[];
  const groups = new Map<string, ReminderRow[]>();
  for (const row of claimed) {
    const key = `${row.created_by_staff_id}:${row.staff_email.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  let remindersSent = 0;
  for (const rows of groups.values()) {
    const staff = rows[0];
    const lines = rows.map(
      (row) =>
        `${row.booking_reference} · ${row.guest_name || "Guest"} · ${row.show_date} · due ${formatDeadline(row.corporate_payment_deadline)}`,
    );
    const result = await sendZingaraEmail({
      message: [
        `Hello ${staff.staff_name || "Team"},`,
        "",
        `${rows.length} Corporate booking payment deadline${rows.length === 1 ? " is" : "s are"} due within the configured reminder window:`,
        "",
        ...lines,
        "",
        "Please review these bookings in Zingara Admin.",
      ].join("\n"),
      subject: `Zingara Corporate payment deadline reminder (${rows.length})`,
      to: staff.staff_email,
    });
    const bookingIds = rows.map((row) => row.booking_id);

    if (!result.ok) {
      await client
        .from("bookings")
        .update({ corporate_payment_reminder_claimed_at: null })
        .in("id", bookingIds)
        .is("corporate_payment_reminder_sent_at", null);
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
        reason: "Consolidated deadline reminder sent to the booking creator.",
        source_area: "Corporate Bookings",
      })),
    );
    if (auditError) throw auditError;
    remindersSent += 1;
  }

  return {
    claimedReminders: claimed.length,
    expired,
    reminderEmailsSent: remindersSent,
  };
}
