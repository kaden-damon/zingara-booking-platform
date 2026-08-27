"use client";

import { useEffect, useMemo, useState } from "react";

type CorporatePaymentCheckoutResponse = {
  actionUrl?: string;
  bookingAppliedAmount?: number;
  error?: string;
  fields?: Record<string, boolean | number | string | null | undefined>;
  providerGrossAmount?: number;
  status?: "payfast" | "preview";
  transactionFeeAmount?: number;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-ZA", {
    currency: "ZAR",
    style: "currency",
  }).format(amount);
}

function submitPayFastCheckoutForm(
  actionUrl: string,
  fields: NonNullable<CorporatePaymentCheckoutResponse["fields"]>,
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

export default function CorporatePaymentPage() {
  const [status, setStatus] = useState(
    "Loading your secure corporate payment...",
  );
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<{
    bookingAppliedAmount: number;
    providerGrossAmount: number;
    transactionFeeAmount: number;
  } | null>(null);
  const params = useMemo(() => {
    if (typeof window === "undefined") {
      return new URLSearchParams();
    }

    return new URLSearchParams(window.location.search);
  }, []);

  useEffect(() => {
    const bookingReference = params.get("booking") ?? "";
    const token = params.get("token") ?? "";

    if (!bookingReference || !token) {
      setError("This corporate payment link is incomplete.");
      setStatus("");
      return;
    }

    async function loadPreview() {
      try {
        const response = await fetch("/api/corporate-payment/checkout", {
          body: JSON.stringify({ action: "preview", bookingReference, token }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        const checkout =
          (await response.json()) as CorporatePaymentCheckoutResponse;

        if (
          !response.ok ||
          checkout.status !== "preview" ||
          typeof checkout.bookingAppliedAmount !== "number" ||
          typeof checkout.transactionFeeAmount !== "number" ||
          typeof checkout.providerGrossAmount !== "number"
        ) {
          throw new Error(
            checkout.error ?? "Corporate payment could not be prepared.",
          );
        }

        setPreview({
          bookingAppliedAmount: checkout.bookingAppliedAmount,
          providerGrossAmount: checkout.providerGrossAmount,
          transactionFeeAmount: checkout.transactionFeeAmount,
        });
        setStatus("");
      } catch (checkoutError) {
        setError(
          checkoutError instanceof Error
            ? checkoutError.message
            : "Corporate payment could not be prepared.",
        );
        setStatus("");
      }
    }

    void loadPreview();
  }, [params]);

  async function startCheckout() {
    if (!preview || isProcessing) return;

    const bookingReference = params.get("booking") ?? "";
    const token = params.get("token") ?? "";

    setIsProcessing(true);
    setError("");
    setStatus("Preparing secure PayFast checkout...");

    try {
      const response = await fetch("/api/corporate-payment/checkout", {
        body: JSON.stringify({ action: "checkout", bookingReference, token }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const checkout =
        (await response.json()) as CorporatePaymentCheckoutResponse;

      if (!response.ok || !checkout.actionUrl || !checkout.fields) {
        throw new Error(
          checkout.error ?? "Corporate payment could not be prepared.",
        );
      }

      setStatus("Redirecting to secure PayFast checkout...");
      submitPayFastCheckoutForm(checkout.actionUrl, checkout.fields);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Corporate payment could not be prepared.",
      );
      setStatus("");
      setIsProcessing(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 py-12 text-white">
      <section className="w-full max-w-xl rounded-[2rem] border border-[#D8C36A]/30 bg-zinc-950 p-6 text-center shadow-2xl shadow-black/40 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#D8C36A]">
          Corporate Payment
        </p>
        <h1 className="mt-4 text-3xl font-bold uppercase sm:text-4xl">
          Secure Checkout
        </h1>
        {status && (
          <p className="mt-4 text-sm leading-6 text-zinc-300">{status}</p>
        )}
        {error && (
          <p className="mt-5 rounded-2xl border border-red-300/30 bg-red-950/25 px-4 py-3 text-sm font-semibold text-red-100">
            {error}
          </p>
        )}
        {preview && !error && (
          <>
            <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-black/35 p-5 text-sm">
              <div className="flex justify-between gap-4 text-zinc-300">
                <span>Amount Due</span>
                <span>{formatCurrency(preview.bookingAppliedAmount)}</span>
              </div>
              <div className="flex justify-between gap-4 text-zinc-300">
                <span>Transaction Fee</span>
                <span>{formatCurrency(preview.transactionFeeAmount)}</span>
              </div>
              <div className="flex justify-between gap-4 border-t border-white/10 pt-3 font-semibold text-[#F2D66C]">
                <span>Total Payable</span>
                <span>{formatCurrency(preview.providerGrossAmount)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void startCheckout()}
              disabled={isProcessing}
              className="mt-6 w-full rounded-full bg-[#D8C36A] px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-black transition hover:bg-[#F2D66C] disabled:cursor-wait disabled:opacity-60"
            >
              {isProcessing ? "Preparing Payment..." : "Continue to PayFast"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
