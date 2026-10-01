import { getPublishedReviews } from "backend/reviews.web";

const MODE = "reviews"; // Use "homepage" for a compact featured section.
const PAGE_SIZE = MODE === "homepage" ? 3 : 12;

let currentPage = 1;
let currentVenue = null;
let displayedReviews = [];

function showOnly(elementId) {
  ["#reviewsLoading", "#reviewsEmpty", "#reviewsError"].forEach((id) => {
    if (id === elementId) $w(id).show();
    else $w(id).hide();
  });
}

function venueLabel(venue) {
  return venue === "johannesburg" ? "Johannesburg" : "Cape Town";
}

function bindRepeater() {
  $w("#reviewsRepeater").onItemReady(($item, itemData) => {
    $item("#reviewStars").text = `${"★".repeat(itemData.rating)}${"☆".repeat(5 - itemData.rating)}`;
    $item("#reviewText").text = `“${itemData.reviewText}”`;
    $item("#reviewName").text = itemData.displayName || "Zingara Guest";
    $item("#verifiedGuest").text = itemData.verifiedGuest ? "Verified Guest" : "";
    $item("#reviewVenue").text = venueLabel(itemData.venue);
  });
}

async function loadReviews({ append = false } = {}) {
  showOnly("#reviewsLoading");
  $w("#loadMore").disable();
  try {
    const result = await getPublishedReviews({
      featured: MODE === "homepage" ? true : undefined,
      limit: PAGE_SIZE,
      page: currentPage,
      venue: currentVenue || undefined,
    });
    const next = result.reviews.map((review) => ({
      ...review,
      _id: review.publicReviewId,
    }));
    displayedReviews = append ? [...displayedReviews, ...next] : next;
    $w("#reviewsRepeater").data = displayedReviews;
    $w("#averageRating").text = `${Number(result.aggregates.averageRating).toFixed(1)} / 5`;
    $w("#publishedCount").text = `${result.aggregates.publishedCount} verified guest review${result.aggregates.publishedCount === 1 ? "" : "s"}`;
    if (MODE === "reviews" && result.pagination.hasMore) $w("#loadMore").show();
    else $w("#loadMore").hide();
    if (displayedReviews.length === 0) {
      showOnly("#reviewsEmpty");
      if (MODE === "homepage") $w("#reviewsSection").collapse();
      return;
    }
    ["#reviewsLoading", "#reviewsEmpty", "#reviewsError"].forEach((id) => $w(id).hide());
    $w("#reviewsRepeater").show();
  } catch (error) {
    console.error("Zingara reviews could not be loaded", error);
    $w("#reviewsRepeater").hide();
    showOnly("#reviewsError");
  } finally {
    $w("#loadMore").enable();
  }
}

$w.onReady(() => {
  bindRepeater();
  $w("#venueFilter").options = [
    { label: "All venues", value: "all" },
    { label: "Johannesburg", value: "johannesburg" },
    { label: "Cape Town", value: "cape-town" },
  ];
  $w("#venueFilter").value = "all";
  if (MODE === "reviews") $w("#venueFilter").show();
  else $w("#venueFilter").hide();
  $w("#loadMore").hide();
  $w("#venueFilter").onChange(() => {
    currentVenue = $w("#venueFilter").value === "all" ? null : $w("#venueFilter").value;
    currentPage = 1;
    displayedReviews = [];
    loadReviews();
  });
  $w("#loadMore").onClick(() => {
    currentPage += 1;
    loadReviews({ append: true });
  });
  loadReviews();
});
