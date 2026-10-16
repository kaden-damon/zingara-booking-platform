import { classifyBulkReview, type BulkReviewCandidate } from "@/lib/reviews/reviewAdmin";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { recordAuditEvent } from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";

const queryBatchSize = 200;
const publishBatchSize = 50;

type Candidate = BulkReviewCandidate & { venue: string };

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

function availableVenues(scope: string[], selected: string) {
  const normalized = normalizeStaffVenueScope(scope ?? []);
  const allowed = normalized.includes("all") ? ["cape-town", "johannesburg"] : normalized;
  if (selected && selected !== "all") {
    if (!allowed.includes(selected)) return null;
    return [selected];
  }
  return allowed.filter((venue) => venue === "cape-town" || venue === "johannesburg");
}

async function loadPlan(
  client: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  venues: string[],
) {
  const candidates: Candidate[] = [];
  for (let from = 0; ; from += queryBatchSize) {
    const { data, error } = await client
      .from("guest_reviews")
      .select("id,venue,public_display_name,rating,review_text,publication_consent,publication_consent_mode,review_privacy_requested,review_publication_policy_version,moderation_status,revision")
      .eq("moderation_status", "needs_review")
      .gte("rating", 4)
      .in("venue", venues.length ? venues : ["__none__"])
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + queryBatchSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    candidates.push(...rows.map((row) => ({
      id: row.id,
      publicationConsent: row.publication_consent,
      publicationConsentMode: row.publication_consent_mode,
      publicationPolicyVersion: row.review_publication_policy_version,
      privacyRequested: row.review_privacy_requested,
      publicDisplayName: row.public_display_name,
      reviewText: row.review_text,
      revision: row.revision,
      status: row.moderation_status,
      venue: row.venue,
    } as Candidate)));
    if (rows.length < queryBatchSize) break;
  }

  const planned = candidates.map((candidate) => ({ candidate, classification: classifyBulkReview(candidate) }));
  const named = planned.filter((item) => item.classification.action === "publish");
  const anonymous = planned.filter((item) => item.classification.action === "publish_anonymous");
  const excluded = planned.filter((item) => item.classification.action === null);
  return {
    anonymous,
    eligible: named.length + anonymous.length,
    excluded: excluded.length,
    named,
    planned,
  };
}

async function authorize(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return { response: auth.error } as const;
  if (!getRolePermissions(roleOf(auth.staffProfile)).includes("communications:manage")) {
    return { response: Response.json({ error: "Communications management access is required." }, { status: 403 }) } as const;
  }
  return { auth } as const;
}

export async function GET(request: Request) {
  const authorized = await authorize(request);
  if ("response" in authorized) return authorized.response;
  const { auth } = authorized;
  const selectedVenue = new URL(request.url).searchParams.get("venue") ?? "all";
  const venues = availableVenues(auth.staffProfile.venue_scope, selectedVenue);
  if (!venues) return Response.json({ error: "You do not have access to this venue." }, { status: 403 });

  try {
    const plan = await loadPlan(auth.serviceClient, venues);
    return Response.json({
      anonymous: plan.anonymous.length,
      eligible: plan.eligible,
      excluded: plan.excluded,
      named: plan.named.length,
    });
  } catch (error) {
    console.error("[Guest Reviews] Bulk publication preview failed", error);
    return Response.json({ error: "Eligible reviews couldn't be checked. Try again." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authorized = await authorize(request);
  if ("response" in authorized) return authorized.response;
  const { auth } = authorized;

  try {
    const body = await request.json() as { venue?: string };
    const venues = availableVenues(auth.staffProfile.venue_scope, body.venue ?? "all");
    if (!venues) return Response.json({ error: "You do not have access to this venue." }, { status: 403 });

    const plan = await loadPlan(auth.serviceClient, venues);
    const batch = plan.planned
      .filter((item) => item.classification.action !== null)
      .slice(0, publishBatchSize);
    let published = 0;
    let skipped = 0;

    for (const item of batch) {
      const action = item.classification.action;
      if (!action) continue;
      const { data, error } = await auth.serviceClient.rpc("moderate_guest_review", {
        p_action: action,
        p_actor_staff_profile_id: auth.staffProfile.id,
        p_expected_revision: item.candidate.revision,
        p_note: null,
        p_review_id: item.candidate.id,
      });
      if (error) {
        if (error.message.includes("REVIEW_STALE_REVISION") || error.message.includes("REVIEW_MODERATION_ACTION_INVALID")) {
          skipped += 1;
          continue;
        }
        throw error;
      }
      published += 1;
      await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
        action: `review.bulk_${action}`,
        afterValues: { moderationStatus: "published", publicationMode: action === "publish" ? "named" : "anonymous", revision: data.revision },
        beforeValues: { moderationStatus: item.candidate.status, revision: item.candidate.revision },
        changedFields: ["moderationStatus", "publicationMode", "revision"],
        entityId: item.candidate.id,
        entityLocation: item.candidate.venue,
        entityReference: item.candidate.id,
        entityType: "review",
        outcome: "success",
        request,
        sourceArea: "Guest Reviews",
      });
    }

    const remaining = Math.max(0, plan.eligible - published - skipped);
    return Response.json({
      published,
      remaining,
      skipped,
    });
  } catch (error) {
    console.error("[Guest Reviews] Bulk publication failed", error);
    return Response.json({ error: "Eligible reviews couldn't be published. Try again." }, { status: 500 });
  }
}
