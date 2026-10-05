import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createBrandedCustomerEmail,
} from "@/lib/email/customerEmail";
import {
  kadenManagementEmail,
  resolveInternalOperationalRecipients,
} from "@/lib/email/internalOperationalRecipients";
import { sendZingaraEmail } from "@/lib/email/smtp";

const timeZone = "Africa/Johannesburg";
const recentChangeDays = 7;
const adminOrigin = "https://book.zingara.co.za";
const pageSize = 500;

export type DailyBookingReviewConfiguration = {
  activatedAt: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  scheduledTime: string;
  subject: string;
};

export type DailyBookingReviewItem = {
  attention: string[];
  bookingId: string;
  bookingReference: string;
  bookingState: string;
  currentReference: string;
  guestCount: number;
  guestOrCompany: string;
  moved: boolean;
  paymentState: string;
  seatingSection: string;
  show: string;
  tableState: string;
  url: string;
};

export type DailyBookingReviewPreviewRow = {
  attentionCount: number;
  bookingCount: number;
  cc: string;
  email: string;
  guestCount: number;
  staffId: string;
  staffName: string;
};

type ConfigRow = {
  activated_at: string | null;
  enabled: boolean;
  scheduled_time: string;
  subject: string;
};

type StaffRow = {
  active: boolean;
  email: string | null;
  full_name: string | null;
  id: string;
  role_id: string;
};

type BookingRow = {
  amount_paid: number;
  archived_at: string | null;
  balance_outstanding: number;
  booking_origin: string | null;
  booking_reference: string;
  booking_source: string | null;
  booking_status: string;
  company_name: string | null;
  corporate_payment_deadline: string | null;
  created_by_staff_id: string;
  customer_id: string | null;
  guest_count: number;
  id: string;
  payment_status: string;
  public_checkout_superseded_by: string | null;
  section: string | null;
  show_id: string;
  table_id: string | null;
  total_amount: number;
  updated_at: string;
};

type Report = {
  attentionCount: number;
  guestCount: number;
  items: DailyBookingReviewItem[];
  staff: StaffRow;
};

const defaultConfiguration: ConfigRow = {
  activated_at: null,
  enabled: false,
  scheduled_time: "08:00:00",
  subject: "Your Zingara bookings - {{reportDate}}",
};

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function johannesburgDateKey(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function johannesburgMinutes(now: Date) {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
  }).formatToParts(now);
  const value = (type: "hour" | "minute") =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}

function scheduleInstant(dateKey: string, scheduledTime: string) {
  return new Date(`${dateKey}T${scheduledTime.slice(0, 5)}:00+02:00`);
}

function nextRunAt(now: Date, scheduledTime: string) {
  const dateKey = johannesburgDateKey(now);
  const today = scheduleInstant(dateKey, scheduledTime);
  if (today.getTime() > now.getTime()) return today.toISOString();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  return tomorrow.toISOString();
}

function isValidEmail(value: string | null | undefined) {
  return Boolean(value?.trim().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/));
}

function formatReportDate(dateKey: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "long",
    timeZone,
  }).format(new Date(`${dateKey}T12:00:00+02:00`));
}

function formatShow(show: { date: string; time: string; venue: string }) {
  const date = new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(new Date(`${show.date}T12:00:00+02:00`));
  const venue = show.venue === "johannesburg" ? "JHB" : show.venue === "cape-town" ? "CPT" : show.venue;
  return `${date} · ${venue} · ${show.time.slice(0, 5)}`;
}

function paymentLabel(booking: BookingRow) {
  if (booking.payment_status === "fully_paid") return "Paid";
  if (booking.payment_status === "deposit_paid") return "Deposit paid";
  if (booking.payment_status === "comp_vip") return "Complimentary";
  if (booking.payment_status === "refunded") return "Refunded";
  if (Number(booking.amount_paid) > 0 && Number(booking.balance_outstanding) > 0) return "Part paid";
  return "Unpaid";
}

