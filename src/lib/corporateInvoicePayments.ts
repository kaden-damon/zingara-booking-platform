import type { DemoBooking } from "./zingaraDemo";

export type CorporateInvoicePaymentBasis =
  | "invoice-outstanding"
  | "invoice-paid";

export function isCorporateInvoicePaymentBasis(
  value: unknown,
): value is CorporateInvoicePaymentBasis {
  return value === "invoice-outstanding" || value === "invoice-paid";
}

function toMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function validateCorporateInvoiceFinancials(
  booking: Pick<
    DemoBooking,
    | "amountPaid"
    | "balanceDue"
    | "corporateInvoiceOutstandingAmount"
    | "corporatePaymentBasis"
    | "paymentStatus"
    | "source"
    | "status"
    | "totalPrice"
  >,
) {
  if (!isCorporateInvoicePaymentBasis(booking.corporatePaymentBasis)) {
    return null;
  }

  if (booking.source !== "corporate-direct") {
    return "Invoice / EFT settlement is available only for internal Corporate bookings.";
  }

  const obligation = toMoney(Number(booking.totalPrice));

  if (!Number.isFinite(obligation) || obligation <= 0) {
    return "A positive authoritative Corporate ticket obligation is required.";
  }

  if (booking.corporatePaymentBasis === "invoice-outstanding") {
    const outstanding = toMoney(
      Number(booking.corporateInvoiceOutstandingAmount),
    );

    if (
      !Number.isFinite(outstanding) ||
      outstanding <= 0 ||
      outstanding > obligation
    ) {
      return "Outstanding Amount must be greater than R0.00 and may not exceed the booking obligation.";
    }

    if (outstanding !== obligation) {
      return "A new invoice booking without recorded payment must keep the full obligation outstanding. Record any prior EFT through financial reconciliation.";
    }

    if (
      toMoney(Number(booking.amountPaid ?? 0)) !== 0 ||
      toMoney(Number(booking.balanceDue ?? outstanding)) !== outstanding ||
      booking.paymentStatus !== "pending-payment" ||
      booking.status !== "pending-payment"
    ) {
      return "The unpaid invoice financial state is inconsistent.";
    }
  }

  if (booking.corporatePaymentBasis === "invoice-paid") {
    if (
      toMoney(Number(booking.amountPaid)) !== obligation ||
      toMoney(Number(booking.balanceDue)) !== 0 ||
      booking.paymentStatus !== "fully-paid" ||
      booking.status !== "confirmed"
    ) {
      return "The paid invoice financial state must record the full obligation as paid by EFT.";
    }
  }

  return null;
}

export function applyCorporateInvoiceFinancials(
  booking: DemoBooking,
): DemoBooking {
  if (!isCorporateInvoicePaymentBasis(booking.corporatePaymentBasis)) {
    return booking;
  }

  const obligation = toMoney(Number(booking.totalPrice));

  if (booking.corporatePaymentBasis === "invoice-paid") {
    return {
      ...booking,
      amountPaid: obligation,
      balanceDue: 0,
      corporateInvoiceOutstandingAmount: 0,
      paymentOption: "full",
      paymentStatus: "fully-paid",
      status: "confirmed",
    };
  }

  const outstanding = toMoney(
    Number(booking.corporateInvoiceOutstandingAmount ?? obligation),
  );

  return {
    ...booking,
    amountPaid: 0,
    balanceDue: outstanding,
    corporateInvoiceOutstandingAmount: outstanding,
    paymentOption: "full",
    paymentStatus: "pending-payment",
    status: "pending-payment",
  };
}
