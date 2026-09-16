import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import {
  staffIssueMediaBucket,
  type StaffIssueAttachment,
  type StaffIssueAttachmentUpload,
} from "@/lib/staffIssueMedia";

export type StaffIssueSelectedFile = {
  clientId: string;
  file: File;
};

export async function uploadAndFinalizeStaffIssueMedia(input: {
  files: StaffIssueSelectedFile[];
  issueId: string;
  uploads: StaffIssueAttachmentUpload[];
}) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error("Secure attachment storage is unavailable.");
  }

  const uploadFailures: Array<{ filename: string; reason: string }> = [];

  for (const upload of input.uploads) {
    const selected = input.files.find(
      (candidate) => candidate.clientId === upload.clientId,
    );

    if (!selected) {
      uploadFailures.push({
        filename: "Attachment",
        reason: "The selected file could not be matched to its upload.",
      });
      continue;
    }

    const { error } = await supabase.storage
      .from(staffIssueMediaBucket)
      .uploadToSignedUrl(upload.path, upload.token, selected.file, {
        cacheControl: "3600",
        contentType: selected.file.type,
        upsert: false,
      });

    if (error) {
      uploadFailures.push({
        filename: selected.file.name,
        reason: "The file upload did not complete.",
      });
    }
  }

  const finalized = await fetchSupabaseApi<{
    attachments: StaffIssueAttachment[];
    failures: Array<{ filename: string; reason: string }>;
    notificationDelivered: boolean;
    notificationError: string | null;
  }>("/api/admin/issues/attachments/finalize", {
    body: {
      attachmentIds: input.uploads.map((upload) => upload.attachmentId),
      issueId: input.issueId,
    },
    method: "POST",
  });

  return {
    ...finalized,
    failures: [...uploadFailures, ...finalized.failures],
  };
}
