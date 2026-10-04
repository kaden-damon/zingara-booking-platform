import type { User } from "@supabase/supabase-js";

export const latestStaffTourVersion = "bookings-simplified-2026-10";
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
    body: "Bookings now open in a compact view so you can scan more guests, shows, payment details and table needs at once.",
    examples: ["Compact is the default", "List and Grid are still available"],
    id: "compact-bookings",
    title: "Bookings are easier to scan",
  },
  {
    body: "Booking Details puts the guest, show, booking, payment and seating status first, with the main next step close by.",
    examples: ["Payment status", "Seating status", "What needs attention"],
    id: "details-first",
    title: "The important details come first",
  },
  {
    body: "All existing booking actions remain available. Filters and less-used details are simply tucked away until you need them.",
    id: "nothing-removed",
    supporting: "You can revisit Recent Changes in Academy at any time.",
    title: "Nothing important was removed",
  },
];

export function hasAcknowledgedStaffTour(user: User | null | undefined) {
  return user?.user_metadata?.[staffTourMetadataKey] === latestStaffTourVersion;
}
