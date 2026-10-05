export function isReviewAttentionRating(rating: number) {
  return rating <= 2;
}

export function calculateReviewRatingAverage(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
}
