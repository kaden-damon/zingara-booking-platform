import type { User } from "@supabase/supabase-js";

export const latestStaffTourVersion = "plain-language-2026-10";
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
    body: "We've simplified the wording and guidance so it's quicker to find what you need during a busy shift.",
    id: "welcome",
    supporting: "Nothing important has been removed.",
    title: "We've made Zingara easier to use",
  },
  {
    body: "You'll see simpler names across the platform. The way bookings, payments and seating work has not changed.",
    examples: ["Guests booked", "Public seats", "Extra seating", "Table needed"],
    id: "wording",
    title: "Simpler wording",
  },
  {
    body: "Booking, payment and seating are shown separately so you can see what needs attention.",
    examples: ["Booking: Confirmed", "Payment: Paid", "Seating: Table needed"],
    id: "statuses",
    title: "Clearer statuses",
  },
  {
    body: "Quick Start and Academy have been updated with the latest Zingara tools and step-by-step help.",
    id: "help",
    supporting: "You can revisit Recent Changes in Academy at any time.",
    title: "Need help?",
  },
  {
    body: "That's it. Everything you already use is still here - it's just easier to understand.",
    id: "ready",
    title: "You're ready",
  },
];

export function hasAcknowledgedStaffTour(user: User | null | undefined) {
  return user?.user_metadata?.[staffTourMetadataKey] === latestStaffTourVersion;
}
