import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { recordAuditEvent } from "@/lib/supabase/serverAudit";
import { getAnonymousReviewIdentityWarnings } from "@/lib/reviews/reviews";

export const dynamic = "force-dynamic";

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

function allowedVenues(scope: string[]) {
  const normalized = normalizeStaffVenueScope(scope ?? []);
  if (normalized.includes("all")) return ["cape-town", "johannesburg"];
  return normalized.filter((venue) => venue === "cape-town" || venue === "johannesburg");
}

function hasReviewAccess(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  return Boolean(
    auth.staffProfile &&
      getRolePermissions(roleOf(auth.staffProfile)).includes("communications:manage"),
  );
}

async function loadReviewPage(
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  scope: string[],
  input: {
    includeDetails: boolean;
    page: number;
    pageSize: number;
    reviewId: string;
    search: string;
    status: string;
  },
) {
  const venues = allowedVenues(scope);
  const from = (input.page - 1) * input.pageSize;
  let query = serviceClient
    .from("guest_reviews")
    .select(
      "id,booking_id,show_id,venue,public_display_name,rating,review_text,contact_requested,publication_consent,publication_consent_mode,publication_mode,moderation_status,moderation_note,moderated_by,moderated_at,published_at,submitted_at,featured,verified_guest,revision",
      { count: "exact" },
    )
    .eq("moderation_status", input.status)
    .in("venue", venues.length ? venues : ["__none__"])
    .order("submitted_at", { ascending: false })
    .range(from, from + input.pageSize - 1);

  if (input.reviewId) {
    query = query.eq("id", input.reviewId);
  }

  if (input.search) {
    const safeSearch = input.search.replace(/[,%()]/g, " ").trim();
    if (safeSearch) {
      query = query.or(
        `public_display_name.ilike.%${safeSearch}%,review_text.ilike.%${safeSearch}%`,
      );
    }
  }

  const { data: reviews, error, count } = await query;
  if (error) throw error;
  const rows = reviews ?? [];
  const bookingIds = [...new Set(rows.map((row) => row.booking_id))];
  const showIds = [...new Set(rows.map((row) => row.show_id))];
  const reviewIds = rows.map((row) => row.id);

  const [bookingsResult, showsResult] = await Promise.all([
    bookingIds.length
      ? serviceClient.from("bookings").select("id,booking_reference,guest_count").in("id", bookingIds)
      : Promise.resolve({ data: [], error: null }),
    showIds.length
      ? serviceClient.from("shows").select("id,name,date,time,venue").in("id", showIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [bookingsResult, showsResult]) {
    if (result.error) throw result.error;
  }

  const [eventsResult, permissionsResult] = input.includeDetails && reviewIds.length
    ? await Promise.all([
        serviceClient
          .from("guest_review_events")
          .select("id,review_id,event_type,actor_staff_profile_id,occurred_at,from_status,to_status,note")
          .in("review_id", reviewIds)
          .order("occurred_at", { ascending: false }),
        serviceClient
          .from("review_anonymous_permission_requests")
          .select("review_id,status,sent_at,expires_at")
          .in("review_id", reviewIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (eventsResult.error) throw eventsResult.error;
  if (permissionsResult.error) throw permissionsResult.error;

  const events = eventsResult.data ?? [];
  const actorIds = [
    ...new Set(
      events
        .map((event) => event.actor_staff_profile_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const staffResult = actorIds.length
    ? await serviceClient.from("staff_profiles").select("id,full_name").in("id", actorIds)
    : { data: [], error: null };
  if (staffResult.error) throw staffResult.error;

  const bookingMap = new Map((bookingsResult.data ?? []).map((row) => [row.id, row]));
  const showMap = new Map((showsResult.data ?? []).map((row) => [row.id, row]));
  const staffMap = new Map((staffResult.data ?? []).map((row) => [row.id, row.full_name]));
  const permissionMap = new Map(
    (permissionsResult.data ?? []).map((row) => [row.review_id, row]),
  );

  return {
    page: input.page,
    pageSize: input.pageSize,
    rows: rows.map((row) => {
      const booking = bookingMap.get(row.booking_id);
      const show = showMap.get(row.show_id);
      return {
        bookingReference: booking?.booking_reference ?? "Booking unavailable",
        contactRequested: row.contact_requested,
        displayName: row.public_display_name,
        featured: row.featured,
        guestCount: booking?.guest_count ?? null,
        history: events
          .filter((event) => event.review_id === row.id)
          .map((event) => ({
            actor: event.actor_staff_profile_id
              ? staffMap.get(event.actor_staff_profile_id) ?? "Staff member"
              : "Guest",
            at: event.occurred_at,
            fromStatus: event.from_status,
            note: event.note,
            toStatus: event.to_status,
            type: event.event_type,
          })),
        id: row.id,
        moderationNote: row.moderation_note,
        moderatedAt: row.moderated_at,
        moderatedBy: row.moderated_by ? staffMap.get(row.moderated_by) ?? "Staff member" : null,
        performanceDate: show?.date ?? null,
        performanceName: show?.name ?? "Performance unavailable",
        performanceTime: show?.time?.slice(0, 5) ?? null,
        anonymousIdentityWarnings: getAnonymousReviewIdentityWarnings(
          row.review_text,
          row.public_display_name,
        ),
        anonymousPermission: permissionMap.get(row.id) ?? null,
        publicationConsent: row.publication_consent,
        publicationConsentMode: row.publication_consent_mode,
        publicationMode: row.publication_mode,
        publishedAt: row.published_at,
        rating: row.rating,
        reviewText: row.review_text,
        revision: row.revision,
        status: row.moderation_status,
        submittedAt: row.submitted_at,
        venue: row.venue,
        verifiedGuest: row.verified_guest,
      };
    }),
    total: count ?? 0,
  };
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!hasReviewAccess(auth)) {
    return Response.json({ error: "Communications management access is required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "needs_review";
  if (!["needs_review", "published", "not_published"].includes(status)) {
    return Response.json({ error: "Invalid review status." }, { status: 400 });
  }
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get("pageSize") ?? "20") || 20));
  const reviewId = url.searchParams.get("reviewId")?.trim() ?? "";
  if (reviewId && !/^[0-9a-f-]{36}$/i.test(reviewId)) {
    return Response.json({ error: "Invalid review identifier." }, { status: 400 });
  }

  try {
    return Response.json(
      await loadReviewPage(auth.serviceClient, auth.staffProfile.venue_scope, {
        includeDetails: url.searchParams.get("details") === "true" && Boolean(reviewId),
        page,
        pageSize,
        reviewId,
        search: url.searchParams.get("search")?.trim() ?? "",
        status,
      }),
    );
  } catch (error) {
    console.error("[Guest Reviews] Failed to load moderation queue", error);
    return Response.json({ error: "The review queue could not be loaded." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  if (!hasReviewAccess(auth)) {
    return Response.json({ error: "Communications management access is required." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      action?: "do_not_publish" | "feature" | "publish" | "publish_anonymous" | "unfeature" | "unpublish";
      note?: string;
      reviewId?: string;
      revision?: number;
    };
    const note = body.note?.trim() ?? "";
    const allowedActions = new Set([
      "do_not_publish",
      "feature",
      "publish",
      "publish_anonymous",
      "unfeature",
      "unpublish",
    ]);
    if (
      !body.reviewId ||
      !body.action ||
      !allowedActions.has(body.action) ||
      !Number.isInteger(body.revision) ||
      note.length > 1000
    ) {
      return Response.json({ error: "Choose a valid moderation action and note." }, { status: 400 });
    }

    const { data: before, error: beforeError } = await auth.serviceClient
      .from("guest_reviews")
      .select("id,venue,moderation_status,publication_consent,publication_consent_mode,publication_mode,public_display_name,review_text,featured,revision")
      .eq("id", body.reviewId)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return Response.json({ error: "Review not found." }, { status: 404 });
    if (!allowedVenues(auth.staffProfile.venue_scope).includes(before.venue)) {
      return Response.json({ error: "You do not have access to this venue." }, { status: 403 });
    }
    if (body.action === "publish" && before.publication_consent_mode !== "public") {
      return Response.json({ error: "This guest did not consent to publication." }, { status: 409 });
    }
    if (body.action === "publish_anonymous") {
      if (before.publication_consent_mode !== "anonymous") {
        return Response.json(
          { error: "The guest has not agreed to anonymous publication." },
          { status: 409 },
        );
      }
      const warnings = getAnonymousReviewIdentityWarnings(
        before.review_text,
        before.public_display_name,
      );
      if (warnings.length > 0) {
        return Response.json(
          { error: `Check the review text before publishing anonymously. It may contain: ${warnings.join(", ")}.` },
          { status: 409 },
        );
      }
    }
    if (
      (body.action === "feature" || body.action === "unfeature") &&
      (before.moderation_status !== "published" || !before.publication_mode)
    ) {
      return Response.json(
        { error: "Only a published, consented review can be featured." },
        { status: 409 },
      );
    }

    const featureAction = body.action === "feature" || body.action === "unfeature";
    const { data, error } = featureAction
      ? await auth.serviceClient.rpc("set_guest_review_featured", {
          p_actor_staff_profile_id: auth.staffProfile.id,
          p_expected_revision: body.revision,
          p_featured: body.action === "feature",
          p_review_id: body.reviewId,
        })
      : await auth.serviceClient.rpc("moderate_guest_review", {
          p_action: body.action,
          p_actor_staff_profile_id: auth.staffProfile.id,
          p_expected_revision: body.revision,
          p_note: note || null,
          p_review_id: body.reviewId,
        });
    if (error) {
      if (error.message.includes("REVIEW_STALE_REVISION")) {
        return Response.json(
          { error: "This review changed while you were viewing it. Refresh and try again." },
          { status: 409 },
        );
      }
      throw error;
    }

    await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: `review.${body.action}`,
      afterValues: {
        featured: featureAction ? data.featured : before.featured,
        moderationStatus: featureAction ? before.moderation_status : data.moderation_status,
        publicationMode: featureAction ? before.publication_mode : data.publication_mode,
        revision: data.revision,
      },
      beforeValues: {
        featured: before.featured,
        moderationStatus: before.moderation_status,
        publicationMode: before.publication_mode,
        revision: before.revision,
      },
      changedFields: featureAction
        ? ["featured", "revision"]
        : ["moderationStatus", "publicationMode", "revision"],
      entityId: body.reviewId,
      entityLocation: before.venue,
      entityReference: body.reviewId,
      entityType: "review",
      outcome: "success",
      request,
      sourceArea: "Guest Reviews",
    });

    return Response.json({ review: data });
  } catch (error) {
    console.error("[Guest Reviews] Moderation failed", error);
    return Response.json({ error: "The review could not be updated." }, { status: 500 });
  }
}
