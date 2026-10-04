import type { User } from "@supabase/supabase-js";

export const latestStaffTourVersion = "navigation-simplified-2026-10";
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
    body: "The tools you use most are now easier to find.",
    id: "navigation",
    title: "Zingara is easier to navigate",
  },
  {
    body: "Bookings, Floor & Arrivals, Customers and Reports stay easy to reach.",
    examples: ["Bookings", "Floor & Arrivals", "Customers", "Reports"],
    id: "daily-work",
    title: "Everyday work comes first",
  },
  {
    body: "Reviews, Settings, System, Quick Start and Academy are grouped under More.",
    id: "everything-remains",
    supporting: "See Academy > Recent Changes for a quick refresher.",
    title: "Everything is still here",
  },
];

export function hasAcknowledgedStaffTour(user: User | null | undefined) {
  return user?.user_metadata?.[staffTourMetadataKey] === latestStaffTourVersion;
}
