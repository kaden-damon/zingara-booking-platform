import { fetchSupabaseApi } from "./apiClient";

export type ShowEditLock = {
  id: string;
  isStale: boolean;
  lastActivityAt: string;
  releaseReason?: string | null;
  releasedAt?: string | null;
  sessionId: string;
  showId: string;
  showReference: string;
  staffName: string;
  staffProfileId?: string | null;
  staffRole: string;
  staffUserId?: string | null;
  startedAt: string;
  takeoverRequestedAt?: string | null;
  takeoverRequestedBy?: string | null;
  takeoverRequestedByName?: string | null;
};

export type ShowLockAcquireResult = {
  lock?: ShowEditLock;
  status: "acquired" | "blocked" | "missing";
};

export async function getShowEditLocks(reference?: string) {
  const params = new URLSearchParams();

  if (reference) {
    params.set("reference", reference);
  }

  const query = params.toString();
  const payload = await fetchSupabaseApi<{ locks: ShowEditLock[] }>(
    `/api/admin/show-locks${query ? `?${query}` : ""}`,
  );

  return payload.locks ?? [];
}

export async function acquireShowEditLock(input: {
  force?: boolean;
  sessionId: string;
  showReference: string;
}) {
  return fetchSupabaseApi<ShowLockAcquireResult>("/api/admin/show-locks", {
    body: {
      action: input.force ? "force-takeover" : "acquire",
      sessionId: input.sessionId,
      showReference: input.showReference,
    },
    method: "POST",
  });
}

export async function heartbeatShowEditLock(input: {
  lockId: string;
  sessionId: string;
}) {
  return fetchSupabaseApi<ShowLockAcquireResult>("/api/admin/show-locks", {
    body: {
      action: "heartbeat",
      lockId: input.lockId,
      sessionId: input.sessionId,
    },
    method: "POST",
  });
}

export async function releaseShowEditLock(input: {
  lockId: string;
  reason: string;
  sessionId: string;
}) {
  return fetchSupabaseApi<{ released: boolean }>("/api/admin/show-locks", {
    body: {
      action: "release",
      lockId: input.lockId,
      reason: input.reason,
      sessionId: input.sessionId,
    },
    method: "POST",
  });
}
