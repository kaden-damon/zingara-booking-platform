import type { ComplimentaryBookingCategory } from "./internalComplimentaryBooking.ts";
import {
  calculateCurrencyPercentage,
  toCurrencyAmount,
} from "./currencyMath.ts";
import type { SeatingZoneId } from "./zingaraDemo.ts";

export type BookingGuestAllocation = {
  complimentaryCategory?: ComplimentaryBookingCategory;
  complimentaryPax: number;
  paidPax: number;
  zoneId: SeatingZoneId;
};

export type BookingGuestAllocationDraft = {
  complimentaryCategory: ComplimentaryBookingCategory;
  complimentaryPax: string;
  paidPax: string;
  zoneId: string;
};

export type GuestAllocationTotals = {
  allocatedPax: number;
  complimentaryPax: number;
  paidPax: number;
};

export type GuestAllocationFinancials = {
  addonsTotal: number;
  bookingFeeAmount: number;
  depositAmount: number;
  depositPercentage: number;
  discountAmount: number;
  discountedSubtotal: number;
  effectivePaidPricePerPerson: number;
  seatingSubtotal: number;
  serviceFeeAmount: number;
  subtotal: number;
  total: number;
};

const allocationZoneTitles: Partial<Record<SeatingZoneId, string>> = {
  "golden-circle": "Golden Circle",
  "middle-ring": "Middle Ring",
  "royal-balcony": "Royal Balcony",
  "royal-booths": "Private Booths",
};
const validZoneIds = new Set(Object.keys(allocationZoneTitles));
const validCategories = new Set<ComplimentaryBookingCategory>([
  "standard",
  "media",
  "tradex",
]);

