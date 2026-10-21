"use client";

import { useEffect, useState } from "react";

type FeedbackContext = {
  firstName: string;
  venue: "cape-town" | "johannesburg";
};

type Props = {
  approvalPreview?: boolean;
  token: string;
};

function StarSelector({
  onChange,
  value,
}: {
  onChange: (value: number) => void;
  value: number | null;
}) {
  return (
    <div aria-label="How easy was it to book?" className="flex justify-center gap-1.5" role="radiogroup">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          aria-checked={value === star}
          aria-label={star + " star" + (star === 1 ? "" : "s")}
          className={[
            "grid h-12 w-12 place-items-center rounded-full text-3xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2d66c]",
            value !== null && star <= value ? "text-[#f2d66c]" : "text-zinc-700 hover:text-[#d8c36a]",
          ].join(" ")}
          key={star}
          onClick={() => onChange(star)}
          role="radio"
          type="button"
        >
          <span aria-hidden="true">★</span>
        </button>
      ))}
    </div>
  );
}

export default function FeedbackSubmissionClient({ approvalPreview = false, token }: Props) {
  const [context, setContext] = useState<FeedbackContext | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [contactRequested, setContactRequested] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "submitting" | "submitted" | "unavailable">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const endpoint = approvalPreview
      ? `/api/feedback/approval/${encodeURIComponent(token)}`
      : `/api/feedback/${encodeURIComponent(token)}`;
    fetch(endpoint, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { error?: string; feedback?: FeedbackContext };
        if (!response.ok || !payload.feedback) throw new Error(payload.error || "This feedback link is unavailable.");
        if (active) {
          setContext(payload.feedback);
          setStatus("ready");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : "This feedback link is unavailable.");
          setStatus("unavailable");
        }
      });
    return () => {
      active = false;
    };
  }, [approvalPreview, token]);

  function chooseRating(value: number) {
    setRating(value);
    if (value >= 4) setContactRequested(false);
    setMessage("");
  }

  function requestConfirmation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating) {
      setMessage("Choose a star rating before sharing your thoughts.");
      return;
    }
    setConfirming(true);
  }

  async function submit() {
    if (!rating) return;
    if (approvalPreview) {
      setConfirming(false);
      setStatus("submitted");
      setMessage("The approval journey is complete. No customer feedback was created.");
      return;
    }
    setConfirming(false);
    setStatus("submitting");
    setMessage("");
    try {
      const response = await fetch(`/api/feedback/${encodeURIComponent(token)}`, {
        body: JSON.stringify({ comment, contactRequested, rating }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Your feedback could not be submitted.");
      setStatus("submitted");
      setMessage("Thank you. Your thoughts have been shared with the Zingara team.");
    } catch (error) {
      setStatus("ready");
      setMessage(error instanceof Error ? error.message : "Your feedback could not be submitted.");
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#211605_0%,#080808_44%,#050505_100%)] px-4 py-8 text-white sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d8c36a]">The Royal Countess Zingara</p>
          <h1 className="mt-4 font-serif text-3xl sm:text-4xl">HOW WAS THE JOURNEY TO ZINGARA?</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
            We&apos;re talking about booking your tickets, not the journey to the venue!
          </p>
        </header>

        {status === "loading" ? <p className="py-14 text-center text-sm text-zinc-400">Opening your feedback invitation...</p> : null}
        {status === "unavailable" ? (
          <section className="mt-8 rounded-2xl border border-white/10 bg-black/45 p-6 text-center">
            <h2 className="text-xl font-semibold">This invitation is unavailable</h2>
            <p className="mt-3 text-sm text-zinc-400">{message}</p>
          </section>
        ) : null}
        {status === "submitted" ? (
          <section className="mt-8 rounded-2xl border border-[#d8c36a]/30 bg-black/50 p-7 text-center" aria-live="polite">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d8c36a]">Thoughts received</p>
            <h2 className="mt-3 font-serif text-2xl">Thank you, {context?.firstName || "Zingarian"}.</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">{message}</p>
          </section>
        ) : null}
        {(status === "ready" || status === "submitting") && context ? (
          <form className="mt-8 space-y-7 rounded-2xl border border-[#d8c36a]/25 bg-[#090909]/95 p-5 shadow-2xl sm:p-7" onSubmit={requestConfirmation}>
            {approvalPreview ? (
              <p className="rounded-xl border border-[#d8c36a]/25 bg-[#d8c36a]/[0.06] px-4 py-3 text-center text-xs text-[#e7d98e]">
                Secure approval journey. Completing this form creates no customer feedback.
              </p>
            ) : null}
            <fieldset>
              <legend className="w-full text-center text-base font-semibold">How easy was it to book?</legend>
              <div className="mt-3"><StarSelector onChange={chooseRating} value={rating} /></div>
            </fieldset>
            <label className="block">
              <span className="text-sm font-semibold">Was there anything we could have made easier?</span>
              <span className="ml-2 text-xs text-zinc-500">Optional</span>
              <textarea
                className="mt-2 min-h-28 w-full rounded-xl border border-white/15 bg-black/35 p-3 text-base text-white outline-none placeholder:text-zinc-600 focus:border-[#d8c36a]"
                maxLength={2000}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Share a little more, if you would like to."
                value={comment}
              />
            </label>
            {rating !== null && rating <= 3 ? (
              <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
                <input
                  checked={contactRequested}
                  className="mt-0.5 h-4 w-4 accent-[#d8c36a]"
                  onChange={(event) => setContactRequested(event.target.checked)}
                  type="checkbox"
                />
                <span><strong className="block text-white">Request Contact</strong>Ask the Zingara team to get in touch about your booking experience.</span>
              </label>
            ) : null}
            {message ? <p className="text-sm text-amber-200" role="alert">{message}</p> : null}
            <button
              className="min-h-12 w-full rounded-full bg-[#d8c36a] px-5 text-sm font-bold text-black transition hover:bg-[#f2d66c] disabled:opacity-50"
              disabled={status === "submitting"}
              type="submit"
            >
              {status === "submitting" ? "SHARING..." : "SHARE YOUR THOUGHTS ✨"}
            </button>
          </form>
        ) : null}
      </div>

      {confirming && rating ? (
        <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" role="dialog">
          <div className="w-full max-w-sm rounded-2xl border border-[#d8c36a]/35 bg-zinc-950 p-6 text-center shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d8c36a]">Confirm your rating</p>
            <p className="mt-4 text-4xl text-[#f2d66c]" aria-label={rating + " stars"}>
              {"★".repeat(rating)}{"☆".repeat(5 - rating)}
            </p>
            <p className="mt-4 text-sm leading-6 text-zinc-300">
              {rating <= 3 ? "Please confirm this rating before sharing your thoughts." : "Ready to share your thoughts with the Zingara team?"}
            </p>
            <div className="mt-6 grid gap-2">
              <button className="min-h-11 rounded-full bg-[#d8c36a] px-4 font-semibold text-black" onClick={() => void submit()} type="button">YES, SUBMIT</button>
              <button className="min-h-11 rounded-full border border-white/15 px-4 font-semibold text-white" onClick={() => setConfirming(false)} type="button">EDIT RATING</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
