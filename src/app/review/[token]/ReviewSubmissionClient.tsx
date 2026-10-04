"use client";

import { useEffect, useState } from "react";

type ReviewContext = {
  firstName: string;
  guestType: "invited" | "verified";
  performanceDate: string;
  performanceName: string;
  performanceTime: string;
  publicDisplayName: string;
  venue: string;
};

type Props = {
  preview?: boolean;
  token: string;
};

const minimumLength = 20;
const maximumLength = 2000;

function venueLabel(venue: string) {
  return venue === "johannesburg" ? "Johannesburg" : "Cape Town";
}

function performanceDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export default function ReviewSubmissionClient({ preview = false, token }: Props) {
  const [context, setContext] = useState<ReviewContext | null>(
    preview
      ? {
          firstName: "Guest",
          guestType: "verified",
          performanceDate: "2026-09-30",
          performanceName: "The Royal Countess",
          performanceTime: "17:00",
          publicDisplayName: "Guest D.",
          venue: "johannesburg",
        }
      : null,
  );
  const [rating, setRating] = useState<number | null>(null);
  const [ratingPreview, setRatingPreview] = useState<number | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [publicationConsent, setPublicationConsent] = useState(false);
  const [contactRequested, setContactRequested] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "submitting" | "submitted" | "unavailable">(
    preview ? "ready" : "loading",
  );
  const [message, setMessage] = useState("");

  const visibleRating = ratingPreview ?? rating;

  function selectRating(value: number) {
    setRating(value);
    setRatingPreview(null);
    setMessage("");
  }

  function handleRatingKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, value: number) {
    let nextRating: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      nextRating = value === 5 ? 1 : value + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      nextRating = value === 1 ? 5 : value - 1;
    } else if (event.key === "Home") {
      nextRating = 1;
    } else if (event.key === "End") {
      nextRating = 5;
    } else if (/^[1-5]$/.test(event.key)) {
      nextRating = Number(event.key);
    }

    if (nextRating === null) return;
    event.preventDefault();
    selectRating(nextRating);
    document.getElementById(`review-rating-${nextRating}`)?.focus();
  }

  useEffect(() => {
    if (preview) return;
    let active = true;

    fetch(`/api/reviews/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { error?: string; review?: ReviewContext };
        if (!response.ok || !payload.review) throw new Error(payload.error || "This review link is unavailable.");
        if (active) {
          setContext(payload.review);
          setStatus("ready");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : "This review link is unavailable.");
          setStatus("unavailable");
        }
      });

    return () => {
      active = false;
    };
  }, [preview, token]);

  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview) {
      setMessage("Preview only. No review was submitted.");
      return;
    }
    if (!rating) {
      setMessage("Choose a star rating before submitting your review.");
      return;
    }
    const trimmed = reviewText.trim();
    if (trimmed.length < minimumLength || trimmed.length > maximumLength) {
      setMessage(`Your review must be between ${minimumLength} and ${maximumLength} characters.`);
      return;
    }

    setStatus("submitting");
    setMessage("");
    try {
      const response = await fetch(`/api/reviews/${encodeURIComponent(token)}`, {
        body: JSON.stringify({ contactRequested, publicationConsent, rating, reviewText: trimmed }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Your review could not be submitted.");
      setStatus("submitted");
      setMessage("Thank you. Your review has been received.");
    } catch (error) {
      setStatus("ready");
      setMessage(error instanceof Error ? error.message : "Your review could not be submitted.");
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#201405_0%,#080808_42%,#050505_100%)] px-4 pb-12 pt-7 text-white sm:px-6 sm:pb-16 sm:pt-10">
      <div className="mx-auto w-full max-w-3xl">
        <header className="text-center">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[#D8C36A]">The Royal Countess Zingara</p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Share your experience</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            Your feedback helps us shape every performance and guest experience.
          </p>
        </header>

        {status === "loading" && <p className="py-14 text-center text-sm text-zinc-400">Opening your review invitation...</p>}

        {status === "unavailable" && (
          <section className="mt-8 rounded-[1.5rem] border border-white/10 bg-black/45 p-6 text-center shadow-2xl shadow-black/30 sm:p-8" aria-live="polite">
            <h2 className="text-xl font-semibold">This invitation is unavailable</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">{message}</p>
          </section>
        )}

        {status === "submitted" && (
          <section className="mt-8 rounded-[1.5rem] border border-[#D8C36A]/30 bg-black/45 p-6 text-center shadow-2xl shadow-[#8D7A2F]/10 sm:p-8" aria-live="polite">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d8bd69]">Review received</p>
            <h2 className="mt-3 text-2xl font-semibold">Thank you, {context?.firstName}.</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">Your review is now with the Zingara team.</p>
          </section>
        )}

        {(status === "ready" || status === "submitting") && context && (
          <form className="mt-8 space-y-6 rounded-[1.5rem] border border-[#D8C36A]/25 bg-[#080808]/95 p-5 shadow-2xl shadow-[#8D7A2F]/10 sm:p-7" onSubmit={submitReview}>
            <section className="rounded-2xl border border-[#D8C36A]/30 bg-[#D8C36A]/[0.07] px-4 py-3.5 sm:flex sm:items-center sm:justify-between sm:gap-5 sm:px-5">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
                  {context.guestType === "verified" ? "Verified guest invitation" : "Invited guest invitation"}
                </p>
                <p className="mt-1 text-lg font-medium text-white">{context.performanceName}</p>
              </div>
              <p className="mt-1.5 text-sm leading-6 text-zinc-400 sm:mt-0 sm:text-right">
                {venueLabel(context.venue)} · {performanceDateLabel(context.performanceDate)} · {context.performanceTime}
              </p>
            </section>

            <fieldset>
              <legend className="text-sm font-semibold text-white">Your rating</legend>
              <p className="mt-1 text-sm text-zinc-500" id="rating-help">Choose from one to five stars.</p>
              <div className="mt-2.5 flex w-fit gap-1 sm:gap-2" role="radiogroup" aria-label="Star rating" aria-describedby="rating-help" onPointerLeave={() => setRatingPreview(null)}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    aria-checked={rating === value}
                    aria-label={`${value} star${value === 1 ? "" : "s"}`}
                    className={`group grid h-12 w-12 place-items-center rounded-full text-[2.25rem] leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D66C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080808] ${
                      visibleRating !== null && value <= visibleRating
                        ? "text-[#F2D66C] drop-shadow-[0_0_10px_rgba(216,195,106,0.35)]"
                        : "text-zinc-700 hover:text-[#D8C36A]"
                    }`}
                    data-review-star="standalone"
                    id={`review-rating-${value}`}
                    key={value}
                    onClick={() => selectRating(value)}
                    onFocus={() => setRatingPreview(value)}
                    onBlur={() => setRatingPreview(null)}
                    onKeyDown={(event) => handleRatingKeyDown(event, value)}
                    onPointerEnter={() => setRatingPreview(value)}
                    role="radio"
                    tabIndex={rating === value || (rating === null && value === 1) ? 0 : -1}
                    type="button"
                  >
                    <span aria-hidden="true" className="block transition-transform group-hover:scale-110">★︎</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <label className="text-sm font-semibold" htmlFor="review-text">Your review</label>
              <textarea
                className="mt-2.5 min-h-32 w-full resize-y rounded-2xl border border-white/10 bg-black px-4 py-3.5 text-base leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-[#D8C36A] focus:ring-1 focus:ring-[#D8C36A]/40"
                id="review-text"
                maxLength={maximumLength}
                minLength={minimumLength}
                onChange={(event) => setReviewText(event.target.value)}
                placeholder="Tell us what stood out about your Zingara experience."
                required
                value={reviewText}
              />
              <p className="mt-1.5 text-right text-xs text-zinc-500">{reviewText.trim().length} / {maximumLength}</p>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#D8C36A]/20 bg-[#D8C36A]/[0.05] p-4 text-sm leading-6 text-zinc-300 sm:px-5">
              <input
                checked={publicationConsent}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#D8C36A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D66C] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                onChange={(event) => setPublicationConsent(event.target.checked)}
                type="checkbox"
              />
              <span>
                Zingara may publish my review under this safe display name: <strong className="text-white">{context.publicDisplayName}</strong> Contact details and booking references are never published.
              </span>
            </label>

            <fieldset>
              <legend className="text-sm font-semibold">Would you like a member of our team to contact you?</legend>
              <div className="mt-3 grid w-full grid-cols-2 rounded-2xl border border-white/10 bg-black/45 p-1 sm:w-64" role="group" aria-label="Contact request">
                {[false, true].map((value) => (
                  <button
                    aria-pressed={contactRequested === value}
                    className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D66C] ${contactRequested === value ? "bg-[#D8C36A] text-black shadow-[0_0_18px_rgba(216,195,106,0.16)]" : "text-zinc-400 hover:text-white"}`}
                    key={String(value)}
                    onClick={() => setContactRequested(value)}
                    type="button"
                  >
                    {value ? "Yes" : "No"}
                  </button>
                ))}
              </div>
            </fieldset>

            {message && (
              <p className="rounded-2xl border border-[#D8C36A]/25 bg-[#D8C36A]/[0.07] px-4 py-3 text-sm leading-6 text-zinc-200" aria-live="polite">{message}</p>
            )}

            <div className="flex justify-center pt-1">
              <button
                className="min-h-12 w-full rounded-full bg-[#D8C36A] px-7 py-3 text-sm font-bold uppercase tracking-[0.12em] text-black shadow-[0_0_24px_rgba(216,195,106,0.18)] transition hover:bg-[#F2D66C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D66C] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-64"
                disabled={status === "submitting"}
                type="submit"
              >
                {status === "submitting" ? "Submitting..." : preview ? "Preview submission" : "Submit review"}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
