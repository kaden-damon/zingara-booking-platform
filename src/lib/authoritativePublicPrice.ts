export type AuthoritativePublicPriceInput = {
  configuredPrice: number;
  partySize: number;
  remainingSeats?: number;
};

export function getAuthoritativePublicPricePerPerson({
  configuredPrice,
}: AuthoritativePublicPriceInput) {
  return configuredPrice;
}