function bookingLabel(status: string) {
  return ({
    cancelled: "Cancelled",
    checked_in: "Checked in",
    completed: "Completed",
    confirmed: "Confirmed",
    new: "New",
    no_show: "No-show",
    pending_payment: "Awaiting payment",
    refunded: "Refunded",
    waitlisted: "Waitlisted",
  } as Record<string, string>)[status] ?? "Needs review";
}

function isCorporate(booking: BookingRow) {
  return booking.booking_origin === "corporate" || booking.booking_source?.startsWith("corporate");
}

function chunks<T>(values: T[], size = 100) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

async function loadConfigurationRow(client: SupabaseClient): Promise<ConfigRow> {
  const { data, error } = await client
    .from("daily_booking_review_configuration")
    .select("enabled,scheduled_time,subject,activated_at")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return (data as ConfigRow | null) ?? defaultConfiguration;
}

export async function loadDailyBookingReviewConfiguration(
  client: SupabaseClient,
  now = new Date(),
): Promise<DailyBookingReviewConfiguration> {
  const configuration = await loadConfigurationRow(client);
  const { data: lastDelivery, error } = await client
    .from("daily_booking_review_deliveries")
    .select("completed_at,claimed_at")
    .in("status", ["sent", "skipped"])
    .order("report_date", { ascending: false })
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return {
    activatedAt: configuration.activated_at,
    enabled: configuration.enabled,
    lastRunAt: lastDelivery?.completed_at ?? lastDelivery?.claimed_at ?? null,
    nextRunAt: configuration.enabled ? nextRunAt(now, configuration.scheduled_time) : null,
    scheduledTime: configuration.scheduled_time.slice(0, 5),
    subject: configuration.subject,
  };
}

export async function saveDailyBookingReviewConfiguration(
  client: SupabaseClient,
  input: { enabled: boolean; scheduledTime: string; subject: string },
  updatedBy: string | null,
  now = new Date(),
) {
  if (!input.scheduledTime.match(/^([01]\d|2[0-3]):[0-5]\d$/)) {
    throw new Error("Enter a valid daily time.");
  }
  if (!input.subject.trim()) throw new Error("Enter an email subject.");
  const current = await loadConfigurationRow(client);
  const activatedAt = input.enabled && !current.enabled ? now.toISOString() : input.enabled ? current.activated_at : null;
  const { error } = await client.from("daily_booking_review_configuration").upsert({
    activated_at: activatedAt,
    enabled: input.enabled,
    id: true,
    scheduled_time: `${input.scheduledTime}:00`,
    subject: input.subject.trim(),
    updated_at: now.toISOString(),
    updated_by: updatedBy,
  });
  if (error) throw error;
  return loadDailyBookingReviewConfiguration(client, now);
}

async function loadEligibleStaff(client: SupabaseClient) {
  const { data: roles, error: roleError } = await client
    .from("roles")
    .select("id,role_permissions(permissions(key))");
  if (roleError) throw roleError;
  const eligibleRoleIds = (roles ?? []).flatMap((role) => {
    const permissions = (role.role_permissions ?? []) as Array<{ permissions: { key: string } | Array<{ key: string }> | null }>;
    const canManage = permissions.some((entry) => {
      const permission = Array.isArray(entry.permissions) ? entry.permissions[0] : entry.permissions;
      return permission?.key === "bookings:manage";
    });
    return canManage ? [role.id] : [];
  });
  if (!eligibleRoleIds.length) return [];
  const { data, error } = await client
    .from("staff_profiles")
    .select("id,full_name,email,role_id,active")
    .eq("active", true)
    .in("role_id", eligibleRoleIds)
    .order("full_name");
  if (error) throw error;
  return ((data ?? []) as StaffRow[]).filter((staff) => isValidEmail(staff.email));
}

async function loadBookingsForStaff(client: SupabaseClient, staffId: string) {
  const rows: BookingRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("bookings")
      .select("id,customer_id,show_id,table_id,booking_reference,booking_source,booking_origin,created_by_staff_id,company_name,guest_count,booking_status,payment_status,section,total_amount,amount_paid,balance_outstanding,corporate_payment_deadline,archived_at,updated_at,public_checkout_superseded_by")
      .eq("created_by_staff_id", staffId)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as BookingRow[]));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

