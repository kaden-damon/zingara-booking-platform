import {
  normalizeShowLocation,
  type DemoShow,
} from "@/lib/zingaraDemo";
import {
  getRolePermissions,
  getServiceClient,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  isShowPubliclyVisible,
  isShowStaffBookable,
} from "@/lib/publicShowSales";
import type { ShowCustomPricing } from "@/lib/showSpecificPricing";
import { loadShowCustomPricingMap } from "@/lib/supabase/showSpecificPricingServer";
import { loadActiveCorporateBuyoutSummaries } from "@/lib/supabase/corporateBuyoutsServer";
import type { CorporateBuyoutSummary } from "@/lib/corporateBuyouts";

export const dynamic = "force-dynamic";

type PublicShowRow = {
  date: string;
  description: string | null;
  id: string;
  name: string;
  notes: string | null;
  status:
    | "active"
    | "archived"
    | "blackout"
    | "inactive"
    | "sold_out"
    | "special_event"
    | "venue_closure";
  time: string;
  updated_at?: string;
  venue: string;
};

const metadataPrefix = "__zingara_show_meta__:";

function getPublicShowMetadata(notes: string | null) {
  if (!notes?.startsWith(metadataPrefix)) {
    return { address: "", legacyId: "" };
  }

  try {
    const parsed = JSON.parse(notes.slice(metadataPrefix.length)) as {
      address?: string;
      legacyId?: string;
    };

    return {
      address: parsed.address ?? "",
      legacyId: parsed.legacyId ?? "",
    };
  } catch {
    return { address: "", legacyId: "" };
  }
}

function getPublicShowStatus(
  status: PublicShowRow["status"],
): DemoShow["operationalStatus"] {
  if (status === "sold_out") return "sold-out";
  if (status === "venue_closure") return "venue-closure";
  if (status === "special_event") return "special-event";
  if (status === "archived") return "inactive";
  return status;
}

function toPublicShow(
  row: PublicShowRow,
  customPricing?: ShowCustomPricing,
  fullShowBuyout?: CorporateBuyoutSummary,
): DemoShow {
  const metadata = getPublicShowMetadata(row.notes);
  const location = normalizeShowLocation(row.venue);

  return {
    address: metadata.address || (location ? "" : row.venue),
    archivedAt: row.status === "archived" ? row.updated_at : undefined,
    customPricing,
    fullShowBuyout,
    date: row.date,
    description: row.description ?? "",
    id: metadata.legacyId || row.id,
    label: row.name,
    location: location ?? undefined,
    operationalStatus: getPublicShowStatus(row.status),
    supabaseId: row.id,
    time: row.time.slice(0, 5),
    venueName: row.venue,
  };
}

export async function GET(request: Request) {
  const operationalScope =
    new URL(request.url).searchParams.get("scope") === "operational";
  let serviceClient = getServiceClient();

  if (operationalScope) {
    const auth = await requireActiveStaff(request);
    if (auth.error || !auth.serviceClient || !auth.staffProfile) {
      return auth.error ?? Response.json(
        { error: "Active staff access is required." },
        { status: 403 },
      );
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
    serviceClient = auth.serviceClient;
  }

  if (!serviceClient) {
    return Response.json(
      { error: "Shows are temporarily unavailable." },
      { status: 503 },
    );
  }

  const { data, error } = await serviceClient
    .from("shows")
    .select(
      "id,name,description,date,time,venue,status,notes,updated_at",
    )
    .order("date", { ascending: true })
    .order("time", { ascending: true });

  if (error) {
    console.error("[Zingara API] Failed to load public shows", error);
    return Response.json(
      { error: "Shows could not be loaded." },
      { status: 500 },
    );
  }

  const showRows = (data ?? []) as PublicShowRow[];
  const showIds = showRows.map((show) => show.id);
  const [customPricingByShowId, buyoutsByShowId] = await Promise.all([
    loadShowCustomPricingMap(serviceClient, showIds),
    loadActiveCorporateBuyoutSummaries(serviceClient, showIds),
  ]);

  return Response.json({
    shows: showRows
      .filter((show) =>
        operationalScope
          ? isShowStaffBookable(show.status)
          : isShowPubliclyVisible(show.status),
      )
      .map((show) => {
        const buyout = buyoutsByShowId.get(show.id);
        return toPublicShow(
          show,
          customPricingByShowId.get(show.id),
          buyout
            ? {
                ...buyout,
                bookingReference: operationalScope ? buyout.bookingReference : "",
                companyName: operationalScope ? buyout.companyName : "Full Show Buyout",
                currentGuestCount: operationalScope ? buyout.currentGuestCount : 0,
                packageName: operationalScope ? buyout.packageName : "Full Show Buyout",
                revision: operationalScope ? buyout.revision : 0,
                unallocatedGuestCount: operationalScope
                  ? buyout.unallocatedGuestCount
                  : 0,
              }
            : undefined,
        );
      }),
  });
}
