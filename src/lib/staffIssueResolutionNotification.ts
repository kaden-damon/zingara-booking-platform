import type { SupabaseClient } from "@supabase/supabase-js";
import { insertCommunicationPayload } from "@/lib/email/communicationIdempotency";
import { createBrandedCustomerEmail } from "@/lib/email/customerEmail";
import { containsHtmlMarkup, sanitizeEmailHtml } from "@/lib/email/html";
import { sendZingaraEmail } from "@/lib/email/smtp";
import { claimStaffEmailDelivery, completeStaffEmailDelivery, isPersonalEmailSubscriptionEnabled } from "@/lib/email/staffEmailNotifications";
import { getStaffIssueResolutionTime, isValidStaffIssueResolutionNotes } from "@/lib/staffIssues";
import { normalizeStaffLocation, normalizeStaffVenueScope } from "@/lib/staffLocations";
import { getRolePermissions, type StaffProfileRow } from "@/lib/supabase/serverAdmin";
import type { Permission } from "@/lib/zingaraAccess";

type Resolution = {
  createdAt: string; completedAt: string; title: string; notes: string;
  reporterStaffId: string | null;
  technicalContext?: { bookingReference?: string; showId?: string; adminPath?: string };
};
type Action = { label: string; url: string } | null;
const origin = "https://book.zingara.co.za";
const templateName = "Staff Issue Resolution";
export const staffIssueResolutionTemplate = {
  subject: "{{bug_reference}} resolved",
  body: "Hello {{reporter_name}},\n\n{{resolution_notes}}",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function buildStaffIssueResolutionContent(input: {
  reference: string; resolution: Resolution; reporterName: string; action: Action;
  template?: { subject: string | null; body: string };
}) {
  const { resolution, action } = input;
  const duration = getStaffIssueResolutionTime(resolution.createdAt, resolution.completedAt);
  if (!duration || !isValidStaffIssueResolutionNotes(resolution.notes)) throw new Error("Verified resolution details are required.");
  const variables: Record<string, string> = {
    bug_reference: input.reference, issue_summary: resolution.title, status: "Resolved",
    resolution_time: duration, reporter_name: input.reporterName, resolution_notes: resolution.notes,
  };
  const render = (value: string, html = false) => value.replace(/\{\{\s*(\w+)\s*\}\}/g,
    (_, key: string) => html ? escapeHtml(variables[key] ?? "") : variables[key] ?? "");
  const template = input.template ?? staffIssueResolutionTemplate;
  const subject = render(template.subject ?? staffIssueResolutionTemplate.subject).replace(/[\r\n]/g, " ");
  const body = render(template.body);
  const htmlBody = containsHtmlMarkup(template.body)
    ? sanitizeEmailHtml(render(template.body, true))
    : escapeHtml(body).replace(/\n/g, "<br>");
  return {
    subject,
    message: [`${input.reference} | Resolved`, resolution.title, duration, "", body,
      ...(action ? ["", `${action.label}: ${action.url}`] : [])].join("\n"),
    html: `<p>${escapeHtml(input.reference)} | Resolved</p><h2 style="color:#D8C36A;font-size:24px;line-height:1.4">${escapeHtml(duration)}</h2><p>${escapeHtml(resolution.title)}</p><div>${htmlBody}</div>`,
  };
}

export async function resolveStaffIssueAction(client: SupabaseClient, resolution: Resolution, profile: StaffProfileRow): Promise<Action> {
  const role = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
  const permissions = getRolePermissions(role);
  const scope = normalizeStaffVenueScope(profile.venue_scope ?? []);
  const context = resolution.technicalContext;
  const url = new URL("/admin", origin);
  let section = "";
  let label = "";
  let permission: Permission;
  let showId = context?.showId;
  if (context?.bookingReference) {
    const { data, error } = await client.from("bookings").select("show_id").eq("booking_reference", context.bookingReference).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    showId = data.show_id;
    section = "bookings"; label = "Open booking"; permission = "bookings:manage";
    url.searchParams.set("booking", context.bookingReference);
  } else {
    let path: URL;
    try { path = new URL(context?.adminPath || (showId ? "/admin" : ""), origin); } catch { return null; }
    if (path.origin !== origin || path.pathname !== "/admin") return null;
    const requested = path.searchParams.get("section") ?? (showId
      ? permissions.includes("bookings:manage") ? "bookings" : "floor"
      : null);
    const sections: Record<string, [string, Permission]> = {
      bookings: ["Open bookings", "bookings:manage"],
      floor: ["Open floor", "tables:manage"],
      "floor-arrivals": ["Open floor", "tables:manage"],
      customers: ["Open customers", "crm:read"],
      waitlist: ["Open waitlist", "waitlist:manage"],
    };
    const target = sections[requested ?? ""];
    if (!target) return null;
    section = requested === "floor-arrivals" ? "floor" : requested!;
    [label, permission] = target;
    if (section === "bookings" && showId) label = "Open performance";
    showId ??= path.searchParams.get("show") ?? undefined;
  }
  if (!permissions.includes(permission)) return null;
  if (showId) {
    const { data, error } = await client.from("shows").select("id,venue").eq("id", showId).maybeSingle();
    if (error) throw error;
    const venue = normalizeStaffLocation(data?.venue);
    if (!data || !venue || (!scope.includes("all") && !scope.includes(venue))) return null;
    url.searchParams.set("show", data.id);
  } else if (section === "floor") {
    return null; // Never open a previously selected, unrelated performance.
  }
  url.searchParams.set("section", section);
  return { label, url: url.toString() };
}

export async function runStaffIssueResolutionNotifications(client: SupabaseClient, issueId?: string) {
  let pending = client.from("staff_email_notification_deliveries").select("event_key")
    .eq("notification_key", "staff-issue-resolution").eq("status", "pending")
    .order("created_at", { ascending: true }).limit(20);
  if (issueId) pending = pending.eq("event_key", issueId);
  const { data: events, error } = await pending;
  if (error) throw error;
  const results: Array<{ issueId: string; status: string }> = [];
  for (const event of events ?? []) {
    let deliveryId: string | null = null;
    let communicationId: string | null = null;
    let smtpStarted = false;
    try {
      const { data: issue, error: issueError } = await client.from("staff_issue_reports")
        .select("id,ticket_reference,status,metadata").eq("id", event.event_key).maybeSingle();
      if (issueError) throw issueError;
      const resolution = issue?.metadata?.verifiedResolution as Resolution | undefined;
      if (!issue || !resolution) throw new Error("Resolution evidence is missing.");
      const { data: profile, error: profileError } = await client.from("staff_profiles")
        .select("id,user_id,full_name,email,active,venue_scope,roles(name,role_permissions(permissions(key)))")
        .eq("id", resolution.reporterStaffId ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
      if (profileError) throw profileError;
      const enabled = profile?.active && profile.email && issue.status === "completed" &&
        await isPersonalEmailSubscriptionEnabled(client, profile.id, "staff-issue-resolution");
      const { data: template, error: templateError } = await client.from("communication_templates")
        .select("subject,body,active").eq("name", templateName).eq("channel", "email").maybeSingle();
      if (templateError) throw templateError;
      const action = enabled ? await resolveStaffIssueAction(client, resolution, profile as unknown as StaffProfileRow) : null;
      const content = buildStaffIssueResolutionContent({ reference: issue.ticket_reference, resolution,
        reporterName: profile?.full_name ?? "there", action, template: template ?? undefined });
      const branded = await createBrandedCustomerEmail({ ...content, heading: "Issue resolved",
        includeAgePolicy: false, includeSecurityNotice: false, includePrimaryCta: Boolean(action),
        ctaLabel: action?.label, ctaUrl: action?.url });
      deliveryId = await claimStaffEmailDelivery(client, { ccStaffProfileIds: [], eventKey: issue.id,
        notificationKey: "staff-issue-resolution", toStaffProfileIds: profile ? [profile.id] : [] });
      if (!deliveryId) continue;
      const suppressed = !enabled || template?.active === false;
      const communication = await insertCommunicationPayload(client, {
        booking_id: null, channel: "email", customer_id: null, show_id: null,
        message: `To: ${profile?.email ?? "No active reporter email"}\n${content.message}`,
        subject: content.subject, type: "custom_message", sent_at: null,
        status: suppressed ? "suppressed" : "sending",
      });
      if (!communication) throw new Error("Communications evidence is required before sending.");
      communicationId = communication.id;
      if (suppressed) {
        await completeStaffEmailDelivery(client, deliveryId, { status: "suppressed", error: "Reporter preference, account, issue status or template disabled delivery." });
        results.push({ issueId: issue.id, status: "suppressed" });
        continue;
      }
      smtpStarted = true;
      const sent = await sendZingaraEmail({ ...content, html: branded.html, message: branded.message,
        attachments: branded.attachments, to: profile.email });
      const status = sent.ok ? "sent" : "failed";
      const { error: logError } = await client.from("communications").update({ status,
        sent_at: sent.ok ? new Date().toISOString() : null }).eq("id", communicationId);
      if (logError) throw logError;
      await completeStaffEmailDelivery(client, deliveryId, { status, error: sent.ok ? undefined : sent.error });
      results.push({ issueId: issue.id, status });
    } catch {
      // Before SMTP, safely release for the scheduled worker. After handoff,
      // preserve uncertainty for reconciliation rather than risk a second email.
      if (deliveryId) {
        if (!smtpStarted) {
          const { error: resetError } = await client.from("staff_email_notification_deliveries")
            .update({ status: "pending", last_error: "Notification preparation failed; retry pending." }).eq("id", deliveryId);
          if (resetError) console.error("[Zingara Issues] Resolution queue update failed");
        } else {
          await completeStaffEmailDelivery(client, deliveryId, { status: "failed", error: "Delivery outcome requires review before any resend." });
        }
      }
      results.push({ issueId: event.event_key, status: "failed" });
      console.error("[Zingara Issues] Resolution notification requires review", { issueId: event.event_key, smtpStarted });
    }
  }
  return results;
}
