import { getActorRoleLabel } from "@/lib/auditTrail";
import {
  isSupportedCustomPricingZone,
  normalizeShowCustomPricing,
  type ShowCustomPricing,
} from "@/lib/showSpecificPricing";
import {
  getAdminRoleFromName,
  getRolePermissions,
  requireActiveStaff,
  type RoleRow,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

function getStaffRole(roles: RoleRow | RoleRow[] | null | undefined) {
  return Array.isArray(roles) ? roles[0] : roles;
}

function getSafeZonePrices(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const zonePrices: ShowCustomPricing["zonePrices"] = {};

  for (const [zoneId, rawPrice] of Object.entries(value)) {
    if (!isSupportedCustomPricingZone(zoneId)) {
      return null;
    }

    const price = Number(rawPrice);
    if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) {
      return null;
    }

    zonePrices[zoneId] = Math.round(price * 100) / 100;
  }

  return zonePrices;
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  const role = getStaffRole(auth.staffProfile.roles);
  if (!getRolePermissions(role).includes("settings:manage")) {
    return Response.json(
      { error: "You don't have access to change show pricing." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    enabled?: unknown;
    expectedUpdatedAt?: unknown;
    showId?: unknown;
    zonePrices?: unknown;
  } | null;
  const showId = typeof body?.showId === "string" ? body.showId.trim() : "";
  const zonePrices = getSafeZonePrices(body?.zonePrices);
  const enabled = body?.enabled === true;

  if (!showId || !zonePrices || (enabled && Object.keys(zonePrices).length === 0)) {
    return Response.json(
      { error: "Enter at least one valid custom price before enabling custom pricing." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.serviceClient.rpc(
    "set_show_custom_pricing_atomic",
    {
      p_actor: {
        authUserId: auth.user?.id ?? null,
        locationScope: auth.staffProfile.venue_scope ?? [],
        name: auth.staffProfile.full_name,
        role: getActorRoleLabel(getAdminRoleFromName(role?.name)),
        staffProfileId: auth.staffProfile.id,
      },
      p_enabled: enabled,
      p_expected_updated_at:
        typeof body?.expectedUpdatedAt === "string" && body.expectedUpdatedAt
          ? body.expectedUpdatedAt
          : null,
      p_show_id: showId,
      p_zone_prices: zonePrices,
    },
  );

  if (error) {
    if (error.message.includes("STALE_SHOW_PRICING_STATE")) {
      return Response.json(
        { error: "Show pricing changed elsewhere. Refresh and try again." },
        { status: 409 },
      );
    }
    if (error.message.includes("SHOW_NOT_FOUND")) {
      return Response.json({ error: "Show not found." }, { status: 404 });
    }
    if (error.message.includes("SHOW_PRICING_PERMISSION_REQUIRED")) {
      return Response.json(
        { error: "You don't have access to change show pricing." },
        { status: 403 },
      );
    }

    console.error("[Zingara show pricing] Save failed", error);
    return Response.json(
      { error: "Custom pricing could not be saved." },
      { status: 500 },
    );
  }

  return Response.json({
    customPricing: normalizeShowCustomPricing(data as ShowCustomPricing),
  });
}
