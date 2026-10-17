import wixLocationFrontend from "wix-location-frontend";
import { getPublishedReviews } from "backend/reviews.web";

const PAGE_SIZE = 6;
const VENUE_BY_PATH = {
  capetownhome: "cape-town",
  joburghome: "johannesburg",
};

function currentVenue() {
  const page = wixLocationFrontend.path.at(-1)?.toLowerCase();
  return page ? VENUE_BY_PATH[page] ?? null : null;
}

function stars(rating) {
  const score = Math.max(0, Math.min(5, Number(rating) || 0));
  return `${"★".repeat(score)}${"☆".repeat(5 - score)}`;
}

function performanceDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00+02:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

function categorySummary(review) {
  return [
    ["Food", review.foodRating],
    ["Value", review.valueRating],
    ["Service", review.serviceRating],
    ["Ambience", review.ambienceRating],
  ]
    .filter(([, rating]) => Number.isInteger(rating))
    .map(([label, rating]) => `${label} ${rating}/5`)
    .join("  ·  ");
}

function bindRepeater() {
  $w("#reviewsRepeater").onItemReady(($item, review) => {
    $item("#reviewStars").text = stars(review.rating);
    $item("#reviewName").text = review.displayName || "Zingara Guest";
    $item("#reviewText").text = `“${review.reviewText}”`;

    const date = performanceDate(review.performanceDate);
    $item("#reviewDate").text = date;
    if (date) $item("#reviewDate").expand();
    else $item("#reviewDate").collapse();

    const categories = categorySummary(review);
    $item("#reviewCategories").text = categories;
    if (categories) $item("#reviewCategories").expand();
    else $item("#reviewCategories").collapse();
  });
}

async function loadVenueReviews() {
  const venue = currentVenue();
  if (!venue) return;

  try {
    const result = await getPublishedReviews({
      limit: PAGE_SIZE,
      page: 1,
      venue,
    });
    const reviews = result.reviews.map((review) => ({
      ...review,
      _id: review.publicReviewId,
    }));
    if (reviews.length === 0) return;

    $w("#reviewsRepeater").data = reviews;
    $w("#averageRating").text = `${Number(result.aggregates.averageRating).toFixed(1)} / 5`;
    const total = Number(result.pagination.totalReviews) || reviews.length;
    $w("#publishedCount").text = `${total} guest review${total === 1 ? "" : "s"}`;
    $w("#reviewsSection").expand();
  } catch (error) {
    console.error("Guest reviews could not be loaded", error);
  }
}

$w.onReady(() => {
  $w("#reviewsSection").collapse();
  bindRepeater();
  loadVenueReviews();
});
