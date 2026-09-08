export function bookingClaimsTable(
  booking: {
    reservationTableClaims?: Array<{ tableId?: string }>;
    tableId?: string;
  },
  tableId: string,
) {
  return (
    booking.tableId === tableId ||
    booking.reservationTableClaims?.some(
      (claim) => claim.tableId === tableId,
    ) === true
  );
}
