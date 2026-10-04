import type { User } from "@supabase/supabase-js";

export const latestStaffTourVersion = "booking-creation-simplified-2026-10";
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
    body: "Standard and Corporate bookings now follow a clearer step-by-step journey.",
    examples: ["Show", "Guests", "Seating", "Payment", "Review"],
    id: "booking-journey",
    title: "Creating bookings is simpler",
  },
  {
    body: "Choose the guest or company, show, number of guests, seating and payment without unnecessary technical information.",
    id: "booking-essentials",
    title: "Only what you need",
  },
  {
    body: "Availability, pricing, payments and capacity checks still work exactly as before.",
    id: "booking-safety",
    supporting: "See Academy > Recent Changes for a quick refresher.",
    title: "The same safeguards remain",
  },
];

export function hasAcknowledgedStaffTour(user: User | null | undefined) {
  return user?.user_metadata?.[staffTourMetadataKey] === latestStaffTourVersion;
}
