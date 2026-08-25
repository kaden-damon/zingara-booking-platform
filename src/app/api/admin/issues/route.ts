import { type AdminRole } from "@/lib/zingaraAccess";
import { sendZingaraEmail } from "@/lib/email/smtp";
import {
  canManageStaffIssues,
  getStaffIssueCategoryLabel,
  getStaffIssuePriorityLabel,
  isStaffIssueCategory,
  isStaffIssuePriority,
  isStaffIssueStatus,
  type StaffIssueCategory,
  type StaffIssuePriority,
  type StaffIssueReport,
  type StaffIssueStatus,
} from "@/lib/staffIssues";
import {
  getAdminRoleFromName,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  diffAuditFields,
  pickAuditFields,
  tryRecordAuditEvent,
} from "@/lib/supabase/serverAudit";
import { sendStaffIdentityPushNotification } from "@/lib/supabase/staffPush";

export const dynamic = "force-dynamic";

type StaffIssueReporterRow = {
  email?: string | null;
  full_name?: string | null;
  id?: string | null;
  roles?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

type StaffIssueRow = {
  admin_notes: string | null;
  category: StaffIssueCategory;
  completed_at: string | null;
  created_at: string;
  description: string;
  id: string;
  location: string | null;
  metadata: Record<string, unknown> | null;
  module_or_area: string | null;
  priority: StaffIssuePriority;
  reporter?: StaffIssueReporterRow | StaffIssueReporterRow[] | null;
  reporter_staff_id: string;
  resolution_notes: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  status: StaffIssueStatus;
  ticket_reference: string;
  title: string;
  updated_at: string;
};

const issueAuditFields = [
  "admin_notes",
  "category",
  "completed_at",
  "description",
  "location",
  "module_or_area",
  "priority",
  "resolution_notes",
  "scheduled_at",
  "started_at",
  "status",
  "title",
];
const issueNotificationRecipient = "kaden@kaden.co.za";

function getIssueNotificationMessage(issue: StaffIssueReport) {
  return [
    `A new Zingara staff issue has been reported: ${issue.ticketReference}`,
    "",
    `Title: ${issue.title}`,
    `Category: ${getStaffIssueCategoryLabel(issue.category)}`,
    `Priority: ${getStaffIssuePriorityLabel(issue.priority)}`,
    `Description: ${issue.description}`,
    `Reporter: ${issue.reporterName ?? issue.reporterEmail ?? "Not recorded"}`,
    `Location: ${issue.location ?? "Not location-specific"}`,
    `Module / Area: ${issue.moduleOrArea ?? "Not recorded"}`,
    `Created: ${issue.createdAt}`,
    "",
    "Admin: /admin?section=platform-operations",
  ].join("\n");
}

async function notifyKadenOfIssue(
  serviceClient: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
  issue: StaffIssueReport,
) {
  const { data: recipient, error } = await serviceClient
    .from("staff_profiles")
    .select("id,user_id")
    .eq("email", issueNotificationRecipient)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const message = getIssueNotificationMessage(issue);
  const notificationTasks: Promise<unknown>[] = [
    sendZingaraEmail({
      message,
      subject: `[${issue.ticketReference}] ${issue.title}`,
      to: issueNotificationRecipient,
    }),
  ];

  if (recipient?.id) {
    notificationTasks.push(
      sendStaffIdentityPushNotification({
        body: `${getStaffIssuePriorityLabel(issue.priority)} · ${issue.title}`,
        staffProfileId: recipient.id,
        title: `New issue · ${issue.ticketReference}`,
        url: "/admin?section=platform-operations",
        userId: recipient.user_id,
      }),
    );
  } else {
    console.error("[Zingara Issues] Kaden push identity was not found.");
  }

  const results = await Promise.allSettled(notificationTasks);

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("[Zingara Issues] Issue notification failed", result.reason);
      return;
    }

    const value = result.value as { error?: string; ok?: boolean };

    if (value.ok === false) {
      console.error(
        "[Zingara Issues] Issue notification was not delivered",
        value.error ?? "No matching active subscription was available.",
      );
    }
  });
}

