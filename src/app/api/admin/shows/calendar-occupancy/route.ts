import { loadShowCalendarOccupancy } from "@/lib/supabase/showCalendarOccupancyServer";
import { requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const validVenues = new Set(["all", "cape-town", "johannesburg"]);

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  const url = new URL(request.url);
  const month = url.searchParams.get("month")?.trim() ?? "";
  const venue = url.searchParams.get("venue")?.trim() ?? "all";

  if (!monthPattern.test(month) || !validVenues.has(venue)) {
    return Response.json(
      { error: "A valid calendar month and venue are required." },
      { status: 400 },
    );
  }

  try {
    const dataset = await loadShowCalendarOccupancy(
      auth.serviceClient,
      auth.staffProfile.venue_scope ?? [],
      { month, venue },
    );

    return Response.json(dataset, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[Zingara API] Show calendar occupancy failed", error);
    return Response.json(
      { error: "Show occupancy couldn't be loaded. Try again." },
      { status: 500 },
    );
  }
}
