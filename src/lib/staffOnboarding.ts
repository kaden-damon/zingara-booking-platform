import type { User } from "@supabase/supabase-js";

export const latestStaffTourVersion = "xero-foundation-2026-10";
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
    body: "The quoting and invoice-draft workflow is ready. Live Xero synchronisation is not connected and stays paused until Accounts approves it.",
    id: "xero-ready",
    supporting: "No document is sent to Xero until a verified organisation is connected and approved.",
    title: "Zingara × Xero",
  },
  {
    body: "Open a Corporate booking and choose Create Quote. Add the customer, show, seating, pax and approved commercial details.",
    id: "xero-quote",
    title: "Create a Quote",
  },
  {
    body: "Use Add Line for independently priced seats, gratuity, venue hire, Halal surcharge, AV or another approved service.",
    id: "xero-lines",
    supporting: "Custom service lines never create guests, tickets or seats.",
    title: "Add Custom Lines",
  },
  {
    body: "Save a draft, preview it and record the accepted version and evidence. Viewing a quote never accepts it.",
    id: "xero-accept",
    title: "Review & Accept",
  },
  {
    body: "Convert only the accepted quote version. Until Xero connects, the result is clearly marked as a local invoice draft.",
    id: "xero-invoice",
    title: "Convert to Invoice",
  },
  {
    body: "Use the existing verified PayFast or EFT workflow to request and confirm deposits. Creating an invoice never marks a booking paid.",
    id: "xero-deposit",
    title: "Request Deposit",
  },
  {
    body: "Open Reports → Accounting to review local documents, verified paid amounts, differences and sync attention without changing certified reports.",
    id: "xero-reporting",
    supporting: "Settings → Integrations shows the connection and mapping status for authorised staff.",
    title: "Accounts & Reports",
  },
];

export function hasAcknowledgedStaffTour(user: User | null | undefined) {
  return user?.user_metadata?.[staffTourMetadataKey] === latestStaffTourVersion;
}