function getStaffRole(profile: {
  roles?: StaffIssueReporterRow["roles"];
}): AdminRole {
  const role = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;

  return getAdminRoleFromName(role?.name);
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toIssueReport(row: StaffIssueRow): StaffIssueReport {
  const reporter = Array.isArray(row.reporter)
    ? row.reporter[0]
    : row.reporter;

  return {
    adminNotes: row.admin_notes,
    category: row.category,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    description: row.description,
    id: row.id,
    location: row.location,
    metadata: row.metadata ?? {},
    moduleOrArea: row.module_or_area,
    priority: row.priority,
    reporterEmail: reporter?.email ?? null,
    reporterName: reporter?.full_name ?? null,
    reporterRole: getStaffRole(reporter ?? {}),
    reporterStaffId: row.reporter_staff_id,
    resolutionNotes: row.resolution_notes,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    status: row.status,
    ticketReference: row.ticket_reference,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

function getCurrentStaffRole(
  staffProfile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
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

  const url = new URL(request.url);
  const role = getCurrentStaffRole(auth.staffProfile);
  const canManage = canManageStaffIssues(role);
  const search = url.searchParams.get("search")?.trim();
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const category = url.searchParams.get("category");
  const reporter = url.searchParams.get("reporter");
  const scope = url.searchParams.get("scope");

  let query = auth.serviceClient
    .from("staff_issue_reports")
    .select(
      "id,ticket_reference,reporter_staff_id,category,priority,status,title,description,location,module_or_area,admin_notes,resolution_notes,metadata,scheduled_at,started_at,completed_at,created_at,updated_at,reporter:staff_profiles!staff_issue_reports_reporter_staff_id_fkey(id,full_name,email,roles(name))",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (!canManage || scope === "mine") {
    query = query.eq("reporter_staff_id", auth.staffProfile.id);
  } else if (reporter) {
    query = query.eq("reporter_staff_id", reporter);
  }

  if (isStaffIssueStatus(status)) {
    query = query.eq("status", status);
  }

  if (isStaffIssuePriority(priority)) {
    query = query.eq("priority", priority);
  }

  if (isStaffIssueCategory(category)) {
    query = query.eq("category", category);
  }

  if (search) {
    const pattern = `%${search.replace(/[%_]/g, "\\$&")}%`;
    query = query.or(
      `ticket_reference.ilike.${pattern},title.ilike.${pattern},description.ilike.${pattern},location.ilike.${pattern},module_or_area.ilike.${pattern}`,
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("[Zingara Issues] Failed to load staff issues", error);
    return Response.json(
      { error: "Issue register could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({
    canManage,
    issues: ((data ?? []) as unknown as StaffIssueRow[]).map(toIssueReport),
  });
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as {
      category?: unknown;
      currentPath?: unknown;
      description?: unknown;
      location?: unknown;
      moduleOrArea?: unknown;
      priority?: unknown;
      submissionId?: unknown;
      title?: unknown;
    };
    const title = normalizeOptionalText(body.title);
    const description = normalizeOptionalText(body.description);
    const category = body.category;
    const priority = body.priority ?? "normal";

    if (!title || !description || !isStaffIssueCategory(category)) {
      return Response.json(
        { error: "Category, title, and description are required." },
        { status: 400 },
      );
    }

    if (!isStaffIssuePriority(priority)) {
      return Response.json({ error: "Priority is invalid." }, { status: 400 });
    }

    const submissionId = normalizeOptionalText(body.submissionId)?.slice(0, 100);
    const metadata: Record<string, unknown> = {};

    if (submissionId) {
      const { data: existingIssue, error: existingIssueError } =
        await auth.serviceClient
          .from("staff_issue_reports")
          .select(
            "id,ticket_reference,reporter_staff_id,category,priority,status,title,description,location,module_or_area,admin_notes,resolution_notes,metadata,scheduled_at,started_at,completed_at,created_at,updated_at,reporter:staff_profiles!staff_issue_reports_reporter_staff_id_fkey(id,full_name,email,roles(name))",
          )
          .eq("reporter_staff_id", auth.staffProfile.id)
          .contains("metadata", { submissionId })
          .maybeSingle();

      if (existingIssueError) {
        throw existingIssueError;
      }

      if (existingIssue) {
        return Response.json({
          deduplicated: true,
          issue: toIssueReport(existingIssue as unknown as StaffIssueRow),
        });
      }

      metadata.submissionId = submissionId;
    }

    if (typeof body.currentPath === "string" && body.currentPath.trim()) {
      metadata.adminPath = body.currentPath.trim().slice(0, 300);
    }

    const { data, error } = await auth.serviceClient
      .from("staff_issue_reports")
      .insert({
        category,
        description,
        location: normalizeOptionalText(body.location),
        metadata,
        module_or_area: normalizeOptionalText(body.moduleOrArea),
        priority,
        reporter_staff_id: auth.staffProfile.id,
        title,
      })
      .select(
        "id,ticket_reference,reporter_staff_id,category,priority,status,title,description,location,module_or_area,admin_notes,resolution_notes,metadata,scheduled_at,started_at,completed_at,created_at,updated_at,reporter:staff_profiles!staff_issue_reports_reporter_staff_id_fkey(id,full_name,email,roles(name))",
      )
      .single();

    if (error) {
      throw error;
    }

    const issue = toIssueReport(data as unknown as StaffIssueRow);

    await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: "staff-issue.create",
      afterValues: pickAuditFields(
        data as unknown as Record<string, unknown>,
        issueAuditFields,
      ),
      entityId: issue.id,
      entityReference: issue.ticketReference,
      entityType: "staff-issue",
      outcome: "success",
      request,
      sourceArea: "System",
    });

    try {
      await notifyKadenOfIssue(auth.serviceClient, issue);
    } catch (notificationError) {
      console.error(
        "[Zingara Issues] Issue saved but notification dispatch failed",
        notificationError,
      );
    }

    return Response.json({ issue }, { status: 201 });
  } catch (error) {
    console.error("[Zingara Issues] Failed to create staff issue", error);
    return Response.json(
      { error: "Issue could not be submitted." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  const role = getCurrentStaffRole(auth.staffProfile);

  if (!canManageStaffIssues(role)) {
    return Response.json(
      { error: "Issue management access is required." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      adminNotes?: unknown;
      id?: unknown;
      priority?: unknown;
      resolutionNotes?: unknown;
      scheduledAt?: unknown;
      status?: unknown;
    };
    const id = typeof body.id === "string" ? body.id : "";

    if (!id) {
      return Response.json({ error: "Issue id is required." }, { status: 400 });
    }

    const { data: beforeIssue, error: beforeError } = await auth.serviceClient
      .from("staff_issue_reports")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (beforeError) {
      throw beforeError;
    }

    if (!beforeIssue) {
      return Response.json({ error: "Issue was not found." }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (body.status !== undefined) {
      if (!isStaffIssueStatus(body.status)) {
        return Response.json({ error: "Status is invalid." }, { status: 400 });
      }

      updates.status = body.status;

      if (body.status === "in_progress" && !beforeIssue.started_at) {
        updates.started_at = new Date().toISOString();
      }

      if (body.status === "completed" && !beforeIssue.completed_at) {
        updates.completed_at = new Date().toISOString();
      }
    }

    if (body.priority !== undefined) {
      if (!isStaffIssuePriority(body.priority)) {
        return Response.json({ error: "Priority is invalid." }, { status: 400 });
      }

      updates.priority = body.priority;
    }

    if (body.adminNotes !== undefined) {
      updates.admin_notes = normalizeOptionalText(body.adminNotes);
    }

    if (body.resolutionNotes !== undefined) {
      updates.resolution_notes = normalizeOptionalText(body.resolutionNotes);
    }

    if (body.scheduledAt !== undefined) {
      updates.scheduled_at = normalizeOptionalText(body.scheduledAt);
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No issue updates were provided." }, { status: 400 });
    }

    const { data, error } = await auth.serviceClient
      .from("staff_issue_reports")
      .update(updates)
      .eq("id", id)
      .select(
        "id,ticket_reference,reporter_staff_id,category,priority,status,title,description,location,module_or_area,admin_notes,resolution_notes,metadata,scheduled_at,started_at,completed_at,created_at,updated_at,reporter:staff_profiles!staff_issue_reports_reporter_staff_id_fkey(id,full_name,email,roles(name))",
      )
      .single();

    if (error) {
      throw error;
    }

    const issue = toIssueReport(data as unknown as StaffIssueRow);
    const diff = diffAuditFields(
      beforeIssue as Record<string, unknown>,
      data as unknown as Record<string, unknown>,
      issueAuditFields,
    );

    await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: "staff-issue.update",
      afterValues: diff.afterValues,
      beforeValues: diff.beforeValues,
      changedFields: diff.changedFields,
      entityId: issue.id,
      entityReference: issue.ticketReference,
      entityType: "staff-issue",
      outcome: "success",
      request,
      sourceArea: "System",
    });

    return Response.json({ issue });
  } catch (error) {
    console.error("[Zingara Issues] Failed to update staff issue", error);
    return Response.json(
      { error: "Issue could not be updated." },
      { status: 500 },
    );
  }
}
