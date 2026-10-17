# Wix approved reviews integration

## Selected architecture

Zingara remains the only review database and moderation system. Wix calls the public Zingara review feed from a backend Velo web module, then renders the returned safe fields in a Wix repeater.

```text
Zingara Admin moderation
  -> https://book.zingara.co.za/api/reviews/public
  -> Wix backend web module
  -> Wix reviews section/page
```

This uses the current Wix Web Modules API (`.web.js`) and backend `wix-fetch`. The browser does not call Zingara directly, so no CORS exception or browser-visible secret is required. Reviews are not copied into Wix CMS. Zingara applies a one-minute shared cache, so publication changes flow to Wix automatically without manual copying or continuous polling.

## Phase 50.0 live placement

Install `reviews.web.js` in the Wix backend and use `homepage-reviews.js` as the page code on both venue homepages.

Approved placement:

- Cape Town (`/capetownhome`): after Gallery and before Contact Details / newsletter.
- Johannesburg (`/joburghome`): after Our Brand Partners and before Contact Details / newsletter.

The reusable presentation code below is the handoff for that later phase. An empty feed must not create a visible homepage section.

## Files

- `reviews.web.js`: install in Wix under `Backend/reviews.web.js`.
- `homepage-reviews.js`: use as the page code for `/joburghome` and `/capetownhome`.
- `reviews-page.js`: retained for a future dedicated reviews page.

The Production API URL in `reviews.web.js` is ready for use only after Phase 43.0/43.1 is approved, migrated and deployed.

## Required Wix elements

Create a section that fits the existing `zingara.co.za` header and page. Do not add a second navigation bar.

| Element ID | Wix element | Purpose |
| --- | --- | --- |
| `#reviewsSection` | Section/box | Whole review experience; may be collapsed on homepage when empty |
| `#reviewsRepeater` | Repeater | Review cards |
| `#reviewStars` | Text in repeater | Star characters |
| `#reviewText` | Text in repeater | Guest wording |
| `#reviewName` | Text in repeater | Safe public display name |
| `#reviewDate` | Text in repeater | Performance date; collapses if unavailable |
| `#reviewCategories` | Text in repeater | Optional category scores; collapses for historical reviews |
| `#verifiedGuest` | Text in repeater | `Verified Guest` label |
| `#reviewVenue` | Text in repeater | Johannesburg or Cape Town |
| `#averageRating` | Text | Overall/selected venue average |
| `#publishedCount` | Text | Published review count |
| `#venueFilter` | Dropdown | All venues, Johannesburg, Cape Town |
| `#loadMore` | Button | Next page |
| `#reviewsLoading` | Text/box | Loading state |
| `#reviewsEmpty` | Text/box | Tasteful empty state |
| `#reviewsError` | Text/box | Temporary unavailable state |

The homepage controller requests up to six reviews for the current venue. It does not use the optional featured filter, so every published review is eligible. The dedicated Reviews page continues to support venue filtering and pagination.

## Presentation

- Reuse the Wix site's existing black background, white type, and gold accent.
- Use compact 8px card radii, comfortable spacing, and the site's existing typefaces.
- Clamp long review text in the Wix editor where possible; provide a Wix expand/collapse interaction only if the existing site pattern supports it.
- Keep cards in one column on small screens, two on tablet, and at most three on desktop.
- Use `Verified Guest`; do not imply that these are Google reviews.

## Safe states

- Empty homepage feed: collapse `#reviewsSection`.
- Empty dedicated page: show `No published guest reviews are available for this selection yet.`
- API failure: hide the repeater and show a short temporary-unavailable message. Never render raw JSON or provider errors.
- Missing display name: render `Zingara Guest`.

## Test procedure

1. Run Zingara locally and open `/review/wix-preview` to exercise success, empty, error, venue, featured, pagination and long-review fixtures.
2. In Wix Preview, verify the backend module returns contract version `1.0`.
3. Verify Johannesburg and Cape Town pages separately and confirm reviews never cross venues.
4. Verify the homepage requests all published reviews for its venue and collapses when none exist.
5. Publish a local consented fixture and verify it appears through the API.
6. Unpublish that fixture and verify it disappears without any Wix approval or CMS change.
7. Verify historical reviews hide empty category ratings.
8. Check 1440px desktop, 900px tablet and 390px mobile before publishing the Wix change.

## SEO decision

Do not add `Review` or `AggregateRating` structured data in this phase. Google's current review-snippet guidance excludes self-serving reviews on an organisation's own `Organization` or `LocalBusiness` pages from star review eligibility. The visible review content can still be published normally without implying it is Google-sourced.
