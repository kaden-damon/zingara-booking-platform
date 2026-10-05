export function normalizeGuestCountGrammar(value: string, guestCount: number) {
  return guestCount === 1 ? value.replaceAll(/\b1 guests\b/gi, "1 guest") : value;
}
