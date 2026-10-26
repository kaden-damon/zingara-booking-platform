export function buildImmediateReviewSubject(review: {
  publicDisplayName: string;
  rating: number;
  reviewPrivacyRequested: boolean | null;
}) {
  if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) {
    throw new Error("Review rating must be an integer from 1 to 5.");
  }

  const visibility = review.reviewPrivacyRequested ? "private" : "public";
  return `${review.publicDisplayName} just submitted a ${review.rating} star ${visibility} review`;
}
