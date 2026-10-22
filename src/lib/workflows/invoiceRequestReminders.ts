import type { SupabaseClient } from "@supabase/supabase-js";

import { createBrandedCustomerEmail } from "@/lib/email/customerEmail";
import { sendZingaraEmail } from "@/lib/email/smtp";
import {
  claimStaffEmailDelivery,
  completeStaffEmailDelivery,
  loadManagementEmailRoute,
} from "@/lib/email/staffEmailNotifications";

const timeZone = "Africa/Johannesburg";
const scheduleHour = 8;
const summaryLimit = 25;
const adminOrigin = "https://book.zingara.co.za";

type InvoiceRequestRow = {
  company_id: string | null;
  customer_name: string;
  invoice_requested_at: string;
  local_reference: string;
  total_cents: number;
};

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dateKey(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function currentHour(now: Date) {
  return Number(
    new Intl.DateTimeFormat("en-ZA", {
      hour: "2-digit",
      hour12: false,
      timeZone,
    }).format(now),
  );
}

function money(cents: number) {
  return new Intl.NumberFormat("en-ZA", {
    currency: "ZAR",
    style: "currency",
  }).format(cents / 100);
}

function requestedDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeZone,
  }).format(new Date(value));
}

export function renderInvoiceRequestReminder(
  requests: InvoiceRequestRow[],
  total: number,
) {
  const queueUrl = `${adminOrigin}/admin?section=reports&report=accounting&invoiceRequested=true`;
  const rows = requests
    .map(
      (request) => `<tr>
        <td style="padding:10px 8px;border-bottom:1px solid #3b3420;color:#f2d66c;font-weight:700;">${escapeHtml(request.local_reference)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #3b3420;color:#fffaf0;">${escapeHtml(request.customer_name)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #3b3420;color:#fffaf0;text-align:right;white-space:nowrap;">${escapeHtml(money(request.total_cents))}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #3b3420;color:#a8a29e;white-space:nowrap;">${escapeHtml(requestedDate(request.invoice_requested_at))}</td>
      </tr>`,
    )
    .join("");
  const remainder = Math.max(0, total - requests.length);
  const html = `<p>Good morning,</p>
    <p>There are currently <strong>${total}</strong> quotations awaiting invoicing.</p>
    <div style="margin:18px 0;overflow-x:auto;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border:1px solid #4f4525;border-radius:12px;background:#0e0c0a;font-size:12px;">
        <thead><tr><th align="left" style="padding:10px 8px;color:#d8c36a;">Quotation</th><th align="left" style="padding:10px 8px;color:#d8c36a;">Customer / Company</th><th align="right" style="padding:10px 8px;color:#d8c36a;">Amount</th><th align="left" style="padding:10px 8px;color:#d8c36a;">Requested</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${remainder ? `<p style="color:#a8a29e;font-size:12px;">${remainder} more request${remainder === 1 ? "" : "s"} are available in the Accounts queue.</p>` : ""}`;
  const message = [
    "Good morning,",
    "",
    `There are currently ${total} quotations awaiting invoicing.`,
    "",
    ...requests.map(
      (request) =>
        `${request.local_reference} | ${request.customer_name} | ${money(request.total_cents)} | ${requestedDate(request.invoice_requested_at)}`,
    ),
    ...(remainder ? ["", `${remainder} more requests are available in Zingara.`] : []),
    "",
    queueUrl,
  ].join("\n");
  return { html, message, queueUrl };
}

export async function runInvoiceRequestReminder(
  client: SupabaseClient,
  now = new Date(),
) {
  const route = await loadManagementEmailRoute(
    client,
    "invoice-request-reminders",
  );
  if (!route.enabled) return { reason: "disabled", sent: false } as const;
  if (currentHour(now) !== scheduleHour) {
    return { reason: "outside-window", sent: false } as const;
  }
  if (!route.to.length) return { reason: "no-recipients", sent: false } as const;

  const [{ data, error }, countResult] = await Promise.all([
    client
      .from("xero_documents")
      .select("local_reference,customer_name,company_id,total_cents,invoice_requested_at")
      .eq("kind", "quote")
      .eq("status", "accepted")
      .not("invoice_requested_at", "is", null)
      .order("invoice_requested_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(summaryLimit),
    client
      .from("xero_documents")
      .select("id", { count: "exact", head: true })
      .eq("kind", "quote")
      .eq("status", "accepted")
      .not("invoice_requested_at", "is", null),
  ]);
  if (error) throw error;
  if (countResult.error) throw countResult.error;
  const requests = (data ?? []) as InvoiceRequestRow[];
  const total = countResult.count ?? requests.length;
  if (!total) return { reason: "empty", sent: false } as const;

  const reportDate = dateKey(now);
  const deliveryId = await claimStaffEmailDelivery(client, {
    ccStaffProfileIds: route.cc.map((recipient) => recipient.id),
    eventKey: reportDate,
    notificationKey: "invoice-request-reminders",
    toStaffProfileIds: route.to.map((recipient) => recipient.id),
  });
  if (!deliveryId) return { reason: "already-claimed", sent: false } as const;

  const subject = "Zingara | Invoices Awaiting Processing";
  const content = renderInvoiceRequestReminder(requests, total);
  const branded = await createBrandedCustomerEmail({
    ctaLabel: "VIEW INVOICE REQUESTS",
    ctaUrl: content.queueUrl,
    heading: "INVOICES AWAITING PROCESSING",
    html: content.html,
    includeAgePolicy: false,
    message: content.message,
    subject,
  });
  const result = await sendZingaraEmail({
    attachments: branded.attachments,
    cc: route.cc.map((recipient) => recipient.email),
    html: branded.html,
    message: branded.message,
    subject,
    to: route.to.map((recipient) => recipient.email),
  });
  await completeStaffEmailDelivery(client, deliveryId, {
    error: result.ok ? undefined : result.error,
    status: result.ok ? "sent" : result.suppressed ? "suppressed" : "failed",
  });
  if (!result.ok) throw new Error(result.error);
  return { reason: "sent", sent: true, total } as const;
}
