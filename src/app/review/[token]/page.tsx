import ReviewSubmissionClient from "./ReviewSubmissionClient";

export default async function VerifiedReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ReviewSubmissionClient token={token} />;
}
