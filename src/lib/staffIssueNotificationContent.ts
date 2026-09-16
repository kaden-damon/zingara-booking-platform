import {
  staffIssueEmailAttachmentLimit,
  type StaffIssueMediaType,
} from "./staffIssueMedia.ts";

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
};

export type StaffIssueNotificationContentMedia = {
  content: Buffer;
  fileSize: number;
  mimeType: StaffIssueMediaType;
  originalFilename: string;
};

const productionAdminOrigin = "https://book.zingara.co.za";

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
      return;
    }

    attachmentLines.push(
      `${item.originalFilename} - View in Zingara: ${getIssueAdminUrl(issue.id)}`,
    );
  });

  const message = [
    `A new Zingara staff issue has been reported: ${issue.ticketReference}`,
    "",
    `Title: ${issue.title}`,
    `Category: ${issue.categoryLabel}`,
    `Priority: ${issue.priorityLabel}`,
    `Description: ${issue.description}`,
    `Reporter: ${issue.reporterName ?? issue.reporterEmail ?? "Not recorded"}`,
    `Location: ${issue.location ?? "Not location-specific"}`,
    `Module / Area: ${issue.moduleOrArea ?? "Not recorded"}`,
    `Created: ${issue.createdAt}`,
    ...(attachmentLines.length > 0
      ? ["", "Attachments:", ...attachmentLines]
      : []),
    "",
    `Admin: ${getIssueAdminUrl(issue.id)}`,
  ].join("\n");

  return { attachments, message };
}
