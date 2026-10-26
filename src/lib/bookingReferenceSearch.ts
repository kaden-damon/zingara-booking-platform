export function isExactBookingReferenceSearch(
  search: string,
  bookingReference: string | null | undefined,
) {
  const normalizedSearch = search.trim().toLowerCase();
  const normalizedReference = bookingReference?.trim().toLowerCase() ?? "";

  return (
    normalizedSearch.length > 0 &&
    normalizedReference.length > 0 &&
    normalizedSearch === normalizedReference
  );
}
