import type { SupabaseClient } from "@supabase/supabase-js";

import { createBrandedCustomerEmail } from "@/lib/email/customerEmail";
import { kadenManagementEmail, resolveInternalOperationalRecipients } from "@/lib/email/internalOperationalRecipients";
import { sendZingaraEmail } from "@/lib/email/smtp";
import { calculateReviewRatingAverage, isReviewAttentionRating } from "@/lib/reviews/reviewRating";

const timeZone = "Africa/Johannesburg";
const adminOrigin = "https://book.zingara.co.za";

type ConfigRow = {
  daily_activated_at: string | null;
  daily_enabled: boolean;
  daily_recipient_staff_ids: string[];
  daily_time: string;
  immediate_activated_at: string | null;
  immediate_enabled: boolean;
  immediate_recipient_staff_ids: string[];
};

type StaffRow = { active: boolean; email: string | null; full_name: string; id: string };
type ReviewRow = {
  contact_requested: boolean;
  id: string;
  invitation_id: string;
  moderation_status: "needs_review" | "not_published" | "published";
  public_display_name: string;
  rating: number;
  review_text: string;
  show_id: string;
  submitted_at: string;
  venue: "cape-town" | "johannesburg";
  verified_guest: boolean;
};
type ReviewContext = ReviewRow & {
  invitationType: "automated_verified" | "manual_email" | "manual_link";
  show: { date: string; name: string; time: string } | null;
};

const defaultConfig: ConfigRow = {
  daily_activated_at: null,
  daily_enabled: false,
  daily_recipient_staff_ids: [],
  daily_time: "08:00:00",
  immediate_activated_at: null,
  immediate_enabled: false,
  immediate_recipient_staff_ids: [],
};

function escapeHtml(value: string | number) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function dateKey(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone, year: "numeric" }).format(now);
}

function currentMinute(now: Date) {
  const parts = new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", hour12: false, minute: "2-digit", timeZone }).formatToParts(now);
  const value = (type: "hour" | "minute") => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}

