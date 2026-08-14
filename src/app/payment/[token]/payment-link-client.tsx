"use client";

import { useEffect, useState } from "react";

type PaymentLinkLookupResponse = {
  booking?: {
    amountPaid: number;
    bookingReference: string;
    customerName: string;
    expiresAt: string;
    isPayable: boolean;
    locationCode: string;
    locationLabel: string;
    outstandingAmount: number;
    paymentStatus: string;
    section: string;
    showDate: string | null;
    showLabel: string;
    showTime: string | null;
    status: string;
    tableNumber: string;
    totalAmount: number;
  };
  error?: string;
};

type PaymentLinkCheckoutResponse =
  | {
      actionUrl: string;
      fields: Record<string, boolean | number | string | null | undefined>;
      mode: "live" | "sandbox";
      status: "payfast";
    }
  | {
      bookingReference: string;
      status: "zero_value";
    }
  | {
      bookingReference: string;
      status: "already_paid";
    }
  | {
      error: string;
    };

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-ZA", {
    currency: "ZAR",
    style: "currency",
  }).format(amount);
}

function submitPayFastCheckoutForm(
  actionUrl: string,
  fields: Record<string, boolean | number | string | null | undefined>,
) {
  const form = document.createElement("form");

  form.action = actionUrl;
  form.method = "POST";
  form.style.display = "none";

  for (const [name, value] of Object.entries(fields)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    const input = document.createElement("input");

    input.name = name;
    input.type = "hidden";
    input.value = String(value);
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

export default function PaymentLinkClient({ token }: { token: string }) {
  const [booking, setBooking] =
    useState<PaymentLinkLookupResponse["booking"]>(undefined);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadPaymentLink() {
      try {
        const response = await fetch(
          `/api/payment-links/${encodeURIComponent(token)}`,
        );
        const payload = (await response.json()) as PaymentLinkLookupResponse;

        if (!response.ok || !payload.booking) {
          throw new Error(
            payload.error ?? "This payment link could not be loaded.",
          );
        }

        if (isMounted) {
          setBooking(payload.booking);
          setError("");
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "This payment link could not be loaded.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadPaymentLink();

    return () => {
      isMounted = false;
    };
  }, [token]);

  async function processPayment() {
    if (!booking || isProcessing) {
      return;
    }

    setIsProcessing(true);
    setError("");

    try {
      const response = await fetch(
        `/api/payment-links/${encodeURIComponent(token)}/checkout`,
        {
          method: "POST",
        },
      );
      const payload = (await response.json()) as PaymentLinkCheckoutResponse;

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload
            ? payload.error
            : "Payment could not be prepared.",
        );
      }

      if (payload.status === "payfast") {
        submitPayFastCheckoutForm(payload.actionUrl, payload.fields);
        return;
      }

      if (payload.status === "zero_value") {
        const zeroResponse = await fetch("/api/bookings/complete-zero-value", {
          body: JSON.stringify({
            bookingReference: payload.bookingReference,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        const zeroPayload = (await zeroResponse.json()) as { error?: string };

        if (!zeroResponse.ok) {
          throw new Error(
            zeroPayload.error ?? "Booking could not be completed.",
          );
        }
      }

      window.location.href = `/book?payment=return&booking=${encodeURIComponent(
        booking.bookingReference,
      )}`;
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Payment could not be prepared.",
      );
      setIsProcessing(false);
    }
  }

  return (
    <main className="min-h-screen bg-black px-4 py-12 text-white">
      <section className="mx-auto w-full max-w-2xl rounded-[2rem] border border-[#D8C36A]/30 bg-zinc-950 p-6 shadow-2xl shadow-black/40 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#D8C36A]">
          Secure Payment
        </p>
        <h1 className="mt-4 text-3xl font-bold uppercase sm:text-4xl">
          Complete Your Booking
        </h1>

        {isLoading && (
          <p className="mt-5 text-sm leading-6 text-zinc-300">
            Loading your secure payment link...
          </p>
        )}

        {error && (
          <p className="mt-5 rounded-2xl border border-red-300/30 bg-red-950/25 px-4 py-3 text-sm font-semibold text-red-100">
            {error}
          </p>
        )}

        {booking && (
          <>
            <div className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-black/35 p-4 text-sm text-zinc-300 sm:grid-cols-2">
              <p>
                <span className="text-zinc-500">Guest</span>
                <br />
                <span className="font-semibold text-white">
                  {booking.customerName}
                </span>
              </p>
              <p>
                <span className="text-zinc-500">Booking</span>
                <br />
                <span className="font-semibold text-white">
                  {booking.bookingReference}
                </span>
              </p>
              <p className="sm:col-span-2">
                <span className="text-zinc-500">Performance</span>
                <br />
                <span className="font-semibold text-white">
                  {booking.showLabel}
                </span>
              </p>
              <p>
                <span className="text-zinc-500">Section</span>
                <br />
                <span className="font-semibold text-white">
                  {booking.section}
                </span>
              </p>
              <p>
                <span className="text-zinc-500">Outstanding</span>
                <br />
                <span className="font-semibold text-white">
                  {formatCurrency(booking.outstandingAmount)}
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={processPayment}
              disabled={!booking.isPayable || isProcessing}
              className="mt-6 w-full rounded-full bg-[#D8C36A] px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-black transition hover:bg-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing ? "Preparing Payment..." : "Process Payment"}
            </button>
            {!booking.isPayable && (
              <p className="mt-3 text-center text-sm text-zinc-400">
                This booking is no longer awaiting payment.
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
