import { getActorRoleLabel } from "@/lib/auditTrail";
import { loadCrmReviewCandidates } from "@/lib/supabase/companyMasterServer";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { recordAuditEvent } from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient) return auth.error;

  try {
    return Response.json({
      candidates: await loadCrmReviewCandidates(auth.serviceClient),
    });
  } catch (error) {
    console.error("[Zingara API] Failed to load CRM review queue", error);
    return Response.json(
      { error: "The CRM review queue could not be loaded." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireActiveStaff(request);
  if (
    auth.error ||
    !auth.serviceClient ||
    !auth.staffProfile ||
    !auth.user
  ) {
    return auth.error;
  }
  const role = Array.isArray(auth.staffProfile.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile.roles;
  if (!getRolePermissions(role).includes("bookings:manage")) {
    return Response.json(
      { error: "Booking management access is required." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      action?: "keep-separate" | "link-to-company" | "merge" | "not-a-duplicate";
      companyId?: string;
      duplicateCustomerId?: string;
      note?: string;
      reviewId?: string;
      survivorCustomerId?: string;
    };
    const note = body.note?.trim() ?? "";
    if (!body.reviewId || !body.action || note.length < 5) {
      return Response.json(
        { error: "Choose a decision and enter a short Management Note." },
        { status: 400 },
      );
    }
    const { data: candidate, error: candidateError } = await auth.serviceClient
      .from("crm_data_review_candidates")
      .select("*")
      .eq("id", body.reviewId)
      .eq("status", "pending")
      .maybeSingle();
    if (candidateError) throw candidateError;
    if (!candidate) {
      return Response.json(
        { error: "This review item has already been decided." },
        { status: 409 },
      );
    }

    const requestId =
      request.headers.get("x-vercel-id") ??
      request.headers.get("x-request-id") ??
      crypto.randomUUID();
    const actorArgs = {
      p_actor_auth_user_id: auth.user.id,
      p_actor_location_scope: auth.staffProfile.venue_scope ?? [],
      p_actor_name: auth.staffProfile.full_name ?? auth.user.email,
      p_actor_role: getActorRoleLabel(role?.name),
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_request_id: requestId,
      p_user_agent: request.headers.get("user-agent"),
    };
    let status: string;

    if (body.action === "merge") {
      if (candidate.candidate_type === "company-variant") {
        const survivorId = body.companyId;
        const duplicateId = (candidate.subject_ids as string[]).find(
          (id) => id !== survivorId,
        );
        if (!survivorId || !duplicateId) {
          return Response.json(
            { error: "Choose the Company record to keep." },
            { status: 400 },
          );
        }
        const { data: companyRows, error } = await auth.serviceClient
          .from("companies")
          .select("id,revision")
          .in("id", [survivorId, duplicateId]);
        if (error) throw error;
        const survivor = companyRows?.find((row) => row.id === survivorId);
        const duplicate = companyRows?.find((row) => row.id === duplicateId);
        if (!survivor || !duplicate) throw new Error("Company records are unavailable.");
        const mergeResult = await auth.serviceClient.rpc("merge_companies_atomic", {
          ...actorArgs,
          p_duplicate_company_id: duplicateId,
          p_expected_duplicate_revision: duplicate.revision,
          p_expected_survivor_revision: survivor.revision,
          p_reason: note,
          p_survivor_company_id: survivorId,
        });
        if (mergeResult.error) throw mergeResult.error;
      } else if (candidate.candidate_type === "customer-duplicate") {
        const survivorId = body.survivorCustomerId;
        const duplicateId = body.duplicateCustomerId;
        if (
          !survivorId ||
          !duplicateId ||
          !(candidate.subject_ids as string[]).includes(survivorId) ||
          !(candidate.subject_ids as string[]).includes(duplicateId)
        ) {
          return Response.json(
            { error: "Choose the Customer to keep and the duplicate to merge." },
            { status: 400 },
          );
        }
        const { data: customerRows, error } = await auth.serviceClient
          .from("customers")
          .select("id,updated_at")
          .in("id", [survivorId, duplicateId]);
        if (error) throw error;
        const survivor = customerRows?.find((row) => row.id === survivorId);
        const duplicate = customerRows?.find((row) => row.id === duplicateId);
        if (!survivor || !duplicate) throw new Error("Customer records are unavailable.");
        const mergeResult = await auth.serviceClient.rpc("merge_customers_atomic", {
          ...actorArgs,
          p_duplicate_customer_id: duplicateId,
          p_expected_duplicate_updated_at: duplicate.updated_at,
          p_expected_survivor_updated_at: survivor.updated_at,
          p_reason: note,
          p_survivor_customer_id: survivorId,
        });
        if (mergeResult.error) throw mergeResult.error;
      } else {
        return Response.json(
          { error: "Link this legacy profile to its Company instead of merging it." },
          { status: 400 },
        );
      }
      status = "merged";
    } else if (body.action === "link-to-company") {
      if (candidate.candidate_type !== "company-as-person" || !body.companyId) {
        return Response.json(
          { error: "This review item cannot be linked to a Company." },
          { status: 400 },
        );
      }
      const customerId = String(candidate.evidence?.customerId ?? "");
      if (!customerId || !(candidate.subject_ids as string[]).includes(body.companyId)) {
        return Response.json({ error: "Invalid Company link." }, { status: 400 });
      }
      const { data: customer, error } = await auth.serviceClient
        .from("customers")
        .select("id,crm_revision,job_title")
        .eq("id", customerId)
        .maybeSingle();
      if (error) throw error;
      if (!customer) throw new Error("Customer record is unavailable.");
      const linkResult = await auth.serviceClient.rpc("link_customer_company_atomic", {
        ...actorArgs,
        p_company_id: body.companyId,
        p_customer_id: customerId,
        p_expected_revision: customer.crm_revision,
        p_job_title: customer.job_title ?? "",
      });
      if (linkResult.error) throw linkResult.error;
      status = "linked";
    } else {
      status = body.action;
    }

    const { data: updated, error: updateError } = await auth.serviceClient
      .from("crm_data_review_candidates")
      .update({
        decision_note: note,
        reviewed_at: new Date().toISOString(),
        reviewed_by_staff_profile_id: auth.staffProfile.id,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidate.id)
      .eq("status", "pending")
      .select("id,candidate_type,subject_ids,display_names,reason,evidence,status,created_at")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw new Error("Review decision could not be persisted.");

    await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: `crm-review.${status}`,
      afterValues: { decision: status, note },
      beforeValues: { status: "pending" },
      changedFields: ["status", "decision_note"],
      entityId: candidate.id,
      entityReference: candidate.review_key,
      entityType: "workflow",
      outcome: "success",
      reason: note,
      request,
      sourceArea: "CRM Review",
    });

    return Response.json({
      candidate: {
        candidateType: updated.candidate_type,
        createdAt: updated.created_at,
        displayNames: updated.display_names ?? [],
        evidence: updated.evidence ?? {},
        id: updated.id,
        reason: updated.reason,
        status: updated.status,
        subjectIds: updated.subject_ids ?? [],
      },
    });
  } catch (error) {
    console.error("[Zingara API] Failed to save CRM review decision", error);
    const message = error instanceof Error ? error.message : "";
    const conflict = /CHANGED|CONFLICT|ALREADY_MERGED/.test(message);
    return Response.json(
      {
        error: conflict
          ? "The records changed or contain conflicting data. Refresh and review them again."
          : "The CRM review decision could not be saved.",
      },
      { status: conflict ? 409 : 500 },
    );
  }
}
