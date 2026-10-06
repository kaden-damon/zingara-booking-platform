import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShowCustomPricing } from "@/lib/showSpecificPricing";
import { normalizeShowCustomPricing } from "@/lib/showSpecificPricing";

type ShowPricingRow = {
  enabled: boolean;
  show_id: string;
  updated_at: string;
  zone_prices: ShowCustomPricing["zonePrices"] | null;
};

export async function loadShowCustomPricingMap(
  supabase: SupabaseClient,
  showIds: string[],
) {
  const result = new Map<string, ShowCustomPricing>();
  const uniqueShowIds = [...new Set(showIds.filter(Boolean))];

  if (uniqueShowIds.length === 0) {
    return result;
  }

  const { data, error } = await supabase
    .from("show_pricing_configurations")
    .select("show_id,enabled,zone_prices,updated_at")
    .in("show_id", uniqueShowIds);

  if (error) {
    throw error;
  }

  for (const row of (data ?? []) as ShowPricingRow[]) {
    result.set(
      row.show_id,
      normalizeShowCustomPricing({
        enabled: row.enabled,
        updatedAt: row.updated_at,
        zonePrices: row.zone_prices ?? {},
      }),
    );
  }

  return result;
}

export async function loadShowCustomPricing(
  supabase: SupabaseClient,
  showId: string,
) {
  const configurations = await loadShowCustomPricingMap(supabase, [showId]);
  return configurations.get(showId) ?? normalizeShowCustomPricing(null);
}
