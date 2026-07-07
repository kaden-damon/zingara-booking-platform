"use client";

import { useEffect, useMemo, useState } from "react";

type CorporatePaymentCheckoutResponse = {
  actionUrl?: string;
  error?: string;
  fields?: Record<string, boolean | number | string | null | undefined>;
};

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
    "Preparing your secure corporate payment...",
  );
  const [error, setError] = useState("");
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

    async function startCheckout() {
      try {
        const response = await fetch("/api/corporate-payment/checkout", {
          body: JSON.stringify({ bookingReference, token }),
          headers: {
            "Content-Type": "application/json",
          },
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
      }
    }

    void startCheckout();
  }, [params]);

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
      </section>
    </main>
  );
}
