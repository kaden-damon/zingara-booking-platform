const reviewIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getAdminReviewSharePath(reviewId: string) {
  const normalizedId = reviewId.trim();
  if (!reviewIdPattern.test(normalizedId)) return null;

  const params = new URLSearchParams({
    reviewId: normalizedId,
    section: "reviews",
  });
  return `/admin?${params.toString()}`;
}

export function clearAdminReviewShareTarget(url: URL) {
  const nextUrl = new URL(url.toString());
  nextUrl.searchParams.delete("reviewId");
  nextUrl.searchParams.delete("reviewStatus");
  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
}
