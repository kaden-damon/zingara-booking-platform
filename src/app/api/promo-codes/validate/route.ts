import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { validatePromoCode } from "@/lib/supabase/promoCodes";
import { normalizeShowLocation } from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

const showMetadataPrefix = "__zingara_show_meta__:";

function parseLegacyShowId(notes: string | null) {
  if (!notes?.startsWith(showMetadataPrefix)) {
    return "";
  }

  try {
    return (
      (JSON.parse(notes.slice(showMetadataPrefix.length)) as { legacyId?: string })
        .legacyId ?? ""
    );
  } catch {
    return "";
  }
}

async function resolveShowId(
  supabase: NonNullable<ReturnType<typeof getServiceClient>>,
  sourceShowId: string | null,
) {
  if (!sourceShowId) {
    return null;
  }

  const query = supabase.from("shows").select("id,notes").limit(50);
  const { data, error } = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    sourceShowId,
  )
    ? await query.eq("id", sourceShowId)
    : await query.ilike("notes", `%${sourceShowId}%`);

  if (error) {
    throw error;
  }

  return (
    (data ?? []).find(
      (show) => show.id === sourceShowId || parseLegacyShowId(show.notes) === sourceShowId,
    )?.id ?? null
  );
}

export async function POST(request: Request) {
  const supabase = getServiceClient();

  if (!supabase) {
    return Response.json(
      { error: "Promo validation is temporarily unavailable." },
      { status: 503 },
    );
  }

  const limit = await checkRateLimit(
    request,
    {
      limit: 45,
      scope: "public_promo_validate_ip",
      windowSeconds: 60,
    },
    [],
    supabase,
  );

  if (!limit.allowed) {
    return rateLimitResponse(
      limit.retryAfterSeconds,
      {
        operation: "validate_promo_code",
        route: "/api/promo-codes/validate",
        safeFingerprint: "promo_validate_rate_limited",
      },
      supabase,
    );
  }

  try {
    const body = (await request.json()) as {
      code?: string;
      location?: string | null;
      showId?: string | null;
      subtotal?: number;
    };
    const location = normalizeShowLocation(body.location) ?? null;
    const showId = await resolveShowId(supabase, body.showId ?? null);
    const promo = await validatePromoCode(supabase, {
      code: body.code,
      location,
      showId,
      subtotal: Math.max(Number(body.subtotal) || 0, 0),
    });

    return Response.json({
      code: promo.code ?? null,
      description: promo.description ?? null,
      discountAmount: promo.status === "valid" ? promo.discountAmount : 0,
      status: promo.status,
    });
  } catch (error) {
    console.error("[Zingara Promo] Validation failed", error);

    return Response.json(
      { error: "Promo code could not be validated." },
      { status: 500 },
    );
  }
}
