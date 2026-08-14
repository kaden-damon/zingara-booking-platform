import { fetchSupabaseApi } from "./apiClient";

export type BookingEditLock = {
  bookingId: string;
  bookingReference: string;
  id: string;
  isStale: boolean;
  lastActivityAt: string;
  releaseReason?: string | null;
  releasedAt?: string | null;
  sessionId: string;
  staffName: string;
  staffProfileId?: string | null;
  staffRole: string;
  staffUserId?: string | null;
  startedAt: string;
  takeoverRequestedAt?: string | null;
  takeoverRequestedBy?: string | null;
  takeoverRequestedByName?: string | null;
};

export type BookingLockAcquireResult = {
  lock?: BookingEditLock;
  status: "acquired" | "blocked" | "missing";
};

export type BookingTakeoverResolutionResult = {
  lock?: BookingEditLock;
  status: "accepted" | "declined" | "missing";
};

export async function getBookingEditLocks(reference?: string) {
  const params = new URLSearchParams();

  if (reference) {
    params.set("reference", reference);
  }

  const query = params.toString();
  const payload = await fetchSupabaseApi<{ locks: BookingEditLock[] }>(
    `/api/admin/booking-locks${query ? `?${query}` : ""}`,
  );

  return payload.locks ?? [];
}

export async function acquireBookingEditLock(input: {
  bookingReference: string;
  force?: boolean;
  sessionId: string;
}) {
  return fetchSupabaseApi<BookingLockAcquireResult>(
    "/api/admin/booking-locks",
    {
      body: {
        action: input.force ? "force-takeover" : "acquire",
        bookingReference: input.bookingReference,
        sessionId: input.sessionId,
      },
      method: "POST",
    },
  );
}

export async function heartbeatBookingEditLock(input: {
  lockId: string;
  sessionId: string;
}) {
  return fetchSupabaseApi<BookingLockAcquireResult>(
    "/api/admin/booking-locks",
    {
      body: {
        action: "heartbeat",
        lockId: input.lockId,
        sessionId: input.sessionId,
      },
      method: "POST",
    },
  );
}

export async function releaseBookingEditLock(input: {
  lockId: string;
  reason: string;
  sessionId: string;
}) {
  return fetchSupabaseApi<{ released: boolean }>(
    "/api/admin/booking-locks",
    {
      body: {
        action: "release",
        lockId: input.lockId,
        reason: input.reason,
        sessionId: input.sessionId,
      },
      method: "POST",
    },
  );
}

export async function requestBookingEditTakeover(input: {
  lockId: string;
}) {
  return fetchSupabaseApi<BookingLockAcquireResult>(
    "/api/admin/booking-locks",
    {
      body: {
        action: "request-takeover",
        lockId: input.lockId,
      },
      method: "POST",
    },
  );
}

export async function resolveBookingEditTakeover(input: {
  action: "accept-takeover" | "decline-takeover";
  lockId: string;
}) {
  return fetchSupabaseApi<BookingTakeoverResolutionResult>(
    "/api/admin/booking-locks",
    {
      body: {
        action: input.action,
        lockId: input.lockId,
      },
      method: "POST",
    },
  );
}
