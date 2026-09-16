import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  detectStaffIssueMediaType,
  staffIssueEmailAttachmentLimit,
  staffIssueMediaMaxFileSize,
  validateStaffIssueAttachmentDescriptors,
  validateStaffIssueMediaContent,
} from "./staffIssueMedia.ts";
import { buildStaffIssueNotificationContent } from "./staffIssueNotificationContent.ts";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

const descriptor = (
  name: string,
  mimeType = "image/png",
  fileSize = 1024,
) => ({
  clientId: `client-${name}`,
  fileSize,
  mimeType,
  originalFilename: name,
});

const issue = {
  categoryLabel: "System / Technical",
  createdAt: "2026-09-16T08:00:00.000Z",
  description: "The issue description",
  id: "issue-id",
  location: "Cape Town",
  moduleOrArea: "Bookings",
  priorityLabel: "Normal",
  reporterEmail: "staff@example.com",
  reporterName: "Staff Member",
  ticketReference: "BUG-000001",
  title: "Example issue",
};

test("optional, multiple, video, and mixed attachment descriptors validate", () => {
  assert.equal(validateStaffIssueAttachmentDescriptors([]), null);
  assert.equal(
    validateStaffIssueAttachmentDescriptors([descriptor("one.png")]),
    null,
  );
  assert.equal(
    validateStaffIssueAttachmentDescriptors([
      descriptor("one.jpg", "image/jpeg"),
      descriptor("two.webp", "image/webp"),
    ]),
    null,
  );
  assert.equal(
    validateStaffIssueAttachmentDescriptors([
      descriptor("clip.mp4", "video/mp4"),
      descriptor("clip.mov", "video/quicktime"),
      descriptor("screen.png"),
    ]),
    null,
  );
});

test("unsupported and oversized media are rejected before issue creation", () => {
  assert.match(
    validateStaffIssueAttachmentDescriptors([
      descriptor("payload.exe", "application/x-msdownload"),
    ]) ?? "",
    /not a supported image or video format/,
  );
  assert.match(
    validateStaffIssueAttachmentDescriptors([
      descriptor("large.mov", "video/quicktime", staffIssueMediaMaxFileSize + 1),
    ]) ?? "",
    /25 MB file limit/,
  );
});

test("server content sniffing recognizes supported image and ISO video signatures", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
  const png = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const webp = Buffer.from("RIFF0000WEBP", "ascii");
  const mp4 = Buffer.from("0000ftypisom", "ascii");
  const mov = Buffer.from("0000ftypqt  ", "ascii");

  assert.equal(detectStaffIssueMediaType(jpeg), "image/jpeg");
  assert.equal(detectStaffIssueMediaType(png), "image/png");
  assert.equal(detectStaffIssueMediaType(webp), "image/webp");
  assert.equal(detectStaffIssueMediaType(mp4), "video/mp4");
  assert.equal(detectStaffIssueMediaType(mov), "video/quicktime");
  assert.match(
    validateStaffIssueMediaContent(Buffer.from("not-media"), "image/png") ?? "",
    /not a supported image or video/,
  );
  assert.match(
    validateStaffIssueMediaContent(jpeg, "image/png") ?? "",
    /does not match/,
  );
});

test("small media is attached and large media uses an authenticated Zingara link", () => {
  const notification = buildStaffIssueNotificationContent(issue, [
    {
      content: Buffer.from("small"),
      fileSize: 5,
      mimeType: "image/png",
      originalFilename: "screenshot.png",
    },
    {
      content: Buffer.from("large"),
      fileSize: staffIssueEmailAttachmentLimit + 1,
      mimeType: "video/quicktime",
      originalFilename: "recording.mov",
    },
  ]);

  assert.equal(notification.attachments.length, 1);
  assert.equal(notification.attachments[0]?.filename, "screenshot.png");
  assert.match(notification.message, /screenshot\.png - attached/);
  assert.match(
    notification.message,
    /recording\.mov - View in Zingara: https:\/\/book\.zingara\.co\.za\/admin\?section=platform-operations&issue=issue-id/,
  );
});

test("private storage and metadata permanently link media to the issue", async () => {
  const migration = await source(
    "../../supabase/migrations/20260916090000_phase_41_2n_staff_issue_media.sql",
  );

  assert.match(migration, /issue_id uuid not null references public\.staff_issue_reports/);
  assert.match(migration, /uploader_staff_id uuid not null/);
  assert.match(migration, /original_filename text not null/);
  assert.match(migration, /mime_type text not null/);
  assert.match(migration, /file_size bigint not null/);
  assert.match(migration, /storage_path text not null unique/);
  assert.match(migration, /'staff-issue-media'/);
  assert.match(migration, /public,\s*file_size_limit/);
  assert.match(migration, /false,\s*26214400/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all .* from anon, authenticated/);
});

test("issue creation persists first, finalizes uploads, and reports partial failure accurately", async () => {
  const [route, finalize, client] = await Promise.all([
    source("../app/api/admin/issues/route.ts"),
    source("../app/api/admin/issues/attachments/finalize/route.ts"),
    source("./staffIssueMediaClient.ts"),
  ]);

  assert.ok(
    route.indexOf('.from("staff_issue_reports")') <
      route.indexOf("await notifyKadenOfStaffIssue"),
  );
  assert.match(route, /attachmentUploads\.length === 0/);
  assert.match(client, /uploadToSignedUrl/);
  assert.match(client, /attachments\/finalize/);
  assert.match(finalize, /status: "failed", upload_error: reason/);
  assert.match(finalize, /status: "ready"/);
  assert.match(finalize, /notificationDelivered/);
});

test("issue list carries metadata only and detail access is authenticated and batched", async () => {
  const [route, access, detail] = await Promise.all([
    source("../app/api/admin/issues/route.ts"),
    source("../app/api/admin/issues/attachments/access/route.ts"),
    source("../app/admin/StaffIssueAttachments.tsx"),
  ]);

  assert.match(route, /attachments:staff_issue_attachments\(id,original_filename,mime_type,file_size,status,created_at\)/);
  assert.doesNotMatch(route, /storage_path,status,created_at\),reporter/);
  assert.match(access, /requireActiveStaff/);
  assert.match(access, /createSignedUrls/);
  assert.match(access, /canManageStaffIssues/);
  assert.match(detail, /attachments\/access\?issueId=/);
  assert.doesNotMatch(detail, /setInterval|poll/);
});

test("historical issues and existing workflows remain attachment-optional", async () => {
  const [route, types, page, guidance] = await Promise.all([
    source("../app/api/admin/issues/route.ts"),
    source("./staffIssues.ts"),
    source("../app/admin/page.tsx"),
    source("./staffActionGuidance.ts"),
  ]);

  assert.match(route, /attachments: \(row\.attachments \?\? \[\]\)/);
  assert.match(types, /attachments: StaffIssueAttachment\[\]/);
  assert.match(page, /staffIssueStatuses\.map/);
  assert.match(page, /staffIssuePriorities\.map/);
  assert.match(page, /staffIssueFilters/);
  assert.match(page, /Admin Notes/);
  assert.match(page, /Resolution Notes/);
  assert.match(guidance, /Communication wasn't sent/);
});
