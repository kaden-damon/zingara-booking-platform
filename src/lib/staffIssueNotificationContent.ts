import {
  staffIssueEmailAttachmentLimit,
  type StaffIssueMediaType,
} from "./staffIssueMedia.ts";
import type { AdminIssueTechnicalContext } from "./adminIssueCapture.ts";

export type StaffIssueNotificationContentDetails = {
  categoryLabel: string;
  createdAt: string;
  description: string;
  id: string;
  location: string | null;
  moduleOrArea: string | null;
  priorityLabel: string;
  reporterEmail: string | null;
  reporterName: string | null;
  ticketReference: string;
  title: string;
  technicalContext?: AdminIssueTechnicalContext | null;
};

export type StaffIssueNotificationContentMedia = {
  content: Buffer;
  fileSize: number;
  mimeType: StaffIssueMediaType;
  originalFilename: string;
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

function formatSastTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return /\bSAST\b/i.test(value) ? value : `${value} SAST`;
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return /\bSAST\b/i.test(value) ? value : `${value} SAST`;
  }

  return `${new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(parsed)} SAST`;
}

function getIssueAdminUrl(issueId: string) {
  const url = new URL("/admin", productionAdminOrigin);
  url.searchParams.set("section", "platform-operations");
  url.searchParams.set("issue", issueId);
  return url.toString();
}

