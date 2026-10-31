import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrandedCustomerEmail } from "@/lib/email/customerEmail";
import {
  claimOneTimeEmailCommunication,
  completeClaimedEmailCommunication,
} from "@/lib/email/communicationIdempotency";
import { sendZingaraEmail } from "@/lib/email/smtp";
import {
  claimStaffEmailDelivery,
  completeStaffEmailDelivery,
  isPersonalEmailSubscriptionEnabled,
  loadManagementEmailRoute,
} from "@/lib/email/staffEmailNotifications";

const notificationKey = "daily-waitlist-reminder" as const;
const subject = "Zingara Box Office — Your Daily Guest List";
const scheduleMinute = 8 * 60;
const pageSize = 500;
const maxPages = 20;

type WaitlistReminderRow = {
  created_at: string;
  customer: {
    email: string | null;
    first_name: string;
    mobile: string | null;
    surname: string | null;
  } | null;
  desired_section: string | null;
  guest_count: number;
  id: string;
  notes: string | null;
  show: {
    date: string;
    time: string;
    venue: string;
  } | null;
  status: "active" | "contacted";
};

type ReminderEntry = {
  contact: string;
  createdAt: string;
  guestCount: number;
  guestName: string;
  reference: string;
  section: string;
  source: "Secret Guest List" | "Waitlist";
  status: "Contacted" | "Waiting";
  showDate: string;
  showTime: string;
  venue: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function johannesburgDateKey(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Johannesburg",
    year: "numeric",
  }).format(now);
}

function johannesburgMinutes(now: Date) {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Africa/Johannesburg",
  }).formatToParts(now);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return value("hour") * 60 + value("minute");
}

function parseMetadata(notes: string | null) {
  const prefix = "__zingara_waitlist_meta__:";
  if (!notes?.startsWith(prefix)) return null;

  try {
    return JSON.parse(notes.slice(prefix.length)) as {
      id?: string;
      notes?: string;
    };
  } catch {
    return null;
  }
}

function performanceInstant(entry: Pick<ReminderEntry, "showDate" | "showTime">) {
  return new Date(`${entry.showDate}T${entry.showTime.slice(0, 5)}:00+02:00`);
}

function formatPerformance(entry: ReminderEntry) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(performanceInstant(entry));
}

function venueLabel(venue: string) {
  return venue === "cape-town" ? "Cape Town" : "Johannesburg";
}

