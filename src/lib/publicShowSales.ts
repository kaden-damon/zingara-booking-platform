export type ShowLifecycleStatus =
  | "active"
  | "archived"
  | "blackout"
  | "inactive"
  | "sold_out"
  | "special_event"
  | "venue_closure";

export function isShowPubliclyBookable(
  status: ShowLifecycleStatus | string | null | undefined,
) {
  return (
    status === "active" ||
    status === "special_event" ||
    status === "special-event"
  );
}

export function isShowPubliclyVisible(
  status: ShowLifecycleStatus | string | null | undefined,
) {
  return status !== "inactive" && status !== "archived";
}

export const publicShowUnavailableMessage =
  "This performance is no longer available for online booking.";