function scheduledMinute(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function scheduleInstant(reportDate: string, time: string) {
  return new Date(`${reportDate}T${time.slice(0, 5)}:00+02:00`);
}

function nextRunAt(now: Date, time: string) {
  const today = scheduleInstant(dateKey(now), time);
  return (today > now ? today : new Date(today.getTime() + 86_400_000)).toISOString();
}

function venueLabel(venue: ReviewRow["venue"]) {
  return venue === "johannesburg" ? "Johannesburg" : "Cape Town";
}

function invitationLabel(type: ReviewContext["invitationType"]) {
  return type === "automated_verified" ? "Verified Guest" : "Invited Guest";
}

function statusLabel(status: ReviewRow["moderation_status"]) {
  return status === "needs_review" ? "Needs Review" : status === "published" ? "Published" : "Not Published";
}

async function loadConfig(client: SupabaseClient): Promise<ConfigRow> {
  const { data, error } = await client.from("review_management_configuration").select("immediate_enabled,daily_enabled,daily_time,immediate_recipient_staff_ids,daily_recipient_staff_ids,immediate_activated_at,daily_activated_at").eq("id", true).maybeSingle();
  if (error) throw error;
  return (data as ConfigRow | null) ?? defaultConfig;
}

async function loadStaff(client: SupabaseClient) {
  const { data, error } = await client.from("staff_profiles").select("id,full_name,email,active").order("full_name");
  if (error) throw error;
  return (data ?? []) as StaffRow[];
}

async function resolveRecipients(client: SupabaseClient, ids: string[]) {
  const staff = (await loadStaff(client)).filter((member) => ids.includes(member.id) && member.active && member.email?.trim());
  const initialTo = staff.flatMap((member) => member.email?.toLowerCase() === kadenManagementEmail ? [] : [member.email!]);
  const fallbackTo = initialTo.length ? initialTo : staff.flatMap((member) => member.email ? [member.email] : []);
  return resolveInternalOperationalRecipients(client, { to: fallbackTo });
}

async function loadReview(client: SupabaseClient, reviewId: string): Promise<ReviewContext | null> {
  const { data, error } = await client.from("guest_reviews").select("id,invitation_id,show_id,venue,public_display_name,rating,review_text,contact_requested,moderation_status,verified_guest,submitted_at").eq("id", reviewId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [showResult, invitationResult] = await Promise.all([
    client.from("shows").select("date,time,name").eq("id", data.show_id).maybeSingle(),
    client.from("review_invitations").select("invitation_type").eq("id", data.invitation_id).maybeSingle(),
  ]);
  if (showResult.error) throw showResult.error;
  if (invitationResult.error) throw invitationResult.error;
  return { ...(data as ReviewRow), invitationType: invitationResult.data?.invitation_type ?? "automated_verified", show: showResult.data };
}

function reviewUrl(review: ReviewRow) {
  return `${adminOrigin}/admin?section=reviews&reviewId=${encodeURIComponent(review.id)}&reviewStatus=${encodeURIComponent(review.moderation_status)}`;
}

function reviewMeta(review: ReviewContext) {
  const show = review.show ? `${review.show.date} · ${review.show.time.slice(0, 5)}` : "Show unavailable";
  return `${venueLabel(review.venue)} · ${show}`;
}

function renderReviewCard(review: ReviewContext) {
  const attention = isReviewAttentionRating(review.rating);
  const excerpt = review.review_text.replace(/\s+/g, " ").trim().slice(0, 360);
  return `<div style="margin:0 0 14px;padding:16px;border:1px solid ${attention ? "#b45309" : "#4f4525"};border-radius:12px;background:#0e0c0a;">
    <div style="color:${attention ? "#fbbf24" : "#f2d66c"};font-size:12px;font-weight:700;letter-spacing:1px;">${attention ? "NEEDS ATTENTION · " : ""}${escapeHtml(review.rating)} / 5</div>
    <div style="margin-top:7px;color:#fffaf0;font-size:16px;font-weight:700;">${escapeHtml(review.public_display_name)}</div>
    <div style="margin-top:5px;color:#a8a29e;font-size:12px;">${escapeHtml(reviewMeta(review))} · ${escapeHtml(invitationLabel(review.invitationType))} · ${escapeHtml(statusLabel(review.moderation_status))}</div>
    <div style="margin-top:12px;color:#e7e5e4;font-size:14px;line-height:1.55;">${escapeHtml(excerpt)}${review.review_text.length > 360 ? "…" : ""}</div>
    ${review.contact_requested ? '<div style="margin-top:10px;color:#fbbf24;font-size:12px;font-weight:700;">Guest requested contact</div>' : ""}
  </div>`;
}

async function renderImmediate(review: ReviewContext) {
  const subject = `${isReviewAttentionRating(review.rating) ? "Review needs attention" : "New guest review"} - ${review.rating}/5`;
  const url = reviewUrl(review);
  const message = `${subject}\n\n${review.public_display_name}\n${review.rating}/5\n${reviewMeta(review)}\n${invitationLabel(review.invitationType)}\n${statusLabel(review.moderation_status)}\n\n${review.review_text}\n\n${url}`;
  const branded = await createBrandedCustomerEmail({ ctaLabel: "OPEN REVIEW", ctaUrl: url, heading: subject, html: renderReviewCard(review), includeAgePolicy: false, message, subject });
  return { ...branded, subject };
}

async function renderDaily(reviews: ReviewContext[], periodStart: string, periodEnd: string) {
  const attention = reviews.filter((review) => isReviewAttentionRating(review.rating));
  const cpt = reviews.filter((review) => review.venue === "cape-town");
  const jhb = reviews.filter((review) => review.venue === "johannesburg");
  const average = calculateReviewRatingAverage(reviews.map((review) => review.rating));
  const subject = `Daily Review Summary - ${reviews.length} new ${reviews.length === 1 ? "review" : "reviews"}`;
  const url = `${adminOrigin}/admin?section=reviews`;
  const summary = `Reviews: ${reviews.length}\nAverage rating: ${average?.toFixed(1) ?? "-"}\nNeeds attention: ${attention.length}\nCape Town: ${cpt.length}\nJohannesburg: ${jhb.length}`;
  const message = `${subject}\n\n${summary}\nReporting period: ${periodStart} to ${periodEnd}\n\n${reviews.map((review) => `${review.rating}/5 · ${review.public_display_name} · ${reviewMeta(review)}\n${review.review_text}`).join("\n\n")}\n\n${url}`;
  const html = `<div style="margin:0 0 18px;padding:16px;border:1px solid #4f4525;border-radius:12px;background:#0e0c0a;color:#fffaf0;font-size:14px;line-height:1.7;"><strong>${reviews.length}</strong> reviews &nbsp;·&nbsp; <strong>${average?.toFixed(1) ?? "-"}</strong> average &nbsp;·&nbsp; <strong>${attention.length}</strong> need attention<br />Cape Town ${cpt.length} &nbsp;·&nbsp; Johannesburg ${jhb.length}</div>${reviews.slice(0, 20).map(renderReviewCard).join("")}${reviews.length > 20 ? `<p style="color:#a8a29e;font-size:13px;">${reviews.length - 20} more reviews are available in Admin.</p>` : ""}`;
  const branded = await createBrandedCustomerEmail({ ctaLabel: "OPEN REVIEWS", ctaUrl: url, heading: "Daily Review Summary", html, includeAgePolicy: false, message, subject });
  return { ...branded, subject };
}

async function completeAlert(client: SupabaseClient, reviewId: string, status: "sent" | "failed", error?: string) {
  const result = await client.rpc("complete_review_management_alert", { p_error_message: error ?? null, p_review_id: reviewId, p_status: status });
  if (result.error) throw result.error;
}

export async function sendImmediateReviewAlert(client: SupabaseClient, reviewId: string) {
  const config = await loadConfig(client);
  if (!config.immediate_enabled || !config.immediate_activated_at) return { reason: "disabled", sent: false } as const;
  const review = await loadReview(client, reviewId);
  if (!review || review.submitted_at < config.immediate_activated_at) return { reason: "before-activation", sent: false } as const;
  const recipients = await resolveRecipients(client, config.immediate_recipient_staff_ids);
  if (!recipients.to.length) return { reason: "no-recipients", sent: false } as const;
  const claim = await client.rpc("claim_review_management_alert", { p_cc_emails: recipients.cc, p_primary_emails: recipients.to, p_review_id: review.id });
  if (claim.error) throw claim.error;
  if (!claim.data) return { reason: "already-claimed", sent: false } as const;
  try {
    const email = await renderImmediate(review);
    const result = await sendZingaraEmail({ attachments: email.attachments, cc: recipients.cc, html: email.html, message: email.message, subject: email.subject, to: recipients.to });
    if (!result.ok) throw new Error(result.error);
    await completeAlert(client, review.id, "sent");
    return { reason: "sent", sent: true } as const;
  } catch (error) {
    await completeAlert(client, review.id, "failed", error instanceof Error ? error.message : "Unknown email failure");
    throw error;
  }
}

export async function runPendingReviewAlerts(client: SupabaseClient) {
  const config = await loadConfig(client);
  if (!config.immediate_enabled || !config.immediate_activated_at) return { attempted: 0, sent: 0 };
  const { data, error } = await client.from("guest_reviews").select("id").gte("submitted_at", config.immediate_activated_at).order("submitted_at").limit(100);
  if (error) throw error;
  let sent = 0;
  for (const review of data ?? []) {
    try { if ((await sendImmediateReviewAlert(client, review.id)).sent) sent += 1; }
    catch (error) { console.error("[Review Management] Immediate alert retry failed", { reviewId: review.id, error }); }
  }
  return { attempted: data?.length ?? 0, sent };
}

async function loadReviewsBetween(client: SupabaseClient, start: string, end: string) {
  const { data, error } = await client.from("guest_reviews").select("id").gte("submitted_at", start).lt("submitted_at", end).order("submitted_at");
  if (error) throw error;
  return (await Promise.all((data ?? []).map((row) => loadReview(client, row.id)))).filter((review): review is ReviewContext => Boolean(review));
}

export async function runDailyReviewSummary(client: SupabaseClient, now = new Date()) {
  const config = await loadConfig(client);
  if (!config.daily_enabled || !config.daily_activated_at) return { reason: "disabled", sent: false } as const;
  const minute = currentMinute(now);
  const scheduled = scheduledMinute(config.daily_time);
  if (minute < scheduled || minute >= scheduled + 60) return { reason: "outside-window", sent: false } as const;
  const reportDate = dateKey(now);
  const periodEnd = scheduleInstant(reportDate, config.daily_time).toISOString();
  const { data: last, error: lastError } = await client.from("review_management_daily_deliveries").select("period_end").in("status", ["sent", "skipped"]).order("period_end", { ascending: false }).limit(1).maybeSingle();
  if (lastError) throw lastError;
  const periodStart = last?.period_end ?? config.daily_activated_at;
  if (periodStart >= periodEnd) return { reason: "activated-after-schedule", sent: false } as const;
  const reviews = await loadReviewsBetween(client, periodStart, periodEnd);
  const recipients = await resolveRecipients(client, config.daily_recipient_staff_ids);
  const attentionCount = reviews.filter((review) => isReviewAttentionRating(review.rating)).length;
  const claim = await client.rpc("claim_review_management_daily", { p_attention_count: attentionCount, p_cc_emails: recipients.cc, p_period_end: periodEnd, p_period_start: periodStart, p_primary_emails: recipients.to, p_report_date: reportDate, p_review_count: reviews.length });
  if (claim.error) throw claim.error;
  if (!claim.data) return { reason: "already-claimed", sent: false } as const;
  const complete = async (status: "sent" | "failed" | "skipped", error?: string) => {
    const result = await client.rpc("complete_review_management_daily", { p_error_message: error ?? null, p_report_date: reportDate, p_status: status });
    if (result.error) throw result.error;
  };
  if (!reviews.length) { await complete("skipped"); return { reason: "empty", sent: false } as const; }
  if (!recipients.to.length) { await complete("failed", "No active configured recipients."); return { reason: "no-recipients", sent: false } as const; }
  try {
    const email = await renderDaily(reviews, periodStart, periodEnd);
    const result = await sendZingaraEmail({ attachments: email.attachments, cc: recipients.cc, html: email.html, message: email.message, subject: email.subject, to: recipients.to });
    if (!result.ok) throw new Error(result.error);
    await complete("sent");
    return { reason: "sent", sent: true } as const;
  } catch (error) {
    await complete("failed", error instanceof Error ? error.message : "Unknown email failure");
    throw error;
  }
}

export async function runReviewManagementWorkflows(client: SupabaseClient, now = new Date()) {
  const [alerts, daily] = await Promise.all([runPendingReviewAlerts(client), runDailyReviewSummary(client, now)]);
  return { alerts, daily };
}

export async function loadReviewManagementConfiguration(client: SupabaseClient, now = new Date()) {
  const config = await loadConfig(client);
  return {
    dailyActivatedAt: config.daily_activated_at,
    dailyEnabled: config.daily_enabled,
    dailyRecipientStaffIds: config.daily_recipient_staff_ids,
    dailyTime: config.daily_time.slice(0, 5),
    immediateActivatedAt: config.immediate_activated_at,
    immediateEnabled: config.immediate_enabled,
    immediateRecipientStaffIds: config.immediate_recipient_staff_ids,
    nextDailyRunAt: config.daily_enabled ? nextRunAt(now, config.daily_time) : null,
  };
}

export async function saveReviewManagementConfiguration(client: SupabaseClient, input: { dailyEnabled: boolean; dailyRecipientStaffIds: string[]; dailyTime: string; immediateEnabled: boolean; immediateRecipientStaffIds: string[] }, updatedBy: string | null, now = new Date()) {
  if (!input.dailyTime.match(/^([01]\d|2[0-3]):[0-5]\d$/)) throw new Error("Enter a valid daily time.");
  const staff = await loadStaff(client);
  const validIds = new Set(staff.filter((member) => member.active && member.email).map((member) => member.id));
  for (const id of [...input.dailyRecipientStaffIds, ...input.immediateRecipientStaffIds]) if (!validIds.has(id)) throw new Error("Choose active staff members with valid email addresses.");
  if (input.immediateEnabled && !input.immediateRecipientStaffIds.length) throw new Error("Choose an immediate alert recipient.");
  if (input.dailyEnabled && !input.dailyRecipientStaffIds.length) throw new Error("Choose a daily summary recipient.");
  const current = await loadConfig(client);
  const immediateActivatedAt = input.immediateEnabled ? current.immediate_enabled ? current.immediate_activated_at : now.toISOString() : null;
  const dailyActivatedAt = input.dailyEnabled ? current.daily_enabled ? current.daily_activated_at : now.toISOString() : null;
  const { error } = await client.from("review_management_configuration").upsert({ id: true, immediate_enabled: input.immediateEnabled, daily_enabled: input.dailyEnabled, daily_time: `${input.dailyTime}:00`, immediate_recipient_staff_ids: input.immediateRecipientStaffIds, daily_recipient_staff_ids: input.dailyRecipientStaffIds, immediate_activated_at: immediateActivatedAt, daily_activated_at: dailyActivatedAt, updated_at: now.toISOString(), updated_by: updatedBy });
  if (error) throw error;
  return loadReviewManagementConfiguration(client, now);
}

export async function previewReviewManagement(client: SupabaseClient) {
  const [configuration, staff] = await Promise.all([loadReviewManagementConfiguration(client), loadStaff(client)]);
  const activeStaff = staff.filter((member) => member.active && member.email);
  const immediateRecipients = await resolveRecipients(client, configuration.immediateRecipientStaffIds);
  const dailyRecipients = await resolveRecipients(client, configuration.dailyRecipientStaffIds);
  const example: ReviewContext = { contact_requested: true, id: "preview", invitation_id: "preview", invitationType: "automated_verified", moderation_status: "needs_review", public_display_name: "Verified Guest", rating: 2, review_text: "The team should review this feedback and follow up with the guest where appropriate.", show_id: "preview", submitted_at: new Date().toISOString(), venue: "johannesburg", verified_guest: true, show: { date: dateKey(new Date()), name: "The Royal Countess", time: "17:00:00" } };
  const [immediateExample, dailyExample] = await Promise.all([renderImmediate(example), renderDaily([example], new Date(Date.now() - 86_400_000).toISOString(), new Date().toISOString())]);
  return { configuration, dailyExample: { html: dailyExample.html, subject: dailyExample.subject }, dailyRecipients, immediateExample: { html: immediateExample.html, subject: immediateExample.subject }, immediateRecipients, staff: activeStaff };
}
