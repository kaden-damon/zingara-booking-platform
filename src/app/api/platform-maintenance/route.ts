import {
  loadPlatformMaintenance,
  normalizePlatformMaintenanceConfig,
} from "@/lib/platformMaintenance";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const client = getServiceClient();

  if (!client) {
    return Response.json(
      { error: "Platform status is temporarily unavailable." },
      { status: 503 },
    );
  }

  try {
    const { config } = await loadPlatformMaintenance(client);

    return Response.json({ public: config.public });
  } catch (error) {
    console.error("[Zingara Maintenance] Public status load failed", error);
    return Response.json(
      { public: normalizePlatformMaintenanceConfig(null).public },
      { status: 503 },
    );
  }
}
