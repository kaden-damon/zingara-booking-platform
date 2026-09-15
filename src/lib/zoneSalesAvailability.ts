export type PublicZoneSalesState = {
  isAvailable: boolean;
  reason: "available" | "capacity-full" | "manually-closed";
};

export function resolvePublicZoneSalesState({
  publicSalesOpen,
  remainingSeats,
}: {
  publicSalesOpen: boolean;
  remainingSeats: number;
}): PublicZoneSalesState {
  if (!publicSalesOpen) {
    return { isAvailable: false, reason: "manually-closed" };
  }

  if (remainingSeats <= 0) {
    return { isAvailable: false, reason: "capacity-full" };
  }

  return { isAvailable: true, reason: "available" };
}
