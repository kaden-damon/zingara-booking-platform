import {
  isSuperAdminProfile,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { recordAuditEvent } from "@/lib/supabase/serverAudit";
import {
  getPromoStatus,
  loadPromoCodesWithUsage,
  type PromoCodeRow,
} from "@/lib/supabase/promoCodes";
import { normalizePromoCode } from "@/lib/pricing";
import type { PromoDiscountType } from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

type PromoCodePayload = {
  code?: string;
  discountType?: PromoDiscountType;
  discountValue?: number;
  location?: string | null;
  name?: string;
  showId?: string | null;
  usageLimit?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
};

const promoSelect =
  "id,code,name,discount_type,discount_value,active,valid_from,valid_until,usage_limit,location,show_id,created_at,updated_at";

function toApiPromo(
  promo: Awaited<ReturnType<typeof loadPromoCodesWithUsage>>[number],
) {
  return {
    active: promo.active,
    code: promo.code,
    createdAt: promo.created_at,
    discountType: promo.discount_type,
    discountValue: Number(promo.discount_value),
    id: promo.id,
    location: promo.location,
    name: promo.name,
    redemptionCount: promo.redemption_count,
    showId: promo.show_id,
    status: getPromoStatus(promo),
    totalDiscountGiven: promo.total_discount_given,
    updatedAt: promo.updated_at,
    usageLimit: promo.usage_limit,
    validFrom: promo.valid_from,
    validUntil: promo.valid_until,
  };
}

function normalizeNullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getPromoPayload(payload: PromoCodePayload, staffProfileId?: string) {
  const code = normalizePromoCode(payload.code);
  const discountType = payload.discountType;
  const discountValue = Number(payload.discountValue);
  const name = payload.name?.trim();

  if (!code) {
    throw new Error("Promo code is required.");
  }

  if (!name) {
    throw new Error("Internal name is required.");
  }

  if (discountType !== "percentage" && discountType !== "fixed") {
    throw new Error("Discount type is invalid.");
  }

  if (discountType === "percentage" && (discountValue <= 0 || discountValue > 100)) {
    throw new Error("Percentage discounts must be between 0 and 100.");
  }

  if (discountType === "fixed" && discountValue <= 0) {
    throw new Error("Fixed discounts must be greater than zero.");
  }

  const usageLimit =
    payload.usageLimit === null || payload.usageLimit === undefined
      ? null
      : Math.trunc(Number(payload.usageLimit));

  if (usageLimit !== null && usageLimit <= 0) {
    throw new Error("Usage limit must be greater than zero.");
  }

  return {
    code,
    discount_type: discountType,
    discount_value: discountValue,
    location: normalizeNullableText(payload.location),
    name,
    show_id: normalizeNullableText(payload.showId),
    updated_by: staffProfileId ?? null,
    usage_limit: usageLimit,
    valid_from: normalizeNullableText(payload.validFrom),
    valid_until: normalizeNullableText(payload.validUntil),
  };
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  if (!isSuperAdminProfile(auth.staffProfile)) {
    return Response.json(
      { error: "Promo code management is restricted to Super Admins." },
      { status: 403 },
    );
  }

  try {
    const promos = await loadPromoCodesWithUsage(auth.serviceClient);

    return Response.json({ promoCodes: promos.map(toApiPromo) });
  } catch (error) {
    console.error("[Zingara Promo] Failed to load promo codes", error);

    return Response.json(
      { error: "Promo codes could not be loaded." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  if (!isSuperAdminProfile(auth.staffProfile)) {
    return Response.json(
      { error: "Promo code management is restricted to Super Admins." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as PromoCodePayload;
    const payload = {
      ...getPromoPayload(body, auth.staffProfile.id),
      active: false,
      created_by: auth.staffProfile.id,
      creation_source: "admin",
    };
    const { data, error } = await auth.serviceClient
      .from("promo_codes")
      .insert(payload)
      .select(promoSelect)
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        return Response.json(
          { error: "A promo code with that code already exists." },
          { status: 409 },
        );
      }

      throw error;
    }

    const promo = data as PromoCodeRow;

    await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: "promo.created",
      afterValues: payload,
      entityId: promo.id,
      entityReference: promo.code,
      entityType: "promo-code",
      outcome: "success",
      request,
      sourceArea: "settings",
    });

    const promos = await loadPromoCodesWithUsage(auth.serviceClient);

    return Response.json({ promoCodes: promos.map(toApiPromo) });
  } catch (error) {
    console.error("[Zingara Promo] Failed to create promo code", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Promo code could not be created.",
      },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  if (!isSuperAdminProfile(auth.staffProfile)) {
    return Response.json(
      { error: "Promo code management is restricted to Super Admins." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as PromoCodePayload & { id?: string };

    if (!body.id) {
      return Response.json({ error: "Promo code ID is required." }, { status: 400 });
    }

    const { data: existingData, error: loadError } = await auth.serviceClient
      .from("promo_codes")
      .select(promoSelect)
      .eq("id", body.id)
      .maybeSingle();

    if (loadError) {
      throw loadError;
    }

    if (!existingData) {
      return Response.json({ error: "Promo code not found." }, { status: 404 });
    }

    const existing = existingData as PromoCodeRow;
    const payload = getPromoPayload(
      {
        code: body.code ?? existing.code,
        discountType: body.discountType ?? existing.discount_type,
        discountValue: body.discountValue ?? Number(existing.discount_value),
        location: body.location ?? existing.location,
        name: body.name ?? existing.name,
        showId: body.showId ?? existing.show_id,
        usageLimit: body.usageLimit ?? existing.usage_limit,
        validFrom: body.validFrom ?? existing.valid_from,
        validUntil: body.validUntil ?? existing.valid_until,
      },
      auth.staffProfile.id,
    );

    const { data, error } = await auth.serviceClient
      .from("promo_codes")
      .update(payload)
      .eq("id", body.id)
      .select(promoSelect)
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        return Response.json(
          { error: "A promo code with that code already exists." },
          { status: 409 },
        );
      }

      throw error;
    }

    const promo = data as PromoCodeRow;
    await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: "promo.updated",
      afterValues: payload,
      beforeValues: {
        active: existing.active,
        code: existing.code,
        discount_type: existing.discount_type,
        discount_value: Number(existing.discount_value),
        location: existing.location,
        name: existing.name,
        show_id: existing.show_id,
        usage_limit: existing.usage_limit,
        valid_from: existing.valid_from,
        valid_until: existing.valid_until,
      },
      entityId: promo.id,
      entityReference: promo.code,
      entityType: "promo-code",
      outcome: "success",
      request,
      sourceArea: "settings",
    });

    const promos = await loadPromoCodesWithUsage(auth.serviceClient);

    return Response.json({ promoCodes: promos.map(toApiPromo) });
  } catch (error) {
    console.error("[Zingara Promo] Failed to update promo code", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Promo code could not be updated.",
      },
      { status: 400 },
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

  if (!isSuperAdminProfile(auth.staffProfile)) {
    return Response.json(
      { error: "Promo code management is restricted to Super Admins." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      action?: "activate" | "disable";
      id?: string;
    };

    if (!body.id) {
      return Response.json({ error: "Promo code ID is required." }, { status: 400 });
    }

    if (body.action !== "activate" && body.action !== "disable") {
      return Response.json(
        { error: "A valid promo status action is required." },
        { status: 400 },
      );
    }

    const { data: existingData, error: loadError } = await auth.serviceClient
      .from("promo_codes")
      .select(promoSelect)
      .eq("id", body.id)
      .maybeSingle();

    if (loadError) {
      throw loadError;
    }

    if (!existingData) {
      return Response.json({ error: "Promo code not found." }, { status: 404 });
    }

    const existing = existingData as PromoCodeRow;

    if (body.action === "activate") {
      const { error } = await auth.serviceClient.rpc("activate_promo_code", {
        p_actor_auth_user_id: auth.user.id,
        p_actor_staff_profile_id: auth.staffProfile.id,
        p_promo_id: body.id,
        p_request_id:
          request.headers.get("x-vercel-id") ??
          request.headers.get("x-request-id"),
        p_user_agent: request.headers.get("user-agent"),
      });

      if (error) {
        throw error;
      }
    } else if (existing.active) {
      const { error } = await auth.serviceClient
        .from("promo_codes")
        .update({
          active: false,
          updated_by: auth.staffProfile.id,
        })
        .eq("id", body.id);

      if (error) {
        throw error;
      }

      await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
        action: "promo.disabled",
        afterValues: { active: false, code: existing.code },
        beforeValues: { active: true, code: existing.code },
        changedFields: ["active"],
        entityId: existing.id,
        entityReference: existing.code,
        entityType: "promo-code",
        outcome: "success",
        request,
        sourceArea: "settings",
      });
    }

    const promos = await loadPromoCodesWithUsage(auth.serviceClient);

    return Response.json({ promoCodes: promos.map(toApiPromo) });
  } catch (error) {
    console.error("[Zingara Promo] Failed to change promo status", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Promo code status could not be updated.",
      },
      { status: 400 },
    );
  }
}
