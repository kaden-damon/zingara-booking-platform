import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type PromoValidationResult,
  getDiscountAmount,
  normalizePromoCode,
} from "@/lib/pricing";
import type { PromoDiscountType } from "@/lib/zingaraDemo";

export type PromoCodeRow = {
  active: boolean;
  code: string;
  created_at: string;
  discount_type: PromoDiscountType;
  discount_value: number;
  id: string;
  location: string | null;
  name: string;
  show_id: string | null;
  updated_at: string;
  usage_limit: number | null;
  valid_from: string | null;
  valid_until: string | null;
};

export type PromoCodeWithUsage = PromoCodeRow & {
  redemption_count: number;
  total_discount_given: number;
};

export type PromoValidationContext = {
  code?: string | null;
  location?: string | null;
  showId?: string | null;
  subtotal: number;
};

export function getPromoStatus(promo: PromoCodeWithUsage, now = new Date()) {
  if (!promo.active) {
    return "Disabled";
  }

  if (promo.valid_from && new Date(promo.valid_from) > now) {
    return "Scheduled";
  }

  if (promo.valid_until && new Date(promo.valid_until) < now) {
    return "Expired";
  }

  if (
    typeof promo.usage_limit === "number" &&
    promo.redemption_count >= promo.usage_limit
  ) {
    return "Usage Exhausted";
  }

  return "Active";
}

export async function loadPromoCodesWithUsage(
  supabase: SupabaseClient,
): Promise<PromoCodeWithUsage[]> {
  const { data: promoRows, error } = await supabase
    .from("promo_codes")
    .select(
      "id,code,name,discount_type,discount_value,active,valid_from,valid_until,usage_limit,location,show_id,created_at,updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const { data: redemptionRows, error: redemptionError } = await supabase
    .from("promo_redemptions")
    .select("promo_code_id,discount_amount");

  if (redemptionError) {
    throw redemptionError;
  }

  const usageByPromo = new Map<
    string,
    { redemption_count: number; total_discount_given: number }
  >();

  for (const row of redemptionRows ?? []) {
    const promoCodeId = String(row.promo_code_id);
    const current =
      usageByPromo.get(promoCodeId) ??
      { redemption_count: 0, total_discount_given: 0 };

    current.redemption_count += 1;
    current.total_discount_given += Number(row.discount_amount ?? 0);
    usageByPromo.set(promoCodeId, current);
  }

  return ((promoRows ?? []) as PromoCodeRow[]).map((promo) => ({
    ...promo,
    ...(usageByPromo.get(promo.id) ?? {
      redemption_count: 0,
      total_discount_given: 0,
    }),
  }));
}

export async function validatePromoCode(
  supabase: SupabaseClient,
  context: PromoValidationContext,
): Promise<PromoValidationResult> {
  const normalizedCode = normalizePromoCode(context.code);

  if (!normalizedCode) {
    return { discountAmount: 0, status: "invalid" };
  }

  const { data, error } = await supabase
    .from("promo_codes")
    .select(
      "id,code,name,discount_type,discount_value,active,valid_from,valid_until,usage_limit,location,show_id,created_at,updated_at",
    )
    .ilike("code", normalizedCode)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return { code: normalizedCode, discountAmount: 0, status: "invalid" };
  }

  const promo = data as PromoCodeRow;
  const now = new Date();

  if (!promo.active) {
    return {
      code: promo.code,
      description: promo.name,
      discountAmount: 0,
      status: "invalid",
    };
  }

  if (promo.valid_from && new Date(promo.valid_from) > now) {
    return {
      code: promo.code,
      description: promo.name,
      discountAmount: 0,
      status: "scheduled",
    };
  }

  if (promo.valid_until && new Date(promo.valid_until) < now) {
    return {
      code: promo.code,
      description: promo.name,
      discountAmount: 0,
      status: "expired",
    };
  }

  if (promo.location && promo.location !== context.location) {
    return {
      code: promo.code,
      description: promo.name,
      discountAmount: 0,
      status: "not_applicable",
    };
  }

  if (promo.show_id && promo.show_id !== context.showId) {
    return {
      code: promo.code,
      description: promo.name,
      discountAmount: 0,
      status: "not_applicable",
    };
  }

  if (typeof promo.usage_limit === "number") {
    const { count, error: countError } = await supabase
      .from("promo_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("promo_code_id", promo.id);

    if (countError) {
      throw countError;
    }

    if ((count ?? 0) >= promo.usage_limit) {
      return {
        code: promo.code,
        description: promo.name,
        discountAmount: 0,
        status: "usage_exhausted",
      };
    }
  }

  return {
    code: promo.code,
    description: promo.name,
    discountAmount: getDiscountAmount(
      {
        discountType: promo.discount_type,
        discountValue: Number(promo.discount_value),
      },
      Math.max(Number(context.subtotal) || 0, 0),
    ),
    discountType: promo.discount_type,
    discountValue: Number(promo.discount_value),
    promoCodeId: promo.id,
    status: "valid",
  };
}
