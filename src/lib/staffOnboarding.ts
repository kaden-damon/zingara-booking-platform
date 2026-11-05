import type { User } from "@supabase/supabase-js";

export const latestStaffTourVersion =
  "quick-bug-reporter-2026-11-05-v1";
export const staffTourMetadataKey = "zingara_staff_tour_version";
export const staffTourAcknowledgementMetadataKey =
  "zingara_staff_tour_acknowledgement";
export const staffTourAcknowledgedAtMetadataKey =
  "zingara_staff_tour_acknowledged_at";
export const staffTourHistoryMetadataKey = "zingara_staff_tour_history";
export const staffTourOpenEvent = "zingara-open-staff-feature-walkthrough";

export type StaffTourAcknowledgement = "completed" | "skipped";

export type StaffTourAcknowledgementRecord = {
  acknowledgedAt: string;
  acknowledgement: StaffTourAcknowledgement;
  version: string;
};

export type StaffTourPage = {
  body: string;
  examples?: string[];
  id: string;
  supporting?: string;
  title: string;
};

export const staffTourPages: StaffTourPage[] = [
  {
    body: "Spot a problem? Tap the floating icon to report it.",
    id: "report-an-issue",
    title: "Report an Issue",
  },
  {
    body: "Zingara captures available error details automatically.",
    id: "automatic-details",
    title: "Automatic Details",
  },
  {
    body: "Drag the icon anywhere. It remembers its position.",
    id: "move-the-icon",
    title: "Move the Icon",
  },
  {
    body: "Tap Capture to take a screenshot. Your browser may ask for permission.",
    id: "add-a-screenshot",
    title: "Add a Screenshot",
  },
  {
    body: "Add a note if needed, then tap Send. Your report goes straight to Kaden.",
    id: "send",
    title: "Send",
  },
];

export function hasAcknowledgedStaffTour(user: User | null | undefined) {
  const metadata = user?.user_metadata;
  const acknowledgement = metadata?.[staffTourAcknowledgementMetadataKey];
  const acknowledgedAt = metadata?.[staffTourAcknowledgedAtMetadataKey];

  return (
    metadata?.[staffTourMetadataKey] === latestStaffTourVersion &&
    (acknowledgement === "completed" || acknowledgement === "skipped") &&
    typeof acknowledgedAt === "string" &&
    Number.isFinite(Date.parse(acknowledgedAt))
  );
}

export function getStaffTourAcknowledgementHistory(
  user: User | null | undefined,
) {
  const metadata = user?.user_metadata;
  const existingHistory = Array.isArray(
    metadata?.[staffTourHistoryMetadataKey],
  )
    ? (metadata[staffTourHistoryMetadataKey] as unknown[])
    : [];
  const history = existingHistory.filter(
    (record): record is StaffTourAcknowledgementRecord => {
      if (!record || typeof record !== "object") return false;
      const candidate = record as Partial<StaffTourAcknowledgementRecord>;
      return (
        typeof candidate.version === "string" &&
        (candidate.acknowledgement === "completed" ||
          candidate.acknowledgement === "skipped") &&
        typeof candidate.acknowledgedAt === "string" &&
        Number.isFinite(Date.parse(candidate.acknowledgedAt))
      );
    },
  );

  const version = metadata?.[staffTourMetadataKey];
  const acknowledgement = metadata?.[staffTourAcknowledgementMetadataKey];
  const acknowledgedAt = metadata?.[staffTourAcknowledgedAtMetadataKey];
  const hasValidCurrentRecord =
    typeof version === "string" &&
    (acknowledgement === "completed" || acknowledgement === "skipped") &&
    typeof acknowledgedAt === "string" &&
    Number.isFinite(Date.parse(acknowledgedAt));

  if (
    hasValidCurrentRecord &&
    !history.some((record) => record.version === version)
  ) {
    history.push({ acknowledgedAt, acknowledgement, version });
  }

  return history;
}
