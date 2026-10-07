import type { User } from "@supabase/supabase-js";

export const latestStaffTourVersion = "full-show-buyouts-2026-10";
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
    body: "Go to Home → Show & Availability Management and select the performance.",
    id: "buyout-show",
    title: "Choose the show",
  },
  {
    body: "Select the + on the performance and choose Full Show Buyout.",
    id: "buyout-start",
    title: "Start the Buyout",
  },
  {
    body: "Select the Company and Contact, or use the yellow + to create them.",
    id: "buyout-company",
    title: "Choose the Company",
  },
  {
    body: "Select Private Salon, Speakeasy or Grand Society.",
    id: "buyout-package",
    title: "Choose the package",
  },
  {
    body: "Enter the expected guest count and final count when known.",
    id: "buyout-guests",
    title: "Add guest numbers",
  },
  {
    body: "Check the show, Company, package, guests and price, then create the Buyout.",
    id: "buyout-review",
    title: "Review and create",
  },
  {
    body: "Once the valid Buyout is created, Zingara protects the performance from ordinary public bookings.",
    id: "buyout-protection",
    supporting: "If the show already has bookings, they stay unchanged and need to be moved manually.",
    title: "The show is protected",
  },
];

export function hasAcknowledgedStaffTour(user: User | null | undefined) {
  return user?.user_metadata?.[staffTourMetadataKey] === latestStaffTourVersion;
}
