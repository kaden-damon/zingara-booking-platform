export const maxBulkAvailabilityShows = 100;

export type ShowAvailabilityAction = "open" | "close";
export type ShowAvailabilitySelection = { id: string; status: "active" | "inactive" };
export type ShowAvailabilityRequest = {
  action: ShowAvailabilityAction;
  month: string;
  venue: "all" | "cape-town" | "johannesburg";
  shows: ShowAvailabilitySelection[];
};
export type ShowAvailabilityResult = {
  id: string;
  success: boolean;
  status?: "active" | "inactive";
  error?: string;
  warning?: string;
};

export function canBulkChangeShow(show: {
  archivedAt?: string;
  fullShowBuyout?: unknown;
  operationalStatus?: string;
}) {
  return !show.archivedAt && !show.fullShowBuyout &&
    ["active", "inactive"].includes(show.operationalStatus ?? "active");
}

export function visibleShowSelection(selected: string[], visible: string[]) {
  const allowed = new Set(visible);
  return [...new Set(selected)].filter((id) => allowed.has(id));
}

export function parseShowAvailabilityRequest(value: unknown): ShowAvailabilityRequest {
  const body = value as Partial<ShowAvailabilityRequest> | null;
  if (!body || !["open", "close"].includes(body.action ?? "") ||
    typeof body.month !== "string" || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(body.month) ||
    !["all", "cape-town", "johannesburg"].includes(body.venue ?? "") ||
    !Array.isArray(body.shows) || body.shows.length < 1 || body.shows.length > maxBulkAvailabilityShows) {
    throw new Error(`Select between 1 and ${maxBulkAvailabilityShows} shows in one visible month.`);
  }
  const ids = new Set<string>();
  for (const show of body.shows) {
    if (!show || typeof show.id !== "string" || !/^[\w:-]{1,180}$/.test(show.id) ||
      !["active", "inactive"].includes(show.status) || ids.has(show.id)) {
      throw new Error("Each selected show must have a unique reference and an Open or Closed status.");
    }
    ids.add(show.id);
  }
  return body as ShowAvailabilityRequest;
}

export async function runShowAvailabilityBatch(
  shows: ShowAvailabilitySelection[],
  apply: (show: ShowAvailabilitySelection) => Promise<ShowAvailabilityResult>,
) {
  const results: ShowAvailabilityResult[] = [];
  // Four independent writes at a time; never retry consequential updates.
  for (let offset = 0; offset < shows.length; offset += 4) {
    results.push(...await Promise.all(shows.slice(offset, offset + 4).map(async (show) => {
      try {
        return await apply(show);
      } catch {
        return { id: show.id, success: false, error: "Could not confirm this change. Review the show before retrying." };
      }
    })));
  }
  return results;
}
