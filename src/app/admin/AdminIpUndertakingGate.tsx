"use client";

import { useState } from "react";
import { adminIpUndertaking } from "@/lib/adminIpUndertaking";

type Props = {
  error?: string;
  isLoading?: boolean;
  onAccept: () => Promise<void>;
};

export function AdminIpUndertakingGate({
  error = "",
  isLoading = false,
  onAccept,
}: Props) {
  const [accepted, setAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    if (!accepted || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onAccept();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative isolate z-10 flex min-h-screen items-center justify-center bg-black px-4 py-8 text-white sm:px-6">
      <section
        aria-labelledby="admin-undertaking-title"
        aria-modal="true"
        role="dialog"
        className="w-full max-w-2xl rounded-[1.5rem] border border-[#8D7A2F]/45 bg-zinc-950 p-5 shadow-2xl shadow-black/60 sm:p-8"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">
          Version 1.0 Platform Update
        </p>
        <h1
          id="admin-undertaking-title"
          className="mt-3 text-2xl font-bold text-white sm:text-3xl"
        >
          {adminIpUndertaking.title}
        </h1>
        <div className="mt-5 space-y-3 text-sm leading-6 text-zinc-300 sm:text-base sm:leading-7">
          <p>We&apos;ve updated our platform access terms.</p>
          <p>
            As part of the Version 1.0 release, all staff with access to the
            Zingara Admin platform are required to review and accept the updated
            terms for authorised platform use, confidentiality, data handling,
            and security.
          </p>
          <p>
            Information and functionality available through Admin access is
            provided for authorised Zingara business purposes only and must not
            be copied, extracted, disclosed, or shared with unauthorised third
            parties.
          </p>
          <p>Please review the updated terms before continuing.</p>
        </div>

        <a
          href="/royal-decrees/terms-and-conditions"
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-[#F2D66C] underline underline-offset-4 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#D8C36A]"
        >
          View Full Terms
        </a>

        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/45 p-4 text-sm leading-6 text-zinc-200">
          <input
            type="checkbox"
            checked={accepted}
            disabled={isLoading || isSubmitting}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-[#D8C36A]"
          />
          <span>{adminIpUndertaking.checkboxLabel}</span>
        </label>

        {error && (
          <p role="alert" className="mt-4 rounded-2xl border border-red-300/30 bg-red-950/25 p-4 text-sm text-red-100">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!accepted || isLoading || isSubmitting}
          onClick={() => void submit()}
          className="mt-5 min-h-12 w-full rounded-full bg-[#D8C36A] px-6 py-3 text-sm font-bold uppercase text-black transition hover:bg-[#F2D66C] focus:outline-none focus:ring-2 focus:ring-[#F2D66C] focus:ring-offset-2 focus:ring-offset-black disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isLoading || isSubmitting ? "Accepting..." : "Accept & Continue"}
        </button>
      </section>
    </main>
  );
}
