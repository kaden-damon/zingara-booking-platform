export const platformPresenceHeartbeatMs = 60_000;
export const platformPresenceActiveWindowMs = 3 * 60_000;

type PresenceActivityInput = {
  lastActivityAt: number;
  now: number;
  visible: boolean;
};

type StaffPresenceSession = {
  session_type: "public" | "staff";
  staff_profile_id: string | null;
};

export function shouldSendPresenceHeartbeat({
  lastActivityAt,
  now,
  visible,
}: PresenceActivityInput) {
  return visible && now - lastActivityAt < platformPresenceActiveWindowMs;
}

export function countUniqueActiveStaff(sessions: StaffPresenceSession[]) {
  return new Set(
    sessions
      .filter(
        (session) =>
          session.session_type === "staff" && Boolean(session.staff_profile_id),
      )
      .map((session) => session.staff_profile_id),
  ).size;
}