function wholePax(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function getGuestAllocationTotals(
  allocations: Array<
    Pick<BookingGuestAllocation, "complimentaryPax" | "paidPax">
  >,
): GuestAllocationTotals {
  return allocations.reduce<GuestAllocationTotals>(
    (totals, allocation) => ({
      allocatedPax:
        totals.allocatedPax + allocation.paidPax + allocation.complimentaryPax,
      complimentaryPax: totals.complimentaryPax + allocation.complimentaryPax,
      paidPax: totals.paidPax + allocation.paidPax,
    }),
    { allocatedPax: 0, complimentaryPax: 0, paidPax: 0 },
  );
}

export function validateBookingGuestAllocations(
  allocations: BookingGuestAllocationDraft[],
  totalPax: number,
) {
  if (allocations.length === 0) return "Add at least one guest allocation.";
  if (allocations.length > validZoneIds.size) {
    return "Each seating zone may appear only once.";
  }

  const seen = new Set<string>();
  const parsed: BookingGuestAllocation[] = [];

  for (const allocation of allocations) {
    if (!validZoneIds.has(allocation.zoneId as SeatingZoneId)) {
      return "Select a valid seating zone for every allocation.";
    }
    if (seen.has(allocation.zoneId)) {
      return "Each seating zone may appear only once.";
    }
    seen.add(allocation.zoneId);

    const paidPax = wholePax(allocation.paidPax);
    const complimentaryPax = wholePax(allocation.complimentaryPax);
    if (paidPax === null || complimentaryPax === null) {
      return "Paid and COMP quantities must be whole guest counts of zero or more.";
    }
    if (paidPax + complimentaryPax <= 0) {
      return "Every selected seating zone must contain at least one guest.";
    }
    if (
      complimentaryPax > 0 &&
      !validCategories.has(allocation.complimentaryCategory)
    ) {
      return "Select Standard COMP, Media or Tradex for complimentary guests.";
    }

    parsed.push({
      ...(complimentaryPax > 0
        ? { complimentaryCategory: allocation.complimentaryCategory }
        : {}),
      complimentaryPax,
      paidPax,
      zoneId: allocation.zoneId as SeatingZoneId,
    });
  }

  const totals = getGuestAllocationTotals(parsed);
  if (
    !Number.isInteger(totalPax) ||
    totalPax <= 0 ||
    totals.allocatedPax !== totalPax
  ) {
    return `Guest allocation must equal ${Math.max(totalPax, 0)} guests.`;
  }

  return null;
}

export function parseBookingGuestAllocations(
  allocations: BookingGuestAllocationDraft[],
  totalPax: number,
): BookingGuestAllocation[] | null {
  if (validateBookingGuestAllocations(allocations, totalPax)) return null;

  return allocations.map((allocation) => {
    const complimentaryPax = Number(allocation.complimentaryPax);
    return {
      ...(complimentaryPax > 0
        ? { complimentaryCategory: allocation.complimentaryCategory }
        : {}),
      complimentaryPax,
      paidPax: Number(allocation.paidPax),
      zoneId: allocation.zoneId as SeatingZoneId,
    };
  });
}

export function deriveZoneEntitlements(
  allocations: BookingGuestAllocation[],
) {
  return allocations.map((allocation) => ({
    pax: allocation.paidPax + allocation.complimentaryPax,
    zoneId: allocation.zoneId,
  }));
}

export function getComplimentaryGuestCounts(
  allocations: BookingGuestAllocation[] | null | undefined,
) {
  return (allocations ?? []).reduce(
    (counts, allocation) => {
      if (allocation.complimentaryPax <= 0) return counts;
      const category = allocation.complimentaryCategory ?? "standard";
      counts[category] += allocation.complimentaryPax;
      return counts;
    },
    { media: 0, standard: 0, tradex: 0 } satisfies Record<
      ComplimentaryBookingCategory,
      number
    >,
  );
}

export function formatGuestAllocationSummary(
  allocations: BookingGuestAllocation[] | null | undefined,
) {
  return (allocations ?? [])
    .map((allocation) => {
      const parts = [
        allocation.paidPax > 0 ? `${allocation.paidPax} Paid` : "",
        allocation.complimentaryPax > 0
          ? `${allocation.complimentaryPax} ${
              allocation.complimentaryCategory === "media"
                ? "Media"
                : allocation.complimentaryCategory === "tradex"
                  ? "Tradex"
                  : "COMP"
            }`
          : "",
      ].filter(Boolean);
      return `${allocationZoneTitles[allocation.zoneId] ?? allocation.zoneId}: ${parts.join(" + ")}`;
    })
    .join(" / ");
}

export function calculateGuestAllocationFinancials(input: {
  addonsTotal: number;
  allocations: BookingGuestAllocation[];
  depositForZone: (
    zoneId: SeatingZoneId,
    allocatedTotal: number,
    paidPax: number,
  ) => number;
  discountAmount?: number;
  includeBookingFee?: boolean;
  includeGratuity?: boolean;
  serviceFeeGuestThreshold: number;
  serviceFeeRate: number;
  totalPax: number;
  zonePrice: (zoneId: SeatingZoneId) => number;
}): GuestAllocationFinancials {
  const paidRows = input.allocations.filter((allocation) => allocation.paidPax > 0);
  const totals = getGuestAllocationTotals(input.allocations);
  const seatingByZone = paidRows.map((allocation) => ({
    ...allocation,
    subtotal: Math.max(input.zonePrice(allocation.zoneId), 0) * allocation.paidPax,
  }));
  const seatingSubtotal = toCurrencyAmount(seatingByZone.reduce(
    (sum, allocation) => sum + allocation.subtotal,
    0,
  ));
  const addonsTotal = totals.paidPax > 0
    ? toCurrencyAmount(Math.max(input.addonsTotal, 0))
    : 0;
  const subtotal = toCurrencyAmount(seatingSubtotal + addonsTotal);
  const discountAmount = toCurrencyAmount(Math.min(
    Math.max(input.discountAmount ?? 0, 0),
    subtotal,
  ));
  const discountedSubtotal = toCurrencyAmount(
    Math.max(subtotal - discountAmount, 0),
  );
  const serviceFeeAmount =
    input.includeGratuity !== false &&
    totals.paidPax > 0 &&
    input.totalPax >= input.serviceFeeGuestThreshold
      ? calculateCurrencyPercentage(discountedSubtotal, input.serviceFeeRate)
      : 0;
  const total = toCurrencyAmount(discountedSubtotal + serviceFeeAmount);
  const depositAmount = Math.min(
    total,
    seatingByZone.reduce((sum, allocation) => {
      const allocatedTotal =
        seatingSubtotal > 0
          ? total * (allocation.subtotal / seatingSubtotal)
          : 0;
      return (
        sum +
        Math.max(
          input.depositForZone(
            allocation.zoneId,
            allocatedTotal,
            allocation.paidPax,
          ),
          0,
        )
      );
    }, 0),
  );

  return {
    addonsTotal,
    bookingFeeAmount: 0,
    depositAmount,
    depositPercentage: total > 0 ? (depositAmount / total) * 100 : 100,
    discountAmount,
    discountedSubtotal,
    effectivePaidPricePerPerson:
      totals.paidPax > 0 ? seatingSubtotal / totals.paidPax : 0,
    seatingSubtotal,
    serviceFeeAmount,
    subtotal,
    total,
  };
}