async function loadReports(client: SupabaseClient, now = new Date()): Promise<Report[]> {
  const reportDate = johannesburgDateKey(now);
  const recentSince = new Date(now.getTime() - recentChangeDays * 24 * 60 * 60 * 1000).toISOString();
  const staff = await loadEligibleStaff(client);
  const bookingGroups = await Promise.all(staff.map((member) => loadBookingsForStaff(client, member.id)));
  const allBookings = bookingGroups.flat();
  const allBookingIds = allBookings.map((booking) => booking.id);

  const recentMoveIds = new Set<string>();
  for (const batch of chunks(allBookingIds)) {
    if (!batch.length) continue;
    const { data, error } = await client
      .from("audit_events")
      .select("entity_id")
      .eq("action", "booking.show-transfer")
      .gte("created_at", recentSince)
      .in("entity_id", batch);
    if (error) throw error;
    (data ?? []).forEach((row) => recentMoveIds.add(row.entity_id));
  }

  const replacementByResidue = new Map<string, string>();
  const { data: dispositions, error: dispositionError } = await client
    .from("duplicate_booking_review_dispositions")
    .select("authoritative_booking_id,residue_booking_ids,decided_at")
    .gte("decided_at", recentSince);
  if (dispositionError) throw dispositionError;
  (dispositions ?? []).forEach((row) =>
    (row.residue_booking_ids ?? []).forEach((id: string) => replacementByResidue.set(id, row.authoritative_booking_id)),
  );

  const candidateGroups = bookingGroups.map((bookings) => bookings.filter((booking) => {
    const activeFuture = booking.archived_at === null && booking.booking_status !== "cancelled" && booking.booking_status !== "refunded" && booking.booking_status !== "completed" && booking.booking_status !== "no_show";
    const recentlyChangedDisposition = new Date(booking.updated_at).getTime() >= new Date(recentSince).getTime() && (booking.archived_at !== null || ["cancelled", "refunded"].includes(booking.booking_status));
    const replaced = Boolean(
      replacementByResidue.has(booking.id) ||
      (booking.public_checkout_superseded_by && new Date(booking.updated_at).getTime() >= new Date(recentSince).getTime()),
    );
    return activeFuture || recentlyChangedDisposition || recentMoveIds.has(booking.id) || replaced;
  }));
  const candidates = candidateGroups.flat();
  const showIds = [...new Set(candidates.map((booking) => booking.show_id))];
  const customerIds = [...new Set(candidates.flatMap((booking) => booking.customer_id ? [booking.customer_id] : []))];
  const replacementIds = [...new Set(candidates.flatMap((booking) => {
    const id = booking.public_checkout_superseded_by ?? replacementByResidue.get(booking.id);
    return id ? [id] : [];
  }))];
  const candidateIds = candidates.map((booking) => booking.id);

  const [showsResult, customersResult, replacementsResult] = await Promise.all([
    showIds.length ? client.from("shows").select("id,date,time,venue,name").in("id", showIds) : Promise.resolve({ data: [], error: null }),
    customerIds.length ? client.from("customers").select("id,first_name,surname").in("id", customerIds) : Promise.resolve({ data: [], error: null }),
    replacementIds.length ? client.from("bookings").select("id,booking_reference").in("id", replacementIds) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [showsResult, customersResult, replacementsResult]) if (result.error) throw result.error;
  const showMap = new Map((showsResult.data ?? []).map((row) => [row.id, row]));
  const customerMap = new Map((customersResult.data ?? []).map((row) => [row.id, [row.first_name, row.surname].filter(Boolean).join(" ").trim()]));
  const referenceMap = new Map((replacementsResult.data ?? []).map((row) => [row.id, row.booking_reference]));
  const tableCodes = new Map<string, string[]>();
  for (const batch of chunks(candidateIds)) {
    if (!batch.length) continue;
    const { data, error } = await client.from("show_tables").select("booking_id,table_code,status").in("booking_id", batch);
    if (error) throw error;
    (data ?? []).filter((row) => ["booked", "merged"].includes(row.status)).forEach((row) => {
      tableCodes.set(row.booking_id, [...(tableCodes.get(row.booking_id) ?? []), row.table_code]);
    });
  }

  return staff.map((member, index) => {
    const items = candidateGroups[index].flatMap((booking) => {
      const show = showMap.get(booking.show_id);
      if (!show) return [];
      const active = booking.archived_at === null && !["cancelled", "refunded", "completed", "no_show"].includes(booking.booking_status);
      if (active && show.date < reportDate) return [];
      const replacementId = booking.public_checkout_superseded_by ?? replacementByResidue.get(booking.id) ?? null;
      const replacementReference = replacementId ? referenceMap.get(replacementId) ?? null : null;
      const tables = [...new Set(tableCodes.get(booking.id) ?? [])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const attention: string[] = [];
      const moved = recentMoveIds.has(booking.id);
      if (replacementReference) attention.push(`Replaced by ${replacementReference}`);
      else if (booking.booking_status === "cancelled") attention.push("Booking cancelled");
      else if (booking.booking_status === "refunded") attention.push("Booking refunded");
      if (moved) attention.push("Booking moved");
      if (active && tables.length === 0) attention.push(booking.table_id ? "Table issue" : "Table needed");
      if (active && Number(booking.balance_outstanding) > 0) {
        if (!isCorporate(booking)) attention.push("Payment outstanding");
        else if (booking.corporate_payment_deadline && new Date(booking.corporate_payment_deadline) <= now) attention.push("Payment follow-up due");
      }
      const currentReference = replacementReference ?? booking.booking_reference;
      const guestName = booking.customer_id ? customerMap.get(booking.customer_id) : null;
      const tableState = tables.length === 0 ? (booking.table_id ? "Table issue" : "Table needed") : `${tables.length === 1 ? "Table" : "Tables"} ${tables.join(" + ")}`;
      return [{
        attention,
        bookingId: booking.id,
        bookingReference: booking.booking_reference,
        bookingState: replacementReference ? `Replaced by ${replacementReference}` : bookingLabel(booking.booking_status),
        currentReference,
        guestCount: booking.guest_count,
        guestOrCompany: booking.company_name?.trim() || guestName || "Guest",
        moved,
        paymentState: paymentLabel(booking),
        seatingSection: booking.section ?? "Seating not set",
        show: formatShow(show),
        tableState,
        url: `${adminOrigin}/admin?section=bookings&booking=${encodeURIComponent(currentReference)}`,
      } satisfies DailyBookingReviewItem];
    }).sort((left, right) => left.show.localeCompare(right.show) || left.bookingReference.localeCompare(right.bookingReference));
    return {
      attentionCount: items.filter((item) => item.attention.length > 0).length,
      guestCount: items.reduce((sum, item) => sum + item.guestCount, 0),
      items,
      staff: member,
    };
  });
}

function renderReport(report: Report, reportDate: string, subjectTemplate: string) {
  const reportDateLabel = formatReportDate(reportDate);
  const subject = subjectTemplate.replaceAll("{{reportDate}}", reportDateLabel);
  const attentionItems = report.items.filter((item) => item.attention.length > 0);
  const htmlAttention = attentionItems.length
    ? `<div style="margin:0 0 22px;padding:16px;border:1px solid #8c7428;border-radius:12px;background:#201a0d;"><strong style="color:#f2d66c;">Needs Attention · ${attentionItems.length}</strong><ul style="margin:12px 0 0;padding-left:20px;">${attentionItems.map((item) => `<li style="margin:0 0 8px;"><a href="${escapeHtml(item.url)}" style="color:#f2d66c;">${escapeHtml(item.bookingReference)}</a> · ${escapeHtml(item.attention.join(" · "))}</li>`).join("")}</ul></div>`
    : "";
  const htmlRows = report.items.map((item) => `<div style="margin:0 0 12px;padding:14px;border:1px solid #3b3420;border-radius:10px;background:#0e0c0a;"><div style="color:#d8c36a;font-size:12px;font-weight:700;">${escapeHtml(item.show)}</div><div style="margin-top:7px;color:#fffaf0;font-size:15px;font-weight:700;">${escapeHtml(item.guestOrCompany)}</div><div style="margin-top:4px;"><a href="${escapeHtml(item.url)}" style="color:#f2d66c;font-size:13px;">${escapeHtml(item.bookingReference)}</a>${item.currentReference !== item.bookingReference ? `<span style="display:block;margin-top:3px;color:#d8c36a;font-size:12px;">Current: ${escapeHtml(item.currentReference)}</span>` : ""}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;color:#fffaf0;font-size:12px;"><tr><td style="padding:3px 4px 3px 0;"><span style="color:#a8a29e;">Guests</span><br><strong>${item.guestCount}</strong></td><td style="padding:3px 4px;"><span style="color:#a8a29e;">Payment</span><br><strong>${escapeHtml(item.paymentState)}</strong></td><td style="padding:3px 0 3px 4px;"><span style="color:#a8a29e;">Table</span><br><strong>${escapeHtml(item.tableState)}</strong></td></tr></table><div style="margin-top:8px;color:#fffaf0;font-size:12px;"><span style="color:#a8a29e;">Status</span><br><strong>${escapeHtml(item.bookingState)}</strong></div></div>`).join("");
  const html = `<p>Hello ${escapeHtml(report.staff.full_name || "Team")},</p><p>Here is the current state of the bookings you created that are still relevant.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 22px;border:1px solid #4f4525;border-radius:12px;background:#0e0c0a;"><tr><td style="padding:14px;text-align:center;"><strong style="display:block;color:#f2d66c;font-size:22px;">${report.items.length}</strong><span style="color:#a8a29e;font-size:12px;">Your bookings</span></td><td style="padding:14px;text-align:center;"><strong style="display:block;color:#f2d66c;font-size:22px;">${report.attentionCount}</strong><span style="color:#a8a29e;font-size:12px;">Needs attention</span></td><td style="padding:14px;text-align:center;"><strong style="display:block;color:#f2d66c;font-size:22px;">${report.guestCount}</strong><span style="color:#a8a29e;font-size:12px;">Guests</span></td></tr></table>${htmlAttention}${htmlRows}<p style="margin-top:20px;color:#a8a29e;font-size:12px;">Payment, seating and booking status are refreshed when this email is created.</p>`;
  const lines = report.items.map((item) => [item.show, item.guestOrCompany, item.bookingReference, `${item.guestCount} guests`, item.paymentState, item.tableState, item.bookingState, item.attention.length ? `Needs attention: ${item.attention.join("; ")}` : null, item.url].filter(Boolean).join("\n"));
  const message = [`Hello ${report.staff.full_name || "Team"},`, "", `Your bookings: ${report.items.length}`, `Needs attention: ${report.attentionCount}`, `Guests: ${report.guestCount}`, "", ...lines.flatMap((line) => [line, ""])].join("\n").trim();
  return { html, message, subject };
}

export async function previewDailyBookingReviews(client: SupabaseClient, now = new Date()) {
  const configuration = await loadDailyBookingReviewConfiguration(client, now);
  const reports = await loadReports(client, now);
  const rows: DailyBookingReviewPreviewRow[] = reports.map((report) => ({
    attentionCount: report.attentionCount,
    bookingCount: report.items.length,
    cc: kadenManagementEmail,
    email: report.staff.email!,
    guestCount: report.guestCount,
    staffId: report.staff.id,
    staffName: report.staff.full_name || "Staff member",
  }));
  const example = reports.find((report) => report.items.length > 0);
  const rendered = example ? renderReport(example, johannesburgDateKey(now), configuration.subject) : null;
  const branded = rendered ? await createBrandedCustomerEmail({ heading: "Daily Booking Review", html: rendered.html, includeAgePolicy: false, message: rendered.message, subject: rendered.subject }) : null;
  const previewHtml = branded
    ? branded.attachments.reduce(
        (html, attachment) => html.replaceAll(`cid:${attachment.cid}`, `data:${attachment.contentType ?? "application/octet-stream"};base64,${attachment.content.toString("base64")}`),
        branded.html,
      )
    : null;
  return { configuration, example: previewHtml ? { html: previewHtml, subject: rendered!.subject } : null, rows };
}

export async function runDailyBookingReview(client: SupabaseClient, now = new Date()) {
  const configuration = await loadConfigurationRow(client);
  if (!configuration.enabled || !configuration.activated_at) return { reason: "disabled", sent: 0, skipped: 0 } as const;
  const reportDate = johannesburgDateKey(now);
  const scheduled = scheduleInstant(reportDate, configuration.scheduled_time);
  const scheduledMinute = Number(configuration.scheduled_time.slice(0, 2)) * 60 + Number(configuration.scheduled_time.slice(3, 5));
  const currentMinute = johannesburgMinutes(now);
  if (currentMinute < scheduledMinute || currentMinute >= scheduledMinute + 60) return { reason: "outside-window", sent: 0, skipped: 0 } as const;
  if (new Date(configuration.activated_at).getTime() >= scheduled.getTime()) return { reason: "activated-after-schedule", sent: 0, skipped: 0 } as const;

  const reports = await loadReports(client, now);
  let sent = 0;
  let skipped = 0;
  for (const report of reports) {
    const recipients = await resolveInternalOperationalRecipients(client, { to: report.staff.email });
    const primary = recipients.to[0];
    const managementCc = recipients.cc.find((email) => email.toLowerCase() === kadenManagementEmail) ?? "";
    const { data: claimed, error: claimError } = await client.rpc("claim_daily_booking_review_delivery", {
      p_attention_count: report.attentionCount,
      p_booking_count: report.items.length,
      p_guest_count: report.guestCount,
      p_management_cc: managementCc,
      p_primary_email: primary,
      p_report_date: reportDate,
      p_staff_profile_id: report.staff.id,
    });
    if (claimError) throw claimError;
    if (!claimed) continue;
    if (!report.items.length) {
      const { error } = await client.rpc("complete_daily_booking_review_delivery", { p_error_message: null, p_report_date: reportDate, p_staff_profile_id: report.staff.id, p_status: "skipped" });
      if (error) throw error;
      skipped += 1;
      continue;
    }
    const content = renderReport(report, reportDate, configuration.subject);
    const branded = await createBrandedCustomerEmail({ heading: "Daily Booking Review", html: content.html, includeAgePolicy: false, message: content.message, subject: content.subject });
    const result = await sendZingaraEmail({ attachments: branded.attachments, cc: recipients.cc, html: branded.html, message: branded.message, subject: content.subject, to: recipients.to });
    const finalStatus = result.ok ? "sent" : "failed";
    const { error: completeError } = await client.rpc("complete_daily_booking_review_delivery", { p_error_message: result.ok ? null : result.error, p_report_date: reportDate, p_staff_profile_id: report.staff.id, p_status: finalStatus });
    if (completeError) throw completeError;
    if (!result.ok) continue;
    const { error: auditError } = await client.from("audit_events").insert({
      action: "workflow.daily-booking-review.sent",
      actor_location_scope: [],
      actor_name: "SYSTEM",
      after_values: { attention_count: report.attentionCount, booking_count: report.items.length, management_cc: recipients.cc, primary_recipient: primary, report_date: reportDate },
      before_values: {},
      changed_fields: [],
      entity_id: report.staff.id,
      entity_reference: report.staff.email,
      entity_type: "staff_daily_booking_review",
      outcome: "success",
      reason: "Daily Booking Review sent to the original booking creator with the configured management copy.",
      source_area: "Automated Workflows",
    });
    if (auditError) throw auditError;
    sent += 1;
  }
  return { reason: "completed", sent, skipped } as const;
}
