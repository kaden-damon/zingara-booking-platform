import type { InitialFloorPlan } from "@/lib/floorAllocator";
import type { ZoneFloorCapacityPlan } from "@/lib/corporateFloorPlanning";
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

export type ShowWideFloorCapacityPlan = {
  generatedAt: string;
  showId: string;
  snapshotToken: string;
  zones: ZoneFloorCapacityPlan[];
};

export type ShowWideFloorCapacityPlanResponse = {
  plan: ShowWideFloorCapacityPlan;
  show: {
    date: string;
    id: string;
    time: string;
    venue: string | null;
  };
};

export function planShowFloorCapacity(showReference: string) {
  return fetchSupabaseApi<ShowWideFloorCapacityPlanResponse>(
    `/api/admin/floor-capacity-plan?showReference=${encodeURIComponent(showReference)}`,
  );
}

export function createShowFloorCapacityPlan(input: {
  capacities: number[];
  showReference: string;
  snapshotToken: string;
  zoneId: string;
}) {
  return fetchSupabaseApi<{ ok: true; result: unknown }>(
    "/api/admin/floor-capacity-plan",
    {
      body: { action: "create", confirmCreate: true, ...input },
      method: "POST",
    },
  );
}

export function assignCorporateFloorPlan(input: {
  bookingReference: string;
  expectedUpdatedAt: string;
  showReference: string;
  snapshotToken: string;
  tableIds: string[];
}) {
  return fetchSupabaseApi<{ ok: true; result: unknown }>(
    "/api/admin/floor-capacity-plan",
    { body: { action: "assign", ...input }, method: "POST" },
  );
}

export function releaseCorporateFloorAssignment(input: {
  bookingReference: string;
  expectedTableIds: string[];
  expectedUpdatedAt: string;
}) {
  return fetchSupabaseApi<{ ok: true; result: unknown }>(
    "/api/admin/floor-capacity-plan",
    { body: { action: "release", ...input }, method: "POST" },
  );
}

export function releaseCorporateFloorTable(input: {
  bookingReference: string;
  expectedTableIds: string[];
  expectedUpdatedAt: string;
  tableId: string;
}) {
  return fetchSupabaseApi<{
    ok: true;
    result: {
      floorAssignmentRequired: boolean;
      releaseMode: "complete-fallback" | "single";
      released: number;
    };
  }>("/api/admin/floor-capacity-plan", {
    body: { action: "release-table", ...input },
    method: "POST",
  });
}
