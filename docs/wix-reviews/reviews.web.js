import { fetch } from "wix-fetch";
import { Permissions, webMethod } from "wix-web-module";

const ZINGARA_REVIEWS_API = "https://book.zingara.co.za/api/reviews/public";
const MAXIMUM_PAGE_SIZE = 24;
const MAXIMUM_PAGE = 500;
const VENUES = new Set(["cape-town", "johannesburg"]);

function integer(value, fallback, maximum) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error("Invalid review feed request.");
  }
  return parsed;
}

export const getPublishedReviews = webMethod(
  Permissions.Anyone,
  async (input = {}) => {
    const venue = input.venue || null;
    if (venue && !VENUES.has(venue)) throw new Error("Invalid venue.");
    if (input.featured !== undefined && input.featured !== true) {
      throw new Error("Invalid featured filter.");
    }

    const params = new URLSearchParams({
      limit: String(integer(input.limit, 12, MAXIMUM_PAGE_SIZE)),
      page: String(integer(input.page, 1, MAXIMUM_PAGE)),
    });
    if (venue) params.set("venue", venue);
    if (input.featured === true) params.set("featured", "true");

    const response = await fetch(`${ZINGARA_REVIEWS_API}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      method: "get",
    });
    if (!response.ok) throw new Error("Guest reviews are temporarily unavailable.");

    const result = await response.json();
    if (result.contractVersion !== "1.0" || !Array.isArray(result.reviews)) {
      throw new Error("Unsupported Zingara review feed response.");
    }
    return result;
  },
);
