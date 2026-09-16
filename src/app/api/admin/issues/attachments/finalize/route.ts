import {
  detectStaffIssueMediaType,
  getStaffIssueMediaKind,
  staffIssueMediaBucket,
  validateStaffIssueMediaContent,
  type StaffIssueMediaType,
} from "@/lib/staffIssueMedia";
import { notifyKadenOfStaffIssue } from "@/lib/staffIssueNotification";
import { requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type AttachmentRow = {
  created_at: string;
  file_size: number;
  id: string;
  issue_id: string;
  mime_type: StaffIssueMediaType;
  original_filename: string;
  status: "failed" | "pending" | "ready";
  storage_path: string;
  uploader_staff_id: string;
};

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as {
      attachmentIds?: unknown;
      issueId?: unknown;
    };
    const issueId = typeof body.issueId === "string" ? body.issueId : "";
    const attachmentIds = Array.isArray(body.attachmentIds)
      ? body.attachmentIds.filter(
          (value): value is string => typeof value === "string",
        )
      : [];

    if (!issueId || attachmentIds.length === 0) {
      return Response.json(
        { error: "Issue and attachment references are required." },
        { status: 400 },
      );
    }

    const { data: issue, error: issueError } = await auth.serviceClient
      .from("staff_issue_reports")
      .select(
        "id,ticket_reference,reporter_staff_id,category,priority,title,description,location,module_or_area,created_at,metadata,reporter:staff_profiles!staff_issue_reports_reporter_staff_id_fkey(full_name,email)",
      )
      .eq("id", issueId)
      .maybeSingle();

    if (issueError) {
      throw issueError;
    }

    if (!issue) {
      return Response.json({ error: "Issue was not found." }, { status: 404 });
    }

    if (issue.reporter_staff_id !== auth.staffProfile.id) {
      return Response.json(
        { error: "Only the issue reporter can complete these uploads." },
        { status: 403 },
      );
    }

    const { data: attachmentData, error: attachmentError } =
      await auth.serviceClient
        .from("staff_issue_attachments")
        .select(
          "id,issue_id,uploader_staff_id,original_filename,mime_type,file_size,storage_path,status,created_at",
        )
        .eq("issue_id", issueId)
        .in("id", attachmentIds);

    if (attachmentError) {
      throw attachmentError;
    }

    const attachments = (attachmentData ?? []) as AttachmentRow[];

    if (
      attachments.length !== attachmentIds.length ||
      attachments.some(
        (attachment) => attachment.uploader_staff_id !== auth.staffProfile.id,
      )
    ) {
      return Response.json(
        { error: "One or more attachment references are invalid." },
        { status: 403 },
      );
    }

    const storage = auth.serviceClient.storage.from(staffIssueMediaBucket);
    const failures: Array<{ filename: string; reason: string }> = [];
    const verifiedMedia: Array<{
      content: Buffer;
      fileSize: number;
      mimeType: StaffIssueMediaType;
      originalFilename: string;
    }> = [];
    const readyAttachments: Array<{
      createdAt: string;
      fileSize: number;
      id: string;
      mediaKind: "image" | "video";
      mimeType: StaffIssueMediaType;
      originalFilename: string;
    }> = [];

    for (const attachment of attachments) {
      const { data: mediaBlob, error: downloadError } = await storage.download(
        attachment.storage_path,
      );

      if (downloadError || !mediaBlob) {
        const reason = "The selected file did not finish uploading.";
        failures.push({ filename: attachment.original_filename, reason });
        await auth.serviceClient
          .from("staff_issue_attachments")
          .update({ status: "failed", upload_error: reason })
          .eq("id", attachment.id);
        continue;
      }

      const content = Buffer.from(await mediaBlob.arrayBuffer());
      const contentError = validateStaffIssueMediaContent(
        content,
        attachment.mime_type,
      );
      const sizeError =
        content.byteLength !== Number(attachment.file_size)
          ? "The uploaded file size does not match the selected file."
          : null;
      const validationError = contentError ?? sizeError;

      if (validationError) {
        failures.push({
          filename: attachment.original_filename,
          reason: validationError,
        });
        await Promise.all([
          storage.remove([attachment.storage_path]),
          auth.serviceClient
            .from("staff_issue_attachments")
            .update({ status: "failed", upload_error: validationError })
            .eq("id", attachment.id),
        ]);
        continue;
      }

      const detectedType = detectStaffIssueMediaType(content);
      const resolvedType =
        detectedType === "video/mp4" || detectedType === "video/quicktime"
          ? attachment.mime_type
          : (detectedType ?? attachment.mime_type);

      await auth.serviceClient
        .from("staff_issue_attachments")
        .update({
          mime_type: resolvedType,
          ready_at: new Date().toISOString(),
          status: "ready",
          upload_error: null,
        })
        .eq("id", attachment.id);

      verifiedMedia.push({
        content,
        fileSize: content.byteLength,
        mimeType: resolvedType,
        originalFilename: attachment.original_filename,
      });
      readyAttachments.push({
        createdAt: attachment.created_at,
        fileSize: content.byteLength,
        id: attachment.id,
        mediaKind: getStaffIssueMediaKind(resolvedType),
        mimeType: resolvedType,
        originalFilename: attachment.original_filename,
      });
    }

    const reporter = Array.isArray(issue.reporter)
      ? issue.reporter[0]
      : issue.reporter;
    let notificationDelivered = false;
    let notificationError: string | null = null;

    try {
      const notification = await notifyKadenOfStaffIssue(
        auth.serviceClient,
        {
          category: issue.category,
          createdAt: issue.created_at,
          description: issue.description,
          id: issue.id,
          location: issue.location,
          moduleOrArea: issue.module_or_area,
          priority: issue.priority,
          reporterEmail: reporter?.email ?? null,
          reporterName: reporter?.full_name ?? null,
          ticketReference: issue.ticket_reference,
          title: issue.title,
        },
        verifiedMedia,
      );
      notificationDelivered = notification.delivered;
      notificationError = notification.error;
    } catch (notificationFailure) {
      notificationError =
        "The issue and media were saved, but the notification could not be sent.";
      console.error(
        "[Zingara Issues] Media saved but notification dispatch failed",
        notificationFailure,
      );
    }

    return Response.json({
      attachments: readyAttachments,
      failures,
      notificationDelivered,
      notificationError,
    });
  } catch (error) {
    console.error("[Zingara Issues] Failed to finalize issue media", error);
    return Response.json(
      {
        error:
          "The issue was saved, but its media could not be verified. Open the issue before retrying.",
      },
      { status: 500 },
    );
  }
}
