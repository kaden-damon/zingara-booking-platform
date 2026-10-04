import type { User } from "@supabase/supabase-js";

export const latestStaffTourVersion = "floor-simplified-2026-10";
export const staffTourMetadataKey = "zingara_staff_tour_version";

export type StaffTourPage = {
  body: string;
  examples?: string[];
  id: string;
  supporting?: string;
  title: string;
};

export const staffTourPages: StaffTourPage[] = [
  {
    body: "See guests booked, public seats and staff-only extra seating without technical wording.",
    examples: ["Public seats", "Extra seating", "Approved seats left"],
    id: "floor-summary",
    title: "Floor is easier to read",
  },
  {
    body: "Use Needs a table to see who still needs seating and the recommended tables.",
    examples: ["Find tables", "Recommended", "Assign"],
    id: "floor-queue",
    title: "Bookings needing tables are clearer",
  },
  {
    body: "Table fit, public capacity, extra seating and assignment checks have not changed.",
    id: "floor-safety",
    supporting: "See Academy > Recent Changes for a quick refresher.",
    title: "The same safety rules still apply",
  },
];

export function hasAcknowledgedStaffTour(user: User | null | undefined) {
  return user?.user_metadata?.[staffTourMetadataKey] === latestStaffTourVersion;
}