export function buildStaffIssueNotificationContent(
  issue: StaffIssueNotificationContentDetails,
  media: StaffIssueNotificationContentMedia[] = [],
) {
  const attachments: Array<{
    cid: string;
    content: Buffer;
    contentDisposition: "attachment";
    contentType: StaffIssueMediaType;
    filename: string;
  }> = [];
  const attachmentLines: string[] = [];
  const attachmentHtmlLines: string[] = [];
  let attachedSize = 0;

  media.forEach((item, index) => {
    if (attachedSize + item.fileSize <= staffIssueEmailAttachmentLimit) {
      attachments.push({
        cid: `staff-issue-${issue.id}-${index}@book.zingara.co.za`,
        content: item.content,
        contentDisposition: "attachment",
        contentType: item.mimeType,
        filename: item.originalFilename,
      });
      attachedSize += item.fileSize;
      attachmentLines.push(`${item.originalFilename} - attached`);
      attachmentHtmlLines.push(
        `<div style="margin-top:6px;color:#d4d4d4;font-size:13px;line-height:1.5;">${escapeHtml(item.originalFilename)} · attached</div>`,
      );
      return;
    }

    const issueUrl = getIssueAdminUrl(issue.id);
    attachmentLines.push(
      `${item.originalFilename} - View in Zingara: ${issueUrl}`,
    );
    attachmentHtmlLines.push(
      `<div style="margin-top:6px;color:#d4d4d4;font-size:13px;line-height:1.5;">${escapeHtml(item.originalFilename)} · <a href="${escapeHtml(issueUrl)}" style="color:#f2d66c;text-decoration:underline;">view in Zingara</a></div>`,
    );
  });

  const technicalContext = issue.technicalContext;
  const technicalLines: string[] = [];
  const addTechnicalLine = (
    label: string,
    value: number | string | null | undefined,
  ) => {
    if (value === null || value === undefined || value === "") return;
    technicalLines.push(`${label}: ${value}`);
  };

  if (technicalContext) {
    addTechnicalLine("Action", technicalContext.action);
    addTechnicalLine("Actual error", technicalContext.errorMessage);
    addTechnicalLine("Error code", technicalContext.errorCode);
    addTechnicalLine("HTTP status", technicalContext.status);
    addTechnicalLine("Booking reference", technicalContext.bookingReference);
    if (
      technicalContext.guestCountBefore !== undefined ||
      technicalContext.guestCountAfter !== undefined
    ) {
      addTechnicalLine(
        "Guest change",
        `${technicalContext.guestCountBefore ?? "?"} -> ${technicalContext.guestCountAfter ?? "?"}`,
      );
    }
    addTechnicalLine("Performance", technicalContext.performanceDate);
    addTechnicalLine("Venue", technicalContext.venue);
    addTechnicalLine("Show ID", technicalContext.showId);
    addTechnicalLine("Page", technicalContext.adminPath);
    addTechnicalLine("Request ID", technicalContext.requestId);
    addTechnicalLine("Browser", technicalContext.browser);
    addTechnicalLine(
      "Device / viewport",
      [technicalContext.device, technicalContext.viewport]
        .filter(Boolean)
        .join(" / "),
    );
    addTechnicalLine("Application version", technicalContext.applicationVersion);
    addTechnicalLine(
      "Time",
      technicalContext.timestampSast
        ? formatSastTimestamp(technicalContext.timestampSast)
        : undefined,
    );
  }

  const createdAtSast = formatSastTimestamp(issue.createdAt);
  const reporter = issue.reporterName ?? issue.reporterEmail ?? "Not recorded";
  const reportLines = [
    `Investigate ${issue.ticketReference}: ${issue.title}`,
    `Description: ${issue.description}`,
    `Category: ${issue.categoryLabel}`,
    `Priority: ${issue.priorityLabel}`,
    `Reporter: ${reporter}`,
    ...(issue.location ? [`Location: ${issue.location}`] : []),
    ...(issue.moduleOrArea ? [`Module / area: ${issue.moduleOrArea}`] : []),
    `Created: ${createdAtSast}`,
    ...technicalLines,
  ];
  const report = reportLines.join("\n");
  const message = [
    `New issue · ${issue.ticketReference}`,
    `Title: ${issue.title}`,
    `Priority: ${issue.priorityLabel}`,
    `Reporter: ${reporter}`,
    `Created: ${createdAtSast}`,
    "",
    "REPORT",
    report,
    ...(attachmentLines.length > 0
      ? ["", "Attachments:", ...attachmentLines]
      : []),
    "",
    `Admin: ${getIssueAdminUrl(issue.id)}`,
  ].join("\n");

  const summaryRows = [
    ["Reference", issue.ticketReference],
    ["Issue", issue.title],
    ["Priority", issue.priorityLabel],
    ["Reporter", reporter],
    ["Created", createdAtSast],
  ]
    .map(
      ([label, value]) => `<tr>
        <td style="padding:4px 12px 4px 0;color:#8f8a83;font-size:12px;line-height:1.45;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
        <td style="padding:4px 0;color:#fffaf0;font-size:13px;font-weight:600;line-height:1.45;vertical-align:top;">${escapeHtml(value)}</td>
      </tr>`,
    )
    .join("");
  const html = `<div style="margin:0 0 18px;padding:14px 16px;border:1px solid #4f4525;border-radius:14px;background:#0e0c0a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${summaryRows}</table>
  </div>
  <div data-zingara-issue-report="true" style="margin:0;padding:16px;border:1px solid #6d5e2d;border-radius:14px;background:#080706;">
    <div style="margin:0 0 10px;color:#f2d66c;font-size:12px;font-weight:700;letter-spacing:1.8px;line-height:1.4;">REPORT</div>
    <div style="margin:0;color:#f5f5f4;font-family:Consolas,'Courier New',monospace;font-size:12px;line-height:1.65;white-space:pre-wrap;word-break:break-word;user-select:text;">${escapeHtml(report)}</div>
  </div>
  ${
    attachmentHtmlLines.length > 0
      ? `<div style="margin-top:18px;"><div style="color:#f2d66c;font-size:12px;font-weight:700;letter-spacing:1.4px;">ATTACHMENTS</div>${attachmentHtmlLines.join("")}</div>`
      : ""
  }`;

  return {
    attachments,
    html,
    issueUrl: getIssueAdminUrl(issue.id),
    message,
  };
}
