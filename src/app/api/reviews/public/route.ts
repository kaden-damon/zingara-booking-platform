import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import {
  getPublishedReviewAggregates,
  getVisiblePublicReviews,
  parsePublicReviewFilters,
  publicReviewContractVersion,
  toPublicReviewPayload,
  type PublicReviewAggregates,
  type PublicReviewFilters,
  type PublicReviewRecord,
  type PublicReviewsResponse,
} from "@/lib/reviews/reviews";
import { wixPreviewReviews } from "@/lib/reviews/wixPreviewFixtures";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function publicResponse(input: {
  aggregates: PublicReviewAggregates;
  filters: PublicReviewFilters;
  records: PublicReviewRecord[];
  total: number;
}): PublicReviewsResponse {
  const totalPages = Math.max(1, Math.ceil(input.total / input.filters.limit));

  return {
    aggregates: input.aggregates,
    contractVersion: publicReviewContractVersion,
    pagination: {
      hasMore: input.filters.page < totalPages,
      limit: input.filters.limit,
      page: input.filters.page,
      totalPages,
      totalReviews: input.total,
    },
    reviews: input.records.flatMap((record) => {
      const payload = toPublicReviewPayload(record);
      return payload ? [payload] : [];
    }),
  };
}

function developmentFixtureResponse(url: URL) {
  if (process.env.NODE_ENV === "production") return null;
  const fixture = url.searchParams.get("fixture");
  if (!fixture) return null;
  url.searchParams.delete("fixture");
  const parsed = parsePublicReviewFilters(url.searchParams);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { headers: responseHeaders, status: 400 });
  }
  if (fixture === "error") {
    return Response.json(
      { error: "Local Wix preview error fixture." },
      { headers: responseHeaders, status: 503 },
    );
  }
  if (fixture !== "wix" && fixture !== "empty") {
    return Response.json(
      { error: "Unknown local review fixture." },
      { headers: responseHeaders, status: 400 },
    );
  }

  const source = fixture === "empty" ? [] : wixPreviewReviews;
  const { records, total } = getVisiblePublicReviews(source, parsed.value);
  const aggregateSource = source.filter(
    (record) => !parsed.value.venue || record.venue === parsed.value.venue,
  );
  return Response.json(
    publicResponse({
      aggregates: getPublishedReviewAggregates(aggregateSource),
      filters: parsed.value,
      records,
      total,
    }),
    { headers: responseHeaders },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fixtureResponse = developmentFixtureResponse(url);
  if (fixtureResponse) return fixtureResponse;

  const parsed = parsePublicReviewFilters(url.searchParams);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { headers: responseHeaders, status: 400 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return Response.json(
      { error: "Reviews are temporarily unavailable." },
      { headers: responseHeaders, status: 503 },
    );
  }

  const rateLimit = await checkRateLimit(
    request,
    { limit: 180, scope: "public_reviews", windowSeconds: 60 },
    [parsed.value.venue, parsed.value.featured ? "featured" : "all"],
    supabase,
  );
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);

  const from = (parsed.value.page - 1) * parsed.value.limit;
  let query = supabase
    .from("guest_reviews")
    .select(
      "public_id,public_display_name,rating,review_text,venue,published_at,publication_consent,moderation_status,verified_guest,featured",
      { count: "exact" },
    )
    .eq("moderation_status", "published")
    .eq("publication_consent", true)
    .order("published_at", { ascending: false })
    .order("public_id", { ascending: false })
    .range(from, from + parsed.value.limit - 1);

  if (parsed.value.venue) query = query.eq("venue", parsed.value.venue);
  if (parsed.value.featured) query = query.eq("featured", true);

  const [reviewsResult, aggregatesResult] = await Promise.all([
    query,
    supabase.rpc("get_public_review_aggregates", {
      p_venue: parsed.value.venue,
    }),
  ]);
  if (reviewsResult.error || aggregatesResult.error) {
    console.error("[Guest Reviews] Public review feed failed", {
      aggregates: aggregatesResult.error?.message,
      reviews: reviewsResult.error?.message,
    });
    return Response.json(
      { error: "Reviews are temporarily unavailable." },
      { headers: responseHeaders, status: 503 },
    );
  }

  const records = (reviewsResult.data ?? []).map((row) => ({
    featured: row.featured,
    id: row.public_id,
    publicDisplayName: row.public_display_name,
    publicationConsent: row.publication_consent,
    publishedAt: row.published_at,
    rating: row.rating,
    reviewText: row.review_text,
    status: row.moderation_status,
    venue: row.venue,
    verifiedGuest: row.verified_guest,
  }));

  return Response.json(
    publicResponse({
      aggregates: aggregatesResult.data as PublicReviewAggregates,
      filters: parsed.value,
      records,
      total: reviewsResult.count ?? 0,
    }),
    { headers: responseHeaders },
  );
}