async function loadActionableEntries(client: SupabaseClient, now: Date) {
  const rows: WaitlistReminderRow[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const { data, error } = await client
      .from("waitlist_entries")
      .select(
        "id,guest_count,status,desired_section,notes,created_at,customer:customers!inner(first_name,surname,email,mobile),show:shows!inner(date,time,venue)",
      )
      .in("status", ["active", "contacted"])
      .order("created_at", { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw error;
    const pageRows = (data ?? []) as unknown as WaitlistReminderRow[];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
    if (page === maxPages - 1) {
      throw new Error("The actionable Waitlist exceeds the safe reminder query bound.");
    }
  }

  return rows
    .flatMap((row): ReminderEntry[] => {
      if (!row.customer || !row.show) return [];
      const metadata = parseMetadata(row.notes);
      const entry: ReminderEntry = {
        contact: [row.customer.email, row.customer.mobile]
          .filter(Boolean)
          .join(" · "),
        createdAt: row.created_at,
        guestCount: row.guest_count,
        guestName:
          [row.customer.first_name, row.customer.surname]
            .filter(Boolean)
            .join(" ") || "Waitlist Guest",
        reference: metadata?.id || row.id,
        section: row.desired_section || "Any eligible seating section",
        source: metadata?.notes
          ?.trim()
          .toLowerCase()
          .startsWith("submitted via the secret guest list.")
          ? "Secret Guest List"
          : "Waitlist",
        status: row.status === "contacted" ? "Contacted" : "Waiting",
        showDate: row.show.date,
        showTime: row.show.time,
        venue: row.show.venue,
      };

      return performanceInstant(entry).getTime() > now.getTime() ? [entry] : [];
    })
    .sort(
      (left, right) =>
        performanceInstant(left).getTime() - performanceInstant(right).getTime() ||
        left.createdAt.localeCompare(right.createdAt),
    );
}

function renderReminder(entries: ReminderEntry[]) {
  const guestTotal = entries.reduce((total, entry) => total + entry.guestCount, 0);
  const groups = new Map<string, ReminderEntry[]>();

  for (const entry of entries) {
    const key = `${entry.showDate}|${entry.showTime}|${entry.venue}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const html = [
    `<p>There are still a few hopeful faces waiting for their moment under the Zingara tent! Here's who's hoping to join us.</p>`,
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 22px;border:1px solid #4f4525;border-radius:12px;background:#0e0c0a;"><tr><td style="padding:14px;text-align:center;"><strong style="display:block;color:#f2d66c;font-size:22px;">${entries.length}</strong><span style="color:#a8a29e;font-size:12px;">Outstanding enquiries</span></td><td style="padding:14px;text-align:center;"><strong style="display:block;color:#f2d66c;font-size:22px;">${guestTotal}</strong><span style="color:#a8a29e;font-size:12px;">Guests waiting</span></td></tr></table>`,
    ...[...groups.values()].map((group) => {
      const first = group[0];
      const rows = group
        .map(
          (entry) => `<tr><td style="padding:8px;border-top:1px solid #3b3420;"><strong>${escapeHtml(entry.guestName)}</strong><br><span style="color:#a8a29e;">${escapeHtml(entry.contact || "No contact details")}</span></td><td style="padding:8px;border-top:1px solid #3b3420;text-align:center;">${entry.guestCount}</td><td style="padding:8px;border-top:1px solid #3b3420;">${escapeHtml(entry.status)}<br><span style="color:#a8a29e;">${escapeHtml(entry.source)} · ${escapeHtml(entry.section)}</span></td></tr>`,
        )
        .join("");
      return `<div style="margin:0 0 18px;padding:14px;border:1px solid #3b3420;border-radius:10px;background:#0e0c0a;"><div style="color:#d8c36a;font-size:13px;font-weight:700;">${escapeHtml(formatPerformance(first))} · ${escapeHtml(venueLabel(first.venue))}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;color:#fffaf0;font-size:12px;">${rows}</table></div>`;
    }),
  ].join("");
  const message = [
    "THE GUESTS ARE WAITING!",
    "",
    "There are still a few hopeful faces waiting for their moment under the Zingara tent! Here's who's hoping to join us.",
    "",
    `Outstanding enquiries: ${entries.length}`,
    `Guests waiting: ${guestTotal}`,
    "",
    ...entries.flatMap((entry) => [
      `${formatPerformance(entry)} · ${venueLabel(entry.venue)}`,
      `${entry.guestName} · ${entry.guestCount} guests · ${entry.status}`,
      `${entry.contact || "No contact details"} · ${entry.source} · ${entry.section}`,
      `Reference: ${entry.reference}`,
      "",
    ]),
  ].join("\n");

  return { guestTotal, html, message };
}

async function enabledRecipients(client: SupabaseClient) {
  const route = await loadManagementEmailRoute(client, notificationKey);
  if (!route.enabled) return { ...route, cc: [], to: [] };
  const filter = async (recipients: typeof route.to) =>
    (
      await Promise.all(
        recipients.map(async (recipient) => ({
          enabled: await isPersonalEmailSubscriptionEnabled(
            client,
            recipient.id,
            notificationKey,
          ),
          recipient,
        })),
      )
    )
      .filter((item) => item.enabled)
      .map((item) => item.recipient);

  const [to, cc] = await Promise.all([filter(route.to), filter(route.cc)]);
  return { ...route, cc, to };
}

export async function runDailyWaitlistReminder(
  client: SupabaseClient,
  now = new Date(),
) {
  const currentMinute = johannesburgMinutes(now);
  if (currentMinute < scheduleMinute || currentMinute >= scheduleMinute + 60) {
    return { reason: "outside-window", sent: false } as const;
  }

  const route = await enabledRecipients(client);
  if (!route.enabled) return { reason: "disabled", sent: false } as const;

  const entries = await loadActionableEntries(client, now);
  if (!entries.length) return { reason: "empty", sent: false } as const;

  const reportDate = johannesburgDateKey(now);
  const deliveryId = await claimStaffEmailDelivery(client, {
    ccStaffProfileIds: route.cc.map((recipient) => recipient.id),
    eventKey: reportDate,
    notificationKey,
    toStaffProfileIds: route.to.map((recipient) => recipient.id),
  });
  if (!deliveryId) return { reason: "already-claimed", sent: false } as const;

  const content = renderReminder(entries);
  const communication = await claimOneTimeEmailCommunication(client, {
    batch_id: reportDate,
    booking_id: null,
    channel: "email",
    customer_id: null,
    message: content.message,
    show_id: null,
    subject,
    type: "custom_message",
  });
  if (!communication) {
    await completeStaffEmailDelivery(client, deliveryId, {
      error: "Daily Waitlist reminder was already recorded.",
      status: "suppressed",
    });
    return { reason: "already-recorded", sent: false } as const;
  }

  const branded = await createBrandedCustomerEmail({
    ctaLabel: "OPEN WAITLIST",
    ctaUrl: "/admin?section=waitlist",
    heading: "THE GUESTS ARE WAITING!",
    html: content.html,
    includeAgePolicy: false,
    includeSecurityNotice: false,
    message: content.message,
    subject,
  });
  const result = route.to.length
    ? await sendZingaraEmail({
        attachments: branded.attachments,
        cc: route.cc.map((recipient) => recipient.email),
        html: branded.html,
        message: branded.message,
        subject,
        to: route.to.map((recipient) => recipient.email),
      })
    : {
        error: "All primary Waitlist reminder recipients disabled this email.",
        ok: false as const,
        suppressed: true,
      };
  const status = result.ok ? "sent" : result.suppressed ? "suppressed" : "failed";

  await Promise.all([
    completeStaffEmailDelivery(client, deliveryId, {
      error: result.ok ? undefined : result.error,
      status,
    }),
    completeClaimedEmailCommunication(client, communication.id, {
      message: content.message,
      status,
      subject,
    }),
  ]);

  if (!result.ok && !result.suppressed) throw new Error(result.error);

  return {
    enquiries: entries.length,
    guests: content.guestTotal,
    reason: result.ok ? "sent" : "suppressed",
    sent: result.ok,
  } as const;
}
