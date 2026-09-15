import { isValidSeatingZoneId, normalizeShowLocation } from "@/lib/zingaraDemo";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { loadPublicShowAvailability } from "@/lib/supabase/publicShowAvailability";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

const metadataPrefix = "__zingara_show_meta__:";

function getLegacyShowId(notes: string | null) {
  if (!notes?.startsWith(metadataPrefix)) return "";
  try {
    return (JSON.parse(notes.slice(metadataPrefix.length)) as { legacyId?: string })
      .legacyId ?? "";
  } catch {
    return "";
  }
}

function getPermissions(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  const role = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
  return getRolePermissions(role);
}

async function resolveShow(
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  showReference: string,
) {
  const { data: rows, error: fallbackError } = await serviceClient
    .from("shows")
    .select("id,notes,venue,date,time,name");
  if (fallbackError) throw fallbackError;
  return (rows ?? []).find((show) => getLegacyShowId(show.notes) === showReference) ?? null;
}

function canAccessVenue(profile: { venue_scope: string[] }, venue: string | null) {
  const scope = normalizeStaffVenueScope(profile.venue_scope ?? []);
  const location = normalizeShowLocation(venue);
  return Boolean(location && (scope.includes("all") || scope.includes(location)));
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!getPermissions(auth.staffProfile).includes("settings:manage")) {
    return Response.json({ error: "Show management access is required." }, { status: 403 });
  }

  try {
    const showReference = new URL(request.url).searchParams.get("showReference")?.trim();
    if (!showReference) {
      return Response.json({ error: "Show reference is required." }, { status: 400 });
    }
    const show = await resolveShow(auth.serviceClient, showReference);
    if (!show) return Response.json({ error: "Show could not be found." }, { status: 404 });
    if (!canAccessVenue(auth.staffProfile, show.venue)) {
      return Response.json({ error: "This show is outside your venue scope." }, { status: 403 });
    }

    return Response.json({
      ...(await loadPublicShowAvailability(auth.serviceClient, show.id)),
      show: { date: show.date, id: show.id, name: show.name, time: show.time, venue: show.venue },
    });
  } catch (error) {
    console.error("[Zingara API] Failed to load zone sales controls", error);
    return Response.json({ error: "Zone sales controls could not be loaded." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  if (!getPermissions(auth.staffProfile).includes("settings:manage")) {
    return Response.json({ error: "Show management access is required." }, { status: 403 });
  }

  try {
    const body = await request.json() as {
      expectedUpdatedAt?: string | null;
      publicSalesOpen?: boolean;
      reason?: string;
      showReference?: string;
      zoneId?: string;
    };
    if (!body.showReference || !isValidSeatingZoneId(body.zoneId ?? "") || typeof body.publicSalesOpen !== "boolean") {
      return Response.json({ error: "A valid show, seating zone and sales state are required." }, { status: 400 });
    }
    const show = await resolveShow(auth.serviceClient, body.showReference);
    if (!show) return Response.json({ error: "Show could not be found." }, { status: 404 });
    if (!canAccessVenue(auth.staffProfile, show.venue)) {
      return Response.json({ error: "This show is outside your venue scope." }, { status: 403 });
    }
    const role = Array.isArray(auth.staffProfile.roles)
      ? auth.staffProfile.roles[0]
      : auth.staffProfile.roles;
    const { data, error } = await auth.serviceClient.rpc(
      "set_show_zone_public_sales_atomic",
      {
        p_actor: {
          authUserId: auth.user.id,
          locationScope: auth.staffProfile.venue_scope,
          name: auth.staffProfile.full_name,
          role: role?.name ?? "Staff",
          staffProfileId: auth.staffProfile.id,
        },
        p_expected_updated_at: body.expectedUpdatedAt ?? null,
        p_public_sales_open: body.publicSalesOpen,
        p_reason: body.reason?.trim() || null,
        p_show_id: show.id,
        p_zone_id: body.zoneId,
      },
    );
    if (error) {
      if (/STALE_ZONE_SALES_STATE/.test(error.message)) {
        return Response.json(
          { error: "This zone's public-sales state changed while you were reviewing it. Reload and try again." },
          { status: 409 },
        );
      }
      throw error;
    }

    return Response.json({ control: data });
  } catch (error) {
    console.error("[Zingara API] Failed to update zone sales controls", error);
    return Response.json({ error: "Zone public-sales state could not be saved." }, { status: 500 });
  }
}
