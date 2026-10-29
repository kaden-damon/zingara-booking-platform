import type { XeroDocumentLineInput } from "./documentMath";

export type BookingInvoiceRevenueCategory =
  | "buyouts"
  | "corporate"
  | "ticket_sales";

type BookingInvoiceAmounts = {
  addonsTotal: number;
  bookingReference: string;
  discountAmount: number;
  revenueCategory: BookingInvoiceRevenueCategory;
  serviceFee: number;
  subtotalAmount: number;
  totalAmount: number;
};

function cents(value: number) {
  if (!Number.isFinite(value)) throw new Error("Booking financials are invalid.");
  return Math.round(value * 100);
}

function amount(value: number) {
  return (value / 100).toFixed(2);
}

function line(
  description: string,
  mappingCategory: string,
  valueCents: number,
  taxRatePercent: string | null,
): XeroDocumentLineInput {
  return {
    description,
    mappingCategory,
    quantity: "1",
    taxCode: null,
    taxRatePercent,
    unitPrice: amount(valueCents),
  };
}

export function buildAuthoritativeBookingInvoiceDraft(
  input: BookingInvoiceAmounts,
) {
  const subtotalCents = cents(input.subtotalAmount);
  const addonsCents = cents(input.addonsTotal);
  const discountCents = cents(input.discountAmount);
  const gratuityCents = cents(input.serviceFee);
  const totalCents = cents(input.totalAmount);
  const ticketGrossCents = subtotalCents - addonsCents;
  const bookingFeeCents = ticketGrossCents > 0 ? Math.min(1_000, ticketGrossCents) : 0;
  const ticketSalesCents = ticketGrossCents - bookingFeeCents;

  if (
    subtotalCents < 0 ||
    addonsCents < 0 ||
    discountCents < 0 ||
    gratuityCents < 0 ||
    ticketSalesCents < 0 ||
    subtotalCents - discountCents + gratuityCents !== totalCents
  ) {
    throw new Error("Booking financials do not reconcile to the booking total.");
  }

  const lines: XeroDocumentLineInput[] = [];
  if (ticketSalesCents > 0) {
    lines.push(
      line(
        `Booking ${input.bookingReference} - ticket sales`,
        input.revenueCategory,
        ticketSalesCents,
        "15",
      ),
    );
  }
  if (bookingFeeCents > 0) {
    lines.push(
      line(
        `Booking ${input.bookingReference} - booking fee`,
        "booking_fee",
        bookingFeeCents,
        "15",
      ),
    );
  }
  if (addonsCents > 0) {
    lines.push(
      line(
        `Booking ${input.bookingReference} - add-ons`,
        "addons",
        addonsCents,
        "15",
      ),
    );
  }
  if (discountCents > 0) {
    lines.push(
      line(
        `Booking ${input.bookingReference} - discount`,
        "discounts",
        -discountCents,
        "15",
      ),
    );
  }
  if (gratuityCents > 0) {
    lines.push(
      line(
        `Booking ${input.bookingReference} - show gratuity`,
        "gratuity",
        gratuityCents,
        null,
      ),
    );
  }

  if (lines.length === 0) throw new Error("The booking has no invoiceable value.");
  return { lineAmountType: "inclusive" as const, lines, totalCents };
}

export function directBookingInvoiceRevenueCategory(input: {
  bookingOrigin: string | null;
  bookingSource: string | null;
  corporateRequestId: string | null;
}) {
  const source = `${input.bookingOrigin ?? ""} ${input.bookingSource ?? ""}`.toLowerCase();
  if (source.includes("buyout")) return "buyouts" as const;
  if (input.corporateRequestId || source.includes("corporate")) return "corporate" as const;
  return "ticket_sales" as const;
}
