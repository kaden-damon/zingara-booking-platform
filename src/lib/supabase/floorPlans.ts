import type { InitialFloorPlan } from "@/lib/floorAllocator";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

export type InitialFloorPlanResponse = {
  plan: InitialFloorPlan;
  show: {
    date: string;
    id: string;
    time: string;
    venue: string | null;
  };
};

export function planInitialFloor(showReference: string) {
  return fetchSupabaseApi<InitialFloorPlanResponse>(
    `/api/admin/floor-plan?showReference=${encodeURIComponent(showReference)}`,
  );
}

export function applyInitialFloorPlan(input: {
  showReference: string;
  snapshotToken: string;
}) {
  return fetchSupabaseApi<{ ok: true; result: unknown }>(
    "/api/admin/floor-plan",
    {
      body: {
        confirmApply: true,
        ...input,
      },
      method: "POST",
    },
  );
}
