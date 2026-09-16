import { canManageStaffIssues } from "@/lib/staffIssues";
import { staffIssueMediaBucket } from "@/lib/staffIssueMedia";
import {
  getAdminRoleFromName,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

function getCurrentStaffRole(staffProfile: {
  roles?: { name?: string | null } | Array<{ name?: string | null }> | null;
}) {
  const role = Array.isArray(staffProfile.roles)
    ? staffProfile.roles[0]
    : staffProfile.roles;
  return getAdminRoleFromName(role?.name);
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  const issueId = new URL(request.url).searchParams.get("issueId")?.trim();

  if (!issueId) {
    return Response.json({ error: "Issue id is required." }, { status: 400 });
  }

  const { data: issue, error: issueError } = await auth.serviceClient
    .from("staff_issue_reports")
    .select("id,reporter_staff_id")
    .eq("id", issueId)
    .maybeSingle();

  if (issueError) {
    throw issueError;
  }

  if (!issue) {
    return Response.json({ error: "Issue was not found." }, { status: 404 });
  }

  const canAccess =
    issue.reporter_staff_id === auth.staffProfile.id ||
    canManageStaffIssues(getCurrentStaffRole(auth.staffProfile));

  if (!canAccess) {
    return Response.json(
      { error: "Issue attachment access is required." },
      { status: 403 },
    );
  }

  const { data: attachments, error: attachmentError } =
    await auth.serviceClient
      .from("staff_issue_attachments")
      .select("id,storage_path")
      .eq("issue_id", issueId)
      .eq("status", "ready")
      .order("created_at", { ascending: true });

  if (attachmentError) {
    throw attachmentError;
  }

  if (!attachments?.length) {
    return Response.json({ attachments: [] });
  }

  const { data: signedUrls, error: signedUrlError } =
    await auth.serviceClient.storage
      .from(staffIssueMediaBucket)
      .createSignedUrls(
        attachments.map((attachment) => attachment.storage_path),
        5 * 60,
      );

  if (signedUrlError) {
    throw signedUrlError;
  }

  return Response.json({
    attachments: attachments.map((attachment, index) => ({
      id: attachment.id,
      url: signedUrls?.[index]?.signedUrl ?? null,
    })),
  });
}
