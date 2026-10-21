import type { Metadata } from "next";
import FeedbackSubmissionClient from "../../FeedbackSubmissionClient";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Booking Feedback Approval | Zingara",
};

export default async function PlatformFeedbackApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <FeedbackSubmissionClient approvalPreview token={token} />;
}
