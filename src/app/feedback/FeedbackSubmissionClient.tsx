"use client";

import { useEffect, useState } from "react";

type BookingDevice = "mobile" | "computer" | "tablet" | "cant_remember";
type PaymentConfidence = "yes" | "mostly" | "no";

type FeedbackContext = {
  firstName: string;
  suggestedDevice?: BookingDevice | null;
  venue: "cape-town" | "johannesburg";
};

type Props = {
  approvalPreview?: boolean;
  token: string;
};

function StarSelector({ onChange, value }: { onChange: (value: number) => void; value: number | null }) {
  return (
    <div aria-label="Overall booking experience" className="flex justify-center gap-1" role="radiogroup">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          aria-checked={value === star}
          aria-label={star + " star" + (star === 1 ? "" : "s")}
          className={[
            "grid h-11 w-11 place-items-center rounded-full text-2xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2d66c] sm:h-12 sm:w-12 sm:text-3xl",
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

function ScaleSelector({ highLabel, label, lowLabel, onChange, value }: {
  highLabel: string;
  label: string;
  lowLabel: string;
  onChange: (value: number) => void;
  value: number | null;
}) {
  return (
    <div>
      <div aria-label={label} className="grid grid-cols-5 gap-2" role="radiogroup">
        {[1, 2, 3, 4, 5].map((option) => (
          <button
            aria-checked={value === option}
            aria-label={`${option} out of 5`}
            className={[
              "min-h-11 rounded-full border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2d66c]",
              value === option
                ? "border-[#d8c36a] bg-[#d8c36a] text-black"
                : "border-white/15 bg-white/[0.02] text-zinc-300 hover:border-[#d8c36a]/55",
            ].join(" ")}
            key={option}
            onClick={() => onChange(option)}
            role="radio"
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-zinc-500">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

function ChoiceSelector<T extends string>({ label, onChange, options, value }: {
  label: string;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T | null;
}) {
  return (
    <div aria-label={label} className="grid gap-2 sm:grid-cols-2" role="radiogroup">
      {options.map((option) => (
        <button
          aria-checked={value === option.value}
          className={[
            "min-h-11 rounded-full border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2d66c]",
            value === option.value
              ? "border-[#d8c36a] bg-[#d8c36a] text-black"
              : "border-white/15 bg-white/[0.02] text-zinc-300 hover:border-[#d8c36a]/55",
          ].join(" ")}
          key={option.value}
          onClick={() => onChange(option.value)}
          role="radio"
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function FeedbackSubmissionClient({ approvalPreview = false, token }: Props) {
  const [context, setContext] = useState<FeedbackContext | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [showDateEase, setShowDateEase] = useState<number | null>(null);
  const [seatingEase, setSeatingEase] = useState<number | null>(null);
  const [checkoutEase, setCheckoutEase] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [paymentConfidence, setPaymentConfidence] = useState<PaymentConfidence | null>(null);
  const [bookingDevice, setBookingDevice] = useState<BookingDevice | null>(null);
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
          setBookingDevice(payload.feedback.suggestedDevice ?? null);
          setStatus("ready");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : "This feedback link is unavailable.");
          setStatus("unavailable");
        }
      });
    return () => { active = false; };
  }, [approvalPreview, token]);

  function chooseRating(value: number) {
    setRating(value);
    if (value >= 4) setContactRequested(false);
    setMessage("");
  }

  function requestConfirmation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating || !showDateEase || !seatingEase || !checkoutEase || !paymentConfidence || !bookingDevice) {
      setMessage("Please answer each question before sharing your thoughts.");
      return;
    }
    setMessage("");
    setConfirming(true);
  }

  async function submit() {
    if (!rating || !showDateEase || !seatingEase || !checkoutEase || !paymentConfidence || !bookingDevice) return;
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
        body: JSON.stringify({ bookingDevice, checkoutEase, comment, contactRequested, paymentConfidence, rating, seatingEase, showDateEase }),
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#211605_0%,#080808_44%,#050505_100%)] px-4 py-7 text-white sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d8c36a]">The Royal Countess Zingara</p>
          <h1 className="mt-3 font-serif text-3xl sm:text-4xl">WE&apos;D LOVE YOUR THOUGHTS</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">Seven quick questions about booking your Zingara experience.</p>
        </header>

        {status === "loading" ? <p className="py-14 text-center text-sm text-zinc-400">Opening your feedback invitation...</p> : null}
        {status === "unavailable" ? (
          <section className="mt-7 rounded-xl border border-white/10 bg-black/45 p-6 text-center">
            <h2 className="text-xl font-semibold">This invitation is unavailable</h2>
            <p className="mt-3 text-sm text-zinc-400">{message}</p>
          </section>
        ) : null}
        {status === "submitted" ? (
          <section className="mt-7 rounded-xl border border-[#d8c36a]/30 bg-black/50 p-7 text-center" aria-live="polite">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d8c36a]">Thoughts received</p>
            <h2 className="mt-3 font-serif text-2xl">Thank you, {context?.firstName || "Zingarian"}.</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">{message}</p>
          </section>
        ) : null}
        {(status === "ready" || status === "submitting") && context ? (
          <form className="mt-7 space-y-6 rounded-xl border border-[#d8c36a]/25 bg-[#090909]/95 p-4 shadow-2xl sm:p-6" onSubmit={requestConfirmation}>
            {approvalPreview ? (
              <p className="rounded-lg border border-[#d8c36a]/25 bg-[#d8c36a]/[0.06] px-4 py-3 text-center text-xs text-[#e7d98e]">
                Secure approval journey. Completing this form creates no customer feedback.
              </p>
            ) : null}

            <fieldset><legend className="w-full text-center text-base font-semibold">1. How was your overall booking experience?</legend><div className="mt-3"><StarSelector onChange={chooseRating} value={rating} /></div></fieldset>
            <fieldset><legend className="mb-3 text-sm font-semibold">2. How easy was it to find your show and date?</legend><ScaleSelector highLabel="Very easy" label="Show and date selection" lowLabel="Very difficult" onChange={setShowDateEase} value={showDateEase} /></fieldset>
            <fieldset><legend className="mb-3 text-sm font-semibold">3. How easy was it to choose your seating?</legend><ScaleSelector highLabel="Very easy" label="Seating selection" lowLabel="Very difficult" onChange={setSeatingEase} value={seatingEase} /></fieldset>
            <fieldset><legend className="mb-3 text-sm font-semibold">4. How was the checkout and payment process?</legend><ScaleSelector highLabel="Excellent" label="Checkout and payment process" lowLabel="Very poor" onChange={setCheckoutEase} value={checkoutEase} /></fieldset>

            <label className="block">
              <span className="text-sm font-semibold">5. What could we make better?</span><span className="ml-2 text-xs text-zinc-500">Optional</span>
              <textarea className="mt-2 min-h-24 w-full rounded-xl border border-white/15 bg-black/35 p-3 text-base text-white outline-none placeholder:text-zinc-600 focus:border-[#d8c36a]" maxLength={2000} onChange={(event) => setComment(event.target.value)} placeholder="Share a little more, if you would like to." value={comment} />
            </label>

            <fieldset>
              <legend className="mb-3 text-sm font-semibold">6. Did you feel safe and confident making your payment online?</legend>
              <ChoiceSelector label="Payment confidence" onChange={setPaymentConfidence} options={[{ label: "Yes", value: "yes" }, { label: "Mostly", value: "mostly" }, { label: "No", value: "no" }]} value={paymentConfidence} />
            </fieldset>
            <fieldset>
              <legend className="mb-3 text-sm font-semibold">7. Which device did you use to book?</legend>
              <ChoiceSelector label="Booking device" onChange={setBookingDevice} options={[{ label: "Mobile phone", value: "mobile" }, { label: "Computer", value: "computer" }, { label: "Tablet", value: "tablet" }, { label: "Can't remember", value: "cant_remember" }]} value={bookingDevice} />
            </fieldset>

            {rating !== null && rating <= 3 ? (
              <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
                <input checked={contactRequested} className="mt-0.5 h-4 w-4 accent-[#d8c36a]" onChange={(event) => setContactRequested(event.target.checked)} type="checkbox" />
                <span><strong className="block text-white">Request Contact</strong>Ask the Zingara team to get in touch about your booking experience.</span>
              </label>
            ) : null}
            {message ? <p className="text-sm text-amber-200" role="alert">{message}</p> : null}
            <button className="min-h-12 w-full rounded-full bg-[#d8c36a] px-5 text-sm font-bold text-black transition hover:bg-[#f2d66c] disabled:opacity-50" disabled={status === "submitting"} type="submit">{status === "submitting" ? "SHARING..." : "SHARE YOUR THOUGHTS"}</button>
          </form>
        ) : null}
      </div>

      {confirming && rating && showDateEase && seatingEase && checkoutEase && paymentConfidence && bookingDevice ? (
        <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4" role="dialog">
          <div className="w-full max-w-md rounded-xl border border-[#d8c36a]/35 bg-zinc-950 p-5 shadow-2xl sm:p-6">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-[#d8c36a]">Confirm your answers</p>
            <p className="mt-3 text-center text-3xl text-[#f2d66c]" aria-label={rating + " stars"}>{"★".repeat(rating)}{"☆".repeat(5 - rating)}</p>
            <dl className="mt-4 grid gap-2 text-sm text-zinc-300">
              <div className="flex justify-between gap-4"><dt>Show and date</dt><dd>{showDateEase}/5</dd></div>
              <div className="flex justify-between gap-4"><dt>Seating</dt><dd>{seatingEase}/5</dd></div>
              <div className="flex justify-between gap-4"><dt>Checkout and payment</dt><dd>{checkoutEase}/5</dd></div>
              <div className="flex justify-between gap-4"><dt>Payment confidence</dt><dd className="capitalize">{paymentConfidence}</dd></div>
              <div className="flex justify-between gap-4"><dt>Booking device</dt><dd>{bookingDevice === "cant_remember" ? "Can't remember" : bookingDevice === "mobile" ? "Mobile phone" : bookingDevice[0].toUpperCase() + bookingDevice.slice(1)}</dd></div>
            </dl>
            <p className="mt-4 text-center text-sm leading-6 text-zinc-400">{rating <= 3 ? "Please confirm these answers before sharing your thoughts." : "Ready to share your thoughts with the Zingara team?"}</p>
            <div className="mt-5 grid gap-2">
              <button className="min-h-11 rounded-full bg-[#d8c36a] px-4 font-semibold text-black" onClick={() => void submit()} type="button">YES, SUBMIT</button>
              <button className="min-h-11 rounded-full border border-white/15 px-4 font-semibold text-white" onClick={() => setConfirming(false)} type="button">EDIT ANSWERS</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
