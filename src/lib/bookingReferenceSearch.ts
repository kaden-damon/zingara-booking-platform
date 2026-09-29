export function isExactBookingReferenceSearch(
  search: string,
  bookingReference: string,
) {
  const normalizedSearch = search.trim().toLowerCase();

  return (
    normalizedSearch.length > 0 &&
    normalizedSearch === bookingReference.trim().toLowerCase()
  );
}
